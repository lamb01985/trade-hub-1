// ─────────────────────────────────────────────────────────────────────────────
// tradeAggregator.js
//
// Pure, framework-agnostic engine that turns broker fills into completed
// trades. No React, no IO, no globals. Same input always produces the same
// output, which makes the behavior testable in isolation and stable when the
// data source swaps (CSV today, broker API tomorrow).
//
// Accounting: weighted-average entry cost. No FIFO lot matching. When a
// position is reduced, realized P&L is computed against the running average
// at the moment of the exit slice. Average entry price is left untouched on
// exits and is only recomputed on same-direction adds.
//
// Position flips (a single fill that takes the position through zero into the
// opposite side) are handled by splitting that fill into two synthetic fills,
// one closing slice that finalizes the current trade and one opening slice
// that starts the new trade. The split fills carry the original price and
// timestamp; their ids are suffixed with #close and #open so downstream
// consumers can trace them back to the source fill.
//
// Fill: { id, timestamp (ISO), symbol, side ('buy'|'sell'), qty (positive),
//   price }
//
// Trade: see buildTradeRecord() below for the full shape.
// ─────────────────────────────────────────────────────────────────────────────

// Small epsilon for floating point quantity comparisons. Brokers report whole
// contracts for futures and options, but we keep a buffer in case a CSV ever
// surfaces fractional quantities.
const QTY_EPS = 1e-9

let _tradeCounter = 0
function nextTradeId(symbol) {
  _tradeCounter += 1
  return `trade_${symbol}_${_tradeCounter}`
}

// Internal: returns true if adding to a long below avg, or to a short above
// avg, both of which mean the fresh slice is at a worse price than the
// existing weighted-average entry. This is what we surface as the
// "addedWhileUnderwater" flag on completed trades, the averaging-down pattern
// the operator wants to spot.
function isUnderwaterAdd(direction, fillPrice, currentAvgEntry) {
  if (direction === 'long') return fillPrice < currentAvgEntry
  return fillPrice > currentAvgEntry
}

// Internal accumulator for a trade in progress. We build this up as fills land
// and freeze it into the public Trade shape when the position closes.
function newInProgressTrade(symbol, direction, firstFill) {
  return {
    id: nextTradeId(symbol),
    symbol,
    direction,
    entryTime: firstFill.timestamp,
    exitTime: null,
    avgEntryPrice: firstFill.price,
    avgExitPrice: null,
    maxSize: firstFill.qty,
    totalEntryQty: firstFill.qty,
    totalExitQty: 0,
    totalExitNotional: 0,
    realizedPnl: 0,
    fills: [firstFill],
    addedWhileUnderwater: false,
    maxAdds: 0,
  }
}

function buildTradeRecord(t) {
  const avgExitPrice = t.totalExitQty > 0 ? t.totalExitNotional / t.totalExitQty : null
  return {
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    entryTime: t.entryTime,
    exitTime: t.exitTime,
    avgEntryPrice: t.avgEntryPrice,
    avgExitPrice,
    maxSize: t.maxSize,
    totalEntryQty: t.totalEntryQty,
    realizedPnl: t.realizedPnl,
    fillCount: t.fills.length,
    fills: t.fills,
    scaledIn: t.maxAdds > 0,
    // True if the trade was exited in more than one slice. A single closing
    // fill (or a flip's closing piece) leaves this false.
    scaledOut: t.fills.filter(f => f._slice === 'exit').length > 1,
    addedWhileUnderwater: t.addedWhileUnderwater,
    maxAdds: t.maxAdds,
  }
}

// Synthesize two fills from a single source fill by quantity split. Used on
// flip events. Both pieces inherit price, timestamp, side, and symbol. Ids
// pick up a suffix so the lineage stays visible in audits.
function splitFillForFlip(fill, closingQty, openingQty) {
  return [
    { ...fill, id: `${fill.id}#close`, qty: closingQty, _sourceFillId: fill.id },
    { ...fill, id: `${fill.id}#open`, qty: openingQty, _sourceFillId: fill.id },
  ]
}

// Apply an opening slice to an empty position. Direction is derived from the
// fill side. Returns the new in-progress trade.
function openTrade(symbol, fill, sliceTag) {
  const direction = fill.side === 'buy' ? 'long' : 'short'
  const tagged = { ...fill, _slice: sliceTag || 'entry' }
  return newInProgressTrade(symbol, direction, tagged)
}

// Apply a same-direction add to the current trade. Updates the weighted
// average and records the underwater flag if the add was at a worse price
// than the pre-add average.
function applyAdd(current, fill) {
  const beforeAvg = current.avgEntryPrice
  if (isUnderwaterAdd(current.direction, fill.price, beforeAvg)) {
    current.addedWhileUnderwater = true
  }
  const currentSize = current.totalEntryQty - current.totalExitQty
  const newSize = currentSize + fill.qty
  current.avgEntryPrice = ((beforeAvg * currentSize) + (fill.price * fill.qty)) / newSize
  current.totalEntryQty += fill.qty
  current.maxSize = Math.max(current.maxSize, newSize)
  current.maxAdds += 1
  current.fills.push({ ...fill, _slice: 'add' })
}

// Apply an opposite-direction slice that reduces or closes the position
// without flipping. Realizes P&L on the closed quantity against the current
// average. Marks the trade closed when size hits zero.
function applyExit(current, fill, exitQty, finalize) {
  const slicePnl = current.direction === 'long'
    ? (fill.price - current.avgEntryPrice) * exitQty
    : (current.avgEntryPrice - fill.price) * exitQty
  current.realizedPnl += slicePnl
  current.totalExitQty += exitQty
  current.totalExitNotional += fill.price * exitQty
  current.fills.push({ ...fill, qty: exitQty, _slice: 'exit' })
  if (finalize) current.exitTime = fill.timestamp
}

// Internal: signed delta of a fill. Buys are positive, sells are negative.
// Operates on quantity, not notional.
function signedDelta(fill) {
  return fill.side === 'buy' ? fill.qty : -fill.qty
}

// Process all fills for a single symbol, sorted by timestamp. Returns a list
// of completed Trade records. Open positions at the end of the input are not
// emitted, since they have no exit yet.
function aggregateForSymbol(symbol, fills) {
  const sorted = [...fills].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const trades = []
  let current = null
  let signedSize = 0

  for (const fill of sorted) {
    const delta = signedDelta(fill)
    const sameDirectionAsPosition = signedSize !== 0 && Math.sign(delta) === Math.sign(signedSize)

    if (signedSize === 0) {
      current = openTrade(symbol, fill, 'entry')
      signedSize = delta
      continue
    }

    if (sameDirectionAsPosition) {
      applyAdd(current, fill)
      signedSize += delta
      continue
    }

    // Opposite direction: this fill either trims the position, closes it
    // exactly, or flips it through zero into the other side.
    const absDelta = fill.qty
    const absSize = Math.abs(signedSize)

    if (absDelta < absSize - QTY_EPS) {
      // Partial exit, position survives in the same direction.
      applyExit(current, fill, absDelta, false)
      signedSize += delta
      continue
    }

    if (Math.abs(absDelta - absSize) < QTY_EPS) {
      // Exact close to flat.
      applyExit(current, fill, absSize, true)
      trades.push(buildTradeRecord(current))
      current = null
      signedSize = 0
      continue
    }

    // Flip: the fill takes the position through zero. Split into two pieces:
    // the closing slice finalizes the current trade, the opening slice starts
    // a fresh trade in the opposite direction.
    const closingQty = absSize
    const openingQty = absDelta - absSize
    const [closingPiece, openingPiece] = splitFillForFlip(fill, closingQty, openingQty)
    applyExit(current, closingPiece, closingQty, true)
    trades.push(buildTradeRecord(current))
    current = openTrade(symbol, openingPiece, 'entry')
    signedSize = openingPiece.side === 'buy' ? openingQty : -openingQty
  }

  return trades
}

// ── Public entrypoint ──────────────────────────────────────────────────────

export function aggregateFills(fills) {
  if (!Array.isArray(fills) || fills.length === 0) return []
  const bySymbol = new Map()
  for (const f of fills) {
    if (!bySymbol.has(f.symbol)) bySymbol.set(f.symbol, [])
    bySymbol.get(f.symbol).push(f)
  }
  const result = []
  for (const [symbol, symbolFills] of bySymbol) {
    for (const trade of aggregateForSymbol(symbol, symbolFills)) {
      result.push(trade)
    }
  }
  result.sort((a, b) => a.entryTime.localeCompare(b.entryTime))
  return result
}

// Test-only helper. The trade id counter is module-state so output is stable
// per process. Tests that depend on specific ids should reset between cases.
export function _resetTradeIdsForTests() {
  _tradeCounter = 0
}
