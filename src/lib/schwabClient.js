// Pure client-side Schwab helpers. No network calls, no secrets, no tokens.
// Everything that talks to Schwab now goes through /api/schwab/* via the
// useSchwab hook. This file keeps the constants and transforms the UI relies
// on, so we don't pull them through the hook for no reason.

export const SCHWAB_BLUE = '#3B82F6'

// Schwab's web Trade page (no documented deep-link params, user enters legs).
export const SCHWAB_TRADE_URL = 'https://client.schwab.com/app/trade/tom/#/trade'

// OCC option symbol. Format: 6-char padded ticker + YYMMDD + C/P + 8-digit
// strike (×1000). Example: "QQQ   260117C00500000"
export function occSymbol({ ticker, expiry, strike, optType }) {
  if (!ticker || !expiry || !strike || !optType) return ''
  const [y, m, d] = String(expiry).split('-')
  if (!y || !m || !d) return ''
  const cp = String(optType).toLowerCase() === 'put' ? 'P' : 'C'
  const padded = String(Math.round(parseFloat(strike) * 1000)).padStart(8, '0')
  return `${String(ticker).toUpperCase().padEnd(6, ' ')}${y.slice(2)}${m}${d}${cp}${padded}`
}

// Count round-trip option day trades from today's filled orders. A round
// trip is a same OCC symbol with both a BUY and a SELL on the same day.
// Mirrors the server-side counter so the UI can recompute if needed.
export function countDayTrades(orders) {
  if (!orders?.length) return 0
  const bySym = new Map()
  for (const order of orders) {
    if (order.status !== 'FILLED') continue
    for (const leg of (order.legs || order.orderLegCollection || [])) {
      const i = leg.instrument || leg
      if ((i.assetType || leg.assetType) !== 'OPTION') continue
      const sym = i.symbol || leg.symbol
      const instr = String(leg.instruction || '').toUpperCase()
      if (!sym) continue
      const entry = bySym.get(sym) || { buy: 0, sell: 0 }
      if (instr.includes('BUY')) entry.buy++
      else if (instr.includes('SELL')) entry.sell++
      bySym.set(sym, entry)
    }
  }
  let n = 0
  for (const v of bySym.values()) n += Math.min(v.buy, v.sell)
  return n
}

// Convert sanitized Schwab orders (from /api/schwab/orders) into Trade Hub
// journal entries. Groups buy/sell legs by OCC symbol and skips anything
// already present in the local journal under the same schwabOrderId.
export function ordersToTrades(orders, existingTrades = []) {
  const existingIds = new Set(
    existingTrades.filter(t => t.schwabOrderId).map(t => String(t.schwabOrderId))
  )

  const bySym = {}
  for (const order of (orders || [])) {
    if (order.status !== 'FILLED') continue
    for (const leg of (order.legs || [])) {
      if (leg.assetType !== 'OPTION') continue
      const sym = leg.symbol
      const price = parseFloat(order.price ?? 0)
      if (!sym || !price) continue
      const isBuy = String(leg.instruction || '').toUpperCase().includes('BUY')
      const entry = {
        orderId: order.orderId,
        price,
        qty: leg.filledQuantity || leg.quantity || 1,
        time: order.closeTime || order.enteredTime,
        ticker: (leg.underlyingSymbol || sym.slice(0, 6)).trim(),
        strike: leg.strikePrice,
        putCall: leg.putCall || 'call',
        expiry: leg.optionExpirationDate,
      }
      if (!bySym[sym]) bySym[sym] = {}
      bySym[sym][isBuy ? 'buy' : 'sell'] = entry
    }
  }

  const result = []
  for (const sym of Object.keys(bySym)) {
    const { buy, sell } = bySym[sym]
    const ref = buy || sell
    if (!ref || existingIds.has(String(ref.orderId))) continue
    const entryPrice = buy?.price ?? null
    const exitPrice = sell?.price ?? null
    const qty = ref.qty
    const pnl = entryPrice != null && exitPrice != null ? (exitPrice - entryPrice) * qty * 100 : null
    result.push({
      id: `schwab-${ref.orderId}-${sym}`,
      schwabOrderId: ref.orderId,
      ticker: ref.ticker,
      instrument: 'options',
      optType: ref.putCall,
      strike: ref.strike,
      expiry: ref.expiry,
      contracts: qty,
      setupType: 'Schwab Sync',
      entry: entryPrice ?? exitPrice,
      stop: null,
      target: null,
      exitPrice,
      entryTime: buy?.time ? new Date(buy.time).toTimeString().slice(0, 5) : null,
      exitTime: sell?.time ? new Date(sell.time).toTimeString().slice(0, 5) : null,
      status: pnl == null ? 'open' : pnl >= 0 ? 'win' : 'loss',
      pnl,
      rr: null,
      dollarRisk: null,
      dollarReward: pnl,
      totalCost: entryPrice ? entryPrice * qty * 100 : null,
      currentPrice: null,
      notes: `Synced from Schwab, ${sym}`,
      date: ref.time || new Date().toISOString(),
    })
  }
  return result
}
