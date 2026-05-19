// Short Thesis screener — scores a ticker 0..100 on the bear case.
// Composite of valuation, fundamental deterioration, short flow, and technical
// breakdown. Missing data is allowed — score is computed against available
// points and labelled "partial" so the user knows the picture isn't complete.

import { getFinancials, getTickerDetails, getSnapshot, getWeeklyBarsRange, getRecentNews, getShortInterest } from './massive.js'

// Early-warning universe: high-multiple growth names still near or recently
// near their 52-week highs. The goal is to find them BEFORE the breakdown.
export const DEFAULT_UNIVERSE = [
  'PLTR', 'SNOW', 'DDOG', 'NET', 'CRWD', 'SHOP',
  'MSTR', 'COIN', 'HOOD', 'DASH', 'UBER', 'LYFT',
  'RBLX', 'DUOL', 'PATH', 'AI', 'SOUN', 'RGTI',
  'IONQ', 'SMCI', 'NKLA', 'RIVN', 'LCID',
  'HIMS', 'RDDT', 'RXRX', 'ACHR', 'JOBY',
  'LUNR', 'RKLB', 'ASTS', 'WOLF', 'KTOS',
  'BFLY', 'PRCT', 'TMDX', 'DOCS', 'AEHR',
  'RELY', 'CELH', 'ARKG', 'ARKK',
]

// Weights: valuation 30, growth deceleration 35, cash burn 20, proximity 15
const WEIGHTS = { valuation: 30, growth: 35, cash: 20, proximity: 15 }

function pickRev(q) {
  return q?.financials?.income_statement?.revenues?.value
}
function pickEPS(q) {
  return q?.financials?.income_statement?.basic_earnings_per_share?.value
    ?? q?.financials?.income_statement?.diluted_earnings_per_share?.value
}
function pickGrossProfit(q) {
  return q?.financials?.income_statement?.gross_profit?.value
}
function pickFCF(q) {
  const cfo = q?.financials?.cash_flow_statement?.net_cash_flow_from_operating_activities?.value
  const capex = q?.financials?.cash_flow_statement?.net_cash_flow_from_investing_activities?.value
  if (cfo == null || capex == null) return null
  return cfo + capex  // capex is typically negative already
}

// ── Pull all data for one ticker ─────────────────────────────────────────────

export async function fetchTickerData(apiKey, ticker) {
  const [snapshot, financials, weekly, details, shortInt] = await Promise.all([
    getSnapshot(apiKey, ticker).catch(() => null),
    getFinancials(apiKey, ticker, 'quarterly', 8).catch(() => null),
    getWeeklyBarsRange(apiKey, ticker, 52).catch(() => []),
    getTickerDetails(apiKey, ticker).catch(() => null),
    getShortInterest(apiKey, ticker).catch(() => null),
  ])

  const price = snapshot?.day?.c || snapshot?.lastTrade?.p || snapshot?.prevDay?.c || null
  if (!price) {
    return { ticker, price: null, error: 'No price data' }
  }

  const fin = financials || []
  const revs = fin.map(pickRev).filter(v => v != null && v > 0)
  const eps = fin.map(pickEPS).filter(v => v != null)
  const gross = fin.map(pickGrossProfit).filter(v => v != null)
  const fcfs = fin.map(pickFCF).filter(v => v != null)

  const ttmRev = revs.slice(0, 4).reduce((s, r) => s + r, 0) || null
  const ttmEPS = eps.slice(0, 4).reduce((s, r) => s + r, 0) || null

  const shares = details?.weighted_shares_outstanding || details?.share_class_shares_outstanding || null
  const mktCap = shares && price ? shares * price : null
  const ps = mktCap && ttmRev ? mktCap / ttmRev : null
  const pe = ttmEPS && ttmEPS !== 0 ? price / ttmEPS : null

  // YoY revenue growth — compare q[i] to q[i+4]
  const yoyGrowth = []
  for (let i = 0; i + 4 < revs.length; i++) {
    if (revs[i + 4] > 0) yoyGrowth.push(((revs[i] - revs[i + 4]) / revs[i + 4]) * 100)
  }

  // Margin trend — gross margin per quarter, check if compressing
  const grossMargins = fin.map(q => {
    const r = pickRev(q), g = pickGrossProfit(q)
    return r > 0 && g != null ? (g / r) * 100 : null
  }).filter(v => v != null)
  const marginsCompressing = grossMargins.length >= 4
    ? grossMargins[0] < grossMargins[grossMargins.length - 1] - 1.5
    : false

  // FCF trend
  const fcfTurnedNegative = fcfs.length >= 2 && fcfs[0] < 0 && fcfs[fcfs.length - 1] > 0

  // Revenue growth deceleration — at least 2 consecutive declines
  let decelStreak = 0
  for (let i = 0; i + 1 < yoyGrowth.length; i++) {
    if (yoyGrowth[i] < yoyGrowth[i + 1]) decelStreak++
    else break
  }

  // 52-week high + days since that high was set
  let wHigh52 = null, daysFromHigh = null
  if (weekly.length) {
    let highBar = weekly[0]
    for (const b of weekly) if (b.h > highBar.h) highBar = b
    wHigh52 = highBar.h
    daysFromHigh = Math.max(0, Math.floor((Date.now() - highBar.t) / 86400000))
  }
  const fromHighPct = wHigh52 ? ((price - wHigh52) / wHigh52) * 100 : null

  // QoQ deceleration — most recent YoY growth vs the one before it. Positive
  // value here means growth is slowing (Q-1 YoY > Q-now YoY).
  const qoqDecel = (yoyGrowth.length >= 2 && yoyGrowth[1] != null)
    ? yoyGrowth[1] - yoyGrowth[0]
    : null

  // FCF worsening — most recent FCF more negative than prior
  const fcfWorsening = fcfs.length >= 2 ? (fcfs[0] < 0 && fcfs[0] < fcfs[1]) : false

  // Lower-highs structure — last 5 weekly highs trending down
  let lowerHighs = false
  if (weekly.length >= 6) {
    const recent = weekly.slice(-6).map(b => b.h)
    let downs = 0
    for (let i = 1; i < recent.length; i++) if (recent[i] < recent[i - 1]) downs++
    lowerHighs = downs >= 4
  }

  // Short interest fields (best-effort)
  const siPct = shortInt?.short_interest && shortInt?.average_daily_volume
    ? null  // we can't compute % of float without float; only days-to-cover
    : null
  const daysToCover = shortInt?.days_to_cover ?? null

  return {
    ticker,
    price,
    mktCap, shares,
    ps, pe, ttmRev, ttmEPS,
    revs, yoyGrowth, decelStreak,
    grossMargins, marginsCompressing,
    fcfs, fcfTurnedNegative,
    wHigh52, fromHighPct, daysFromHigh, lowerHighs,
    qoqDecel, fcfWorsening,
    weekly,
    shortInterest: shortInt,
    siPct, daysToCover,
    snapshot,
    financialsRaw: fin,
    detailsRaw: details,
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────────

// Early-warning scoring — find them BEFORE the breakdown.
// We deliberately do NOT reward stocks that already crashed (no "lower highs"
// or "% below high" bonuses). Stocks deep below their high get penalized.
export function scoreTicker(d) {
  if (!d || !d.price) return { score: 0, partial: true, components: {}, reasons: [], available: 0 }

  const components = { valuation: 0, growth: 0, cash: 0, proximity: 0 }
  const have = { valuation: false, growth: false, cash: false, proximity: false }
  const reasons = []

  // ── VALUATION EXTREME (max 30) ─────────────────────────────────────────────
  // The fuel. Higher valuation = further to fall when the multiple compresses.
  if (d.ps != null || (d.mktCap && d.ttmRev)) {
    have.valuation = true
    let pts = 0
    if (d.ps != null) {
      if (d.ps > 30) { pts += 30; reasons.push(`Extreme P/S ${d.ps.toFixed(1)}x`) }
      else if (d.ps > 20) { pts += 25; reasons.push(`Very high P/S ${d.ps.toFixed(1)}x`) }
      else if (d.ps > 15 && d.yoyGrowth?.[0] > 0) { pts += 20; reasons.push(`High P/S ${d.ps.toFixed(1)}x while still growing — dangerous`) }
    }
    if (d.mktCap && d.ttmRev && d.mktCap / d.ttmRev > 20) {
      pts += 5  // Cap/Rev redundant with P/S but adds bonus when both confirm
    }
    components.valuation = Math.min(30, pts)
  }

  // ── GROWTH DECELERATION (max 35) ───────────────────────────────────────────
  // The trigger. Still positive but slowing is the prime setup — once growth
  // is already negative the multiple has typically compressed.
  if (d.qoqDecel != null || d.marginsCompressing) {
    have.growth = true
    let pts = 0
    if (d.qoqDecel != null) {
      if (d.qoqDecel >= 20) { pts += 35; reasons.push(`Growth decelerated ${d.qoqDecel.toFixed(0)} pts QoQ`) }
      else if (d.qoqDecel >= 10) { pts += 25; reasons.push(`Growth decelerated ${d.qoqDecel.toFixed(0)} pts QoQ`) }
      else if (d.qoqDecel >= 5) { pts += 15; reasons.push(`Growth decelerated ${d.qoqDecel.toFixed(0)} pts QoQ`) }
    }
    if (d.marginsCompressing) { pts += 10; reasons.push('Gross margins compressing YoY') }
    components.growth = Math.min(35, pts)
  }

  // ── CASH BURN & DILUTION (max 20) ──────────────────────────────────────────
  if (d.fcfs?.length || d.shortInterest) {
    have.cash = true
    let pts = 0
    if (d.fcfWorsening) { pts += 15; reasons.push('FCF negative and worsening') }
    if (d.fcfs?.length && d.fcfs[0] < 0 && !d.fcfWorsening) { pts += 5 }
    // Short interest rising while stock near highs — smart money positioning
    if (d.shortInterest && d.fromHighPct != null && d.fromHighPct > -20) {
      pts += 15
      reasons.push('Short interest building while stock still near highs')
    }
    components.cash = Math.min(20, pts)
  }

  // ── PROXIMITY TO HIGH (max +15, can go to -40) ─────────────────────────────
  // Key inversion: we WANT stocks near their highs. Already-crashed stocks
  // are penalized because the move is mostly done.
  if (d.fromHighPct != null) {
    have.proximity = true
    let pts = 0
    if (d.fromHighPct >= -10) { pts += 15; reasons.push(`Within ${Math.abs(d.fromHighPct).toFixed(0)}% of 52w high — full downside available`) }
    else if (d.fromHighPct >= -20) { pts += 10 }
    else if (d.fromHighPct >= -30) { pts += 5 }
    else if (d.fromHighPct <= -70) { pts -= 40; reasons.push(`${Math.abs(d.fromHighPct).toFixed(0)}% below high — most of move done`) }
    else if (d.fromHighPct <= -50) { pts -= 20 }
    components.proximity = pts
  }

  const rawTotal = components.valuation + components.growth + components.cash + components.proximity
  const availableWeight = (have.valuation ? WEIGHTS.valuation : 0)
    + (have.growth ? WEIGHTS.growth : 0)
    + (have.cash ? WEIGHTS.cash : 0)
    + (have.proximity ? WEIGHTS.proximity : 0)
  const score = availableWeight ? Math.max(0, Math.min(100, Math.round((rawTotal / availableWeight) * 100))) : 0
  const partial = availableWeight < 100

  return { score, partial, components, reasons, available: availableWeight, have }
}

// ── Setup stage (drives DTE guidance) ────────────────────────────────────────

export const MOMENTUM_MEME_TICKERS = new Set([
  'SOUN', 'RGTI', 'IONQ', 'BBAI', 'MSTR', 'SMCI',
  'COIN', 'HOOD', 'RIVN', 'LCID', 'NKLA', 'BYND',
])

// Early-warning stage: 1 = best entry (still near highs), 4 = too late.
// Stage is driven by proximity to 52-week high — the only honest measure of
// how much of the move is still ahead of us.
export function setupStage(d) {
  if (!d || !d.price || d.fromHighPct == null) return null
  const p = d.fromHighPct
  if (p >= -15) return {
    stage: 1, label: 'PRE-BREAKDOWN', icon: '🎯',
    dteRange: '45-60',
    background: '#170d22',
    dteCopy: 'Stock still near highs. Thesis developing but not confirmed. Best risk/reward — most downside still available. Wait for the first technical signal but build a watchlist position.',
  }
  if (p >= -35) return {
    stage: 2, label: 'CRACK FORMING', icon: '⚠',
    dteRange: '30-45',
    background: '#1a0e04',
    dteCopy: 'Breakdown beginning. Fundamentals clearly deteriorating, structure starting to roll. Enter on failed bounces — solid setup with most of the move still ahead.',
  }
  if (p >= -60) return {
    stage: 3, label: 'IN PROGRESS', icon: '📉',
    dteRange: '21-30',
    background: '#150505',
    dteCopy: 'Partial move done. Thesis playing out but less upside remains. Tradeable on continuation but size smaller.',
  }
  return {
    stage: 4, label: 'TOO LATE', icon: '❌',
    dteRange: 'skip',
    background: '#0a0a0a',
    dteCopy: 'Most of the move already played out. Skip — find earlier setups instead.',
  }
}

export function stageColor(stage) {
  switch (stage) {
    case 1: return '#a78bfa'  // purple
    case 2: return '#F97316'  // orange
    case 3: return '#FF4D4D'  // red
    case 4: return '#555'     // gray
    default: return '#666'
  }
}

// Days-since-52w-high freshness indicator
export function highFreshness(daysFromHigh) {
  if (daysFromHigh == null) return null
  if (daysFromHigh < 30) return { label: 'Very recent high', icon: '🔴', color: '#FF4D4D' }
  if (daysFromHigh < 90) return { label: 'Recent high', icon: '🟠', color: '#F97316' }
  if (daysFromHigh < 180) return { label: 'Aging high', icon: '🟡', color: '#FFD166' }
  return { label: 'Old high', icon: '⚪', color: '#888' }
}

// Timing-risk overlay — separate from conviction score because a high-quality
// short thesis still doesn't mean enter today if the stock is ripping.
export function timingRisk(d) {
  if (!d?.snapshot) return { level: 'NONE', score: 0, msg: 'No live data.' }
  const todayPct = d.snapshot.todaysChangePerc ?? (d.snapshot.day?.c && d.snapshot.prevDay?.c ? ((d.snapshot.day.c - d.snapshot.prevDay.c) / d.snapshot.prevDay.c) * 100 : null)
  if (todayPct == null) return { level: 'NONE', score: 0, todayPct: null, msg: 'Today change unavailable.' }
  let score = 0, level = 'LOW', msg = ''
  if (todayPct >= 20) { score = 60; level = 'EXTREME'; msg = `Stock up ${todayPct.toFixed(1)}% today — wait for the fade. Buying puts into this rip is throwing money away.` }
  else if (todayPct >= 10) { score = 40; level = 'HIGH'; msg = `Stock ripping ${todayPct.toFixed(1)}% today — do not chase. Wait for the failed rally.` }
  else if (todayPct >= 5) { score = 20; level = 'ELEVATED'; msg = `Stock up ${todayPct.toFixed(1)}% today — let it cool. Enter on the fade, not the rip.` }
  else if (todayPct >= 0) { score = 5; level = 'LOW'; msg = 'No squeeze risk today.' }
  else { score = 0; level = 'NONE'; msg = `Stock down ${Math.abs(todayPct).toFixed(1)}% — no timing-risk penalty.` }
  return { level, score, todayPct, msg }
}

export function isMomentumMeme(ticker) {
  return MOMENTUM_MEME_TICKERS.has((ticker || '').toUpperCase())
}

// ── Score interpretation ─────────────────────────────────────────────────────

export function scoreLabel(score) {
  if (score >= 81) return { label: 'STRONG PUT', tier: 'strong', icon: '🔴' }
  if (score >= 61) return { label: 'PUT CANDIDATE', tier: 'candidate', icon: '🟠' }
  if (score >= 41) return { label: 'WATCH', tier: 'watch', icon: '🟡' }
  if (score >= 26) return { label: 'MONITOR', tier: 'monitor', icon: '⚪' }
  return { label: 'CLEAN', tier: 'clean', icon: '✓' }
}

// ── Scan universe with progress callback ─────────────────────────────────────

export async function scanUniverse(apiKey, tickers, onProgress) {
  const results = []
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]
    try {
      const data = await fetchTickerData(apiKey, ticker)
      const scored = scoreTicker(data)
      const stage = setupStage(data)
      const timing = timingRisk(data)
      const isMeme = isMomentumMeme(ticker)
      const entry = { ticker, data, stage, timing, isMeme, ...scored, ...scoreLabel(scored.score) }
      results.push(entry)
      onProgress?.({ done: i + 1, total: tickers.length, current: ticker, entry, all: [...results] })
    } catch (err) {
      const entry = { ticker, data: null, error: err.message, score: 0, partial: true, components: {}, reasons: [], ...scoreLabel(0) }
      results.push(entry)
      onProgress?.({ done: i + 1, total: tickers.length, current: ticker, entry, all: [...results] })
    }
  }
  return results
}
