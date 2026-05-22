// ─────────────────────────────────────────────────────────────────────────────
// bot.js — Trade Hub coach engine (rebuild, v2)
//
// State machine, not a rules engine. Pure logic, no React.
//
// States:  WAIT, WATCH, GO, IN_TRADE, CLOSED, LOCKED
//
// Transitions:
//   WAIT     -> WATCH      (setup forming, price near a tradeable level)
//   WAIT     -> GO         (high-confluence signal detected this tick)
//   WATCH    -> GO         (signal confirmed by candle close, same or better)
//   WATCH    -> WAIT       (price moved away, setup invalidated)
//   GO       -> IN_TRADE   (user pressed "I took it")
//   GO       -> WAIT       (user pressed "I skipped" or 60s auto-expire)
//   IN_TRADE -> CLOSED     (target or stop hit on underlying, or manual close)
//   CLOSED   -> WAIT       (auto after 30s or on dismiss)
//   any      -> LOCKED     (realized + unrealized P/L crosses daily lockout)
//   LOCKED   -> WAIT       (user unlock with friction)
//
// Storage key intentionally fresh: tradeHub.bot.coach.v1
//
// Position MTM uses a delta approximation because Massive's equity tier does
// not expose option chains. Default delta 0.5 for ATM, configurable on the
// position itself when the user enters strike + premium.
// ─────────────────────────────────────────────────────────────────────────────

import { PLAYBOOK, evaluatePlaybook, CONFLUENCE_DEFAULT_THRESHOLD, TOUCH_TOLERANCE } from './playbook.js'

const STORAGE_KEY = 'tradeHub.bot.coach.v1'

// ── Tunable thresholds at top so they can be adjusted without code spelunking ─

export const GO_WINDOW_MS = 60 * 1000              // GO state auto-expires after this
export const CLOSED_LINGER_MS = 30 * 1000          // CLOSED auto-returns to WAIT after this
export const WATCH_NEAR_DISTANCE = 0.50            // dollars from level to enter WATCH
export const WATCH_DROP_DISTANCE = 1.00            // dollars away from level to abandon WATCH
export const DEFAULT_DAILY_LOSS_LIMIT = 200        // dollars
export const DEFAULT_CONFLUENCE_THRESHOLD = CONFLUENCE_DEFAULT_THRESHOLD
export const DEFAULT_OPTION_DELTA = 0.5            // for ATM option P/L approximation
export const DEFAULT_CONTRACTS = 1
export const SESSION_HISTORY_CAP = 20              // last N sessions retained

// ── State factory ───────────────────────────────────────────────────────────

export function createInitialState() {
  return {
    state: 'WAIT',
    activeSetup: null,           // playbook signal currently in WATCH or GO
    position: null,              // open position when IN_TRADE
    lastClosed: null,            // most recent closed position, shown during CLOSED
    goExpiresAt: null,           // timestamp ms when GO auto-expires
    watchEnteredAt: null,        // when current WATCH started
    closedEnteredAt: null,       // when current CLOSED state started
    lockedAt: null,              // timestamp when LOCKED triggered
    sessionStartedAt: null,      // first tick of current session
    sessionDate: null,           // YYYY-MM-DD for session bucketing
    realizedPL: 0,               // session-realized P/L
    todaysSetups: [],            // every setup surfaced today
    pendingWouldHaveWon: [],     // skipped/expired setups still tracking outcome
    sessionHistory: [],          // rolled-up past sessions, capped
    settings: {
      dailyLossLimit: DEFAULT_DAILY_LOSS_LIMIT,
      confluenceThreshold: DEFAULT_CONFLUENCE_THRESHOLD,
      liveMode: false,
      requireChecklist: true,
      writePaperTrades: false,
    },
    checklistComplete: false,    // populated by parent (App) before each tick
    wasLockedToday: false,       // set when LOCKED transitions to anything
  }
}

// ── localStorage I/O ────────────────────────────────────────────────────────

export function saveState(state) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (_) {
    // storage might be full or unavailable; ignore silently
  }
}

export function loadState() {
  if (typeof window === 'undefined') return createInitialState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw)
    // Merge defaults so older saves missing keys still load cleanly.
    return { ...createInitialState(), ...parsed, settings: { ...createInitialState().settings, ...(parsed.settings || {}) } }
  } catch (_) {
    return createInitialState()
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ymdET(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const d = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${d}`
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// Position mark-to-market using a delta approximation. Returns the position
// with currentUnderlying and unrealizedPL fields refreshed.
export function markPosition(position, currentUnderlying) {
  if (!position) return position
  const delta = position.delta ?? DEFAULT_OPTION_DELTA
  const sign = position.direction === 'long' ? 1 : -1
  const underlyingMove = currentUnderlying - position.entryUnderlying
  // Option premium move approximation. Each 1.00 in the underlying moves the
  // ATM option by delta dollars per share. Contracts are 100 shares each.
  const premiumMovePerContract = underlyingMove * delta * sign
  const unrealizedPL = premiumMovePerContract * 100 * (position.contracts || 1)
  return { ...position, currentUnderlying, unrealizedPL }
}

// Check if a position has hit target or stop on the underlying.
export function checkExit(position, currentUnderlying) {
  if (!position) return null
  if (position.direction === 'long') {
    if (currentUnderlying <= position.stopUnderlying) return 'stop'
    if (currentUnderlying >= position.targetUnderlying) return 'target'
  } else {
    if (currentUnderlying >= position.stopUnderlying) return 'stop'
    if (currentUnderlying <= position.targetUnderlying) return 'target'
  }
  return null
}

// Close the position. Caller supplies the exit reason and (optionally) an exit
// premium for manual closes. Auto-closes at target/stop estimate premium from
// the underlying move using delta.
export function closePosition(position, exitUnderlying, exitReason, now, exitPremium = null) {
  const delta = position.delta ?? DEFAULT_OPTION_DELTA
  const sign = position.direction === 'long' ? 1 : -1
  const underlyingMove = exitUnderlying - position.entryUnderlying
  const estPremiumMovePerContract = underlyingMove * delta * sign
  const estimatedExitPremium = position.premiumPaid + estPremiumMovePerContract
  const finalExitPremium = exitPremium != null ? exitPremium : Math.max(0, estimatedExitPremium)
  const realizedPL = (finalExitPremium - position.premiumPaid) * 100 * (position.contracts || 1)
  return {
    ...position,
    status: 'closed',
    exitUnderlying,
    exitPremium: finalExitPremium,
    exitReason,            // 'target' | 'stop' | 'manual'
    closedAt: now,
    realizedPL,
    unrealizedPL: 0,
  }
}

// Build a todaysSetups record for a setup that just transitioned states.
function recordSetup(signal, status, atMinute, ts, extras = {}) {
  return {
    id: uid('setup'),
    setupId: signal.setupId,
    setupName: signal.setupName,
    direction: signal.direction,
    level: signal.level,
    signal,                   // full signal kept for replay / detail panel
    surfaceAt: atMinute,
    surfaceTs: ts,
    status,
    ...extras,
  }
}

// Computes minutes-from-midnight in ET for a given Date.
function etMinutesOf(date = new Date()) {
  const s = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

// Distance from current price to nearest "tradeable" level in the levels map.
// Used to decide WATCH eligibility. Returns { name, price, distance } or null.
function nearestTradableLevel(levels, currentPrice) {
  const tradable = ['VWAP', 'P', 'R1', 'R2', 'R3', 'S1', 'S2', 'S3', 'PDH', 'PDL']
  let best = null
  for (const name of tradable) {
    const price = levels?.[name]
    if (price == null || isNaN(price)) continue
    const distance = Math.abs(price - currentPrice)
    if (!best || distance < best.distance) best = { name, price, distance }
  }
  return best
}

// Build a synthetic "candidate" signal for WATCH state when no full GO signal
// fires yet. We pull the matching setup from the playbook by direction +
// regime and surface it as a forming setup.
function findWatchCandidate(ctx) {
  const near = nearestTradableLevel(ctx.levels, ctx.currentPrice)
  if (!near || near.distance > WATCH_NEAR_DISTANCE) return null

  // Determine which setup would fire at this level. Map level name -> setup id.
  const levelToSetupLong = { PDL: 'pdl_bounce', S1: 's1_bounce', VWAP: 'vwap_reclaim' }
  const levelToSetupShort = { PDH: 'pdh_fade', R1: 'r1_fade', VWAP: 'vwap_lose' }

  // Without knowing direction yet, pick whichever setup is allowed by time +
  // regime right now. Long-side first, then short.
  const candidates = [
    levelToSetupLong[near.name] ? PLAYBOOK.find(s => s.id === levelToSetupLong[near.name]) : null,
    levelToSetupShort[near.name] ? PLAYBOOK.find(s => s.id === levelToSetupShort[near.name]) : null,
  ].filter(Boolean)

  for (const setup of candidates) {
    const timeOk = setup.time_of_day_allowed.some(([a, b]) => ctx.etMinutes >= a && ctx.etMinutes < b)
    if (!timeOk) continue
    // Cheap regime check using only the 5m read
    const m5 = ctx.alignment?.['5m']
    const m15 = ctx.alignment?.['15m']
    const m1h = ctx.alignment?.['1h']
    let regimeOk = false
    if (setup.regime_required === 'ranging') regimeOk = m5 === 'ranging' || m15 === 'ranging' || m1h === 'ranging' || m5 === 'transition'
    else if (setup.regime_required === 'trending_up') regimeOk = m5 === 'trending_up' || m15 === 'trending_up'
    else if (setup.regime_required === 'trending_down') regimeOk = m5 === 'trending_down' || m15 === 'trending_down'
    else if (setup.regime_required === 'mixed') regimeOk = m5 === 'transition' || m1h === 'ranging'
    else if (setup.regime_required === 'any') regimeOk = true
    if (!regimeOk) continue

    // Build a synthetic "forming" signal so the UI can render the plan.
    return {
      setupId: setup.id,
      setupName: setup.name,
      direction: setup.direction,
      confidence: 0,            // not yet confirmed
      entry: near.price,
      stop: setup.direction === 'long' ? near.price - 0.40 : near.price + 0.40,
      target: setup.direction === 'long' ? near.price + 1.50 : near.price - 1.50,
      why: `${setup.description} Waiting for ${setup.direction === 'long' ? 'reversal' : 'rejection'} candle close ${setup.direction === 'long' ? 'above' : 'below'} ${near.name} $${near.price.toFixed(2)}.`,
      level: { name: near.name, price: near.price },
      optionDirection: setup.option_direction,
      optionStrikeRule: setup.option_strike_rule,
      forming: true,
    }
  }
  return null
}

// Run pending "would have won" tracking for skipped / expired setups.
function trackPendingOutcomes(state, currentPrice, etMinutes) {
  if (!state.pendingWouldHaveWon?.length) return state
  const stillPending = []
  const resolved = []
  for (const p of state.pendingWouldHaveWon) {
    const dir = p.signal.direction
    const target = p.signal.target
    const stop = p.signal.stop
    let outcome = null
    if (dir === 'long') {
      if (currentPrice <= stop) outcome = false
      else if (currentPrice >= target) outcome = true
    } else {
      if (currentPrice >= stop) outcome = false
      else if (currentPrice <= target) outcome = true
    }
    // Stop tracking past end of session (15:55 ET = 955)
    if (outcome == null && etMinutes < 955) {
      stillPending.push(p)
    } else {
      resolved.push({ setupRecordId: p.setupRecordId, wouldHaveWon: outcome })
    }
  }
  if (!resolved.length) return state
  const todaysSetups = state.todaysSetups.map(r => {
    const match = resolved.find(rr => rr.setupRecordId === r.id)
    return match ? { ...r, wouldHaveWon: match.wouldHaveWon } : r
  })
  return { ...state, todaysSetups, pendingWouldHaveWon: stillPending }
}

// Daily lockout check. Returns true if realized + unrealized P/L is at or
// past the configured loss limit.
export function isLockedOut(state, unrealized = 0) {
  const limit = state.settings?.dailyLossLimit ?? DEFAULT_DAILY_LOSS_LIMIT
  return (state.realizedPL + unrealized) <= -limit
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY: evaluateContext
//
// Called by useBot.js on each tick. Returns { state, events } where events is
// an array of transition descriptors the hook uses to drive alerts and the
// notification surface. Pure function: no side effects, no fetches.
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateContext(ctx, state) {
  const now = Date.now()
  const etMin = ctx.etMinutes ?? etMinutesOf(new Date())
  const today = ymdET(new Date())
  const events = []
  let nextState = state

  // Bucket session date. If date changed since last persist, archive yesterday
  // into sessionHistory and reset session counters.
  if (state.sessionDate && state.sessionDate !== today) {
    nextState = rollOverSession(nextState, state.sessionDate)
  }
  if (!nextState.sessionDate) {
    nextState = { ...nextState, sessionDate: today, sessionStartedAt: nextState.sessionStartedAt || now }
  }

  // Track pending would-have-won outcomes for previously skipped / expired
  nextState = trackPendingOutcomes(nextState, ctx.currentPrice, etMin)

  // ── Branch by current state ──────────────────────────────────────────────

  switch (nextState.state) {

    case 'LOCKED': {
      // Locked stays locked until explicit unlock. No setups process.
      return { state: nextState, events }
    }

    case 'CLOSED': {
      // Auto return to WAIT after CLOSED_LINGER_MS
      if (nextState.closedEnteredAt && now - nextState.closedEnteredAt >= CLOSED_LINGER_MS) {
        // Check lockout before going back to WAIT
        if (isLockedOut(nextState, 0)) {
          nextState = { ...nextState, state: 'LOCKED', lockedAt: now, wasLockedToday: true, lastClosed: null, closedEnteredAt: null }
          events.push({ type: 'lockout', message: 'Daily loss limit hit, bot locked.' })
        } else {
          nextState = { ...nextState, state: 'WAIT', lastClosed: null, closedEnteredAt: null, activeSetup: null }
          events.push({ type: 'closed_dismissed' })
        }
      }
      return { state: nextState, events }
    }

    case 'IN_TRADE': {
      if (!nextState.position) {
        // Defensive: position lost, return to WAIT
        nextState = { ...nextState, state: 'WAIT', position: null }
        return { state: nextState, events }
      }
      // Mark-to-market
      const marked = markPosition(nextState.position, ctx.currentPrice)
      nextState = { ...nextState, position: marked }
      // Check exit
      const reason = checkExit(marked, ctx.currentPrice)
      if (reason) {
        const closed = closePosition(marked, ctx.currentPrice, reason, now)
        const realizedPL = nextState.realizedPL + closed.realizedPL
        // Update the matching todaysSetups record
        const todaysSetups = nextState.todaysSetups.map(r =>
          r.id === nextState.position.setupRecordId
            ? { ...r, status: closed.realizedPL >= 0 ? 'win' : 'loss', closeData: { realizedPL: closed.realizedPL, exitUnderlying: closed.exitUnderlying, exitReason: closed.exitReason, closedAt: closed.closedAt } }
            : r
        )
        nextState = {
          ...nextState,
          state: 'CLOSED',
          position: null,
          lastClosed: closed,
          closedEnteredAt: now,
          realizedPL,
          todaysSetups,
        }
        events.push({
          type: 'position_closed',
          position: closed,
          message: `${closed.direction.toUpperCase()} ${closed.setupName} closed at ${ctx.currentPrice.toFixed(2)} (${reason}), P/L $${closed.realizedPL.toFixed(2)}`,
        })
        // Immediate lockout check after realized loss
        if (isLockedOut(nextState, 0)) {
          nextState = { ...nextState, state: 'LOCKED', lockedAt: now, wasLockedToday: true, closedEnteredAt: null, lastClosed: null }
          events.push({ type: 'lockout', message: 'Daily loss limit hit, bot locked.' })
        }
      }
      return { state: nextState, events }
    }

    case 'GO': {
      // 60-second auto-expire
      if (nextState.goExpiresAt && now >= nextState.goExpiresAt) {
        const record = nextState.activeSetup ? recordSetup(nextState.activeSetup, 'expired', etMin, now) : null
        const todaysSetups = record ? [...nextState.todaysSetups, record] : nextState.todaysSetups
        const pendingWouldHaveWon = record ? [...nextState.pendingWouldHaveWon, { setupRecordId: record.id, signal: nextState.activeSetup }] : nextState.pendingWouldHaveWon
        nextState = {
          ...nextState,
          state: 'WAIT',
          activeSetup: null,
          goExpiresAt: null,
          todaysSetups,
          pendingWouldHaveWon,
        }
        events.push({ type: 'go_expired', message: `${record?.setupName || 'Setup'} expired, no entry within 60s.` })
      }
      return { state: nextState, events }
    }

    case 'WATCH':
    case 'WAIT': {
      // Arming gate: checklist required
      if (nextState.settings.requireChecklist && !ctx.checklistComplete) {
        // Stay in WAIT, no setups process
        if (nextState.state !== 'WAIT') {
          nextState = { ...nextState, state: 'WAIT', activeSetup: null, watchEnteredAt: null }
        }
        return { state: nextState, events }
      }

      // Evaluate playbook for full GO signals
      const threshold = nextState.settings.confluenceThreshold ?? DEFAULT_CONFLUENCE_THRESHOLD
      const goSignals = evaluatePlaybook(buildPlaybookCtx(ctx, nextState), threshold)
      if (goSignals.length > 0) {
        const winner = goSignals[0]
        // Record the surfacing
        const record = recordSetup(winner, 'pending', etMin, now)
        const todaysSetups = [...nextState.todaysSetups, record]
        nextState = {
          ...nextState,
          state: 'GO',
          activeSetup: { ...winner, recordId: record.id },
          goExpiresAt: now + GO_WINDOW_MS,
          watchEnteredAt: null,
          todaysSetups,
        }
        events.push({
          type: 'go',
          setup: winner,
          message: `GO ${winner.direction.toUpperCase()}: ${winner.setupName} at ${winner.entry.toFixed(2)}, confluence ${winner.confidence}/10.`,
        })
        return { state: nextState, events }
      }

      // No GO signal: check for WATCH conditions
      const watching = findWatchCandidate(ctx)
      if (watching) {
        const isSameWatch = nextState.state === 'WATCH'
          && nextState.activeSetup?.level?.name === watching.level.name
          && nextState.activeSetup?.setupId === watching.setupId
        if (!isSameWatch) {
          nextState = {
            ...nextState,
            state: 'WATCH',
            activeSetup: watching,
            watchEnteredAt: now,
          }
          events.push({
            type: 'watch',
            setup: watching,
            message: `Watching: ${watching.setupName} at ${watching.level.name} $${watching.level.price.toFixed(2)}.`,
          })
        }
        return { state: nextState, events }
      }

      // No setup at all: if we were in WATCH and price moved away, drop to WAIT
      if (nextState.state === 'WATCH' && nextState.activeSetup) {
        const dist = Math.abs(nextState.activeSetup.level.price - ctx.currentPrice)
        if (dist > WATCH_DROP_DISTANCE) {
          nextState = { ...nextState, state: 'WAIT', activeSetup: null, watchEnteredAt: null }
          events.push({ type: 'watch_dropped', message: 'Price moved away from watched level.' })
        }
      }
      return { state: nextState, events }
    }

    default:
      return { state: nextState, events }
  }
}

// Build the playbook's market-context shape from the engine's broader context.
// Engine ctx carries everything; the playbook only needs a subset.
function buildPlaybookCtx(ctx, state) {
  return {
    ticker: ctx.ticker,
    currentPrice: ctx.currentPrice,
    lastPrice: ctx.lastPrice ?? null,
    bars5m: ctx.bars5m || [],
    levels: ctx.levels || {},
    alignment: ctx.alignment || {},
    etMinutes: ctx.etMinutes,
    rvol: ctx.rvol ?? null,
    prevSignals: state.todaysSetups.map(r => ({
      setupId: r.setupId,
      levelName: r.level?.name,
      outcome: r.status === 'win' ? 'win' : r.status === 'loss' ? 'loss' : 'pending',
      atMinute: r.surfaceAt,
    })),
    orb: ctx.orb || null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER ACTIONS — transitions driven by UI
// ─────────────────────────────────────────────────────────────────────────────

// User pressed "I took it". Opens a paper position.
export function userTakeIt(state, { strike, premium, contracts = DEFAULT_CONTRACTS, delta = DEFAULT_OPTION_DELTA }) {
  if (state.state !== 'GO' || !state.activeSetup) return { state, events: [] }
  const now = Date.now()
  const sig = state.activeSetup
  const position = {
    id: uid('pos'),
    setupRecordId: sig.recordId,
    setupId: sig.setupId,
    setupName: sig.setupName,
    direction: sig.direction,
    optionDirection: sig.optionDirection,
    optionStrike: strike != null ? Number(strike) : null,
    premiumPaid: premium != null ? Number(premium) : 0,
    contracts: Number(contracts) || 1,
    delta,
    entryUnderlying: sig.entry,
    stopUnderlying: sig.stop,
    targetUnderlying: sig.target,
    openedAt: now,
    currentUnderlying: sig.entry,
    unrealizedPL: 0,
    status: 'open',
  }
  // Update todaysSetups record to "taken" pending outcome
  const todaysSetups = state.todaysSetups.map(r =>
    r.id === sig.recordId ? { ...r, status: 'taken', position: { strike, premium, contracts } } : r
  )
  return {
    state: {
      ...state,
      state: 'IN_TRADE',
      activeSetup: null,
      goExpiresAt: null,
      position,
      todaysSetups,
    },
    events: [{
      type: 'position_opened',
      position,
      message: `${sig.direction.toUpperCase()} ${sig.setupName}, opened at ${sig.entry.toFixed(2)}.`,
    }],
  }
}

// User pressed "I skipped". Logs skip and returns to WAIT. Schedules a
// would-have-won tracker so we can grade the skip later.
export function userSkipIt(state) {
  if (state.state !== 'GO' || !state.activeSetup) return { state, events: [] }
  const sig = state.activeSetup
  const todaysSetups = state.todaysSetups.map(r =>
    r.id === sig.recordId ? { ...r, status: 'skipped' } : r
  )
  const pendingWouldHaveWon = [...state.pendingWouldHaveWon, { setupRecordId: sig.recordId, signal: sig }]
  return {
    state: {
      ...state,
      state: 'WAIT',
      activeSetup: null,
      goExpiresAt: null,
      todaysSetups,
      pendingWouldHaveWon,
    },
    events: [{ type: 'skipped', message: `Skipped ${sig.setupName}.` }],
  }
}

// User closed an open position manually. exitPremium is required (the user
// reports what they actually got out at, since we cannot fetch option price).
export function userCloseManually(state, exitPremium) {
  if (state.state !== 'IN_TRADE' || !state.position) return { state, events: [] }
  const now = Date.now()
  const closed = closePosition(state.position, state.position.currentUnderlying, 'manual', now, Number(exitPremium))
  const realizedPL = state.realizedPL + closed.realizedPL
  const todaysSetups = state.todaysSetups.map(r =>
    r.id === state.position.setupRecordId
      ? { ...r, status: closed.realizedPL >= 0 ? 'win' : 'loss', closeData: { realizedPL: closed.realizedPL, exitUnderlying: closed.exitUnderlying, exitReason: 'manual', closedAt: closed.closedAt } }
      : r
  )
  let nextState = {
    ...state,
    state: 'CLOSED',
    position: null,
    lastClosed: closed,
    closedEnteredAt: now,
    realizedPL,
    todaysSetups,
  }
  const events = [{
    type: 'position_closed',
    position: closed,
    message: `Manual close: ${closed.direction.toUpperCase()} ${closed.setupName}, P/L $${closed.realizedPL.toFixed(2)}`,
  }]
  if (isLockedOut(nextState, 0)) {
    nextState = { ...nextState, state: 'LOCKED', lockedAt: now, wasLockedToday: true, lastClosed: null, closedEnteredAt: null }
    events.push({ type: 'lockout', message: 'Daily loss limit hit, bot locked.' })
  }
  return { state: nextState, events }
}

// User dismissed the CLOSED card before the auto-timer.
export function userDismissClosed(state) {
  if (state.state !== 'CLOSED') return { state, events: [] }
  let nextState = { ...state, state: 'WAIT', lastClosed: null, closedEnteredAt: null, activeSetup: null }
  const events = []
  if (isLockedOut(nextState, 0)) {
    const now = Date.now()
    nextState = { ...nextState, state: 'LOCKED', lockedAt: now, wasLockedToday: true }
    events.push({ type: 'lockout', message: 'Daily loss limit hit, bot locked.' })
  }
  return { state: nextState, events }
}

// User unlocked the bot after lockout. UI is responsible for the friction
// (typing UNLOCK confirmation); this just clears the state.
export function userUnlock(state) {
  if (state.state !== 'LOCKED') return { state, events: [] }
  return {
    state: { ...state, state: 'WAIT', lockedAt: null, activeSetup: null },
    events: [{ type: 'unlocked', message: 'Bot unlocked. Trade carefully.' }],
  }
}

// User reset the session. Rolls today's stats into history, clears today.
export function resetSession(state) {
  const archived = rollOverSession(state, state.sessionDate || ymdET(new Date()))
  // Reset today's bucket but keep settings + history
  return {
    ...archived,
    state: 'WAIT',
    activeSetup: null,
    position: null,
    lastClosed: null,
    goExpiresAt: null,
    watchEnteredAt: null,
    closedEnteredAt: null,
    lockedAt: null,
    sessionStartedAt: Date.now(),
    sessionDate: ymdET(new Date()),
    realizedPL: 0,
    todaysSetups: [],
    pendingWouldHaveWon: [],
    wasLockedToday: false,
  }
}

// Update a setting field. UI passes the slice it changed.
export function updateSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } }
}

// Parent calls this each render to push the latest checklist completion into
// the state so the engine's arming gate has access.
export function setChecklistComplete(state, complete) {
  if (state.checklistComplete === complete) return state
  return { ...state, checklistComplete: complete }
}

// ── Session rollover ────────────────────────────────────────────────────────

function rollOverSession(state, dateStr) {
  if (!dateStr) return state
  if (!state.todaysSetups?.length && state.realizedPL === 0) {
    return state  // nothing to archive
  }
  const taken = state.todaysSetups.filter(r => r.status === 'taken' || r.status === 'win' || r.status === 'loss')
  const wins = state.todaysSetups.filter(r => r.status === 'win').length
  const losses = state.todaysSetups.filter(r => r.status === 'loss').length
  const skipped = state.todaysSetups.filter(r => r.status === 'skipped').length
  const expired = state.todaysSetups.filter(r => r.status === 'expired').length
  const perSetupCounts = {}
  for (const r of state.todaysSetups) {
    const k = r.setupId
    if (!perSetupCounts[k]) perSetupCounts[k] = { taken: 0, won: 0, lost: 0, skipped: 0, expired: 0, wouldHaveWon: 0 }
    if (r.status === 'taken') perSetupCounts[k].taken++
    if (r.status === 'win') { perSetupCounts[k].won++; perSetupCounts[k].taken++ }
    if (r.status === 'loss') { perSetupCounts[k].lost++; perSetupCounts[k].taken++ }
    if (r.status === 'skipped') perSetupCounts[k].skipped++
    if (r.status === 'expired') perSetupCounts[k].expired++
    if (r.wouldHaveWon === true) perSetupCounts[k].wouldHaveWon++
  }
  const session = {
    date: dateStr,
    sessionStartedAt: state.sessionStartedAt,
    sessionEndedAt: Date.now(),
    setupsSurfaced: state.todaysSetups.length,
    taken: taken.length,
    skipped,
    expired,
    wins,
    losses,
    realizedPL: state.realizedPL,
    lockoutActivated: !!state.wasLockedToday,
    perSetupCounts,
  }
  const sessionHistory = [session, ...(state.sessionHistory || [])].slice(0, SESSION_HISTORY_CAP)
  return { ...state, sessionHistory }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats and patterns helpers consumed by the UI.
// ─────────────────────────────────────────────────────────────────────────────

export function sessionStats(state) {
  const t = state.todaysSetups || []
  const taken = t.filter(r => r.status === 'taken' || r.status === 'win' || r.status === 'loss').length
  const wins = t.filter(r => r.status === 'win').length
  const losses = t.filter(r => r.status === 'loss').length
  const skipped = t.filter(r => r.status === 'skipped').length
  const expired = t.filter(r => r.status === 'expired').length
  const wouldHaveWonSkips = t.filter(r => (r.status === 'skipped' || r.status === 'expired') && r.wouldHaveWon === true).length
  return { surfaced: t.length, taken, wins, losses, skipped, expired, wouldHaveWonSkips, realizedPL: state.realizedPL }
}

// Aggregate per-setup performance across last N sessions plus today.
export function patternsByActivity(state, lookback = 20) {
  const sessions = (state.sessionHistory || []).slice(0, lookback)
  const agg = {}
  // Include today's bucket synthesized live
  const todaysPerSetup = {}
  for (const r of state.todaysSetups || []) {
    const k = r.setupId
    if (!todaysPerSetup[k]) todaysPerSetup[k] = { taken: 0, won: 0, lost: 0, skipped: 0, expired: 0, wouldHaveWon: 0 }
    if (r.status === 'taken') todaysPerSetup[k].taken++
    if (r.status === 'win') { todaysPerSetup[k].won++; todaysPerSetup[k].taken++ }
    if (r.status === 'loss') { todaysPerSetup[k].lost++; todaysPerSetup[k].taken++ }
    if (r.status === 'skipped') todaysPerSetup[k].skipped++
    if (r.status === 'expired') todaysPerSetup[k].expired++
    if (r.wouldHaveWon === true) todaysPerSetup[k].wouldHaveWon++
  }
  const allBuckets = [todaysPerSetup, ...sessions.map(s => s.perSetupCounts || {})]
  for (const bucket of allBuckets) {
    for (const [k, v] of Object.entries(bucket)) {
      if (!agg[k]) agg[k] = { taken: 0, won: 0, lost: 0, skipped: 0, expired: 0, wouldHaveWon: 0 }
      agg[k].taken += v.taken || 0
      agg[k].won += v.won || 0
      agg[k].lost += v.lost || 0
      agg[k].skipped += v.skipped || 0
      agg[k].expired += v.expired || 0
      agg[k].wouldHaveWon += v.wouldHaveWon || 0
    }
  }
  return agg
}

// Discipline streak: consecutive sessions in history with no lockout and no
// "loss > stop" rule break. Since we close at stop deterministically, the
// streak just tracks lockout-free sessions for v1.
export function disciplineStreak(state) {
  const sessions = state.sessionHistory || []
  let streak = 0
  for (const s of sessions) {
    if (s.lockoutActivated) break
    streak++
  }
  return streak
}

// Skip quality summary: did skips save money or cost money over recent
// sessions? Sums wouldHaveWon * average_taken_PL (rough estimate).
export function skipQuality(state) {
  let skipped = 0, wouldHaveWon = 0
  for (const r of state.todaysSetups || []) {
    if (r.status === 'skipped' || r.status === 'expired') {
      skipped++
      if (r.wouldHaveWon === true) wouldHaveWon++
    }
  }
  for (const s of state.sessionHistory || []) {
    skipped += (s.skipped || 0) + (s.expired || 0)
    // wouldHaveWon counts roll up via perSetupCounts
    for (const v of Object.values(s.perSetupCounts || {})) wouldHaveWon += v.wouldHaveWon || 0
  }
  const wouldHaveLost = skipped - wouldHaveWon
  return { skipped, wouldHaveWon, wouldHaveLost }
}
