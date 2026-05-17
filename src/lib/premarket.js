// Pre-market helpers — works on Polygon 1-min bars (timestamps in UTC ms).
// US equities pre-market: 4:00 ET to 9:30 ET (240 to 570 minutes from midnight ET).

import { detectSwings, labelSwings } from './structure.js'

function etMinsFromTs(ts) {
  const d = new Date(ts)
  const s = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

export function isPreMarketBar(bar) {
  if (!bar?.t) return false
  const m = etMinsFromTs(bar.t)
  return m >= 240 && m < 570
}

export function isRegularSessionBar(bar) {
  if (!bar?.t) return false
  const m = etMinsFromTs(bar.t)
  return m >= 570 && m < 960
}

export function filterPreMarket(bars) {
  return (bars || []).filter(isPreMarketBar)
}

export function filterRegularSession(bars) {
  return (bars || []).filter(isRegularSessionBar)
}

// Detect trend on pre-market bars using a small-lookback swing scan
function preMarketTrend(bars) {
  if (!bars || bars.length < 7) return 'building'
  const swings = detectSwings(bars, 2)
  const labeled = labelSwings(swings)
  if (labeled.length < 2) return 'choppy'
  const last3 = labeled.slice(-3)
  const bull = last3.filter(s => s.label === 'HH' || s.label === 'HL').length
  const bear = last3.filter(s => s.label === 'LH' || s.label === 'LL').length
  if (bull > bear && bull >= 2) return 'trending up'
  if (bear > bull && bear >= 2) return 'trending down'
  return 'choppy'
}

export function computePreMarketStats(intradayBars, prevDayClose) {
  const pm = filterPreMarket(intradayBars)
  if (!pm.length) {
    return { active: false, high: null, low: null, last: null, vol: 0, trend: 'no data', gap: null, gapPct: null, openPrice: null, bars: [] }
  }
  const high = Math.max(...pm.map(b => b.h))
  const low = Math.min(...pm.map(b => b.l))
  const vol = pm.reduce((s, b) => s + (b.v || 0), 0)
  const last = pm[pm.length - 1].c
  const openPrice = pm[0].o
  const trend = preMarketTrend(pm)
  const gap = prevDayClose != null ? last - prevDayClose : null
  const gapPct = prevDayClose ? (gap / prevDayClose) * 100 : null
  return { active: true, high, low, last, vol, trend, gap, gapPct, openPrice, bars: pm }
}

export const PREMARKET_START_ET_MIN = 240
export const MARKET_OPEN_ET_MIN = 570
