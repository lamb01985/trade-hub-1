// Trading Intelligence Engine
// Calculates all key levels used by institutional traders

// ── VWAP ─────────────────────────────────────────────────────────────────────

export function calcVWAP(bars) {
  if (!bars?.length) return null
  let cumTP = 0, cumVol = 0
  const deviations = []

  for (const bar of bars) {
    const tp = (bar.h + bar.l + bar.c) / 3
    cumTP += tp * bar.v
    cumVol += bar.v
    const vwap = cumTP / cumVol
    deviations.push((tp - vwap) ** 2 * bar.v)
  }

  const vwap = cumVol > 0 ? cumTP / cumVol : null
  if (!vwap) return null

  const variance = deviations.reduce((a, b) => a + b, 0) / cumVol
  const stdev = Math.sqrt(variance)

  return {
    vwap,
    band1up: vwap + stdev,
    band1dn: vwap - stdev,
    band2up: vwap + 2 * stdev,
    band2dn: vwap - 2 * stdev,
    band3up: vwap + 3 * stdev,
    band3dn: vwap - 3 * stdev,
    stdev,
  }
}

// ── Pivot Points (Floor Trader) ───────────────────────────────────────────────

export function calcPivots(pdh, pdl, pdc) {
  if (!pdh || !pdl || !pdc) return null
  const PP = (pdh + pdl + pdc) / 3
  return {
    PP,
    R1: 2 * PP - pdl,
    R2: PP + (pdh - pdl),
    R3: pdh + 2 * (PP - pdl),
    S1: 2 * PP - pdh,
    S2: PP - (pdh - pdl),
    S3: pdl - 2 * (pdh - PP),
  }
}

// ── Fibonacci ─────────────────────────────────────────────────────────────────

export function calcFibs(swingHigh, swingLow) {
  if (!swingHigh || !swingLow || swingHigh <= swingLow) return null
  const range = swingHigh - swingLow
  return {
    // Retracements (from high)
    fib0: swingHigh,
    fib236: swingHigh - range * 0.236,
    fib382: swingHigh - range * 0.382,
    fib500: swingHigh - range * 0.5,
    fib618: swingHigh - range * 0.618,
    fib786: swingHigh - range * 0.786,
    fib100: swingLow,
    // Extensions (below low)
    ext127: swingLow - range * 0.272,
    ext162: swingLow - range * 0.618,
    ext200: swingLow - range * 1.0,
    // Above high
    extUp127: swingHigh + range * 0.272,
    extUp162: swingHigh + range * 0.618,
  }
}

// ── Supply & Demand Zone Detection ───────────────────────────────────────────

export function detectSDZones(dailyBars) {
  if (!dailyBars || dailyBars.length < 5) return []
  const zones = []

  for (let i = 1; i < dailyBars.length - 1; i++) {
    const bar = dailyBars[i]
    const range = bar.h - bar.l
    // Average range of preceding 5 bars
    const preceding = dailyBars.slice(Math.max(0, i - 5), i)
    const avgRange = preceding.reduce((s, b) => s + (b.h - b.l), 0) / preceding.length

    if (avgRange === 0) continue

    // Tight consolidation (range < 60% of average)
    if (range < avgRange * 0.6) {
      const nextBar = dailyBars[i + 1]
      const nextMove = Math.abs(nextBar.c - bar.c)
      const nextRange = nextBar.h - nextBar.l

      // Strong impulse move away (next bar moves more than 1.5x avg range)
      if (nextMove > avgRange * 1.5 || nextRange > avgRange * 1.5) {
        const isBullish = nextBar.c > bar.h // broke up = demand zone
        zones.push({
          type: isBullish ? 'demand' : 'supply',
          high: bar.h,
          low: bar.l,
          midpoint: (bar.h + bar.l) / 2,
          strength: nextMove / avgRange,
          date: bar.t,
          tested: false,
        })
      }
    }
  }

  // Return most recent 6, strongest first within that
  return zones.slice(-6).sort((a, b) => b.strength - a.strength).slice(0, 4)
}

// ── Intraday Volume Profile with VAH/VAL ─────────────────────────────────────
// Bucketizes price levels at the given tick size, distributes each bar's volume
// uniformly across the buckets it touched, then derives POC + 70% value area.

export function tickSizeFor(price) {
  if (price == null || isNaN(price)) return 0.25
  return price >= 200 ? 0.5 : 0.25
}

export function calcIntradayVolumeProfile(bars, tickSize = 0.25) {
  if (!bars || bars.length < 15) return null
  const valid = bars.filter(b => b.v > 0 && b.h >= b.l)
  if (valid.length < 15) return null

  const byLevel = new Map()
  for (const bar of valid) {
    const lo = Math.round(bar.l / tickSize) * tickSize
    const hi = Math.round(bar.h / tickSize) * tickSize
    const numBuckets = Math.max(1, Math.round((hi - lo) / tickSize) + 1)
    const perBucket = bar.v / numBuckets
    for (let i = 0; i < numBuckets; i++) {
      const price = Number((lo + i * tickSize).toFixed(4))
      byLevel.set(price, (byLevel.get(price) || 0) + perBucket)
    }
  }

  if (byLevel.size === 0) return null

  const sortedByPrice = [...byLevel.entries()].sort((a, b) => a[0] - b[0])
  const totalVol = sortedByPrice.reduce((s, [, v]) => s + v, 0)
  if (totalVol === 0) return null

  // POC = highest-volume bucket
  let pocIdx = 0, pocVol = sortedByPrice[0][1]
  for (let i = 1; i < sortedByPrice.length; i++) {
    if (sortedByPrice[i][1] > pocVol) { pocIdx = i; pocVol = sortedByPrice[i][1] }
  }
  const poc = sortedByPrice[pocIdx][0]

  // Expand from POC outward until 70% of volume is captured
  let lo = pocIdx, hi = pocIdx
  let captured = pocVol
  const threshold = totalVol * 0.70
  while (captured < threshold && (lo > 0 || hi < sortedByPrice.length - 1)) {
    const above = hi + 1 < sortedByPrice.length ? sortedByPrice[hi + 1][1] : -1
    const below = lo - 1 >= 0 ? sortedByPrice[lo - 1][1] : -1
    if (above < 0 && below < 0) break
    if (above >= below) { hi++; captured += sortedByPrice[hi][1] }
    else { lo--; captured += sortedByPrice[lo][1] }
  }
  const vah = sortedByPrice[hi][0]
  const val = sortedByPrice[lo][0]

  const avgPerLevel = totalVol / sortedByPrice.length
  const hvn = sortedByPrice.filter(([, v]) => v > avgPerLevel * 1.5).map(([p, v]) => ({ price: p, volRatio: v / avgPerLevel }))
  const lvn = sortedByPrice.filter(([, v]) => v < avgPerLevel * 0.4).map(([p, v]) => ({ price: p, volRatio: v / avgPerLevel }))

  return { poc, vah, val, hvn: hvn.slice(0, 5), lvn: lvn.slice(0, 5), byLevel: sortedByPrice, totalVol, tickSize }
}

// ── Volume Profile (legacy, from daily bars) ─────────────────────────────────

export function calcVolumeProfile(histBars) {
  if (!histBars || histBars.length < 3) return null
  const bars = histBars.filter(b => b.v > 0 && b.h > b.l)
  if (bars.length < 3) return null
  const avgVol = bars.reduce((s, b) => s + b.v, 0) / bars.length
  if (!avgVol) return null
  let poc = null, pocVol = 0
  const hvn = [], lvn = []
  for (const bar of bars) {
    const mid = (bar.h + bar.l) / 2
    if (bar.v > pocVol) { poc = mid; pocVol = bar.v }
    if (bar.v > avgVol * 1.5) hvn.push({ price: mid, volRatio: bar.v / avgVol })
    else if (bar.v < avgVol * 0.5) lvn.push({ price: mid, volRatio: bar.v / avgVol })
  }
  return { poc, hvn: hvn.slice(-3), lvn: lvn.slice(-3) }
}

// ── ATR (Average True Range, 14-period) ───────────────────────────────────────

export function calcATR(bars, period = 14) {
  if (!bars || bars.length < 2) return null
  const trs = []
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h, l = bars[i].l, pc = bars[i - 1].c
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  if (trs.length === 0) return null
  const recent = trs.slice(-period)
  return recent.reduce((s, v) => s + v, 0) / recent.length
}

// ── Level Map Builder ─────────────────────────────────────────────────────────
// Assembles all levels into a sorted, annotated array

export function buildLevelMap(currentPrice, {
  pivots,
  fibs,
  vwapData,
  prevDay,
  weeklyData,
  orbHigh,
  orbLow,
  sdZones = [],
  customLevels = [],
  volProfile = null,
}) {
  const levels = []

  const add = (price, label, type, sublabel = '') => {
    if (price != null && !isNaN(price) && price > 0) {
      levels.push({ price, label, type, sublabel, distance: currentPrice ? price - currentPrice : null })
    }
  }

  // Weekly structure
  if (weeklyData) {
    add(weeklyData.high, 'Weekly High', 'weekly')
    add(weeklyData.low, 'Weekly Low', 'weekly')
  }

  // Previous day structure
  if (prevDay) {
    add(prevDay.high, 'Prev Day High', 'structure')
    add(prevDay.low, 'Prev Day Low', 'structure')
    add(prevDay.close, 'Prev Day Close', 'structure')
  }

  // Floor pivot points
  if (pivots) {
    add(pivots.R3, 'R3', 'pivot-r', 'Resistance 3')
    add(pivots.R2, 'R2', 'pivot-r', 'Resistance 2')
    add(pivots.R1, 'R1', 'pivot-r', 'Resistance 1')
    add(pivots.PP, 'Pivot', 'pivot', 'Floor Pivot Point')
    add(pivots.S1, 'S1', 'pivot-s', 'Support 1')
    add(pivots.S2, 'S2', 'pivot-s', 'Support 2')
    add(pivots.S3, 'S3', 'pivot-s', 'Support 3')
  }

  // VWAP and bands
  if (vwapData) {
    add(vwapData.band3up, 'VWAP +3σ', 'vwap-band', 'Extreme — breakout extension')
    add(vwapData.band2up, 'VWAP +2σ', 'vwap-band', 'Overbought zone')
    add(vwapData.band1up, 'VWAP +1σ', 'vwap-band', 'Extended')
    add(vwapData.vwap, 'VWAP', 'vwap', 'Volume weighted avg price')
    add(vwapData.band1dn, 'VWAP -1σ', 'vwap-band', 'Extended')
    add(vwapData.band2dn, 'VWAP -2σ', 'vwap-band', 'Oversold zone')
    add(vwapData.band3dn, 'VWAP -3σ', 'vwap-band', 'Extreme — breakdown extension')
  }

  // Opening range
  if (orbHigh) add(orbHigh, 'OR High', 'orb', 'Opening range breakout level')
  if (orbLow) add(orbLow, 'OR Low', 'orb', 'Opening range breakdown level')

  // Fibonacci
  if (fibs) {
    add(fibs.extUp162, 'Fib 161.8% ↑', 'fib', 'Extension')
    add(fibs.extUp127, 'Fib 127.2% ↑', 'fib', 'Extension')
    add(fibs.fib0, 'Fib 0% (Swing High)', 'fib')
    add(fibs.fib236, 'Fib 23.6%', 'fib', 'Retracement')
    add(fibs.fib382, 'Fib 38.2%', 'fib', 'Key retracement')
    add(fibs.fib500, 'Fib 50%', 'fib', 'Midpoint')
    add(fibs.fib618, 'Fib 61.8%', 'fib', 'Golden ratio — strongest')
    add(fibs.fib786, 'Fib 78.6%', 'fib', 'Deep retracement')
    add(fibs.fib100, 'Fib 100% (Swing Low)', 'fib')
    add(fibs.ext127, 'Fib 127.2% ↓', 'fib', 'Extension')
    add(fibs.ext162, 'Fib 161.8% ↓', 'fib', 'Extension')
  }

  // Supply & Demand zones (midpoints)
  for (const zone of sdZones) {
    add(zone.midpoint, `${zone.type === 'demand' ? 'Demand' : 'Supply'} Zone`, zone.type, `${zone.high.toFixed(2)}–${zone.low.toFixed(2)}`)
  }

  // Custom user levels
  for (const lvl of customLevels) {
    add(lvl.price, lvl.label, 'custom')
  }

  // Whole-dollar magnet levels. When price breaks out of the structural stack
  // (e.g. above the weekly high into blue sky), these guarantee there are
  // always reference points just above and below price. Generated within a
  // band around current price so the list never runs dry on a trending move.
  if (currentPrice != null && currentPrice > 0) {
    // Scale the step to the instrument: $1 for sub-$100 names, $1 still works
    // for QQQ/SPY-range; keep it whole-dollar which is what these respect.
    const step = 1
    const span = Math.max(5, Math.ceil(currentPrice * 0.01)) // ~1% each way, min $5
    const base = Math.floor(currentPrice)
    for (let p = base - span; p <= base + span + step; p += step) {
      if (p <= 0) continue
      // Skip if a structural level already sits within 10 cents — avoid clutter.
      if (levels.some(l => Math.abs(l.price - p) < 0.10)) continue
      add(p, `$${p}`, 'round', 'Whole-dollar level — intraday magnet')
    }
  }

  // Measured-move target: when price has broken above the weekly high (blue
  // sky), project an upside target = broken high + the day's opening range.
  // Gives a breakout something to aim at instead of empty space.
  const orRange = (orbHigh && orbLow && orbHigh > orbLow) ? (orbHigh - orbLow) : null
  if (currentPrice != null && weeklyData?.high && orRange) {
    if (currentPrice > weeklyData.high) {
      add(weeklyData.high + orRange, 'Measured Move ↑', 'target', `Breakout target = weekly high + OR range ($${orRange.toFixed(2)})`)
    }
    if (weeklyData.low && currentPrice < weeklyData.low) {
      add(weeklyData.low - orRange, 'Measured Move ↓', 'target', `Breakdown target = weekly low − OR range ($${orRange.toFixed(2)})`)
    }
  }

  // Volume Profile (POC, VAH, VAL, HVN, LVN)
  if (volProfile) {
    if (volProfile.poc != null) add(volProfile.poc, 'POC', 'poc', 'Point of Control — highest volume node, strongest S/R')
    if (volProfile.vah != null) add(volProfile.vah, 'VAH', 'vah', 'Value Area High — top 70% of volume')
    if (volProfile.val != null) add(volProfile.val, 'VAL', 'val', 'Value Area Low — bottom 70% of volume')
    for (const z of volProfile.hvn) add(z.price, 'HVN', 'hvn', `High Volume Node — ${z.volRatio.toFixed(1)}× avg — strong support/resistance`)
    for (const z of volProfile.lvn) add(z.price, 'LVN', 'lvn', `Low Volume Node — ${z.volRatio.toFixed(1)}× avg — price moves fast through here`)
  }

  // Sort by price, high to low
  levels.sort((a, b) => b.price - a.price)

  // Detect confluence (levels within $0.40 of each other)
  for (const lvl of levels) {
    const nearby = levels.filter(l => l !== lvl && Math.abs(l.price - lvl.price) < 0.40)
    lvl.confluence = nearby.length
    lvl.confluenceWith = nearby.map(l => l.label)
  }

  if (!currentPrice) return { levels, nearestAbove: null, nearestBelow: null, inZone: false, setupQuality: null, blueSkyUp: false, blueSkyDown: false }

  const above = levels.filter(l => l.price > currentPrice)
  const below = levels.filter(l => l.price <= currentPrice)
  const nearestAbove = above[above.length - 1] || null
  const nearestBelow = below[0] || null

  // Blue-sky flags: price has run past the entire structural stack on one side.
  // With round-dollar + measured-move levels added above, true blue sky is now
  // rare, but we still surface it so the trader knows breaking into space IS
  // the read rather than seeing a level list that's all on one side.
  const structuralAbove = above.filter(l => l.type !== 'round')
  const structuralBelow = below.filter(l => l.type !== 'round')
  const blueSkyUp = structuralAbove.length === 0
  const blueSkyDown = structuralBelow.length === 0

  // "In zone" = within $0.20 of any level
  const inZone = levels.some(l => Math.abs(l.price - currentPrice) < 0.20)

  // Setup quality score
  let setupQuality = null
  if (nearestAbove && nearestBelow) {
    const gapAbove = nearestAbove.price - currentPrice
    const gapBelow = currentPrice - nearestBelow.price
    const minGap = Math.min(gapAbove, gapBelow)

    if (minGap < 0.15) setupQuality = 'ON LEVEL'
    else if (minGap < 0.40) setupQuality = 'APPROACHING'
    else if (gapAbove + gapBelow < 1.50) setupQuality = 'TIGHT RANGE'
    else setupQuality = 'BETWEEN LEVELS'
  }

  return { levels, nearestAbove, nearestBelow, inZone, setupQuality, blueSkyUp, blueSkyDown }
}
