// ─────────────────────────────────────────────────────────────────────────────
// indicators.js — pure technical-indicator math, array-returning.
//
// Used by both the live evaluation path (conditionEvaluators) and the
// walk-forward backtester (setupBacktest). Every function is pure: takes
// raw values, returns the indicator series or a derived scalar.
//
// All series are same-length-as-input arrays with leading nulls when the
// indicator is not yet defined. This makes indexing by bar offset trivial.
// ─────────────────────────────────────────────────────────────────────────────

const TRADING_DAYS_PER_YEAR = 252

// EMA series with SMA seeding for the first valid value.
export function computeEMA(values, period) {
  const n = values?.length || 0
  const out = new Array(n).fill(null)
  if (n < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  let e = seed / period
  out[period - 1] = e
  for (let i = period; i < n; i++) {
    e = values[i] * k + e * (1 - k)
    out[i] = e
  }
  return out
}

// Wilder RSI series. Returns array of same length as closes; entries before
// the warmup are null.
export function computeRSI(closes, period = 14) {
  const n = closes?.length || 0
  const out = new Array(n).fill(null)
  if (n < period + 1) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1]
    if (ch >= 0) avgGain += ch
    else avgLoss -= ch
  }
  avgGain /= period
  avgLoss /= period
  const seedRSI = avgLoss === 0 ? 100 : (100 - 100 / (1 + avgGain / avgLoss))
  out[period] = seedRSI
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1]
    const g = ch >= 0 ? ch : 0
    const l = ch < 0 ? -ch : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

// MACD series. Returns { macd: [], signal: [], histogram: [] }; same length
// as input. Each entry is null until the corresponding warmup is satisfied.
export function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  const n = closes?.length || 0
  const emaFast = computeEMA(closes, fast)
  const emaSlow = computeEMA(closes, slow)
  const macd = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macd[i] = emaFast[i] - emaSlow[i]
  }
  // Signal line is an EMA of the macd line over its valid prefix.
  const validStart = macd.findIndex(v => v != null)
  const sig = new Array(n).fill(null)
  if (validStart >= 0) {
    const slice = macd.slice(validStart)
    const sigSlice = computeEMA(slice, signal)
    for (let i = 0; i < sigSlice.length; i++) sig[validStart + i] = sigSlice[i]
  }
  const hist = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (macd[i] != null && sig[i] != null) hist[i] = macd[i] - sig[i]
  }
  return { macd, signal: sig, histogram: hist }
}

// Annualized historical volatility from the trailing N daily closes ending
// at the last index of `closes`. Returns null if fewer than 20 returns
// computable (matches the WheelScanner / wheelOptions threshold).
export function computeHV(closes, days = 30) {
  if (!Array.isArray(closes) || closes.length < 20) return null
  const window = closes.slice(-days)
  const valid = window.filter(v => v != null && v > 0)
  if (valid.length < 20) return null
  const returns = []
  for (let i = 1; i < valid.length; i++) returns.push(Math.log(valid[i] / valid[i - 1]))
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

// Highest high over the last N bars ending at `endIdx` (inclusive). When
// endIdx is undefined, uses the last bar. Returns null if fewer than N bars
// are available behind endIdx.
export function nDayHigh(bars, days, endIdx) {
  if (!bars?.length || !days) return null
  const end = endIdx == null ? bars.length - 1 : endIdx
  const start = end - days + 1
  if (start < 0) return null
  let hi = -Infinity
  for (let i = start; i <= end; i++) {
    const h = bars[i]?.h
    if (h != null && h > hi) hi = h
  }
  return hi === -Infinity ? null : hi
}

// Lowest low over the last N bars ending at `endIdx`. Mirror of nDayHigh.
export function nDayLow(bars, days, endIdx) {
  if (!bars?.length || !days) return null
  const end = endIdx == null ? bars.length - 1 : endIdx
  const start = end - days + 1
  if (start < 0) return null
  let lo = Infinity
  for (let i = start; i <= end; i++) {
    const l = bars[i]?.l
    if (l != null && l < lo) lo = l
  }
  return lo === Infinity ? null : lo
}

// Last value of an EMA computed over the input; convenience wrapper.
export function lastEMA(values, period) {
  const s = computeEMA(values, period)
  return s.length ? s[s.length - 1] : null
}

// Last value of RSI; convenience wrapper.
export function lastRSI(closes, period = 14) {
  const s = computeRSI(closes, period)
  return s.length ? s[s.length - 1] : null
}
