// ─────────────────────────────────────────────────────────────────────────────
// conditionEvaluators.js — per-condition pure-function library.
//
// Each evaluator: (params, snapshot) -> { met, currentValue, label }
//   met: boolean
//   currentValue: number | string (formatted for display)
//   label: short human-readable description with the actual values plugged in
//
// snapshot shape (built by buildSnapshot below):
//   ticker, price, prevClose, changePct, openPrice, rvol, vwap
//   prevDay { high, low, close }, pivots { pp, r1..r3, s1..s3 }
//   histBars [{t, o, h, l, c, v}], closes []
//   ema9 / ema21 / ema50 / ema200 (today + prev), rsi14, macd { line, signal, prevLine, prevSignal }
//   pe, ps, fromHighPct, scannerScore
//
// Adding a new condition: add the entry to conditionLibrary.js AND register
// an evaluator here keyed by the same id.
// ─────────────────────────────────────────────────────────────────────────────

import { CONDITIONS_BY_ID } from './conditionLibrary.js'

// ── Indicator math ──────────────────────────────────────────────────────────

// EMA series. Returns array of length closes.length; first (period-1) entries
// are null. Uses SMA seeding for the first valid value.
export function emaSeries(closes, period) {
  const n = closes?.length || 0
  if (n < period) return new Array(n).fill(null)
  const out = new Array(period - 1).fill(null)
  const k = 2 / (period + 1)
  let e = 0
  for (let i = 0; i < period; i++) e += closes[i]
  e /= period
  out.push(e)
  for (let i = period; i < n; i++) {
    e = closes[i] * k + e * (1 - k)
    out.push(e)
  }
  return out
}

export function ema(closes, period) {
  const s = emaSeries(closes, period)
  return s.length ? s[s.length - 1] : null
}

// Wilder RSI with configurable period.
export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch >= 0) avgGain += ch
    else avgLoss -= ch
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1]
    const g = ch >= 0 ? ch : 0
    const l = ch < 0 ? -ch : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

// MACD 12-26-9. Returns { line, signal, histogram, prevLine, prevSignal }
// or null if not enough bars.
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  if (!closes || closes.length < slow + signalPeriod) return null
  const emaFast = emaSeries(closes, fast)
  const emaSlow = emaSeries(closes, slow)
  const macdLine = closes.map((_, i) => {
    if (emaFast[i] == null || emaSlow[i] == null) return null
    return emaFast[i] - emaSlow[i]
  })
  // Signal line is EMA of the macdLine valid portion.
  const validStart = macdLine.findIndex(v => v != null)
  if (validStart < 0) return null
  const validMacd = macdLine.slice(validStart)
  if (validMacd.length < signalPeriod) return null
  const sigSeries = emaSeries(validMacd, signalPeriod)
  const fullSig = new Array(validStart).fill(null).concat(sigSeries)
  const n = closes.length
  const lineNow = macdLine[n - 1]
  const linePrev = macdLine[n - 2] ?? null
  const sigNow = fullSig[n - 1]
  const sigPrev = fullSig[n - 2] ?? null
  const hist = (lineNow != null && sigNow != null) ? lineNow - sigNow : null
  return { line: lineNow, signal: sigNow, histogram: hist, prevLine: linePrev, prevSignal: sigPrev }
}

// ── Snapshot construction ───────────────────────────────────────────────────

// Build a per-ticker snapshot from the useLiveDataMulti bundle plus a 252-day
// daily-bar history (fetched outside this module). Returns null if the bundle
// has no price yet.
export function buildSnapshot(ticker, bundle, histBars = [], extras = {}) {
  if (!bundle || bundle.price == null) return null

  const closes = (histBars || []).map(b => b?.c).filter(v => v != null && v > 0)
  const ema9 = ema(closes, 9)
  const ema21 = ema(closes, 21)
  const ema50 = ema(closes, 50)
  const ema200 = ema(closes, 200)
  // Prev-bar EMAs for cross detection.
  const ema9s = emaSeries(closes, 9)
  const ema21s = emaSeries(closes, 21)
  const ema50s = emaSeries(closes, 50)
  const prevEma9 = ema9s.length >= 2 ? ema9s[ema9s.length - 2] : null
  const prevEma21 = ema21s.length >= 2 ? ema21s[ema21s.length - 2] : null
  const prevEma50 = ema50s.length >= 2 ? ema50s[ema50s.length - 2] : null

  const rsi14 = rsi(closes, 14)
  const macdNow = macd(closes)

  const wk52High = closes.length ? Math.max(...closes) : null
  const wk52Low = closes.length ? Math.min(...closes) : null
  const fromHighPct = wk52High ? ((bundle.price - wk52High) / wk52High) * 100 : null

  return {
    ticker,
    price: bundle.price,
    prevClose: bundle.prevDay?.close ?? null,
    openPrice: bundle.openPrice ?? null,
    changePct: bundle.prevDay?.close ? ((bundle.price - bundle.prevDay.close) / bundle.prevDay.close) * 100 : null,
    rvol: bundle.rvol ?? null,
    vwap: bundle.vwapData?.vwap ?? null,
    prevDay: bundle.prevDay ?? null,
    pivots: bundle.pivots ?? null,
    histBars,
    closes,
    ema9, ema21, ema50, ema200,
    prevEma9, prevEma21, prevEma50,
    rsi14,
    macd: macdNow,
    pe: extras.pe ?? null,
    ps: extras.ps ?? null,
    fromHighPct: extras.fromHighPct ?? fromHighPct,
    scannerScore: extras.scannerScore ?? null,
    wk52High,
    wk52Low,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PIVOT_LABEL = { pp: 'PP', r1: 'R1', r2: 'R2', r3: 'R3', s1: 'S1', s2: 'S2', s3: 'S3' }

function fmt2(n) {
  return n == null || isNaN(n) ? '—' : Number(n).toFixed(2)
}

function notReady(reason = 'not enough data') {
  return { met: false, currentValue: null, label: reason }
}

// Compute EMA of arbitrary period from the snapshot's closes. Used by
// price_above_ema / price_below_ema for non-standard periods.
function emaOf(snapshot, period) {
  const stored = {
    9: snapshot.ema9, 21: snapshot.ema21, 50: snapshot.ema50, 200: snapshot.ema200,
  }[period]
  if (stored != null) return stored
  return ema(snapshot.closes || [], period)
}

// ── Evaluator map ──────────────────────────────────────────────────────────

const EVALUATORS = {
  // TREND
  emas_stacked_bullish: (_, s) => {
    const all = [s.ema9, s.ema21, s.ema50, s.ema200]
    if (all.some(v => v == null)) return notReady()
    const ok = s.ema9 > s.ema21 && s.ema21 > s.ema50 && s.ema50 > s.ema200
    return { met: ok, currentValue: ok ? 'stacked' : 'not stacked', label: `9>21>50>200: ${ok ? 'yes' : 'no'}` }
  },
  emas_stacked_bearish: (_, s) => {
    const all = [s.ema9, s.ema21, s.ema50, s.ema200]
    if (all.some(v => v == null)) return notReady()
    const ok = s.ema9 < s.ema21 && s.ema21 < s.ema50 && s.ema50 < s.ema200
    return { met: ok, currentValue: ok ? 'stacked' : 'not stacked', label: `9<21<50<200: ${ok ? 'yes' : 'no'}` }
  },
  ema_cross_up: ({ fast = 9, slow = 21 }, s) => {
    const fastSer = emaSeries(s.closes, fast)
    const slowSer = emaSeries(s.closes, slow)
    const n = fastSer.length
    if (n < 2 || fastSer[n - 1] == null || fastSer[n - 2] == null || slowSer[n - 1] == null || slowSer[n - 2] == null) return notReady()
    const met = fastSer[n - 2] <= slowSer[n - 2] && fastSer[n - 1] > slowSer[n - 1]
    return { met, currentValue: met ? 'cross up' : 'no cross', label: `EMA${fast} ${met ? 'crossed above' : 'no cross with'} EMA${slow}` }
  },
  ema_cross_down: ({ fast = 9, slow = 21 }, s) => {
    const fastSer = emaSeries(s.closes, fast)
    const slowSer = emaSeries(s.closes, slow)
    const n = fastSer.length
    if (n < 2 || fastSer[n - 1] == null || fastSer[n - 2] == null || slowSer[n - 1] == null || slowSer[n - 2] == null) return notReady()
    const met = fastSer[n - 2] >= slowSer[n - 2] && fastSer[n - 1] < slowSer[n - 1]
    return { met, currentValue: met ? 'cross down' : 'no cross', label: `EMA${fast} ${met ? 'crossed below' : 'no cross with'} EMA${slow}` }
  },
  price_above_ema: ({ period = 21 }, s) => {
    const e = emaOf(s, Number(period))
    if (e == null || s.price == null) return notReady()
    const met = s.price > e
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '>' : '<='} EMA${period} $${fmt2(e)}` }
  },
  price_below_ema: ({ period = 21 }, s) => {
    const e = emaOf(s, Number(period))
    if (e == null || s.price == null) return notReady()
    const met = s.price < e
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '<' : '>='} EMA${period} $${fmt2(e)}` }
  },

  // PRICE
  price_above: ({ value }, s) => {
    if (s.price == null || value == null) return notReady()
    return { met: s.price > Number(value), currentValue: s.price, label: `$${fmt2(s.price)} ${s.price > value ? '>' : '<='} $${fmt2(value)}` }
  },
  price_below: ({ value }, s) => {
    if (s.price == null || value == null) return notReady()
    return { met: s.price < Number(value), currentValue: s.price, label: `$${fmt2(s.price)} ${s.price < value ? '<' : '>='} $${fmt2(value)}` }
  },
  price_close_above: ({ value }, s) => {
    const last = s.closes?.length ? s.closes[s.closes.length - 1] : null
    if (last == null || value == null) return notReady()
    const met = last > Number(value)
    return { met, currentValue: last, label: `Close $${fmt2(last)} ${met ? '>' : '<='} $${fmt2(value)}` }
  },
  price_close_below: ({ value }, s) => {
    const last = s.closes?.length ? s.closes[s.closes.length - 1] : null
    if (last == null || value == null) return notReady()
    const met = last < Number(value)
    return { met, currentValue: last, label: `Close $${fmt2(last)} ${met ? '<' : '>='} $${fmt2(value)}` }
  },
  price_within_pct_of: ({ value, pct = 1 }, s) => {
    if (s.price == null || value == null) return notReady()
    const tol = Math.abs(Number(value)) * (Number(pct) / 100)
    const met = Math.abs(s.price - Number(value)) <= tol
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? 'within' : 'outside'} ${pct}% of $${fmt2(value)}` }
  },
  price_above_vwap: (_, s) => {
    if (s.vwap == null || s.price == null) return notReady('no VWAP')
    const met = s.price > s.vwap
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '>' : '<='} VWAP $${fmt2(s.vwap)}` }
  },
  price_below_vwap: (_, s) => {
    if (s.vwap == null || s.price == null) return notReady('no VWAP')
    const met = s.price < s.vwap
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '<' : '>='} VWAP $${fmt2(s.vwap)}` }
  },
  price_at_pivot: ({ pivot = 'pp', pct = 0.5 }, s) => {
    const px = s.pivots?.[pivot]
    if (px == null || s.price == null) return notReady('no pivots')
    const tol = px * (Number(pct) / 100)
    const met = Math.abs(s.price - px) <= tol
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? 'at' : 'away from'} ${PIVOT_LABEL[pivot] || pivot} $${fmt2(px)}` }
  },
  price_broke_pivot: ({ pivot = 'pp', direction = 'above' }, s) => {
    const px = s.pivots?.[pivot]
    if (px == null || s.price == null) return notReady('no pivots')
    const met = direction === 'above' ? s.price > px : s.price < px
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? `broke ${direction}` : `did not break ${direction}`} ${PIVOT_LABEL[pivot] || pivot} $${fmt2(px)}` }
  },
  price_at_prev_day_high: ({ pct = 0.25 }, s) => {
    const px = s.prevDay?.high
    if (px == null || s.price == null) return notReady('no PDH')
    const tol = px * (Number(pct) / 100)
    const met = Math.abs(s.price - px) <= tol
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? 'at' : 'away from'} PDH $${fmt2(px)}` }
  },
  price_at_prev_day_low: ({ pct = 0.25 }, s) => {
    const px = s.prevDay?.low
    if (px == null || s.price == null) return notReady('no PDL')
    const tol = px * (Number(pct) / 100)
    const met = Math.abs(s.price - px) <= tol
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? 'at' : 'away from'} PDL $${fmt2(px)}` }
  },
  price_above_prev_day_high: (_, s) => {
    const px = s.prevDay?.high
    if (px == null || s.price == null) return notReady('no PDH')
    const met = s.price > px
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '>' : '<='} PDH $${fmt2(px)}` }
  },
  price_below_prev_day_low: (_, s) => {
    const px = s.prevDay?.low
    if (px == null || s.price == null) return notReady('no PDL')
    const met = s.price < px
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '<' : '>='} PDL $${fmt2(px)}` }
  },

  // MOMENTUM
  rsi_above: ({ period = 14, value = 70 }, s) => {
    const r = period == 14 ? s.rsi14 : rsi(s.closes, Number(period))
    if (r == null) return notReady('not enough closes')
    const met = r > Number(value)
    return { met, currentValue: r, label: `RSI${period} ${r.toFixed(1)} ${met ? '>' : '<='} ${value}` }
  },
  rsi_below: ({ period = 14, value = 35 }, s) => {
    const r = period == 14 ? s.rsi14 : rsi(s.closes, Number(period))
    if (r == null) return notReady('not enough closes')
    const met = r < Number(value)
    return { met, currentValue: r, label: `RSI${period} ${r.toFixed(1)} ${met ? '<' : '>='} ${value}` }
  },
  rsi_oversold: (_, s) => {
    if (s.rsi14 == null) return notReady('not enough closes')
    const met = s.rsi14 < 30
    return { met, currentValue: s.rsi14, label: `RSI14 ${s.rsi14.toFixed(1)} ${met ? '<' : '>='} 30` }
  },
  rsi_overbought: (_, s) => {
    if (s.rsi14 == null) return notReady('not enough closes')
    const met = s.rsi14 > 70
    return { met, currentValue: s.rsi14, label: `RSI14 ${s.rsi14.toFixed(1)} ${met ? '>' : '<='} 70` }
  },
  macd_bullish_cross: (_, s) => {
    const m = s.macd
    if (!m || m.line == null || m.signal == null || m.prevLine == null || m.prevSignal == null) return notReady('not enough closes')
    const met = m.prevLine <= m.prevSignal && m.line > m.signal
    return { met, currentValue: m.line - m.signal, label: met ? 'MACD bullish cross' : `no cross (hist ${(m.line - m.signal).toFixed(3)})` }
  },
  macd_bearish_cross: (_, s) => {
    const m = s.macd
    if (!m || m.line == null || m.signal == null || m.prevLine == null || m.prevSignal == null) return notReady('not enough closes')
    const met = m.prevLine >= m.prevSignal && m.line < m.signal
    return { met, currentValue: m.line - m.signal, label: met ? 'MACD bearish cross' : `no cross (hist ${(m.line - m.signal).toFixed(3)})` }
  },

  // VOLUME
  volume_above_avg: ({ multiple = 1.5 }, s) => {
    if (s.rvol == null) return notReady('no RVOL')
    const met = s.rvol >= Number(multiple)
    return { met, currentValue: s.rvol, label: `RVOL ${s.rvol.toFixed(2)}x ${met ? '>=' : '<'} ${multiple}x` }
  },
  rvol_above: ({ value = 1.5 }, s) => {
    if (s.rvol == null) return notReady('no RVOL')
    const met = s.rvol > Number(value)
    return { met, currentValue: s.rvol, label: `RVOL ${s.rvol.toFixed(2)} ${met ? '>' : '<='} ${value}` }
  },

  // PATTERN
  gap_up: ({ pct = 1 }, s) => {
    if (s.openPrice == null || s.prevClose == null) return notReady('no gap data')
    const gapPct = ((s.openPrice - s.prevClose) / s.prevClose) * 100
    const met = gapPct >= Number(pct)
    return { met, currentValue: gapPct, label: `Gap ${gapPct.toFixed(2)}% ${met ? '>=' : '<'} ${pct}%` }
  },
  gap_down: ({ pct = 1 }, s) => {
    if (s.openPrice == null || s.prevClose == null) return notReady('no gap data')
    const gapPct = ((s.openPrice - s.prevClose) / s.prevClose) * 100
    const met = gapPct <= -Math.abs(Number(pct))
    return { met, currentValue: gapPct, label: `Gap ${gapPct.toFixed(2)}% ${met ? '<=' : '>'} -${pct}%` }
  },
  breakout_high: ({ days = 20 }, s) => {
    const closes = s.closes || []
    if (closes.length < days + 1 || s.price == null) return notReady('not enough closes')
    const window = closes.slice(-days - 1, -1)
    const hi = Math.max(...window)
    const met = s.price > hi
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '>' : '<='} ${days}D high $${fmt2(hi)}` }
  },
  breakdown_low: ({ days = 20 }, s) => {
    const closes = s.closes || []
    if (closes.length < days + 1 || s.price == null) return notReady('not enough closes')
    const window = closes.slice(-days - 1, -1)
    const lo = Math.min(...window)
    const met = s.price < lo
    return { met, currentValue: s.price, label: `$${fmt2(s.price)} ${met ? '<' : '>='} ${days}D low $${fmt2(lo)}` }
  },
  failed_breakout: ({ days = 20 }, s) => {
    const closes = s.closes || []
    if (closes.length < days + 2 || s.price == null) return notReady('not enough closes')
    // Reference high = highest close in the (days) bars prior to the (days) recent window
    const refStart = closes.length - 2 * days - 1
    const refEnd = closes.length - days - 1
    if (refStart < 0) return notReady('not enough closes')
    const refWindow = closes.slice(Math.max(0, refStart), refEnd)
    const refHigh = Math.max(...refWindow)
    const recent = closes.slice(-days)
    const exceeded = recent.some(c => c > refHigh)
    const backBelow = s.price < refHigh
    const met = exceeded && backBelow
    return { met, currentValue: s.price, label: met ? `failed breakout from $${fmt2(refHigh)}` : 'no failed breakout' }
  },

  // FUNDAMENTALS
  ps_ratio_above: ({ value = 20 }, s) => {
    if (s.ps == null) return notReady('no P/S data')
    const met = s.ps > Number(value)
    return { met, currentValue: s.ps, label: `P/S ${s.ps.toFixed(1)} ${met ? '>' : '<='} ${value}` }
  },
  pe_ratio_above: ({ value = 40 }, s) => {
    if (s.pe == null) return notReady('no P/E data')
    const met = s.pe > Number(value)
    return { met, currentValue: s.pe, label: `P/E ${s.pe.toFixed(1)} ${met ? '>' : '<='} ${value}` }
  },
  pe_negative: (_, s) => {
    if (s.pe == null) return notReady('no P/E data')
    const met = s.pe < 0
    return { met, currentValue: s.pe, label: `P/E ${s.pe.toFixed(1)} ${met ? '< 0' : '>= 0'}` }
  },
  down_from_high_pct: ({ pct = 15 }, s) => {
    if (s.fromHighPct == null) return notReady('no 52W data')
    const drawdown = Math.abs(s.fromHighPct)
    const met = drawdown >= Number(pct)
    return { met, currentValue: s.fromHighPct, label: `${drawdown.toFixed(1)}% off high ${met ? '>=' : '<'} ${pct}%` }
  },
  scanner_score_above: ({ value = 40 }, s) => {
    if (s.scannerScore == null) return notReady('scanner not run')
    const met = s.scannerScore > Number(value)
    return { met, currentValue: s.scannerScore, label: `Scanner ${s.scannerScore} ${met ? '>' : '<='} ${value}` }
  },
}

// ── Public API ──────────────────────────────────────────────────────────────

// Evaluate a single condition against a snapshot. Returns the evaluator's
// shape with the condition id and params attached for downstream display.
export function evaluateCondition(condition, snapshot) {
  if (!condition || !snapshot) return { met: false, currentValue: null, label: 'no condition or snapshot' }
  const def = CONDITIONS_BY_ID[condition.type]
  if (!def) return { met: false, currentValue: null, label: `unknown condition: ${condition.type}` }
  const evalFn = EVALUATORS[condition.type]
  if (!evalFn) return { met: false, currentValue: null, label: `no evaluator for ${condition.type}` }
  try {
    const r = evalFn(condition.params || {}, snapshot)
    return { ...r, type: condition.type, params: condition.params }
  } catch (e) {
    return { met: false, currentValue: null, label: `error: ${e.message}`, type: condition.type, params: condition.params }
  }
}

// Evaluate every condition in a list. Returns an array same length as input.
export function evaluateAll(conditions, snapshot) {
  return (conditions || []).map(c => evaluateCondition(c, snapshot))
}
