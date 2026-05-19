// Sector rotation tracker. Pulls each SPDR sector ETF + SPY benchmark from
// Polygon snapshot/agg endpoints and scores each sector on momentum, 5-day
// trend, relative strength vs SPY, and volume confirmation.

import { getSnapshot, getDayBars } from './massive.js'

export const SECTORS = [
  { etf: 'XLK', name: 'Technology',          short: 'TECH' },
  { etf: 'XLV', name: 'Healthcare',          short: 'HLTH' },
  { etf: 'XLF', name: 'Financials',          short: 'FIN' },
  { etf: 'XLE', name: 'Energy',              short: 'ENRG' },
  { etf: 'XLY', name: 'Consumer Disc.',      short: 'DISC' },
  { etf: 'XLP', name: 'Consumer Staples',    short: 'STAP' },
  { etf: 'XLI', name: 'Industrials',         short: 'IND' },
  { etf: 'XLB', name: 'Materials',           short: 'MAT' },
  { etf: 'XLU', name: 'Utilities',           short: 'UTIL' },
  { etf: 'XLRE', name: 'Real Estate',        short: 'RE' },
  { etf: 'XLC', name: 'Communications',      short: 'COMM' },
]

export const BENCHMARK = 'SPY'

// Common tickers → sector ETF. Used by Command, Watchlist, AI brief.
// Index ETFs map to XLK as their dominant exposure (QQQ ~50% tech).
export const TICKER_TO_SECTOR = {
  // Technology
  AAPL: 'XLK', MSFT: 'XLK', NVDA: 'XLK', AMD: 'XLK', AVGO: 'XLK',
  CRM: 'XLK', ORCL: 'XLK', INTC: 'XLK', QCOM: 'XLK', TXN: 'XLK',
  ADBE: 'XLK', NOW: 'XLK', PANW: 'XLK', SMCI: 'XLK', ARM: 'XLK',
  PLTR: 'XLK', SNOW: 'XLK', DDOG: 'XLK', CRWD: 'XLK', NET: 'XLK',
  IBM: 'XLK', INTU: 'XLK', AMAT: 'XLK', MU: 'XLK', LRCX: 'XLK',
  IONQ: 'XLK', RGTI: 'XLK', SOUN: 'XLK', AI: 'XLK', BBAI: 'XLK',
  PATH: 'XLK', DOCU: 'XLK', ZM: 'XLK', DUOL: 'XLK', DASH: 'XLK',
  // Communication Services
  GOOGL: 'XLC', GOOG: 'XLC', META: 'XLC', NFLX: 'XLC', DIS: 'XLC',
  TMUS: 'XLC', VZ: 'XLC', T: 'XLC', CMCSA: 'XLC', WBD: 'XLC',
  // Consumer Discretionary
  AMZN: 'XLY', TSLA: 'XLY', HD: 'XLY', NKE: 'XLY', SBUX: 'XLY',
  MCD: 'XLY', LOW: 'XLY', TGT: 'XLY', BKNG: 'XLY', LULU: 'XLY',
  RBLX: 'XLY', SHOP: 'XLY', RIVN: 'XLY', LCID: 'XLY', NKLA: 'XLY',
  BYND: 'XLY', W: 'XLY', CHWY: 'XLY', UBER: 'XLY', LYFT: 'XLY',
  // Consumer Staples
  WMT: 'XLP', PG: 'XLP', KO: 'XLP', PEP: 'XLP', COST: 'XLP',
  MO: 'XLP', PM: 'XLP', CL: 'XLP', KMB: 'XLP',
  // Healthcare
  UNH: 'XLV', JNJ: 'XLV', PFE: 'XLV', MRK: 'XLV', LLY: 'XLV',
  ABBV: 'XLV', TMO: 'XLV', ABT: 'XLV', DHR: 'XLV', BMY: 'XLV',
  // Financials
  JPM: 'XLF', BAC: 'XLF', WFC: 'XLF', GS: 'XLF', MS: 'XLF',
  C: 'XLF', BLK: 'XLF', BRK: 'XLF', V: 'XLF', MA: 'XLF',
  COIN: 'XLF', HOOD: 'XLF', MSTR: 'XLF',
  // Energy
  XOM: 'XLE', CVX: 'XLE', COP: 'XLE', SLB: 'XLE', EOG: 'XLE',
  PSX: 'XLE', MPC: 'XLE', OXY: 'XLE',
  // Industrials
  CAT: 'XLI', BA: 'XLI', UPS: 'XLI', HON: 'XLI', GE: 'XLI',
  RTX: 'XLI', LMT: 'XLI', DE: 'XLI', UNP: 'XLI',
  // Materials
  LIN: 'XLB', SHW: 'XLB', APD: 'XLB', NEM: 'XLB', FCX: 'XLB',
  // Utilities
  NEE: 'XLU', DUK: 'XLU', SO: 'XLU', AEP: 'XLU',
  // Real Estate
  PLD: 'XLRE', AMT: 'XLRE', EQIX: 'XLRE', CCI: 'XLRE', SPG: 'XLRE',
  // Index ETFs (mapped to dominant exposure for context)
  SPY: 'XLK', QQQ: 'XLK', TQQQ: 'XLK', SQQQ: 'XLK', IWM: 'XLI',
}

export function sectorForTicker(ticker) {
  if (!ticker) return null
  const t = ticker.toUpperCase()
  const etf = TICKER_TO_SECTOR[t]
  if (!etf) return null
  return SECTORS.find(s => s.etf === etf) || null
}

// ── Fetch one ETF's raw data ─────────────────────────────────────────────────

async function fetchOne(apiKey, etf, today, from5, from20) {
  const [snapshot, week, month] = await Promise.all([
    getSnapshot(apiKey, etf).catch(() => null),
    getDayBars(apiKey, etf, from5, today).catch(() => []),
    getDayBars(apiKey, etf, from20, today).catch(() => []),
  ])
  return { etf, snapshot, week, month }
}

// ── Compute per-sector metrics + score ───────────────────────────────────────

function computeMetrics(raw, spyRaw) {
  const snap = raw.snapshot
  if (!snap) return null
  const todayChangePct = snap.todaysChangePerc != null ? snap.todaysChangePerc
    : snap.day?.c && snap.prevDay?.c ? ((snap.day.c - snap.prevDay.c) / snap.prevDay.c) * 100
    : null
  const todayClose = snap.day?.c ?? snap.lastTrade?.p ?? snap.prevDay?.c ?? null
  const todayVol = snap.day?.v ?? 0

  const week = raw.week
  let fiveDayReturn = null
  if (week.length >= 2) {
    const first = week[0].o
    const last = week[week.length - 1].c
    fiveDayReturn = ((last - first) / first) * 100
  }

  const month = raw.month
  let avgVol = null
  if (month.length >= 5) {
    avgVol = month.slice(0, -1).reduce((s, b) => s + (b.v || 0), 0) / Math.max(1, month.length - 1)
  }
  const rvol = avgVol && todayVol ? todayVol / avgVol : null

  // Relative strength vs SPY
  let rsToday = null
  if (spyRaw?.todayChangePct != null && todayChangePct != null) {
    rsToday = (1 + todayChangePct / 100) / (1 + spyRaw.todayChangePct / 100)
  }

  return { etf: raw.etf, todayChangePct, todayClose, todayVol, fiveDayReturn, avgVol, rvol, rsToday }
}

function scoreSector(m) {
  if (!m) return { score: 0, partial: true }

  let score = 0
  // Momentum 40
  if (m.todayChangePct != null) {
    if (m.todayChangePct >= 2) score += 20
    else if (m.todayChangePct >= 1) score += 10
    else if (m.todayChangePct >= -1) score += 0
    else if (m.todayChangePct >= -2) score -= 10
    else score -= 20
  }
  // 5-day trend 35
  if (m.fiveDayReturn != null) {
    if (m.fiveDayReturn >= 5) score += 35
    else if (m.fiveDayReturn >= 2) score += 20
    else if (m.fiveDayReturn >= 0) score += 5
    else score += Math.max(-35, Math.round(m.fiveDayReturn * 5))
  }
  // Relative strength 25
  if (m.rsToday != null) {
    if (m.rsToday > 1.2) score += 25
    else if (m.rsToday > 1.0) score += 10
    else if (m.rsToday > 0.8) score -= 10
    else score -= 25
  }
  // Volume confirmation bonus
  if (m.rvol != null && m.rvol > 1.5 && m.todayChangePct != null) {
    score += m.todayChangePct >= 0 ? 10 : -10
  }

  return { score: Math.max(-100, Math.min(100, Math.round(score))), partial: m.fiveDayReturn == null || m.rsToday == null }
}

export function flowLabel(score) {
  if (score >= 60) return { label: 'Strong inflow', arrow: '↑↑', tier: 'strong-in' }
  if (score >= 20) return { label: 'Moderate inflow', arrow: '↑', tier: 'mod-in' }
  if (score <= -60) return { label: 'Strong outflow', arrow: '↓↓', tier: 'strong-out' }
  if (score <= -20) return { label: 'Moderate outflow', arrow: '↓', tier: 'mod-out' }
  return { label: 'Neutral', arrow: '→', tier: 'neutral' }
}

export function tierColor(tier) {
  switch (tier) {
    case 'strong-in': return '#D1FF79'    // bright lime
    case 'mod-in':    return '#86A45A'    // dim lime
    case 'neutral':   return '#444'
    case 'mod-out':   return '#8A4040'    // dim red
    case 'strong-out':return '#FF4D4D'    // bright red
    default: return '#444'
  }
}

export function trendArrow(fiveDayReturn) {
  if (fiveDayReturn == null) return '—'
  if (fiveDayReturn >= 3) return '↑↑'
  if (fiveDayReturn >= 1) return '↑'
  if (fiveDayReturn >= -1) return '→'
  if (fiveDayReturn >= -3) return '↓'
  return '↓↓'
}

// ── Public: fetch + score everything ─────────────────────────────────────────

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── localStorage cache shared across tabs ────────────────────────────────────

const CACHE_KEY = 'th-sector-cache'
const STALE_MS = 30 * 60 * 1000  // 30 minutes

export function readSectorCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.fetchedAt) return null
    const stale = Date.now() - parsed.fetchedAt > STALE_MS
    return { ...parsed, stale }
  } catch { return null }
}

export function writeSectorCache(snap) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch {}
}

// Quick helper for non-Calendar tabs: returns the sector row for a given
// ticker plus the freshness flag.
export function rotationContextForTicker(ticker) {
  const cache = readSectorCache()
  if (!cache?.rows?.length) return null
  const sector = sectorForTicker(ticker)
  if (!sector) return null
  const row = cache.rows.find(r => r.etf === sector.etf)
  if (!row) return null
  return { ...row, stale: cache.stale, fetchedAt: cache.fetchedAt }
}

export async function getRotationSnapshot(apiKey) {
  if (!apiKey) throw new Error('Missing Massive API key')

  const today = ymd(new Date())
  const from5 = ymd(new Date(Date.now() - 7 * 86400000))   // 7 cal days to catch 5 trading days
  const from20 = ymd(new Date(Date.now() - 32 * 86400000)) // ~20 trading days

  // Fetch all sectors + SPY in parallel
  const tickers = [...SECTORS.map(s => s.etf), BENCHMARK]
  const raws = await Promise.all(tickers.map(t => fetchOne(apiKey, t, today, from5, from20)))

  const spyRaw = raws.find(r => r.etf === BENCHMARK)
  const spyMetrics = spyRaw ? computeMetrics(spyRaw, { todayChangePct: 0 }) : null
  const spyContext = spyMetrics ? { todayChangePct: spyMetrics.todayChangePct, fiveDayReturn: spyMetrics.fiveDayReturn } : { todayChangePct: 0 }

  const rows = SECTORS.map(s => {
    const raw = raws.find(r => r.etf === s.etf)
    const m = computeMetrics(raw, spyContext)
    const { score, partial } = scoreSector(m)
    return {
      ...s,
      metrics: m,
      score,
      partial,
      ...flowLabel(score),
    }
  }).sort((a, b) => b.score - a.score)

  return { rows, spy: spyMetrics, fetchedAt: Date.now() }
}
