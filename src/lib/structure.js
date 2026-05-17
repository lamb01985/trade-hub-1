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
