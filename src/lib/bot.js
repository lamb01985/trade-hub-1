// ─────────────────────────────────────────────────────────────────────────────
// bot.js — Trade Hub coach engine (multi-ticker, v3)
//
// State machine, not a rules engine. Pure logic, no React.
//
// Per-ticker state machine slices live in state.byTicker[TICKER]:
//   WAIT, WATCH, GO, IN_TRADE, CLOSED   (per ticker)
//
// Global state:
//   lockedAt / wasLockedToday           (global lockout, fires on aggregate P/L)
//   sessionDate, sessionStartedAt, sessionHistory, settings, checklistComplete
//
// Transitions (per ticker):
//   WAIT     -> WATCH      (setup forming, price near a tradeable level)
//   WAIT     -> GO         (high-confluence signal detected this tick)
//   WATCH    -> GO         (signal confirmed)
//   WATCH    -> WAIT       (price moved away)
//   GO       -> IN_TRADE   (user pressed "I took it")
//   GO       -> WAIT       (user pressed "I skipped" or 60s auto-expire)
//   IN_TRADE -> CLOSED     (target or stop on underlying, or manual)
//   CLOSED   -> WAIT       (auto after 30s, on dismiss)
//
// Global lockout (state.lockedAt set):
//   - Fires when aggregate realizedPL across tickers crosses the daily limit.
//   - Blocks new WATCH/GO transitions for every ticker.
//   - Open positions continue to mark-to-market and may hit stop/target.
//   - User clears with userUnlock(state); per-ticker states are untouched.
//
// Storage key (legacy): tradeHub.bot.coach.v1
// loadState() migrates a pre-v3 single-ticker payload into byTicker[QQQ].
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

// Per-ticker slice. Each watchlist ticker gets its own state machine.
export function createTickerState() {
  return {
    state: 'WAIT',
    activeSetup: null,
    position: null,
    lastClosed: null,
    goExpiresAt: null,
    watchEnteredAt: null,
    closedEnteredAt: null,
    todaysSetups: [],          // setups surfaced today for this ticker
    pendingWouldHaveWon: [],   // skipped/expired setups still tracking outcome
    realizedPL: 0,             // realized P/L for this ticker today
  }
}

export function createInitialState() {
  return {
    byTicker: {},                // { [TICKER]: createTickerState() }
    sessionStartedAt: null,
    sessionDate: null,
    sessionHistory: [],
    lockedAt: null,              // global lockout (set when aggregate P/L crosses limit)
    wasLockedToday: false,
    settings: {
      dailyLossLimit: DEFAULT_DAILY_LOSS_LIMIT,
      confluenceThreshold: DEFAULT_CONFLUENCE_THRESHOLD,
      liveMode: false,
      requireChecklist: true,
      writePaperTrades: false,
    },
    checklistComplete: false,    // populated by parent (App) before each tick
  }
}

// Return state with byTicker[TICKER] guaranteed to exist (defaults to a fresh
// per-ticker slice). Returns the same state if already present.
export function ensureTicker(state, ticker) {
  const t = (ticker || '').toUpperCase()
  if (!t) return state
  if (state.byTicker?.[t]) return state
  return {
    ...state,
    byTicker: { ...(state.byTicker || {}), [t]: createTickerState() },
  }
}

// Convenience: get a per-ticker slice or a fresh empty one (without mutating).
export function tickerSlice(state, ticker) {
  const t = (ticker || '').toUpperCase()
  return state.byTicker?.[t] || createTickerState()
}

// Aggregate realized P/L across all per-ticker slices.
export function totalRealizedPL(state) {
  let sum = 0
  for (const t of Object.values(state.byTicker || {})) {
    sum += t.realizedPL || 0
  }
  return sum
}

// Aggregate unrealized P/L across all open positions.
export function totalUnrealizedPL(state) {
  let sum = 0
  for (const t of Object.values(state.byTicker || {})) {
    if (t.position?.unrealizedPL != null) sum += t.position.unrealizedPL
  }
  return sum
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

// Detect a legacy (single-ticker) save and migrate it into byTicker[QQQ].
// The pre-v3 shape kept state/activeSetup/position/etc at the top level.
function migrateLegacy(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  if (parsed.byTicker) return null // already v3
  const looksLegacy = 'state' in parsed || 'activeSetup' in parsed || 'position' in parsed || 'todaysSetups' in parsed
  if (!looksLegacy) return null

  const legacyWasLocked = parsed.state === 'LOCKED'
  const tickerSlot = {
    state: legacyWasLocked ? 'WAIT' : (parsed.state || 'WAIT'),
    activeSetup: legacyWasLocked ? null : (parsed.activeSetup ?? null),
    position: parsed.position ?? null,
    lastClosed: parsed.lastClosed ?? null,
    goExpiresAt: parsed.goExpiresAt ?? null,
    watchEnteredAt: parsed.watchEnteredAt ?? null,
    closedEnteredAt: parsed.closedEnteredAt ?? null,
    todaysSetups: Array.isArray(parsed.todaysSetups) ? parsed.todaysSetups : [],
    pendingWouldHaveWon: Array.isArray(parsed.pendingWouldHaveWon) ? parsed.pendingWouldHaveWon : [],
    realizedPL: typeof parsed.realizedPL === 'number' ? parsed.realizedPL : 0,
  }
  return {
    byTicker: { QQQ: tickerSlot },
    sessionStartedAt: parsed.sessionStartedAt ?? null,
    sessionDate: parsed.sessionDate ?? null,
    sessionHistory: Array.isArray(parsed.sessionHistory) ? parsed.sessionHistory : [],
    lockedAt: legacyWasLocked ? (parsed.lockedAt || Date.now()) : (parsed.lockedAt ?? null),
    wasLockedToday: !!parsed.wasLockedToday || legacyWasLocked,
    settings: parsed.settings || {},
    checklistComplete: !!parsed.checklistComplete,
  }
}

export function loadState() {
  if (typeof window === 'undefined') return createInitialState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw)
    const migrated = migrateLegacy(parsed) || parsed
    // Merge defaults so older saves missing keys still load cleanly.
    const base = createInitialState()
    return {
      ...base,
      ...migrated,
      byTicker: { ...(migrated.byTicker || {}) },
      settings: { ...base.settings, ...(migrated.settings || {}) },
    }
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

// Build a todaysSetups record for a setup that just transitioned states. The
// ticker is captured so per-ticker breakdowns (P/L grouping, etc.) work.
function recordSetup(signal, status, atMinute, ts, ticker = null, extras = {}) {
  return {
    id: uid('setup'),
    ticker: ticker ? String(ticker).toUpperCase() : null,
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
export function nearestTradableLevel(levels, currentPrice) {
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

// Run pending "would have won" tracking for skipped / expired setups on a
// single per-ticker slice. Returns the updated slice.
function trackPendingOutcomes(slot, currentPrice, etMinutes) {
  if (!slot.pendingWouldHaveWon?.length) return slot
  const stillPending = []
  const resolved = []
  for (const p of slot.pendingWouldHaveWon) {
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
  if (!resolved.length) return slot
  const todaysSetups = slot.todaysSetups.map(r => {
    const match = resolved.find(rr => rr.setupRecordId === r.id)
    return match ? { ...r, wouldHaveWon: match.wouldHaveWon } : r
  })
  return { ...slot, todaysSetups, pendingWouldHaveWon: stillPending }
}

// Replace a per-ticker slice immutably.
function setSlot(state, ticker, slot) {
  const t = String(ticker || '').toUpperCase()
  return { ...state, byTicker: { ...(state.byTicker || {}), [t]: slot } }
}

// Daily lockout check. Aggregates realized P/L across all per-ticker slices
// (plus an optional extra unrealized delta the caller may pass for a fresh
// projected close). Returns true if aggregate is at or past the configured
// loss limit.
export function isLockedOut(state, extraUnrealized = 0) {
  const limit = state.settings?.dailyLossLimit ?? DEFAULT_DAILY_LOSS_LIMIT
  const realized = totalRealizedPL(state)
  return (realized + extraUnrealized) <= -limit
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

  const ticker = String(ctx.ticker || '').toUpperCase()
  if (!ticker) return { state: nextState, events }

  // Bucket session date. If date changed since last persist, archive yesterday
  // into sessionHistory and reset session counters.
  if (state.sessionDate && state.sessionDate !== today) {
    nextState = rollOverSession(nextState, state.sessionDate)
  }
  if (!nextState.sessionDate) {
    nextState = { ...nextState, sessionDate: today, sessionStartedAt: nextState.sessionStartedAt || now }
  }

  // Ensure this ticker has a state slot, then operate on it.
  nextState = ensureTicker(nextState, ticker)
  let slot = nextState.byTicker[ticker]

  // Track pending would-have-won outcomes for previously skipped / expired
  slot = trackPendingOutcomes(slot, ctx.currentPrice, etMin)
  nextState = setSlot(nextState, ticker, slot)

  const globallyLocked = !!nextState.lockedAt

  // ── Branch by per-ticker state ────────────────────────────────────────────

  switch (slot.state) {

    case 'CLOSED': {
      // Auto return to WAIT after CLOSED_LINGER_MS. Global lockout state is
      // unchanged here; the slot just returns to WAIT regardless.
      if (slot.closedEnteredAt && now - slot.closedEnteredAt >= CLOSED_LINGER_MS) {
        slot = { ...slot, state: 'WAIT', lastClosed: null, closedEnteredAt: null, activeSetup: null }
        nextState = setSlot(nextState, ticker, slot)
        events.push({ type: 'closed_dismissed' })
      }
      return { state: nextState, events }
    }

    case 'IN_TRADE': {
      if (!slot.position) {
        // Defensive: position lost, return to WAIT
        slot = { ...slot, state: 'WAIT', position: null }
        nextState = setSlot(nextState, ticker, slot)
        return { state: nextState, events }
      }
      // Mark-to-market
      const marked = markPosition(slot.position, ctx.currentPrice)
      slot = { ...slot, position: marked }
      // Check exit
      const reason = checkExit(marked, ctx.currentPrice)
      if (reason) {
        const closed = closePosition(marked, ctx.currentPrice, reason, now)
        const newSlotRealizedPL = slot.realizedPL + closed.realizedPL
        const todaysSetups = slot.todaysSetups.map(r =>
          r.id === slot.position.setupRecordId
            ? { ...r, status: closed.realizedPL >= 0 ? 'win' : 'loss', closeData: { realizedPL: closed.realizedPL, exitUnderlying: closed.exitUnderlying, exitReason: closed.exitReason, closedAt: closed.closedAt } }
            : r
        )
        slot = {
          ...slot,
          state: 'CLOSED',
          position: null,
          lastClosed: closed,
          closedEnteredAt: now,
          realizedPL: newSlotRealizedPL,
          todaysSetups,
        }
        nextState = setSlot(nextState, ticker, slot)
        events.push({
          type: 'position_closed',
          position: closed,
          message: `${closed.direction.toUpperCase()} ${closed.setupName} closed at ${ctx.currentPrice.toFixed(2)} (${reason}), P/L $${closed.realizedPL.toFixed(2)}`,
        })
        // Immediate global lockout check after realized loss
        if (!nextState.lockedAt && isLockedOut(nextState, 0)) {
          nextState = { ...nextState, lockedAt: now, wasLockedToday: true }
          events.push({ type: 'lockout', message: 'Daily loss limit hit, bot locked.' })
        }
      } else {
        nextState = setSlot(nextState, ticker, slot)
      }
      return { state: nextState, events }
    }

    case 'GO': {
      // 60-second auto-expire
      if (slot.goExpiresAt && now >= slot.goExpiresAt) {
        const record = slot.activeSetup ? recordSetup(slot.activeSetup, 'expired', etMin, now, ticker) : null
        const todaysSetups = record ? [...slot.todaysSetups, record] : slot.todaysSetups
        const pendingWouldHaveWon = record ? [...slot.pendingWouldHaveWon, { setupRecordId: record.id, signal: slot.activeSetup }] : slot.pendingWouldHaveWon
        slot = {
          ...slot,
          state: 'WAIT',
          activeSetup: null,
          goExpiresAt: null,
          todaysSetups,
          pendingWouldHaveWon,
        }
        nextState = setSlot(nextState, ticker, slot)
        events.push({ type: 'go_expired', message: `${record?.setupName || 'Setup'} expired, no entry within 60s.` })
      }
      return { state: nextState, events }
    }

    case 'WATCH':
    case 'WAIT': {
      // Global lockout: stay in WAIT, no new setups process.
      if (globallyLocked) {
        if (slot.state !== 'WAIT') {
          slot = { ...slot, state: 'WAIT', activeSetup: null, watchEnteredAt: null }
          nextState = setSlot(nextState, ticker, slot)
        }
        return { state: nextState, events }
      }

      // Arming gate: checklist required
      if (nextState.settings.requireChecklist && !ctx.checklistComplete) {
        if (slot.state !== 'WAIT') {
          slot = { ...slot, state: 'WAIT', activeSetup: null, watchEnteredAt: null }
          nextState = setSlot(nextState, ticker, slot)
        }
        return { state: nextState, events }
      }

      // Evaluate playbook for full GO signals
      const threshold = nextState.settings.confluenceThreshold ?? DEFAULT_CONFLUENCE_THRESHOLD
      const goSignals = evaluatePlaybook(buildPlaybookCtx(ctx, slot), threshold)
      if (goSignals.length > 0) {
        const winner = goSignals[0]
        const record = recordSetup(winner, 'pending', etMin, now, ticker)
        const todaysSetups = [...slot.todaysSetups, record]
        slot = {
          ...slot,
          state: 'GO',
          activeSetup: { ...winner, recordId: record.id },
          goExpiresAt: now + GO_WINDOW_MS,
          watchEnteredAt: null,
          todaysSetups,
        }
        nextState = setSlot(nextState, ticker, slot)
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
        const isSameWatch = slot.state === 'WATCH'
          && slot.activeSetup?.level?.name === watching.level.name
          && slot.activeSetup?.setupId === watching.setupId
        if (!isSameWatch) {
          slot = {
            ...slot,
            state: 'WATCH',
            activeSetup: watching,
            watchEnteredAt: now,
          }
          nextState = setSlot(nextState, ticker, slot)
          events.push({
            type: 'watch',
            setup: watching,
            message: `Watching: ${watching.setupName} at ${watching.level.name} $${watching.level.price.toFixed(2)}.`,
          })
        }
        return { state: nextState, events }
      }

      // No setup at all: if WATCH and price moved away, drop to WAIT
      if (slot.state === 'WATCH' && slot.activeSetup) {
        const dist = Math.abs(slot.activeSetup.level.price - ctx.currentPrice)
        if (dist > WATCH_DROP_DISTANCE) {
          slot = { ...slot, state: 'WAIT', activeSetup: null, watchEnteredAt: null }
          nextState = setSlot(nextState, ticker, slot)
          events.push({ type: 'watch_dropped', message: 'Price moved away from watched level.' })
        }
      }
      return { state: nextState, events }
    }

    default:
      return { state: nextState, events }
  }
}

// Build the playbook's market-context shape. Takes the per-ticker slice so
// prevSignals only counts this ticker's prior setups (not cross-ticker noise).
function buildPlaybookCtx(ctx, slot) {
  return {
    ticker: ctx.ticker,
    currentPrice: ctx.currentPrice,
    lastPrice: ctx.lastPrice ?? null,
    bars5m: ctx.bars5m || [],
    levels: ctx.levels || {},
    alignment: ctx.alignment || {},
    etMinutes: ctx.etMinutes,
    rvol: ctx.rvol ?? null,
    prevSignals: (slot.todaysSetups || []).map(r => ({
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

// User pressed "I took it" on the GO card for `ticker`. Opens a paper position
// in that ticker's slot. Other tickers' positions are untouched (concurrent
// positions are allowed).
export function userTakeIt(state, ticker, { strike, premium, contracts = DEFAULT_CONTRACTS, delta = DEFAULT_OPTION_DELTA } = {}) {
  const t = String(ticker || '').toUpperCase()
  const slot = state.byTicker?.[t]
  if (!slot || slot.state !== 'GO' || !slot.activeSetup) return { state, events: [] }
  const now = Date.now()
  const sig = slot.activeSetup
  const position = {
    id: uid('pos'),
    ticker: t,
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
  const todaysSetups = slot.todaysSetups.map(r =>
    r.id === sig.recordId ? { ...r, status: 'taken', position: { strike, premium, contracts } } : r
  )
  const nextSlot = {
    ...slot,
    state: 'IN_TRADE',
    activeSetup: null,
    goExpiresAt: null,
    position,
    todaysSetups,
  }
  return {
    state: setSlot(state, t, nextSlot),
    events: [{
      type: 'position_opened',
      position,
      message: `${sig.direction.toUpperCase()} ${sig.setupName} on ${t}, opened at ${sig.entry.toFixed(2)}.`,
    }],
  }
}

// User pressed "I skipped" on a per-ticker GO card.
export function userSkipIt(state, ticker) {
  const t = String(ticker || '').toUpperCase()
  const slot = state.byTicker?.[t]
  if (!slot || slot.state !== 'GO' || !slot.activeSetup) return { state, events: [] }
  const sig = slot.activeSetup
  const todaysSetups = slot.todaysSetups.map(r =>
    r.id === sig.recordId ? { ...r, status: 'skipped' } : r
  )
  const pendingWouldHaveWon = [...slot.pendingWouldHaveWon, { setupRecordId: sig.recordId, signal: sig }]
  const nextSlot = {
    ...slot,
    state: 'WAIT',
    activeSetup: null,
    goExpiresAt: null,
    todaysSetups,
    pendingWouldHaveWon,
  }
  return {
    state: setSlot(state, t, nextSlot),
    events: [{ type: 'skipped', message: `Skipped ${sig.setupName} on ${t}.` }],
  }
}

// User closed a per-ticker open position manually. exitPremium is what they
// actually got out at (option-side, since we cannot fetch live option price).
export function userCloseManually(state, ticker, exitPremium) {
  const t = String(ticker || '').toUpperCase()
  const slot = state.byTicker?.[t]
  if (!slot || slot.state !== 'IN_TRADE' || !slot.position) return { state, events: [] }
  const now = Date.now()
  const closed = closePosition(slot.position, slot.position.currentUnderlying, 'manual', now, Number(exitPremium))
  const newSlotRealizedPL = slot.realizedPL + closed.realizedPL
  const todaysSetups = slot.todaysSetups.map(r =>
    r.id === slot.position.setupRecordId
      ? { ...r, status: closed.realizedPL >= 0 ? 'win' : 'loss', closeData: { realizedPL: closed.realizedPL, exitUnderlying: closed.exitUnderlying, exitReason: 'manual', closedAt: closed.closedAt } }
      : r
  )
  const nextSlot = {
    ...slot,
    state: 'CLOSED',
    position: null,
    lastClosed: closed,
    closedEnteredAt: now,
    realizedPL: newSlotRealizedPL,
    todaysSetups,
  }
  let nextState = setSlot(state, t, nextSlot)
  const events = [{
    type: 'position_closed',
    position: closed,
    message: `Manual close: ${closed.direction.toUpperCase()} ${closed.setupName} (${t}), P/L $${closed.realizedPL.toFixed(2)}`,
  }]
  if (!nextState.lockedAt && isLockedOut(nextState, 0)) {
    nextState = { ...nextState, lockedAt: now, wasLockedToday: true }
    events.push({ type: 'lockout', message: 'Daily loss limit hit, bot locked.' })
  }
  return { state: nextState, events }
}

// User dismissed the CLOSED card for a specific ticker before its auto-timer.
export function userDismissClosed(state, ticker) {
  const t = String(ticker || '').toUpperCase()
  const slot = state.byTicker?.[t]
  if (!slot || slot.state !== 'CLOSED') return { state, events: [] }
  const nextSlot = { ...slot, state: 'WAIT', lastClosed: null, closedEnteredAt: null, activeSetup: null }
  return { state: setSlot(state, t, nextSlot), events: [] }
}

// User unlocked the bot after a global lockout. Friction (typing UNLOCK) is
// the UI's responsibility; this just clears the global flag.
export function userUnlock(state) {
  if (!state.lockedAt) return { state, events: [] }
  return {
    state: { ...state, lockedAt: null },
    events: [{ type: 'unlocked', message: 'Bot unlocked. Trade carefully.' }],
  }
}

// Reset the session across all tickers. Rolls today's stats into history.
export function resetSession(state) {
  const archived = rollOverSession(state, state.sessionDate || ymdET(new Date()))
  return {
    ...archived,
    byTicker: {},
    lockedAt: null,
    sessionStartedAt: Date.now(),
    sessionDate: ymdET(new Date()),
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

// Dev-only helper. Forces a synthetic GO signal on a specific ticker so the
// user can exercise the full state machine without waiting for live conditions.
export function devInjectTestSetup(state, ticker = 'QQQ', currentPrice = 590) {
  const t = String(ticker || 'QQQ').toUpperCase()
  const now = Date.now()
  const synthetic = {
    setupId: 'dev_test',
    setupName: 'Dev test setup',
    direction: 'long',
    confidence: 10,
    entry: currentPrice,
    stop: currentPrice - 0.40,
    target: currentPrice + 1.50,
    why: 'Synthetic GO injected for testing. This bypasses the playbook.',
    level: { name: 'TEST', price: currentPrice },
    optionDirection: 'call',
    optionStrikeRule: 'atm',
  }
  const record = recordSetup(synthetic, 'pending', etMinutesOf(new Date()), now, t)
  let nextState = ensureTicker(state, t)
  const slot = nextState.byTicker[t]
  const nextSlot = {
    ...slot,
    state: 'GO',
    activeSetup: { ...synthetic, recordId: record.id },
    goExpiresAt: now + GO_WINDOW_MS,
    watchEnteredAt: null,
    todaysSetups: [...slot.todaysSetups, record],
  }
  nextState = setSlot(nextState, t, nextSlot)
  nextState = {
    ...nextState,
    sessionDate: nextState.sessionDate || ymdET(new Date()),
    sessionStartedAt: nextState.sessionStartedAt || now,
  }
  return {
    state: nextState,
    events: [{ type: 'go', setup: synthetic, message: `GO LONG ${t}: Dev test setup at ${currentPrice.toFixed(2)}, confluence 10/10.` }],
  }
}

// ── Session rollover ────────────────────────────────────────────────────────

function rollOverSession(state, dateStr) {
  if (!dateStr) return state
  // Flatten today's records across all per-ticker slots.
  const allRecords = []
  let realizedPL = 0
  const perTickerPL = {}
  for (const [tk, slot] of Object.entries(state.byTicker || {})) {
    for (const r of slot.todaysSetups || []) allRecords.push({ ...r, ticker: r.ticker || tk })
    realizedPL += slot.realizedPL || 0
    if ((slot.todaysSetups?.length || 0) > 0 || (slot.realizedPL || 0) !== 0) {
      perTickerPL[tk] = slot.realizedPL || 0
    }
  }
  if (allRecords.length === 0 && realizedPL === 0) return state // nothing to archive

  const taken = allRecords.filter(r => r.status === 'taken' || r.status === 'win' || r.status === 'loss')
  const wins = allRecords.filter(r => r.status === 'win').length
  const losses = allRecords.filter(r => r.status === 'loss').length
  const skipped = allRecords.filter(r => r.status === 'skipped').length
  const expired = allRecords.filter(r => r.status === 'expired').length
  const perSetupCounts = {}
  for (const r of allRecords) {
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
    setupsSurfaced: allRecords.length,
    taken: taken.length,
    skipped,
    expired,
    wins,
    losses,
    realizedPL,
    perTickerPL,
    lockoutActivated: !!state.wasLockedToday,
    perSetupCounts,
  }
  const sessionHistory = [session, ...(state.sessionHistory || [])].slice(0, SESSION_HISTORY_CAP)
  return { ...state, sessionHistory }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats and patterns helpers consumed by the UI.
// ─────────────────────────────────────────────────────────────────────────────

// Flatten today's setups across all per-ticker slices into one array.
function allTodaysSetups(state) {
  const out = []
  for (const slot of Object.values(state.byTicker || {})) {
    for (const r of slot.todaysSetups || []) out.push(r)
  }
  return out
}

export function sessionStats(state) {
  const t = allTodaysSetups(state)
  const taken = t.filter(r => r.status === 'taken' || r.status === 'win' || r.status === 'loss').length
  const wins = t.filter(r => r.status === 'win').length
  const losses = t.filter(r => r.status === 'loss').length
  const skipped = t.filter(r => r.status === 'skipped').length
  const expired = t.filter(r => r.status === 'expired').length
  const wouldHaveWonSkips = t.filter(r => (r.status === 'skipped' || r.status === 'expired') && r.wouldHaveWon === true).length
  return { surfaced: t.length, taken, wins, losses, skipped, expired, wouldHaveWonSkips, realizedPL: totalRealizedPL(state) }
}

// Per-ticker breakdown of today's realized + unrealized P/L for the lockout
// banner (Phase 5). Returns a sorted array, largest absolute first.
export function perTickerPLBreakdown(state) {
  const out = []
  for (const [t, slot] of Object.entries(state.byTicker || {})) {
    const realized = slot.realizedPL || 0
    const unrealized = slot.position?.unrealizedPL || 0
    const taken = (slot.todaysSetups || []).filter(r => ['taken', 'win', 'loss'].includes(r.status)).length
    if (realized === 0 && unrealized === 0 && taken === 0) continue
    out.push({ ticker: t, realized, unrealized, taken })
  }
  out.sort((a, b) => Math.abs(b.realized + b.unrealized) - Math.abs(a.realized + a.unrealized))
  return out
}

// Aggregate per-setup performance across last N sessions plus today.
// Today's bucket is synthesized from all per-ticker todaysSetups.
export function patternsByActivity(state, lookback = 20) {
  const sessions = (state.sessionHistory || []).slice(0, lookback)
  const agg = {}
  const todaysPerSetup = {}
  for (const r of allTodaysSetups(state)) {
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
  for (const r of allTodaysSetups(state)) {
    if (r.status === 'skipped' || r.status === 'expired') {
      skipped++
      if (r.wouldHaveWon === true) wouldHaveWon++
    }
  }
  for (const s of state.sessionHistory || []) {
    skipped += (s.skipped || 0) + (s.expired || 0)
    for (const v of Object.values(s.perSetupCounts || {})) wouldHaveWon += v.wouldHaveWon || 0
  }
  const wouldHaveLost = skipped - wouldHaveWon
  return { skipped, wouldHaveWon, wouldHaveLost }
}
