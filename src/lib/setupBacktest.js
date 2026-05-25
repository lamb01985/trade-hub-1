// ─────────────────────────────────────────────────────────────────────────────
// setupBacktest.js — walk-forward backtester for Setup definitions.
//
// For each ticker in the setup's universe, fetch ~252 days of daily bars and
// walk day by day. At each day, build an "as-of-date" snapshot (only data up
// to and including that day), evaluate the setup's conditions, and if they
// fire, simulate the trade plan forward bar by bar until an exit hits.
//
// Limitations of this v1 (called out so the results aren't overinterpreted):
//   - Daily bars only. Intraday signals (VWAP, RVOL, gap rules using true
//     open vs prev close) are approximated or null in the backtest snapshot.
//   - Option pricing uses Black-Scholes with HV held constant at entry, no
//     skew, no dividends. Premiums are estimates, not historical quotes.
//   - No commissions, no slippage. Real fills will be worse.
//   - Triggers within the per-ticker cooldown window are skipped.
//
// Stats reported: triggers, winRate, avgWin, avgLoss, expectedValue,
// maxDrawdown, sharpe (annualized).
// ─────────────────────────────────────────────────────────────────────────────

import { getHistoricalBars } from './massive.js'
import { calcPivots } from './levels.js'
import { evaluateAll } from './conditionEvaluators.js'
import { computeEMA, computeRSI, computeMACD, computeHV } from './indicators.js'
import { estimatePremium } from './wheelOptions.js'

const TRADING_DAYS_PER_YEAR = 252

// Build a backtest snapshot from a bars window ending at `idx`. Uses ONLY
// data from bars[0..idx] so the evaluators don't peek at the future.
function buildBacktestSnapshot(ticker, bars, idx) {
  if (!bars?.length || idx < 1 || idx >= bars.length) return null
  const bar = bars[idx]
  const prev = bars[idx - 1]
  if (!bar || !prev) return null

  // Trailing closes up to and including this bar.
  const closes = []
  for (let i = 0; i <= idx; i++) {
    if (bars[i]?.c != null) closes.push(bars[i].c)
  }

  // Indicators on the trailing-closes window. computeEMA / RSI / MACD return
  // same-length arrays; pull the last value.
  const last = (arr) => (arr.length ? arr[arr.length - 1] : null)
  const ema9 = last(computeEMA(closes, 9))
  const ema21 = last(computeEMA(closes, 21))
  const ema50 = last(computeEMA(closes, 50))
  const ema200 = last(computeEMA(closes, 200))
  const ema9Series = computeEMA(closes, 9)
  const ema21Series = computeEMA(closes, 21)
  const ema50Series = computeEMA(closes, 50)
  const prevEma9 = ema9Series.length >= 2 ? ema9Series[ema9Series.length - 2] : null
  const prevEma21 = ema21Series.length >= 2 ? ema21Series[ema21Series.length - 2] : null
  const prevEma50 = ema50Series.length >= 2 ? ema50Series[ema50Series.length - 2] : null
  const rsiSeries = computeRSI(closes, 14)
  const rsi14 = rsiSeries.length ? rsiSeries[rsiSeries.length - 1] : null
  const macdRes = computeMACD(closes)
  const m = (arr) => arr?.length ? arr[arr.length - 1] : null
  const mPrev = (arr) => arr?.length >= 2 ? arr[arr.length - 2] : null
  const macd = {
    line: m(macdRes.macd),
    signal: m(macdRes.signal),
    histogram: m(macdRes.histogram),
    prevLine: mPrev(macdRes.macd),
    prevSignal: mPrev(macdRes.signal),
  }

  // Approximate RVOL = today's volume vs trailing-20 average.
  let rvol = null
  if (bar.v != null && idx >= 20) {
    let sum = 0, n = 0
    for (let j = idx - 20; j < idx; j++) {
      if (bars[j]?.v != null) { sum += bars[j].v; n++ }
    }
    if (n > 0 && sum > 0) rvol = bar.v / (sum / n)
  }

  const prevDay = { high: prev.h, low: prev.l, close: prev.c }
  const pivots = calcPivots(prev.h, prev.l, prev.c)

  const wk52High = closes.length ? Math.max(...closes.slice(-Math.min(252, closes.length))) : null
  const wk52Low = closes.length ? Math.min(...closes.slice(-Math.min(252, closes.length))) : null
  const fromHighPct = wk52High ? ((bar.c - wk52High) / wk52High) * 100 : null

  return {
    ticker,
    price: bar.c,                  // backtest treats close as the "current" price
    prevClose: prev.c,
    openPrice: bar.o,
    changePct: prev.c ? ((bar.c - prev.c) / prev.c) * 100 : null,
    rvol,
    vwap: null,                    // daily-bar backtest can't model intraday VWAP
    prevDay,
    pivots,
    histBars: bars.slice(0, idx + 1),
    closes,
    ema9, ema21, ema50, ema200,
    prevEma9, prevEma21, prevEma50,
    rsi14,
    macd,
    pe: null, ps: null, scannerScore: null,
    fromHighPct,
    wk52High, wk52Low,
  }
}

// Determine if all conditions are met (operator='all') or any are (operator='any').
function isFired(operator, results) {
  if (!results.length) return false
  const metCount = results.filter(r => r.met).length
  return operator === 'any' ? metCount >= 1 : metCount === results.length
}

// Standard increment rounding (same table the WheelScanner uses).
function strikeIncrement(price) {
  if (price < 25) return 0.5
  if (price < 200) return 1
  if (price < 500) return 2.5
  return 5
}
function roundStrike(price, value) {
  const inc = strikeIncrement(price)
  return inc ? Math.round(value / inc) * inc : value
}

// Simulate the option trade forward from entryIdx. Returns a trade record
// with realized P&L when an exit hits, or null if no exit before end of
// available bars (caller may treat that as "left open" = expired).
function simulateOptionTrade(setup, bars, entryIdx, hv) {
  const plan = setup.tradePlan || {}
  const entryBar = bars[entryIdx]
  if (!entryBar) return null
  const entryPrice = entryBar.c

  const optionType = plan.optionType || (setup.direction === 'short' ? 'put' : 'call')
  const offset = Number(plan.strikeOffset)
  const rawStrike = entryPrice * (1 + (isNaN(offset) ? (optionType === 'put' ? -0.05 : 0.05) : offset))
  const strike = roundStrike(entryPrice, rawStrike)
  const dteEntry = Math.max(1, Number(plan.dte) || 30)
  const entryPremium = estimatePremium({ price: entryPrice, strike, hv, dte: dteEntry, type: optionType })
  if (!entryPremium || entryPremium <= 0) return null

  const targetMult = plan.targetExitPct != null ? 1 + Number(plan.targetExitPct) / 100 : Infinity
  const stopMult = plan.stopExitPct != null ? 1 - Number(plan.stopExitPct) / 100 : -Infinity
  const stopPrice = plan.stopExitPrice != null ? Number(plan.stopExitPrice) : null
  const timeExitDte = plan.timeExitDte != null ? Number(plan.timeExitDte) : 0

  for (let j = entryIdx + 1; j < bars.length; j++) {
    const daysElapsed = j - entryIdx
    const dte = dteEntry - daysElapsed
    const bar = bars[j]
    if (!bar) break
    const px = bar.c

    // Underlying stop check first (price-based) — fires intra-day at close.
    if (stopPrice != null) {
      const hit = optionType === 'call' ? px <= stopPrice : px >= stopPrice
      if (hit) {
        const exitPremium = dte > 0
          ? estimatePremium({ price: px, strike, hv, dte, type: optionType })
          : Math.max(0, optionType === 'call' ? px - strike : strike - px)
        return makeTradeRecord(setup, bars, entryIdx, j, entryPremium, exitPremium, optionType, strike, 'stop_price')
      }
    }

    // Time-exit before expiry.
    if (dte <= timeExitDte) {
      const exitPremium = dte > 0
        ? estimatePremium({ price: px, strike, hv, dte, type: optionType })
        : Math.max(0, optionType === 'call' ? px - strike : strike - px)
      return makeTradeRecord(setup, bars, entryIdx, j, entryPremium, exitPremium, optionType, strike, 'time_exit')
    }

    // At expiry, settle to intrinsic.
    if (dte <= 0) {
      const intrinsic = Math.max(0, optionType === 'call' ? px - strike : strike - px)
      return makeTradeRecord(setup, bars, entryIdx, j, entryPremium, intrinsic, optionType, strike, 'expired')
    }

    // Mark-to-market and check target / pct stop.
    const mark = estimatePremium({ price: px, strike, hv, dte, type: optionType })
    if (mark != null) {
      if (mark >= entryPremium * targetMult) {
        return makeTradeRecord(setup, bars, entryIdx, j, entryPremium, mark, optionType, strike, 'target')
      }
      if (plan.stopExitPct != null && mark <= entryPremium * stopMult) {
        return makeTradeRecord(setup, bars, entryIdx, j, entryPremium, mark, optionType, strike, 'stop_pct')
      }
    }
  }
  // No exit before end of available bars.
  return null
}

function makeTradeRecord(setup, bars, entryIdx, exitIdx, entryPremium, exitPremium, optionType, strike, exitReason) {
  const pnlAbs = (exitPremium ?? 0) - entryPremium
  const pnlPct = (pnlAbs / entryPremium) * 100
  return {
    setupId: setup.id,
    entryIdx, exitIdx,
    entryDate: bars[entryIdx]?.t ? new Date(bars[entryIdx].t).toISOString().slice(0, 10) : null,
    exitDate: bars[exitIdx]?.t ? new Date(bars[exitIdx].t).toISOString().slice(0, 10) : null,
    daysHeld: exitIdx - entryIdx,
    optionType, strike,
    entryPremium, exitPremium,
    pnlAbs, pnlPct,
    exitReason,
  }
}

// Aggregate per-trade results into the summary stats stored on the setup.
function summarize(trades) {
  if (!trades?.length) {
    return { triggers: 0, winRate: 0, avgWin: 0, avgLoss: 0, expectedValue: 0, maxDrawdown: 0, sharpe: 0 }
  }
  const wins = trades.filter(t => (t.pnlPct ?? 0) > 0)
  const losses = trades.filter(t => (t.pnlPct ?? 0) <= 0)
  const winRate = wins.length / trades.length
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0
  const expectedValue = winRate * avgWin + (1 - winRate) * avgLoss
  // Equity curve from per-trade P&L percent (additive in trade units).
  let equity = 0, peak = 0, maxDD = 0
  for (const t of trades) {
    equity += t.pnlPct
    if (equity > peak) peak = equity
    const dd = peak - equity
    if (dd > maxDD) maxDD = dd
  }
  // Sharpe-ish: mean pnlPct / stdev, annualized to expected trade frequency.
  const mean = trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length
  const variance = trades.reduce((s, t) => s + (t.pnlPct - mean) * (t.pnlPct - mean), 0) / Math.max(1, trades.length - 1)
  const std = Math.sqrt(variance)
  const avgDaysHeld = trades.reduce((s, t) => s + (t.daysHeld || 1), 0) / trades.length
  const tradesPerYear = avgDaysHeld > 0 ? TRADING_DAYS_PER_YEAR / avgDaysHeld : 0
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(tradesPerYear) : 0
  return {
    triggers: trades.length,
    winRate: Number(winRate.toFixed(4)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    expectedValue: Number(expectedValue.toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
  }
}

// Public entry. `options.onProgress({ ticker, progressPct, stage })` is
// optional; called as each ticker phase completes.
//
// options.barsCache: { [TICKER]: bars } reusable cache so re-running the
// backtest doesn't re-fetch. The function writes into it.
export async function backtestSetup(setup, apiKey, options = {}) {
  if (!setup || !apiKey) return { error: 'Missing setup or apiKey' }
  if (!setup.conditions?.length) return { error: 'Setup has no conditions' }
  if (!setup.universe?.length) return { error: 'Setup has no universe' }

  const cache = options.barsCache || {}
  const onProgress = options.onProgress || (() => {})
  const minBarsForEval = 50  // need enough history for EMAs and RSI to be meaningful
  const cooldownDays = Math.max(0, Math.ceil((setup.alerts?.cooldownMinutes || 0) / (60 * 24)))

  let allTrades = []
  const tickers = setup.universe
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]
    onProgress({ ticker, progressPct: Math.round((i / tickers.length) * 100), stage: 'fetching' })
    let bars = cache[ticker]
    if (!bars) {
      try {
        bars = await getHistoricalBars(apiKey, ticker, 252)
        cache[ticker] = bars || []
      } catch {
        cache[ticker] = []
        bars = []
      }
    }
    if (!bars?.length || bars.length < minBarsForEval) continue

    onProgress({ ticker, progressPct: Math.round((i / tickers.length) * 100), stage: 'walking' })

    let lastTriggerIdx = -Infinity
    for (let day = minBarsForEval; day < bars.length; day++) {
      // Respect cooldown so the same setup can't fire every consecutive day.
      if (day - lastTriggerIdx <= cooldownDays) continue
      const snap = buildBacktestSnapshot(ticker, bars, day)
      if (!snap) continue
      const results = evaluateAll(setup.conditions, snap)
      if (!isFired(setup.operator || 'all', results)) continue
      // Compute HV from prior 30 daily closes for option pricing.
      const hv = computeHV(snap.closes, 30)
      if (hv == null || hv <= 0) continue
      const trade = simulateOptionTrade(setup, bars, day, hv)
      if (trade) {
        trade.ticker = ticker
        allTrades.push(trade)
      }
      lastTriggerIdx = day
    }
  }
  onProgress({ ticker: null, progressPct: 100, stage: 'done' })

  const summary = summarize(allTrades)
  return {
    ...summary,
    lastRunAt: Date.now(),
    trades: allTrades,
  }
}
