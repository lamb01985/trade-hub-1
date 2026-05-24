// ─────────────────────────────────────────────────────────────────────────────
// wheelOptions.js — options estimation for the Wheel scanner.
//
// Stock-data-plan version. When Massive options plan is active, replace the
// estimation logic in getOptionsData() with getOptionChain() from massive.js.
// Keep the same return shape:
//   { putCandidate: { strike, estPremium, dte, deltaApprox } | null,
//     callCandidate: { strike, estPremium, dte, deltaApprox } | null }
//
// Strike picking uses an HV-implied move heuristic. Premium estimates use
// textbook Black-Scholes (no dividends, no skew). These are *estimates*, not
// quotes. The Wheel scanner marks confidence accordingly.
// ─────────────────────────────────────────────────────────────────────────────

const RISK_FREE_RATE = 0.045        // annualized; reasonable for 2026 short-end
const TRADING_DAYS_PER_YEAR = 252
const HV_MIN_BARS = 20              // minimum daily bars required for a useful HV
const HV_WINDOW = 30                // bars used for the HV calc

// ── Pure math helpers ───────────────────────────────────────────────────────

// Standard normal CDF via Abramowitz-Stegun erf approximation. Accurate to
// ~1.5e-7, plenty for option-pricing estimates at this level of fidelity.
function erf(x) {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)
  return sign * y
}

function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

// Inverse standard normal CDF (Acklam algorithm). Accurate to ~1e-9 across
// the central region, more than enough for delta-targeted strike selection.
function normInv(p) {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
  const pLow = 0.02425
  const pHigh = 1 - pLow
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
  }
  if (p <= pHigh) {
    const q = p - 0.5
    const r = q * q
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q /
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1)
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
          ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
}

// Standard equity option strike increments.
function strikeIncrement(price) {
  if (price < 25) return 0.5
  if (price < 200) return 1
  if (price < 500) return 2.5
  return 5
}

function roundToIncrement(value, inc) {
  if (!inc || inc <= 0) return value
  return Math.round(value / inc) * inc
}

function ceilToIncrement(value, inc) {
  if (!inc || inc <= 0) return value
  return Math.ceil(value / inc) * inc
}

// ── Public API ──────────────────────────────────────────────────────────────

// 30-day annualized historical volatility from daily closes.
// Uses ln-returns, sample stdev (n-1), times sqrt(252).
// Returns null if fewer than HV_MIN_BARS daily bars are available.
export function computeHV30(historicalBars) {
  if (!Array.isArray(historicalBars) || historicalBars.length < HV_MIN_BARS) return null
  const window = historicalBars.slice(-HV_WINDOW)
  const closes = window.map(b => b?.c).filter(v => v != null && v > 0)
  if (closes.length < HV_MIN_BARS) return null
  const returns = []
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]))
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

// Pick an OTM put strike whose implied delta is close to -targetDelta.
// Approximation: strike ≈ price × (1 - hv × sqrt(dte/365) × |N⁻¹(delta)|).
// Rounded to the standard increment for the underlying's price range.
export function pickPutStrike({ price, hv, dte, targetDelta = 0.25 }) {
  if (!price || !hv || !dte || hv <= 0 || dte <= 0) return null
  const T = dte / 365
  const z = Math.abs(normInv(targetDelta))
  const raw = price * (1 - hv * Math.sqrt(T) * z)
  if (raw <= 0) return null
  const strike = roundToIncrement(raw, strikeIncrement(price))
  return strike > 0 ? strike : null
}

// Pick an OTM call strike. Mirror of pickPutStrike, then enforced to be at or
// above costBasis (rounded up to the nearest valid increment) so a covered
// call never caps below cost.
export function pickCallStrike({ price, hv, dte, costBasis, targetDelta = 0.25 }) {
  if (!price || !hv || !dte || hv <= 0 || dte <= 0) return null
  const T = dte / 365
  const z = Math.abs(normInv(targetDelta))
  const raw = price * (1 + hv * Math.sqrt(T) * z)
  let strike = roundToIncrement(raw, strikeIncrement(price))
  if (costBasis != null && strike < costBasis) {
    strike = ceilToIncrement(costBasis, strikeIncrement(price))
  }
  return strike > 0 ? strike : null
}

// Black-Scholes premium estimate. Returns a per-share dollar value (multiply
// by 100 for total premium per contract). No dividends, no skew, RISK_FREE_RATE
// as the short-end r.
export function estimatePremium({ price, strike, hv, dte, type }) {
  if (!price || !strike || !hv || !dte || hv <= 0 || dte <= 0) return null
  const T = dte / 365
  const sigma = hv
  const r = RISK_FREE_RATE
  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(price / strike) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  const discountedStrike = strike * Math.exp(-r * T)
  if (type === 'call') {
    return Math.max(0, price * normCdf(d1) - discountedStrike * normCdf(d2))
  }
  // put
  return Math.max(0, discountedStrike * normCdf(-d2) - price * normCdf(-d1))
}

// Black-Scholes delta. Calls positive, puts negative.
export function estimateDelta({ price, strike, hv, dte, type }) {
  if (!price || !strike || !hv || !dte || hv <= 0 || dte <= 0) return null
  const T = dte / 365
  const sigma = hv
  const r = RISK_FREE_RATE
  const d1 = (Math.log(price / strike) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T))
  if (type === 'call') return normCdf(d1)
  return normCdf(d1) - 1
}

// Unified entry point used by the Wheel scanner. Returns put and (if costBasis
// given) call candidates in the schema the scanner consumes. Premiums and
// deltas are rounded to two decimals for display.
export function getOptionsData({ price, hv, dte = 30, costBasis = null, targetDelta = 0.25 } = {}) {
  if (price == null || hv == null || dte == null) {
    return { putCandidate: null, callCandidate: null }
  }
  const round2 = (n) => n == null ? null : Math.round(n * 100) / 100

  const putStrike = pickPutStrike({ price, hv, dte, targetDelta })
  const putPremium = putStrike != null ? estimatePremium({ price, strike: putStrike, hv, dte, type: 'put' }) : null
  const putDelta = putStrike != null ? estimateDelta({ price, strike: putStrike, hv, dte, type: 'put' }) : null
  const putCandidate = putStrike != null ? {
    strike: putStrike,
    estPremium: round2(putPremium),
    dte,
    deltaApprox: round2(putDelta),
  } : null

  let callCandidate = null
  if (costBasis != null) {
    const callStrike = pickCallStrike({ price, hv, dte, costBasis, targetDelta })
    const callPremium = callStrike != null ? estimatePremium({ price, strike: callStrike, hv, dte, type: 'call' }) : null
    const callDelta = callStrike != null ? estimateDelta({ price, strike: callStrike, hv, dte, type: 'call' }) : null
    callCandidate = callStrike != null ? {
      strike: callStrike,
      estPremium: round2(callPremium),
      dte,
      deltaApprox: round2(callDelta),
    } : null
  }

  return { putCandidate, callCandidate }
}
