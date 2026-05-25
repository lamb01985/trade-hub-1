// ─────────────────────────────────────────────────────────────────────────────
// setupEngine.js — orchestrates condition evaluation across the universe of a
// setup. Pure. No persistence, no fetches.
//
// evaluateSetup(setup, snapshotsByTicker, opts) returns per-ticker results
// bucketed by status: triggered / approaching / monitoring. Caller wires the
// triggered list into notifications + the staged trade plan.
//
// Cooldown: a ticker that triggered within cooldownMinutes is excluded from
// the triggered list this cycle (still appears under monitoring with a flag).
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateAll } from './conditionEvaluators.js'
import { resolveUniverseTickers } from './universeResolver.js'

// Public helper used by FocusedTickerCard to render per-setup condition
// state for a specific ticker. Returns the raw condition results plus the
// derived statuses + percentMet so the UI can show progress bars and
// "approaching" indicators without re-implementing the classifier.
//
// snapshot is the buildSnapshot-shape object the caller produces from the
// ticker's bundle + 252-day daily bars.
export function evaluateSetupForTicker(setup, ticker, snapshot) {
  if (!setup || !setup.conditions?.length || !snapshot) {
    return { conditionResults: [], allMet: false, anyMet: false, percentMet: 0, status: 'monitoring' }
  }
  const conditionResults = evaluateAll(setup.conditions, snapshot)
  const total = conditionResults.length
  const metCount = conditionResults.filter(r => r.met).length
  const allMet = total > 0 && metCount === total
  const anyMet = metCount > 0
  const percentMet = total > 0 ? metCount / total : 0
  const op = setup.operator || 'all'
  let status = 'monitoring'
  if ((op === 'all' && allMet) || (op === 'any' && anyMet)) status = 'triggered'
  else if (percentMet > 0.5) status = 'approaching'
  return { conditionResults, allMet, anyMet, percentMet, status, metCount, total }
}

// Determine the status for a single ticker given its condition results and
// the setup's operator. Triggered when all-met (operator=all) or any-met
// (operator=any). Approaching when half or more conditions are met but not
// fully triggered. Monitoring otherwise.
function classify(operator, results) {
  if (!results.length) return 'monitoring'
  const metCount = results.filter(r => r.met).length
  const total = results.length
  const triggered = operator === 'any' ? metCount >= 1 : metCount === total
  if (triggered) return 'triggered'
  const half = metCount * 2 >= total // metCount >= total/2
  if (half && metCount > 0) return 'approaching'
  return 'monitoring'
}

// Filter the universe down to tickers that actually have a snapshot. Tickers
// missing data are reported separately so the UI can show "no data" rather
// than silently dropping them.
function partitionUniverse(tickerList, snapshotsByTicker) {
  const ready = []
  const missing = []
  for (const T of tickerList || []) {
    if (!T) continue
    if (snapshotsByTicker[T]) ready.push(T)
    else missing.push(T)
  }
  return { ready, missing }
}

// Cooldown check. Returns true if this ticker triggered within the cooldown
// window for this setup.
function inCooldown(setup, ticker) {
  const ms = (setup?.alerts?.cooldownMinutes || 0) * 60 * 1000
  if (!ms) return false
  const last = setup?.alerts?.lastTriggeredAt?.[ticker]
  if (!last) return false
  return (Date.now() - last) < ms
}

export function evaluateSetup(setup, snapshotsByTicker, opts = {}) {
  if (!setup || !setup.conditions?.length) {
    return { triggered: [], approaching: [], monitoring: [], missing: [] }
  }
  const savedUniverses = opts.savedUniverses || []
  const universeTickers = resolveUniverseTickers(setup.universe, savedUniverses)
  const { ready, missing } = partitionUniverse(universeTickers, snapshotsByTicker)
  const operator = setup.operator || 'all'

  const triggered = []
  const approaching = []
  const monitoring = []

  for (const ticker of ready) {
    const snap = snapshotsByTicker[ticker]
    const results = evaluateAll(setup.conditions, snap)
    const status = classify(operator, results)
    const cool = inCooldown(setup, ticker)
    const row = { ticker, snapshot: snap, conditionResults: results, status, inCooldown: cool }
    if (status === 'triggered' && !cool) triggered.push(row)
    else if (status === 'approaching') approaching.push(row)
    else monitoring.push(row)
  }

  return { triggered, approaching, monitoring, missing }
}

// ── Roll-up across many setups ──────────────────────────────────────────────
// Returns:
//   bySetup: { [setupId]: result }
//   triggers: [{ setupId, ticker, snapshot, conditionResults }]
//   tickerStatus: { [ticker]: 'triggered' | 'approaching' | 'monitoring' }
//     (highest status across all setups touching that ticker)
//
// Caller uses triggers to fire notifications + stage trade plans, and
// tickerStatus for header pills / per-ticker badges.

export function evaluateAllSetups(setups, snapshotsByTicker, opts = {}) {
  const bySetup = {}
  const triggers = []
  const tickerStatus = {}
  const setStatus = (t, s) => {
    const cur = tickerStatus[t]
    if (cur === 'triggered') return
    if (s === 'triggered') tickerStatus[t] = s
    else if (s === 'approaching' && cur !== 'triggered') tickerStatus[t] = s
    else if (!cur) tickerStatus[t] = 'monitoring'
  }
  for (const setup of setups || []) {
    if (setup.status && setup.status !== 'active') continue
    const r = evaluateSetup(setup, snapshotsByTicker, opts)
    bySetup[setup.id] = r
    for (const t of r.triggered) {
      triggers.push({ setupId: setup.id, setup, ticker: t.ticker, snapshot: t.snapshot, conditionResults: t.conditionResults })
      setStatus(t.ticker, 'triggered')
    }
    for (const t of r.approaching) setStatus(t.ticker, 'approaching')
    for (const t of r.monitoring) setStatus(t.ticker, 'monitoring')
  }
  return { bySetup, triggers, tickerStatus }
}

// ── Staged trade plan derivation ────────────────────────────────────────────

// Round to the standard equity strike increment for the underlying price band.
function strikeIncrement(price) {
  if (price < 25) return 0.5
  if (price < 200) return 1
  if (price < 500) return 2.5
  return 5
}
function roundStrike(price, value) {
  const inc = strikeIncrement(price)
  if (!inc) return value
  return Math.round(value / inc) * inc
}

// Compute the staged execution plan when a setup triggers on a ticker.
// estimatePremium is optional; pass it (from wheelOptions.estimatePremium) to
// fill in the dollar cost / contract count estimate.
//
// Returns:
//   { side, contracts, strike, dte, expiration, estPremium, dollarRisk, accountValue }
//
// side: 'BUY TO OPEN PUT' / 'BUY TO OPEN CALL' / 'BUY' (stock)
export function computeStagedTrade(setup, currentPrice, accountValue, hv = null, estimatePremiumFn = null) {
  const plan = setup?.tradePlan || {}
  const dte = Math.max(1, Number(plan.dte) || 30)
  const expiration = new Date(Date.now() + dte * 86400000).toISOString().slice(0, 10)
  const sizing = Math.min(0.5, Math.max(0.0001, Number(plan.sizingValue) || 0.015))
  const dollarRisk = (accountValue || 0) * sizing

  if (plan.instrumentType === 'stock') {
    const shares = Math.floor((dollarRisk || 0) / (currentPrice || 1))
    return {
      side: setup.direction === 'short' ? 'SELL SHORT' : 'BUY',
      shares,
      price: currentPrice,
      dollarRisk,
      accountValue,
      sizing,
      dte: null,
      expiration: null,
    }
  }

  // Option flow. Strike offset is a fraction of current price; positive for
  // higher strikes, negative for lower. Defaults: puts use negative offset
  // (OTM below price), calls use positive (OTM above).
  const offset = Number(plan.strikeOffset)
  const rawStrike = currentPrice * (1 + (isNaN(offset) ? (plan.optionType === 'put' ? -0.05 : 0.05) : offset))
  const strike = roundStrike(currentPrice, rawStrike)
  const optionType = plan.optionType || (setup.direction === 'short' ? 'put' : 'call')

  let estPremium = null
  if (estimatePremiumFn && strike > 0 && hv != null) {
    try {
      estPremium = estimatePremiumFn({ price: currentPrice, strike, hv, dte, type: optionType })
    } catch { estPremium = null }
  }
  const contracts = (estPremium && estPremium > 0) ? Math.max(1, Math.floor(dollarRisk / (estPremium * 100))) : 1

  return {
    side: optionType === 'put' ? 'BUY TO OPEN PUT' : 'BUY TO OPEN CALL',
    optionType,
    strike,
    dte,
    expiration,
    estPremium,
    contracts,
    dollarRisk,
    accountValue,
    sizing,
    targetExitPct: plan.targetExitPct ?? null,
    stopExitPct: plan.stopExitPct ?? null,
    stopExitPrice: plan.stopExitPrice ?? null,
    timeExitDte: plan.timeExitDte ?? null,
  }
}

// ── Back-compat projection for Chart / Levels / Calendar ────────────────────
// The old putTheses store fed Chart's price-line annotation, Levels' alert
// banner, and Calendar's earnings overlay. To keep those consumers working
// after the migration to Setups, derive an equivalent { [TICKER]: { trigger,
// text } } map from the current setups.
//
// Rule: for each ticker in any active SHORT setup with a price_below /
// price_close_below condition, use the lowest (most aggressive) trigger
// price as the trigger and the setup name as the text. Long setups with a
// price_above condition project a "PUT TRIGGER"-style notification too,
// for the long case (Chart and Levels treat trigger as a horizontal level
// without direction).
export function derivePutThesesProjection(setups, savedUniverses = []) {
  const out = {}
  for (const setup of setups || []) {
    if (setup.status && setup.status !== 'active') continue
    const tickers = resolveUniverseTickers(setup.universe, savedUniverses)
    for (const ticker of tickers) {
      const T = String(ticker || '').toUpperCase()
      if (!T) continue
      for (const cond of setup.conditions || []) {
        const val = cond?.params?.value
        if (val == null || isNaN(val)) continue
        const isPriceBased = cond.type === 'price_below' || cond.type === 'price_above'
        if (!isPriceBased) continue
        const cur = out[T]
        if (!cur || Number(val) < cur.trigger) {
          out[T] = { trigger: Number(val), text: setup.name, setupId: setup.id, direction: setup.direction || 'short' }
        }
      }
    }
  }
  return out
}
