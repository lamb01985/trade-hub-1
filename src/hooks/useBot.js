// ─────────────────────────────────────────────────────────────────────────────
// useBot.js — coach engine hook
//
// Owns no data of its own. Receives the active ticker, the live price stream,
// the multi-timeframe alignment object, the level map, intraday bars, and a
// checklist-complete flag from the parent (App.jsx via the Bot component).
//
// Each render builds the market context, calls evaluateContext from the new
// bot engine, and dispatches sound + notification + tab title side effects
// based on the events the engine returns.
//
// The engine is the source of truth for state. This hook only mirrors it
// into React via useReducer so the UI re-renders when the engine returns
// a new state object.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useReducer, useRef, useCallback } from 'react'
import { aggregateBars } from '../lib/structure.js'
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

// ── Adapters: convert App-level shapes into the engine's expected shapes ────

// Engine wants levels keyed by { VWAP, P, R1, R2, R3, S1, S2, S3, PDH, PDL, PDC }.
// App provides fullLevelMap.levels as an array of { label, price, type } plus
// prevDay = { high, low, close } from useLiveData.
function adaptLevels(levelMap, prevDay) {
  const out = {}
  for (const lvl of levelMap?.levels || []) {
    if (lvl.price == null || isNaN(lvl.price)) continue
    if (lvl.label === 'VWAP') out.VWAP = lvl.price
    else if (lvl.label === 'Pivot') out.P = lvl.price
    else if (['R1', 'R2', 'R3', 'S1', 'S2', 'S3'].includes(lvl.label)) out[lvl.label] = lvl.price
  }
  // Prior day comes from useLiveData directly because the level map labels
  // them as 'Prev Day High' / 'Prev Day Low' / 'Prev Day Close' and we want
  // the canonical short names PDH / PDL / PDC.
  if (prevDay?.high != null) out.PDH = prevDay.high
  if (prevDay?.low != null) out.PDL = prevDay.low
  if (prevDay?.close != null) out.PDC = prevDay.close
  return out
}

// Map App's mtfAlignment.mtf states (BULLISH / BEARISH / RANGING / TRANSITION)
// to the engine's vocabulary (trending_up / trending_down / ranging / transition).
function adaptAlignment(mtf) {
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

// Build a Journal-shaped trade record from a closed engine position. Used
// when the bot's writePaperTrades setting is on; the parent supplies the
// callback and is responsible for actually pushing to the trades store.
// The shape mirrors what QuickLog writes: status 'win'/'loss' (not 'closed'),
// pnl in dollars, optType 'call'/'put', entryTime/exitTime as HH:MM strings.
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
    ticker: (ticker || 'QQQ').toUpperCase(),
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

// Compute today's opening range from intradayBars. Polygon timestamps are UTC
// ms. Regular session opens at 9:30 ET = 570 minutes from midnight ET; the
// first 15 minutes (9:30 to 9:45) define the ORB. Returns null until 9:45 ET
// has passed or until at least one bar lands in the window.
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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useBot({
  activeTicker = 'QQQ',
  livePrice = null,
  intradayBars = [],
  levelMap = null,
  mtfAlignment = null,
  prevDay = null,
  rvol = null,
  checklistComplete = false,
  onPaperTrade = null,
} = {}) {
  const [state, dispatch] = useReducer(reducer, null, createInitialState)
  const hydratedRef = useRef(false)
  const stateRef = useRef(state)
  const lastPriceRef = useRef(null)
  stateRef.current = state

  // One-time hydrate from localStorage
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

  // ── Adapt inputs into the engine's expected shapes ────────────────────────
  const levels = useMemo(() => adaptLevels(levelMap, prevDay), [levelMap, prevDay])
  const alignment = useMemo(() => adaptAlignment(mtfAlignment?.mtf), [mtfAlignment])
  const bars5m = useMemo(() => aggregateBars(intradayBars, 5), [intradayBars])
  const orb = useMemo(() => computeOrb(intradayBars), [intradayBars])

  // ── Main tick: build context and let the engine evaluate ─────────────────
  useEffect(() => {
    if (!hydratedRef.current) return
    if (livePrice == null || !activeTicker) return

    const ticker = activeTicker.toUpperCase()
    const etMinutes = getETMins()
    const ctx = {
      ticker,
      currentPrice: livePrice,
      lastPrice: lastPriceRef.current,
      bars5m,
      levels,
      alignment,
      etMinutes,
      rvol,
      orb,
      checklistComplete,
    }

    let working = stateRef.current
    // Sync checklist flag into engine state if it changed
    working = setChecklistComplete(working, !!checklistComplete)

    const { state: nextState, events } = evaluateContext(ctx, working)

    if (nextState !== working) {
      dispatch({ type: 'REPLACE', state: nextState })
    }

    // Side effects per event. The engine only emits transition events, not
    // sustained-state events, so each event is a single audible cue.
    for (const e of events) {
      handleEvent(e, ticker)
    }

    // Tab title reflects current visual state regardless of new events
    const titleSummary = {
      ticker,
      direction: nextState.activeSetup?.direction || nextState.position?.direction,
      pl: nextState.position?.unrealizedPL ?? nextState.lastClosed?.realizedPL,
    }
    updateTabTitle(nextState.state, titleSummary)

    lastPriceRef.current = livePrice
  }, [livePrice, activeTicker, bars5m, levels, alignment, rvol, orb, checklistComplete])

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
        // Opt-in journal write: only if the Bot settings drawer has it on.
        const settings = stateRef.current?.settings || {}
        if (settings.writePaperTrades && onPaperTrade && e.position) {
          try { onPaperTrade(buildPaperTrade(e.position, ticker)) } catch (_) {}
        }
        break
      }
      case 'lockout':
        playLockout()
        notify('Daily lockout', e.message || `${ticker}: daily loss limit hit`, 'high')
        break
      case 'go_expired':
        notify('Setup expired', e.message || `${ticker}: 60s window closed`, 'low')
        break
      case 'skipped':
      case 'watch_dropped':
      case 'closed_dismissed':
      case 'unlocked':
        // Silent transitions, no sound. Title still updates above.
        break
      default:
        break
    }
  }

  // ── User actions ──────────────────────────────────────────────────────────
  const onTakeIt = useCallback((opts) => {
    const { state: ns, events } = userTakeIt(stateRef.current, opts || {})
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, (activeTicker || 'QQQ').toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker])

  const onSkipIt = useCallback(() => {
    const { state: ns, events } = userSkipIt(stateRef.current)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, (activeTicker || 'QQQ').toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker])

  const onCloseManually = useCallback((exitPremium) => {
    const { state: ns, events } = userCloseManually(stateRef.current, exitPremium)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, (activeTicker || 'QQQ').toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker])

  const onDismissClosed = useCallback(() => {
    const { state: ns, events } = userDismissClosed(stateRef.current)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, (activeTicker || 'QQQ').toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker])

  const onUnlock = useCallback(() => {
    const { state: ns, events } = userUnlock(stateRef.current)
    if (ns !== stateRef.current) dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, (activeTicker || 'QQQ').toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker])

  const onResetSession = useCallback(() => {
    const next = resetSession(stateRef.current)
    dispatch({ type: 'REPLACE', state: next })
  }, [])

  const onUpdateSettings = useCallback((patch) => {
    const next = updateSettings(stateRef.current, patch)
    dispatch({ type: 'REPLACE', state: next })
  }, [])

  // Dev-only convenience. Bot.jsx hides the button outside import.meta.env.DEV
  // so this can never be invoked in a production build's UI. Kept exposed
  // unconditionally on the hook so the engine helper remains a single import.
  const onDevTriggerTestSetup = useCallback(() => {
    const price = livePrice ?? 590
    const ticker = (activeTicker || 'QQQ').toUpperCase()
    const { state: ns, events } = devInjectTestSetup(stateRef.current, ticker, Number(price))
    dispatch({ type: 'REPLACE', state: ns })
    for (const e of events) handleEvent(e, ticker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker, livePrice])

  // ── Exposed UI surface ────────────────────────────────────────────────────
  // currentCard is the data driving the BotRightNowCard. Everything the card
  // needs to render any of the six sub-states is here, with the active ticker
  // included so the UI does not need its own copy.
  const currentCard = useMemo(() => ({
    state: state.state,
    setup: state.activeSetup,
    position: state.position,
    lastClosed: state.lastClosed,
    goExpiresAt: state.goExpiresAt,
    lockout: state.state === 'LOCKED' ? { lockedAt: state.lockedAt } : null,
    checklistRequired: state.settings?.requireChecklist && !checklistComplete,
    ticker: (activeTicker || 'QQQ').toUpperCase(),
    settings: state.settings,
  }), [state, activeTicker, checklistComplete])

  const todaysSetups = state.todaysSetups || []
  const patterns = useMemo(() => ({
    bySetup: patternsByActivity(state, 20),
    skip: skipQuality(state),
    disciplineStreak: disciplineStreak(state),
    today: sessionStats(state),
  }), [state])

  return {
    state,
    currentCard,
    todaysSetups,
    patterns,
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
