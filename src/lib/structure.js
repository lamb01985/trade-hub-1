// Market structure analysis — swing detection, HH/HL/LH/LL labeling,
// trend state (BULLISH/BEARISH/RANGING/TRANSITION), BOS and CHoCH.
// Operates on bar arrays of shape { t, o, h, l, c, v }.

export function detectSwings(bars, lookback = 3) {
  if (!bars || bars.length < lookback * 2 + 1) return []
  const swings = []
  for (let i = lookback; i < bars.length - lookback; i++) {
    const bar = bars[i]
    let isHigh = true, isLow = true
    for (let j = 1; j <= lookback; j++) {
      if (bars[i - j].h >= bar.h || bars[i + j].h >= bar.h) isHigh = false
      if (bars[i - j].l <= bar.l || bars[i + j].l <= bar.l) isLow = false
      if (!isHigh && !isLow) break
    }
    if (isHigh) swings.push({ type: 'high', price: bar.h, time: bar.t, index: i })
    if (isLow) swings.push({ type: 'low', price: bar.l, time: bar.t, index: i })
  }
  return swings.sort((a, b) => a.time - b.time)
}

export function labelSwings(swings) {
  const labeled = []
  let lastHigh = null, lastLow = null
  for (const s of swings) {
    let label = ''
    if (s.type === 'high') {
      label = lastHigh ? (s.price > lastHigh.price ? 'HH' : 'LH') : 'H'
      lastHigh = s
    } else {
      label = lastLow ? (s.price > lastLow.price ? 'HL' : 'LL') : 'L'
      lastLow = s
    }
    labeled.push({ ...s, label })
  }
  return labeled
}

export function analyzeStructure(labeled) {
  if (labeled.length < 2) return { state: 'RANGING', strength: 0, direction: 0, choch: null, lastSwings: labeled }

  // Trend strength: consecutive same-direction labels from the end
  let direction = 0, strength = 0
  for (let i = labeled.length - 1; i >= 0; i--) {
    const lbl = labeled[i].label
    const bullish = lbl === 'HH' || lbl === 'HL'
    const bearish = lbl === 'LH' || lbl === 'LL'
    if (direction === 0) {
      if (bullish) { direction = 1; strength = 1 }
      else if (bearish) { direction = -1; strength = 1 }
      else break
    } else if (direction === 1 && bullish) strength++
    else if (direction === -1 && bearish) strength++
    else break
  }

  // CHoCH: latest swing flips the prior trend
  let choch = null
  if (labeled.length >= 3) {
    const latest = labeled[labeled.length - 1]
    const prior = labeled.slice(0, -1).slice(-3)
    const priorBull = prior.filter(s => s.label === 'HH' || s.label === 'HL').length
    const priorBear = prior.filter(s => s.label === 'LH' || s.label === 'LL').length
    if (priorBear >= 2 && latest.label === 'HH') choch = { type: 'bullish', swing: latest }
    else if (priorBull >= 2 && latest.label === 'LL') choch = { type: 'bearish', swing: latest }
  }

  let state
  if (choch) state = 'TRANSITION'
  else if (direction === 1 && strength >= 2) state = 'BULLISH'
  else if (direction === -1 && strength >= 2) state = 'BEARISH'
  else state = 'RANGING'

  return { state, strength, direction, choch, lastSwings: labeled.slice(-4) }
}

// Break of Structure: the most recent close that pierced an unbroken prior swing
export function detectBOS(swings, bars) {
  if (!swings.length || !bars?.length) return null
  const lastBar = bars[bars.length - 1]
  const close = lastBar.c
  const time = lastBar.t

  const highs = swings.filter(s => s.type === 'high' && s.time < time)
  const lows = swings.filter(s => s.type === 'low' && s.time < time)

  // Bullish BOS: close above most recent unbroken swing high
  for (let i = highs.length - 1; i >= Math.max(0, highs.length - 5); i--) {
    if (close > highs[i].price) {
      // Find which bar triggered the break (first bar after the swing that closed above it)
      let breakIdx = bars.length - 1
      for (let j = 0; j < bars.length; j++) {
        if (bars[j].t > highs[i].time && bars[j].c > highs[i].price) { breakIdx = j; break }
      }
      return { type: 'bullish', price: highs[i].price, swingTime: highs[i].time, breakTime: bars[breakIdx]?.t || time, barsAgo: bars.length - 1 - breakIdx }
    }
  }
  for (let i = lows.length - 1; i >= Math.max(0, lows.length - 5); i--) {
    if (close < lows[i].price) {
      let breakIdx = bars.length - 1
      for (let j = 0; j < bars.length; j++) {
        if (bars[j].t > lows[i].time && bars[j].c < lows[i].price) { breakIdx = j; break }
      }
      return { type: 'bearish', price: lows[i].price, swingTime: lows[i].time, breakTime: bars[breakIdx]?.t || time, barsAgo: bars.length - 1 - breakIdx }
    }
  }
  return null
}

export function fullAnalysis(bars) {
  const raw = detectSwings(bars)
  const labeled = labelSwings(raw)
  const analysis = analyzeStructure(labeled)
  const bos = detectBOS(raw, bars)
  return { swings: labeled, ...analysis, bos }
}

// Aggregate 1-min bars into N-min bars (OHLCV)
export function aggregateBars(bars, mins) {
  if (!bars?.length) return []
  if (mins === 1) return bars
  const bucketMs = mins * 60000
  const groups = new Map()
  for (const b of bars) {
    const bucket = Math.floor(b.t / bucketMs) * bucketMs
    const existing = groups.get(bucket)
    if (!existing) {
      groups.set(bucket, { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })
    } else {
      existing.h = Math.max(existing.h, b.h)
      existing.l = Math.min(existing.l, b.l)
      existing.c = b.c
      existing.v += b.v
    }
  }
  return [...groups.values()].sort((a, b) => a.t - b.t)
}

// Multi-timeframe alignment score. mtf is { '1h': ..., '15m': ..., '5m': ..., '1m': ... }.
// Weighted scoring: 1H 35% / 15M 30% / 5M 20% / 1M 15%. Higher TFs dominate.
// Returns { score, direction, confidence, label, recommendation }.
const MTF_WEIGHTS = { '1h': 0.35, '15m': 0.30, '5m': 0.20, '1m': 0.15 }

export function alignmentScore(mtf, rvol) {
  if (!mtf) {
    return { score: 0, direction: 'NO DATA', confidence: 'NONE', label: 'NO DATA', recommendation: 'Waiting for bars to populate timeframes.' }
  }

  // Weighted vote across whichever TFs have analysis. Missing TFs contribute 0.
  let bullWeight = 0, bearWeight = 0, presentWeight = 0
  for (const [tf, w] of Object.entries(MTF_WEIGHTS)) {
    const s = mtf[tf]?.state
    if (!s) continue
    presentWeight += w
    if (s === 'BULLISH') bullWeight += w
    else if (s === 'BEARISH') bearWeight += w
  }

  if (presentWeight === 0) {
    return { score: 0, direction: 'NO DATA', confidence: 'NONE', label: 'NO DATA', recommendation: 'Waiting for bars to populate timeframes.' }
  }

  const direction = bullWeight > bearWeight ? 'BULLISH' : bearWeight > bullWeight ? 'BEARISH' : 'NO BIAS'
  const dominant = Math.max(bullWeight, bearWeight)
  // Normalize against present weight so partial data doesn't artificially deflate the score
  const baseScore = Math.round((dominant / presentWeight) * 100)

  const rvolMult = rvol == null ? 1 : rvol > 1.5 ? 1.15 : rvol >= 1.0 ? 1.0 : 0.85
  const score = Math.min(100, Math.round(baseScore * rvolMult))

  let label, confidence
  if (score >= 85) { label = direction === 'BEARISH' ? 'STRONG BEAR' : direction === 'BULLISH' ? 'STRONG BULL' : 'MIXED'; confidence = 'HIGH' }
  else if (score >= 70) { label = direction === 'BEARISH' ? 'BEAR BIAS' : direction === 'BULLISH' ? 'BULL BIAS' : 'MIXED'; confidence = 'MODERATE' }
  else if (score >= 55) { label = 'MIXED — WAIT'; confidence = 'LOW' }
  else if (score >= 40) { label = 'CONFLICTED'; confidence = 'LOW' }
  else { label = 'NO SETUP'; confidence = 'NONE' }

  const s1 = mtf['1m']?.state, s5 = mtf['5m']?.state, s15 = mtf['15m']?.state, s60 = mtf['1h']?.state
  let recommendation
  if (score >= 85) {
    recommendation = `HIGH CONVICTION — 1H / 15M / 5M / 1M all ${direction.toLowerCase()}. Full size on confirmation.`
  } else if (score >= 70) {
    let pullback = ''
    if (direction === 'BULLISH' && s1 === 'BEARISH') pullback = ' 1m pulling back — watch for 1m structure flip as entry trigger.'
    else if (direction === 'BEARISH' && s1 === 'BULLISH') pullback = ' 1m bouncing — watch for 1m flip as short entry trigger.'
    else pullback = ' Wait for 1m confirmation.'
    const higher = s60 === direction && s15 === direction ? '1H and 15M' : s60 === direction ? '1H' : s15 === direction ? '15M' : 'lower TFs'
    recommendation = `${direction} BIAS — ${higher} aligned ${direction.toLowerCase()}.${pullback}`
  } else if (score >= 55) {
    recommendation = `MIXED SIGNALS — higher TFs not fully agreed. Reduce size 50%. Only take A+ level confluences.`
  } else if (score >= 40) {
    recommendation = 'CONFLICTED — 1H and lower TFs disagree. Stand aside.'
  } else {
    recommendation = 'LOW CONVICTION — no clean setup. Watch only.'
  }

  return { score, direction, confidence, label, recommendation }
}

// Build MTF analysis from 1-min intradayBars. Includes 1H (uses partial-hour
// aggregation when fewer than 60 1-min bars are present in the most recent hour).
export function computeMTF(intradayBars) {
  const bars = intradayBars || []
  if (bars.length < 15) return null
  const out = {}
  for (const tf of [{ id: '1m', mins: 1 }, { id: '5m', mins: 5 }, { id: '15m', mins: 15 }, { id: '1h', mins: 60 }]) {
    out[tf.id] = fullAnalysis(aggregateBars(bars, tf.mins))
  }
  return out
}
