// ─────────────────────────────────────────────────────────────────────────────
// orbSignalEngine.js
//
// Pure detection engine for ORB opening-range signals. No React, no fetch,
// no time-based clocks. Same input always returns the same output, which is
// what lets the React layer call it on every new 5m bar without surprise and
// lets vitest exercise the state machine with synthetic bar arrays.
//
// Inputs:
//   bars       chronologically-ordered, COMPLETED 5m bars. Shape:
//              { t (ms epoch), o, h, l, c, v }. Forming/partial bars should
//              be filtered out by the caller before passing in.
//   orHigh     opening-range high (number)
//   orLow      opening-range low (number)
//   config     { confirmationWindowBars, extensionInvalidationMult } overrides.
//
// State per boundary (independent for orHigh and orLow):
//
//   WATCHING   no break has occurred. Each bar is checked for a fresh break
//              (close beyond the boundary) and for the single-bar
//              sweep-reclaim pattern.
//
//   PENDING    a bar closed through the boundary; we are now in the
//              confirmation window watching for one of three outcomes
//              within confirmationWindowBars bars:
//                1. EXTENSION INVALIDATION: a bar closes more than
//                   extensionInvalidationMult * orRange beyond the broken
//                   boundary. Failed-break thesis dies; resolve to
//                   BREAK_HOLD on that bar.
//                2. REVERSAL: a bar closes back across the boundary.
//                   Resolve to FAILED_BREAK on that bar.
//                3. EXPIRY: window runs out with no reversal and no
//                   invalidation. Resolve to BREAK_HOLD on the bar that
//                   exhausts the window.
//
//   CONFIRMED  terminal. The boundary's signal is locked in. The opposite
//              boundary still runs independently and can produce its own
//              signal later in the session.
//
// Six possible CONFIRMED-tier signals:
//   BREAK_HOLD_LONG     close above orHigh held / extended through window
//   BREAK_HOLD_SHORT    close below orLow  held / extended through window
//   FAILED_BREAK_SHORT  close above orHigh then back below within window
//   FAILED_BREAK_LONG   close below orLow  then back above within window
//
// Two sweep events (single-bar, fire from WATCHING only):
//   SWEEP_RECLAIM_LONG   bar's low < orLow  but close > orLow
//   SWEEP_RECLAIM_SHORT  bar's high > orHigh but close < orHigh
//
// Sweep events only fire when the boundary state at the start of the bar
// was WATCHING. If the boundary is already PENDING from a prior break, the
// same wick + close-back-across pattern is the FAILED_BREAK resolution of
// the state machine, not a sweep-reclaim.
// ─────────────────────────────────────────────────────────────────────────────

// Default confirmation window, in bars. With 5m bars this is 15 minutes,
// matching the spec.
export const CONFIRMATION_WINDOW_BARS = 3

// Multiplier on orRange that defines "this breakout is real, kill any
// failed-break watch": if a PENDING bar closes more than this multiplier
// times the OR range beyond the broken boundary, resolve to BREAK_HOLD
// immediately on that bar.
export const EXTENSION_INVALIDATION_MULT = 0.5

// Each signal carries a short, plain-English explanation used by the UI.
// Authored without em-dashes intentionally; use commas, colons, or rewrite.
const SIGNAL_EXPLANATIONS = {
  BREAK_HOLD_LONG: 'Bar closed above OR High and held above through the confirmation window, no failed-break reversal. Buyers in control. Long bias.',
  BREAK_HOLD_SHORT: 'Bar closed below OR Low and held below through the confirmation window, no reclaim. Sellers in control. Short bias.',
  FAILED_BREAK_SHORT: 'Bar closed above OR High then failed back below within the window. Breakout absorbed, sellers defended. Fade short.',
  FAILED_BREAK_LONG: 'Bar closed below OR Low then reclaimed within the window. Breakdown absorbed, buyers defended. Fade long.',
  SWEEP_RECLAIM_LONG: 'Bar wicked below OR Low but closed back above. Liquidity swept under the floor and reclaimed. Long bias.',
  SWEEP_RECLAIM_SHORT: 'Bar wicked above OR High but closed back below. Liquidity swept over the ceiling and rejected. Short bias.',
}

const SIGNAL_DIRECTION = {
  BREAK_HOLD_LONG: 'LONG',
  BREAK_HOLD_SHORT: 'SHORT',
  FAILED_BREAK_SHORT: 'SHORT',
  FAILED_BREAK_LONG: 'LONG',
  SWEEP_RECLAIM_LONG: 'LONG',
  SWEEP_RECLAIM_SHORT: 'SHORT',
}

function makeBoundaryState() {
  return {
    state: 'WATCHING',
    signal: null,
    breakBarIdx: null,
    signalBarIdx: null,
    windowRemaining: null,
    triggerPrice: null,
  }
}

function makeEvent(type, bar, barIdx, boundary, boundaryPrice) {
  return {
    type,
    direction: SIGNAL_DIRECTION[type] || null,
    boundary,
    boundaryPrice,
    barIdx,
    time: bar?.t ?? null,
    price: bar?.c ?? null,
    explanation: SIGNAL_EXPLANATIONS[type] || '',
  }
}

// Pure detection. Processes bars in order and returns the final per-boundary
// state, the chronological event history, and the current actionable view.
//
// The function is intentionally stateless: re-running it with the same bars
// will produce the same output. The caller decides how much history to
// supply (e.g., re-run with all bars since the OR closed each time a new 5m
// bar lands). The engine does not subscribe to anything.
export function evaluateOrbSignals(bars, options = {}) {
  const { orHigh, orLow } = options
  const cfg = {
    confirmationWindowBars: options.config?.confirmationWindowBars ?? CONFIRMATION_WINDOW_BARS,
    extensionInvalidationMult: options.config?.extensionInvalidationMult ?? EXTENSION_INVALIDATION_MULT,
  }

  const upper = makeBoundaryState()
  const lower = makeBoundaryState()
  const events = []

  if (!Array.isArray(bars) || orHigh == null || orLow == null) {
    return { upper, lower, events, current: { type: 'NO_DATA' }, config: cfg, orRange: null }
  }
  const orRange = orHigh - orLow
  if (!(orRange > 0)) {
    return { upper, lower, events, current: { type: 'NO_DATA' }, config: cfg, orRange }
  }

  const upperInvalidationThreshold = orHigh + cfg.extensionInvalidationMult * orRange
  const lowerInvalidationThreshold = orLow - cfg.extensionInvalidationMult * orRange

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]
    if (!b) continue

    // Snapshot state at the start of the bar so sweep checks don't mis-fire
    // when this same bar also transitions a boundary to PENDING.
    const upperStateAtStart = upper.state
    const lowerStateAtStart = lower.state

    // ── Single-bar sweep-reclaim, only valid from WATCHING ──────────────────
    if (upperStateAtStart === 'WATCHING' && b.h > orHigh && b.c < orHigh) {
      const evt = makeEvent('SWEEP_RECLAIM_SHORT', b, i, 'OR High', orHigh)
      events.push(evt)
    }
    if (lowerStateAtStart === 'WATCHING' && b.l < orLow && b.c > orLow) {
      const evt = makeEvent('SWEEP_RECLAIM_LONG', b, i, 'OR Low', orLow)
      events.push(evt)
    }

    // ── Upper boundary state machine ────────────────────────────────────────
    if (upper.state === 'WATCHING') {
      if (b.c > orHigh) {
        upper.state = 'PENDING'
        upper.breakBarIdx = i
        upper.windowRemaining = cfg.confirmationWindowBars
        upper.triggerPrice = b.c
      }
    } else if (upper.state === 'PENDING') {
      if (b.c > upperInvalidationThreshold) {
        upper.state = 'CONFIRMED'
        upper.signal = 'BREAK_HOLD_LONG'
        upper.signalBarIdx = i
        events.push(makeEvent('BREAK_HOLD_LONG', b, i, 'OR High', orHigh))
      } else if (b.c < orHigh) {
        upper.state = 'CONFIRMED'
        upper.signal = 'FAILED_BREAK_SHORT'
        upper.signalBarIdx = i
        events.push(makeEvent('FAILED_BREAK_SHORT', b, i, 'OR High', orHigh))
      } else {
        upper.windowRemaining -= 1
        if (upper.windowRemaining <= 0) {
          upper.state = 'CONFIRMED'
          upper.signal = 'BREAK_HOLD_LONG'
          upper.signalBarIdx = i
          events.push(makeEvent('BREAK_HOLD_LONG', b, i, 'OR High', orHigh))
        }
      }
    }

    // ── Lower boundary state machine, mirror of the above ──────────────────
    if (lower.state === 'WATCHING') {
      if (b.c < orLow) {
        lower.state = 'PENDING'
        lower.breakBarIdx = i
        lower.windowRemaining = cfg.confirmationWindowBars
        lower.triggerPrice = b.c
      }
    } else if (lower.state === 'PENDING') {
      if (b.c < lowerInvalidationThreshold) {
        lower.state = 'CONFIRMED'
        lower.signal = 'BREAK_HOLD_SHORT'
        lower.signalBarIdx = i
        events.push(makeEvent('BREAK_HOLD_SHORT', b, i, 'OR Low', orLow))
      } else if (b.c > orLow) {
        lower.state = 'CONFIRMED'
        lower.signal = 'FAILED_BREAK_LONG'
        lower.signalBarIdx = i
        events.push(makeEvent('FAILED_BREAK_LONG', b, i, 'OR Low', orLow))
      } else {
        lower.windowRemaining -= 1
        if (lower.windowRemaining <= 0) {
          lower.state = 'CONFIRMED'
          lower.signal = 'BREAK_HOLD_SHORT'
          lower.signalBarIdx = i
          events.push(makeEvent('BREAK_HOLD_SHORT', b, i, 'OR Low', orLow))
        }
      }
    }
  }

  const current = pickCurrent({ upper, lower, events, orHigh, orLow })
  return { upper, lower, events, current, config: cfg, orRange, orHigh, orLow }
}

// What the UI should render right now. Priority:
//   1. Most recent CONFIRMED or sweep event (most actionable).
//   2. Active PENDING state (waiting for confirmation).
//   3. WATCHING (no signal yet).
function pickCurrent({ upper, lower, events, orHigh, orLow }) {
  if (events.length > 0) {
    const last = events[events.length - 1]
    return {
      type: 'EVENT',
      state: 'CONFIRMED',
      event: last,
      boundary: last.boundary,
      direction: last.direction,
      signal: last.type,
      price: last.price,
      explanation: last.explanation,
    }
  }
  if (upper.state === 'PENDING') {
    return {
      type: 'PENDING',
      state: 'PENDING',
      boundary: 'OR High',
      boundaryPrice: orHigh,
      triggerPrice: upper.triggerPrice,
      windowRemaining: upper.windowRemaining,
      waitingFor: 'a full 5m bar to close either back below OR High (failed break, short) or stay above (break-hold, long). Strong extension above resolves to break-hold immediately.',
    }
  }
  if (lower.state === 'PENDING') {
    return {
      type: 'PENDING',
      state: 'PENDING',
      boundary: 'OR Low',
      boundaryPrice: orLow,
      triggerPrice: lower.triggerPrice,
      windowRemaining: lower.windowRemaining,
      waitingFor: 'a full 5m bar to close either back above OR Low (failed break, long) or stay below (break-hold, short). Strong extension below resolves to break-hold immediately.',
    }
  }
  return { type: 'WATCHING', state: 'WATCHING' }
}

// Surface the stale-levels warning the spec called for: live price more than
// 1x orRange away from BOTH boundaries means the loaded OR levels are
// almost certainly from a prior session and should be refetched.
export function detectStaleLevels(livePrice, orHigh, orLow) {
  if (livePrice == null || orHigh == null || orLow == null) return false
  const range = orHigh - orLow
  if (!(range > 0)) return false
  const distAbove = Math.abs(livePrice - orHigh)
  const distBelow = Math.abs(livePrice - orLow)
  return distAbove > range && distBelow > range
}
