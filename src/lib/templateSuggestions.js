// ─────────────────────────────────────────────────────────────────────────────
// templateSuggestions.js — rank setup templates by how well they match a
// selected universe's aggregate characteristics.
//
// Input: an array of per-ticker rows already hydrated by UniverseBuilder
//   ({ ticker, price, rsi14, dist50, dist200, fromHighPct, marketCap, sector,
//      ema200, psRatio?, peRatio? })
//
// Output: top-N { template, matchScore (0-100), reasoning, exemplars[] }
// sorted by match score descending, filtered to matches above the threshold.
//
// Scoring is a small bag of heuristics per template id. The goal is to
// surface obvious-fit candidates, not to be Bayesian. Add new template ids
// to the SCORERS map as templates evolve.
// ─────────────────────────────────────────────────────────────────────────────

import { TEMPLATE_BY_ID, SETUP_TEMPLATES } from './setupTemplates.js'

function mean(arr) {
  const vs = arr.filter(v => v != null && !isNaN(v))
  if (!vs.length) return null
  return vs.reduce((s, v) => s + v, 0) / vs.length
}
function pct(arr, predicate) {
  const vs = arr.filter(v => v != null)
  if (!vs.length) return null
  return vs.filter(predicate).length / vs.length
}

// Aggregate the selected universe into a single profile object the scorers
// consume. Computed once and reused.
export function aggregateProfile(rows) {
  if (!rows?.length) return null
  const rsis = rows.map(r => r.rsi14)
  const d50s = rows.map(r => r.dist50)
  const d200s = rows.map(r => r.dist200)
  const fhs = rows.map(r => r.fromHighPct)
  const pss = rows.map(r => r.psRatio).filter(v => v != null)
  const mcs = rows.map(r => r.marketCap).filter(v => v != null)
  // Sector concentration: dominant sector + share.
  const sectorCounts = {}
  for (const r of rows) {
    const s = r.sector?.trim()
    if (!s) continue
    sectorCounts[s] = (sectorCounts[s] || 0) + 1
  }
  let dominantSector = null
  let dominantShare = 0
  for (const [s, c] of Object.entries(sectorCounts)) {
    const share = c / rows.length
    if (share > dominantShare) { dominantSector = s; dominantShare = share }
  }
  return {
    n: rows.length,
    avgRsi: mean(rsis),
    avgDist50: mean(d50s),
    avgDist200: mean(d200s),
    avgFromHighPct: mean(fhs),
    avgPsRatio: pss.length ? mean(pss) : null,
    avgMarketCap: mcs.length ? mean(mcs) : null,
    pctAboveEma50: pct(d50s, v => v > 0),
    pctAboveEma200: pct(d200s, v => v > 0),
    pctRsiOversold: pct(rsis, v => v < 35),
    pctRsiOverbought: pct(rsis, v => v > 65),
    pctNearHigh: pct(fhs, v => v > -5),
    pctDeepDrawdown: pct(fhs, v => v < -20),
    dominantSector,
    dominantShare,
  }
}

// Pick up to three rows that best exemplify the template for the reasoning
// blurb. e.g. for an RSI-pullback long: the lowest-RSI names.
function exemplarsFor(templateId, rows) {
  if (!rows?.length) return []
  const sortKey = ({
    ema_9_21_bounce_uptrend: r => r.rsi14 ?? 99,
    ema_50_bounce_uptrend: r => r.rsi14 ?? 99,
    minervini_vcp: r => Math.abs((r.dist50 ?? 0)),
    episodic_pivot_long: r => -(r.dist200 ?? -99),
    bull_flag_breakout: r => -(r.dist50 ?? -99),
    parabolic_exhaustion_short: r => -(r.rsi14 ?? 0),
    failed_breakout_fade: r => -(r.dist50 ?? -99),
    multiple_compression_short: r => -(r.psRatio ?? 0),
    distribution_breakdown_short: r => r.dist50 ?? 99,
    lower_high_reversal_short: r => r.dist50 ?? 99,
    csp_wheel_on_quality: r => r.rsi14 ?? 99,
    iron_condor_low_iv: r => Math.abs((r.dist50 ?? 0)),
    orb_long: r => -(r.rsi14 ?? 0),
    vwap_reclaim_long: r => -(r.dist50 ?? -99),
    pdh_fade_short: r => -(r.rsi14 ?? 0),
  })[templateId] || (() => 0)
  return [...rows]
    .filter(r => r.rsi14 != null)
    .sort((a, b) => sortKey(a) - sortKey(b))
    .slice(0, 3)
}

// Scoring + reasoning bag. Each scorer returns { score, reasons[] } where
// reasons are the bullets used to assemble the human paragraph below.
// Returning score < 0 is fine; the caller clamps to 0.
const SCORERS = {
  parabolic_exhaustion_short: (a) => {
    const reasons = []
    let score = 0
    if (a.avgRsi != null && a.avgRsi > 70) { score += 35; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (overbought)`) }
    else if (a.avgRsi != null && a.avgRsi > 65) { score += 20; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (extended)`) }
    if (a.pctAboveEma200 != null && a.pctAboveEma200 > 0.8) { score += 25; reasons.push(`${Math.round(a.pctAboveEma200 * 100)}% of names above the 200 EMA (full uptrend)`) }
    if (a.pctNearHigh != null && a.pctNearHigh > 0.5) { score += 20; reasons.push(`${Math.round(a.pctNearHigh * 100)}% within 5% of their 52W high`) }
    if (a.avgDist50 != null && a.avgDist50 > 8) { score += 10; reasons.push(`avg ${a.avgDist50.toFixed(1)}% extended above the 50 EMA`) }
    return { score, reasons }
  },
  ema_9_21_bounce_uptrend: (a) => {
    const reasons = []
    let score = 0
    if (a.avgRsi != null && a.avgRsi >= 30 && a.avgRsi <= 50) { score += 35; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (pullback zone)`) }
    if (a.pctAboveEma200 != null && a.pctAboveEma200 > 0.7) { score += 30; reasons.push(`${Math.round(a.pctAboveEma200 * 100)}% above the 200 EMA`) }
    if (a.pctAboveEma50 != null && a.pctAboveEma50 > 0.4 && a.pctAboveEma50 < 0.8) { score += 15; reasons.push(`mixed 50 EMA position (${Math.round(a.pctAboveEma50 * 100)}%) consistent with shallow pullbacks`) }
    return { score, reasons }
  },
  ema_50_bounce_uptrend: (a) => {
    const reasons = []
    let score = 0
    if (a.avgRsi != null && a.avgRsi >= 35 && a.avgRsi <= 50) { score += 30; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (deeper pullback)`) }
    if (a.pctAboveEma200 != null && a.pctAboveEma200 > 0.6) { score += 25; reasons.push(`${Math.round(a.pctAboveEma200 * 100)}% above the 200 EMA`) }
    if (a.avgDist50 != null && Math.abs(a.avgDist50) <= 5) { score += 20; reasons.push(`avg ${a.avgDist50.toFixed(1)}% from the 50 EMA (close to the line)`) }
    return { score, reasons }
  },
  minervini_vcp: (a) => {
    const reasons = []
    let score = 0
    if (a.avgRsi != null && a.avgRsi >= 50 && a.avgRsi <= 65) { score += 25; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (mid-range, base-building)`) }
    if (a.pctAboveEma200 != null && a.pctAboveEma200 > 0.7) { score += 20; reasons.push(`${Math.round(a.pctAboveEma200 * 100)}% above 200 EMA`) }
    if (a.pctNearHigh != null && a.pctNearHigh > 0.5) { score += 15; reasons.push(`${Math.round(a.pctNearHigh * 100)}% within 5% of 52W high (potential breakout candidates)`) }
    return { score, reasons }
  },
  episodic_pivot_long: (a) => {
    const reasons = []
    let score = 0
    if (a.pctRsiOverbought != null && a.pctRsiOverbought > 0.4) { score += 15; reasons.push(`${Math.round(a.pctRsiOverbought * 100)}% overbought (post-gap)`) }
    if (a.pctNearHigh != null && a.pctNearHigh > 0.4) { score += 15; reasons.push(`${Math.round(a.pctNearHigh * 100)}% near 52W high`) }
    return { score, reasons }
  },
  bull_flag_breakout: (a) => {
    const reasons = []
    let score = 0
    if (a.pctAboveEma200 != null && a.pctAboveEma200 > 0.6) { score += 20; reasons.push(`${Math.round(a.pctAboveEma200 * 100)}% in uptrend`) }
    if (a.avgRsi != null && a.avgRsi >= 50 && a.avgRsi <= 70) { score += 20; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (momentum holding)`) }
    return { score, reasons }
  },
  failed_breakout_fade: (a) => {
    const reasons = []
    let score = 0
    if (a.pctAboveEma200 != null && a.pctAboveEma200 < 0.4) { score += 20; reasons.push(`only ${Math.round((a.pctAboveEma200 || 0) * 100)}% above 200 EMA (weak tape)`) }
    if (a.avgRsi != null && a.avgRsi < 50) { score += 15; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)}`) }
    return { score, reasons }
  },
  multiple_compression_short: (a) => {
    const reasons = []
    let score = 0
    if (a.avgPsRatio != null && a.avgPsRatio > 20) { score += 35; reasons.push(`avg P/S ${a.avgPsRatio.toFixed(1)} (extended valuation)`) }
    else if (a.avgPsRatio != null && a.avgPsRatio > 12) { score += 18; reasons.push(`avg P/S ${a.avgPsRatio.toFixed(1)} (elevated)`) }
    if (a.avgFromHighPct != null && a.avgFromHighPct < -10) { score += 20; reasons.push(`avg ${a.avgFromHighPct.toFixed(0)}% off the 52W high (already breaking down)`) }
    if (a.dominantSector && a.dominantShare > 0.5) { score += 8; reasons.push(`${Math.round(a.dominantShare * 100)}% concentrated in ${a.dominantSector}`) }
    return { score, reasons }
  },
  distribution_breakdown_short: (a) => {
    const reasons = []
    let score = 0
    if (a.pctAboveEma200 != null && a.pctAboveEma200 < 0.3) { score += 30; reasons.push(`${Math.round((1 - (a.pctAboveEma200 || 0)) * 100)}% below 200 EMA (bear regime)`) }
    if (a.avgFromHighPct != null && a.avgFromHighPct < -20) { score += 25; reasons.push(`avg ${a.avgFromHighPct.toFixed(0)}% off 52W high`) }
    if (a.avgRsi != null && a.avgRsi < 45) { score += 10; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)}`) }
    return { score, reasons }
  },
  lower_high_reversal_short: (a) => {
    const reasons = []
    let score = 0
    if (a.avgDist50 != null && a.avgDist50 < 0 && a.avgDist50 > -5) { score += 20; reasons.push(`avg ${a.avgDist50.toFixed(1)}% below the 50 EMA (rejection zone)`) }
    if (a.pctAboveEma200 != null && a.pctAboveEma200 < 0.5) { score += 15; reasons.push(`${Math.round((1 - (a.pctAboveEma200 || 0)) * 100)}% under the 200 EMA`) }
    return { score, reasons }
  },
  csp_wheel_on_quality: (a) => {
    const reasons = []
    let score = 0
    if (a.pctAboveEma200 != null && a.pctAboveEma200 > 0.7) { score += 25; reasons.push(`${Math.round(a.pctAboveEma200 * 100)}% above 200 EMA (quality uptrends)`) }
    if (a.avgRsi != null && a.avgRsi < 50) { score += 20; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (mild pullback)`) }
    if (a.avgMarketCap != null && a.avgMarketCap > 50e9) { score += 10; reasons.push(`avg market cap $${(a.avgMarketCap / 1e9).toFixed(0)}B (large, liquid)`) }
    return { score, reasons }
  },
  iron_condor_low_iv: (a) => {
    const reasons = []
    let score = 0
    if (a.avgRsi != null && a.avgRsi >= 45 && a.avgRsi <= 55) { score += 25; reasons.push(`avg RSI ${a.avgRsi.toFixed(0)} (range-bound)`) }
    if (a.avgDist50 != null && Math.abs(a.avgDist50) < 3) { score += 15; reasons.push(`avg ${a.avgDist50.toFixed(1)}% from the 50 EMA (sitting in the middle)`) }
    return { score, reasons }
  },
  orb_long: () => ({ score: 5, reasons: ['Intraday template; static-universe match score is low by design'] }),
  vwap_reclaim_long: () => ({ score: 5, reasons: ['Intraday template; static-universe match score is low by design'] }),
  pdh_fade_short: () => ({ score: 5, reasons: ['Intraday template; static-universe match score is low by design'] }),
}

function scoreTemplate(template, aggregates) {
  const fn = SCORERS[template.id]
  if (!fn) return { score: 0, reasons: [] }
  const r = fn(aggregates)
  return { score: Math.max(0, Math.min(100, Math.round(r.score))), reasons: r.reasons || [] }
}

function buildReasoning(template, aggregates, reasons, exemplars) {
  if (!reasons?.length) return ''
  const lead = `Your selection ${reasons.slice(0, 2).join(' and ')}.`
  const tail = reasons.length > 2 ? ` ${reasons.slice(2).join(' ')}.` : ''
  const cat = exemplars?.length ? ` Best fit in basket: ${exemplars.map(e => e.ticker).join(', ')}.` : ''
  return `${lead}${tail} This matches the "${template.name}" pattern.${cat}`
}

// Main entry. Returns top N suggestions sorted by match score, filtered to
// matches above the threshold.
export function suggestTemplates(selectedRows, { threshold = 40, topN = 5 } = {}) {
  const aggregates = aggregateProfile(selectedRows)
  if (!aggregates) return []
  const scored = SETUP_TEMPLATES.map(template => {
    const { score, reasons } = scoreTemplate(template, aggregates)
    const exemplars = exemplarsFor(template.id, selectedRows)
    return {
      template,
      matchScore: score,
      reasoning: buildReasoning(template, aggregates, reasons, exemplars),
      exemplars,
    }
  })
  return scored
    .filter(s => s.matchScore >= threshold)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, topN)
}

// Re-export to keep imports tidy.
export { TEMPLATE_BY_ID, SETUP_TEMPLATES }
