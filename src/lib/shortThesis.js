// Short Thesis screener — scores a ticker 0..100 on the bear case.
// Composite of valuation, fundamental deterioration, short flow, and technical
// breakdown. Missing data is allowed — score is computed against available
// points and labelled "partial" so the user knows the picture isn't complete.

import { getFinancials, getTickerDetails, getSnapshot, getWeeklyBarsRange, getRecentNews, getShortInterest } from './massive.js'

export const DEFAULT_UNIVERSE = [
  'TSLA', 'PLTR', 'COIN', 'RBLX', 'DUOL', 'SNOW', 'DDOG',
  'CRWD', 'NET', 'SHOP', 'MSTR', 'SMCI', 'IONQ', 'RGTI',
  'SOUN', 'HOOD', 'RIVN', 'LCID', 'NKLA', 'BYND',
  'W', 'CHWY', 'DASH', 'UBER', 'LYFT', 'ZM', 'DOCU',
  'PATH', 'AI', 'BBAI',
]

const WEIGHTS = { valuation: 35, fundamental: 35, shortflow: 20, technical: 10 }

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

  // 52-week high
  const wHigh52 = weekly.length ? Math.max(...weekly.map(b => b.h)) : null
  const fromHighPct = wHigh52 ? ((price - wHigh52) / wHigh52) * 100 : null

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
    wHigh52, fromHighPct, lowerHighs,
    weekly,
    shortInterest: shortInt,
    siPct, daysToCover,
    snapshot,
    financialsRaw: fin,
    detailsRaw: details,
  }
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function scoreTicker(d) {
  if (!d || !d.price) return { score: 0, partial: true, components: {}, reasons: [], available: 0 }

  const components = { valuation: 0, fundamental: 0, shortflow: 0, technical: 0 }
  const have = { valuation: false, fundamental: false, shortflow: false, technical: false }
  const reasons = []

  // ── Valuation (max 35) ─────────────────────────────────────────────────────
  if (d.ps != null || d.pe != null || d.ttmEPS != null || d.fcfs?.length) {
    have.valuation = true
    let pts = 0
    if (d.ps != null) {
      if (d.ps > 20) { pts += 30; reasons.push(`Extreme P/S ${d.ps.toFixed(1)}x`) }
      else if (d.ps > 10) { pts += 20; reasons.push(`Very high P/S ${d.ps.toFixed(1)}x`) }
      else if (d.ps > 5) { pts += 10; reasons.push(`Elevated P/S ${d.ps.toFixed(1)}x`) }
    }
    if (d.pe != null && d.pe > 0) {
      if (d.pe > 100) pts += 20
      else if (d.pe > 50) pts += 10
    }
    if (d.ttmEPS != null && d.ttmEPS < 0) { pts += 15; reasons.push('Negative TTM EPS') }
    if (d.fcfs?.length && d.fcfs[0] < 0) { pts += 10; reasons.push('Negative free cash flow') }
    components.valuation = Math.min(35, pts)
  }

  // ── Fundamental deterioration (max 35) ─────────────────────────────────────
  if (d.yoyGrowth?.length || d.marginsCompressing || d.fcfTurnedNegative) {
    have.fundamental = true
    let pts = 0
    if (d.decelStreak >= 2) { pts += 20; reasons.push(`Revenue growth decelerating ${d.decelStreak + 1} quarters`) }
    if (d.yoyGrowth?.[0] != null && d.yoyGrowth[0] < 0) { pts += 30; reasons.push(`Revenue growth negative YoY (${d.yoyGrowth[0].toFixed(1)}%)`) }
    if (d.marginsCompressing) { pts += 15; reasons.push('Gross margins compressing') }
    if (d.fcfTurnedNegative) { pts += 20; reasons.push('FCF turned negative from positive') }
    components.fundamental = Math.min(35, pts)
  }

  // ── Short flow (max 20) ────────────────────────────────────────────────────
  if (d.shortInterest || d.daysToCover != null) {
    have.shortflow = true
    let pts = 0
    if (d.daysToCover != null && d.daysToCover > 5) { pts += 10; reasons.push(`Days to cover ${d.daysToCover.toFixed(1)}`) }
    components.shortflow = Math.min(20, pts)
  }

  // ── Technical (max 10) ─────────────────────────────────────────────────────
  if (d.fromHighPct != null || d.lowerHighs) {
    have.technical = true
    let pts = 0
    if (d.fromHighPct != null) {
      if (d.fromHighPct < -60) { pts += 20; reasons.push(`${Math.abs(d.fromHighPct).toFixed(0)}% below 52w high`) }
      else if (d.fromHighPct < -40) { pts += 10 }
      else if (d.fromHighPct < -20) { pts += 5 }
    }
    if (d.lowerHighs) { pts += 15; reasons.push('Lower-highs structure (bearish)') }
    components.technical = Math.min(10, pts)
  }

  const rawTotal = components.valuation + components.fundamental + components.shortflow + components.technical
  const availableWeight = (have.valuation ? WEIGHTS.valuation : 0)
    + (have.fundamental ? WEIGHTS.fundamental : 0)
    + (have.shortflow ? WEIGHTS.shortflow : 0)
    + (have.technical ? WEIGHTS.technical : 0)
  const score = availableWeight ? Math.min(100, Math.round((rawTotal / availableWeight) * 100)) : 0
  const partial = availableWeight < 100

  return { score, partial, components, reasons, available: availableWeight, have }
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
      const entry = { ticker, data, ...scored, ...scoreLabel(scored.score) }
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
