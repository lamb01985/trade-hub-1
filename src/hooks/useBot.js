// ─────────────────────────────────────────────────────────────────────────────
// useBot.js — multi-ticker coach engine hook
//
// Receives a watchlist of tickers plus a liveDataMulti map. On each tick,
// iterates the watchlist, builds per-ticker context, calls the engine's
// evaluateContext for that ticker. The engine's state is per-ticker indexed
// in state.byTicker[TICKER]; a single global lockout flag governs new-setup
// suppression across all tickers.
//
// Concurrent positions are allowed: each ticker has its own state machine and
// can be IN_TRADE independently.
//
// The hook still mirrors engine state via useReducer so the UI re-renders on
// changes. The "primary" ticker (highest priority) drives the Right Now card;
// remaining active tickers surface in pendingCards.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useReducer, useRef, useCallback } from 'react'
import { aggregateBars, computeMTF, alignmentScore } from '../lib/structure.js'
import { getETMins } from '../constants.js'
import {
  createInitialState,
  loadState,
  saveState,
  evaluateContext,
  userTakeIt,
  userSkipIt,
  userCloseManually,
  userDismissClosed,
  userUnlock,
  resetSession,
  updateSettings,
  setChecklistComplete,
  sessionStats,
  patternsByActivity,
  disciplineStreak,
  skipQuality,
  devInjectTestSetup,
  tickerSlice,
  totalRealizedPL,
  perTickerPLBreakdown,
} from '../lib/bot.js'
import {
  notify,
  updateTabTitle,
  playSetupForming,
  playGoLive,
  playPositionOpened,
  playWin,
  playLoss,
  playLockout,
} from '../lib/alerts.js'

// ── Reducer mirrors the engine's state into React ───────────────────────────

function reducer(_state, action) {
  switch (action.type) {
    case 'REPLACE': return action.state
    default: return _state
  }
}

// ── Per-ticker adapters: bundle (from useLiveDataMulti) -> engine ctx ──────

// Extract the small set of levels the engine consumes from a per-ticker bundle.
function adaptLevelsFromBundle(bundle) {
  const out = {}
  if (bundle?.vwapData?.vwap != null) out.VWAP = bundle.vwapData.vwap
  const p = bundle?.pivots
  if (p?.pp != null) out.P = p.pp
  if (p?.r1 != null) out.R1 = p.r1
  if (p?.r2 != null) out.R2 = p.r2
  if (p?.r3 != null) out.R3 = p.r3
  if (p?.s1 != null) out.S1 = p.s1
  if (p?.s2 != null) out.S2 = p.s2
  if (p?.s3 != null) out.S3 = p.s3
  const pd = bundle?.prevDay
  if (pd?.high != null) out.PDH = pd.high
  if (pd?.low != null) out.PDL = pd.low
  if (pd?.close != null) out.PDC = pd.close
  return out
}

// Map an alignmentScore mtf object to engine vocabulary.
function adaptAlignmentMtf(mtf) {
  if (!mtf) return {}
  const m = (state) => {
    if (state === 'BULLISH') return 'trending_up'
    if (state === 'BEARISH') return 'trending_down'
    if (state === 'TRANSITION') return 'transition'
    if (state === 'RANGING') return 'ranging'
    return null
  }
  return {
    '1h':  m(mtf['1h']?.state),
    '15m': m(mtf['15m']?.state),
    '5m':  m(mtf['5m']?.state),
    '1m':  m(mtf['1m']?.state),
  }
}

// Compute the today's opening range from intradayBars (9:30-9:45 ET window).
function computeOrb(intradayBars) {
  if (!intradayBars?.length) return null
  const inWindow = intradayBars.filter((b) => {
    const et = new Date(b.t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
    const [h, m] = et.split(':').map(Number)
    const mins = h * 60 + m
    return mins >= 570 && mins < 585
  })
  if (!inWindow.length) return null
  const high = Math.max(...inWindow.map(b => b.h))
  const low = Math.min(...inWindow.map(b => b.l))
  return { high, low, mid: (high + low) / 2 }
}

// Build a Journal-shaped trade record from a closed engine position.
function buildPaperTrade(position, ticker) {
  const id = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const hhmm = (ms) => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const today = new Date().toISOString().slice(0, 10)
  return {
    id,
    date: new Date(position.closedAt || Date.now()).toISOString(),
    ticker: (ticker || position.ticker || 'QQQ').toUpperCase(),
    optType: position.optionDirection || (position.direction === 'long' ? 'call' : 'put'),
    strike: position.optionStrike ?? null,
    expiry: today,
    contracts: position.contracts || 1,
    entry: position.premiumPaid ?? 0,
    exitPrice: position.exitPremium ?? 0,
    entryTime: hhmm(position.openedAt || Date.now()),
    exitTime: hhmm(position.closedAt || Date.now()),
    setupType: position.setupName || 'Bot coach',
    status: (position.realizedPL ?? 0) >= 0 ? 'win' : 'loss',
    pnl: position.realizedPL ?? 0,
    notes: `Bot coach paper (${position.exitReason || 'manual'})`,
    paper: true,
  }
}

// ── Priority ranking ────────────────────────────────────────────────────────
// State priority order. Higher index = higher priority for the right-now card.
const STATE_PRIORITY = {
  'WAIT': 0,
  'CLOSED': 1,
  'WATCH': 2,
  'IN_TRADE': 3,
  'GO': 4,
}

function rankSlot(slot, ticker, activeTicker) {
  const statePri = STATE_PRIORITY[slot?.state] ?? 0
  const confluence = slot?.activeSetup?.confidence ?? 0
  // Final tiebreaker: prefer the user's currently-active app ticker.
  const isActive = activeTicker && String(activeTicker).toUpperCase() === ticker ? 1 : 0
  return statePri * 1_000_000 + confluence * 1_000 + isActive
}

function deriveTickerOrder(state, watchlist, activeTicker) {
  const tickers = (watchlist || []).map(t => String(t).toUpperCase()).filter(Boolean)
  if (!tickers.length) return { primaryTicker: null, pendingTickers: [], sorted: [] }
  const sorted = [...tickers].sort((a, b) => {
    const sa = tickerSlice(state, a)
    const sb = tickerSlice(state, b)
    return rankSlot(sb, b, activeTicker) - rankSlot(sa, a, activeTicker)
  })
  const primaryTicker = sorted[0] || null
  // Pending = the remaining tickers in WATCH/GO/IN_TRADE only.
  const pendingTickers = sorted
    .slice(1)
    .filter(t => {
      const s = tickerSlice(state, t)
      return s.state === 'GO' || s.state === 'WATCH' || s.state === 'IN_TRADE'
    })
  return { primaryTicker, pendingTickers, sorted }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useBot({
  watchlist = [],
  liveDataMulti = {},
  activeTicker = null,
  checklistComplete = false,
  onPaperTrade = null,
} = {}) {
  const [state, dispatch] = useReducer(reducer, null, createInitialState)
  const hydratedRef = useRef(false)
  const stateRef = useRef(state)
  // Track last-tick price per ticker so the engine has lastPrice for breakout
  // detection on the next tick.
  const lastPriceRef = useRef({})
  stateRef.current = state

  // Normalize watchlist for stable iteration.
  const tickers = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const t of watchlist || []) {
      if (!t) continue
      const T = String(t).toUpperCase()
      if (seen.has(T)) continue
      seen.add(T)
      out.push(T)
    }
    return out
  }, [watchlist])
  const tickersKey = tickers.join('|')

  // One-time hydrate from localStorage. Engine's loadState migrates legacy
  // single-ticker payloads into byTicker[QQQ].
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const loaded = loadState()
    dispatch({ type: 'REPLACE', state: loaded })
  }, [])

  // Persist whenever state changes (post-hydration)
  useEffect(() => {
    if (hydratedRef.current) saveState(state)
  }, [state])

  // ── Main tick: iterate watchlist, evaluate per ticker, batch dispatch ─────
  useEffect(() => {
    if (!hydratedRef.current) return
    if (tickers.length === 0) return

    let working = stateRef.current
    working = setChecklistComplete(working, !!checklistComplete)

    const etMinutes = getETMins()
    const eventsToFire = []  // [{ticker, event}]

    for (const ticker of tickers) {
      const bundle = liveDataMulti[ticker]
      if (!bundle || bundle.price == null) continue

      const intradayBars = bundle.intradayBars || []
      const bars5m = aggregateBars(intradayBars, 5)
      const mtf = computeMTF(intradayBars)
      const aScore = mtf ? alignmentScore(mtf, bundle.rvol ?? null) : null
      const alignment = adaptAlignmentMtf(aScore?.mtf || mtf)
      const levels = adaptLevelsFromBundle(bundle)
      const orb = computeOrb(intradayBars)

      const ctx = {
        ticker,
        currentPrice: bundle.price,
        lastPrice: lastPriceRef.current[ticker] ?? null,
        bars5m,
        levels,
        alignment,
        etMinutes,
        rvol: bundle.rvol ?? null,
        orb,
        checklistComplete,
      }

      const { state: ns, events } = evaluateContext(ctx, working)
      working = ns
      for (const e of events) eventsToFire.push({ ticker, event: e })

      lastPriceRef.current[ticker] = bundle.price
    }

    if (working !== stateRef.current) {
      dispatch({ type: 'REPLACE', state: working })
    }

    for (const { ticker, event } of eventsToFire) handleEvent(event, ticker)

    // Tab title reflects the primary ticker's state (or global lockout).
    const { primaryTicker } = deriveTickerOrder(working, tickers, activeTicker)
    if (primaryTicker) {
      const slot = tickerSlice(working, primaryTicker)
      const visualState = working.lockedAt ? 'LOCKED' : slot.state
      updateTabTitle(visualState, {
        ticker: primaryTicker,
        direction: slot.activeSetup?.direction || slot.position?.direction,
        pl: slot.position?.unrealizedPL ?? slot.lastClosed?.realizedPL,
      })
    }
  // We intentionally drive this effect off the multi bundle reference plus the
  // tickers signature. The reference is stable in useLiveDataMulti's useState
  // and changes only when underlying data ticks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDataMulti, tickersKey, activeTicker, checklistComplete])

  // ── Event side effects ────────────────────────────────────────────────────
  function handleEvent(e, ticker) {
    switch (e.type) {
      case 'watch':
        playSetupForming()
        notify('Setup forming', e.message || `${ticker}: watching ${e.setup?.setupName || 'a setup'}`, 'normal')
        break
      case 'go':
        playGoLive()
        notify('GO', e.message || `${ticker}: take it or skip it`, 'high')
        break
      case 'position_opened':
        playPositionOpened()
        notify('Position opened', e.message || `${ticker}: paper position open`, 'normal')
        break
      case 'position_closed': {
        const isWin = (e.position?.realizedPL ?? 0) >= 0
        if (isWin) playWin(); else playLoss()
        notify(isWin ? 'Win' : 'Loss', e.message || `${ticker}: position closed`, isWin ? 'normal' : 'high')
        const settings = stateRef.current?.settings || {}
        if (settings.writePaperTrades && onPaperTrade && e.position) {
          try { onPaperTrade(buildPaperTrade(e.position, ticker)) } catch (_) {}
        }
        break
      }
      case 'lockout':
        playLockout()
        notify('Daily lockout', e.message || 'Daily loss limit hit', 'high')
        break
      case 'go_expired':
        notify('Setup expired', e.message || `${ticker}: 60s window closed`, 'low')
        break
      case 'skipped':
      case 'watch_dropped':
      case 'closed_dismissed':
      case 'unlocked':
        break
      default:
        break
    }
  }

  // ── User actions (now take a ticker arg) ──────────────────────────────────
  const onTakeIt = useCallback((ticker, opts) => {
    const t = String(ticker || activeTicker || '').toUpperCase()
    if (!t) return
    const { state: ns, events } = userTakeIt(stateRef.current, t, opts || {})
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, t)
  }, [activeTicker])

  const onSkipIt = useCallback((ticker) => {
    const t = String(ticker || activeTicker || '').toUpperCase()
    if (!t) return
    const { state: ns, events } = userSkipIt(stateRef.current, t)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, t)
  }, [activeTicker])

  const onCloseManually = useCallback((ticker, exitPremium) => {
    const t = String(ticker || activeTicker || '').toUpperCase()
    if (!t) return
    const { state: ns, events } = userCloseManually(stateRef.current, t, exitPremium)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, t)
  }, [activeTicker])

  const onDismissClosed = useCallback((ticker) => {
    const t = String(ticker || activeTicker || '').toUpperCase()
    if (!t) return
    const { state: ns, events } = userDismissClosed(stateRef.current, t)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, t)
  }, [activeTicker])

  const onUnlock = useCallback(() => {
    const { state: ns, events } = userUnlock(stateRef.current)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, '')
  }, [])

  const onResetSession = useCallback(() => {
    const next = resetSession(stateRef.current)
    dispatch({ type: 'REPLACE', state: next })
  }, [])

  const onUpdateSettings = useCallback((patch) => {
    const next = updateSettings(stateRef.current, patch)
    dispatch({ type: 'REPLACE', state: next })
  }, [])

  const onDevTriggerTestSetup = useCallback((targetTicker) => {
    const ticker = String(targetTicker || activeTicker || tickers[0] || 'QQQ').toUpperCase()
    const price = liveDataMulti[ticker]?.price ?? 590
    const { state: ns, events } = devInjectTestSetup(stateRef.current, ticker, Number(price))
    dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, ticker)
  }, [activeTicker, tickers, liveDataMulti])

  // ── Derived: primary ticker + pending list ────────────────────────────────
  const { primaryTicker, pendingTickers, sorted } = useMemo(() => {
    return deriveTickerOrder(state, tickers, activeTicker)
  }, [state, tickersKey, activeTicker])

  // ── currentCard: drives the right-now card for the primary ticker ────────
  const currentCard = useMemo(() => {
    if (!primaryTicker) {
      return {
        state: state.lockedAt ? 'LOCKED' : 'WAIT',
        ticker: '',
        setup: null,
        position: null,
        lastClosed: null,
        goExpiresAt: null,
        lockout: state.lockedAt ? { lockedAt: state.lockedAt } : null,
        checklistRequired: state.settings?.requireChecklist && !checklistComplete,
        settings: state.settings,
      }
    }
    const slot = tickerSlice(state, primaryTicker)
    return {
      state: state.lockedAt ? 'LOCKED' : slot.state,
      setup: slot.activeSetup,
      position: slot.position,
      lastClosed: slot.lastClosed,
      goExpiresAt: slot.goExpiresAt,
      lockout: state.lockedAt ? { lockedAt: state.lockedAt } : null,
      checklistRequired: state.settings?.requireChecklist && !checklistComplete,
      ticker: primaryTicker,
      settings: state.settings,
    }
  }, [state, primaryTicker, checklistComplete])

  // ── pendingCards: the "Also live" queue (max 3 by priority) ──────────────
  const pendingCards = useMemo(() => {
    return pendingTickers.slice(0, 3).map(t => {
      const slot = tickerSlice(state, t)
      return {
        ticker: t,
        state: slot.state,
        setup: slot.activeSetup,
        position: slot.position,
        confluence: slot.activeSetup?.confidence ?? 0,
      }
    })
  }, [state, pendingTickers])

  // ── Per-ticker chip data for the watchlist UI ─────────────────────────────
  const tickerChips = useMemo(() => {
    return tickers.map(t => {
      const slot = tickerSlice(state, t)
      const bundle = liveDataMulti[t] || {}
      return {
        ticker: t,
        state: state.lockedAt ? 'LOCKED' : slot.state,
        price: bundle.price ?? null,
        setup: slot.activeSetup,
        position: slot.position,
        realizedPL: slot.realizedPL || 0,
        unrealizedPL: slot.position?.unrealizedPL ?? 0,
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, tickersKey, liveDataMulti])

  // ── Aggregate today's setups across tickers for the today panel ──────────
  const todaysSetups = useMemo(() => {
    const out = []
    for (const slot of Object.values(state.byTicker || {})) {
      for (const r of slot.todaysSetups || []) out.push(r)
    }
    out.sort((a, b) => (b.surfaceTs || 0) - (a.surfaceTs || 0))
    return out
  }, [state])

  const patterns = useMemo(() => ({
    bySetup: patternsByActivity(state, 20),
    skip: skipQuality(state),
    disciplineStreak: disciplineStreak(state),
    today: sessionStats(state),
    perTicker: perTickerPLBreakdown(state),
  }), [state])

  return {
    state,
    currentCard,
    pendingCards,
    tickerChips,
    primaryTicker,
    sortedTickers: sorted,
    todaysSetups,
    patterns,
    realizedPL: totalRealizedPL(state),
    onTakeIt,
    onSkipIt,
    onCloseManually,
    onDismissClosed,
    onUnlock,
    onResetSession,
    onUpdateSettings,
    onDevTriggerTestSetup,
  }
}
