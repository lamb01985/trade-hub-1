// vitest run
//
// Coverage per the spec:
//   clean break-hold up
//   failed-break-short
//   sweep-reclaim long
//   invalidation killing a failed-break (strong extension)
//   window expiry resolving to break-hold (no movement in window)
//   mirrors for the down side
//   sweep-reclaim does NOT fire from a PENDING state
//   stale-levels detector

import { describe, it, expect } from 'vitest'
import {
  evaluateOrbSignals,
  detectStaleLevels,
  CONFIRMATION_WINDOW_BARS,
  EXTENSION_INVALIDATION_MULT,
} from './orbSignalEngine.js'

// QQQ-ish numbers chosen so the OR range is 5.0 and the invalidation
// threshold above orHigh is 712.50 + 0.5 * 5 = 715.00. Easy to reason about.
const OR_HIGH = 712.5
const OR_LOW = 707.5
const OR_RANGE = OR_HIGH - OR_LOW

let _t = 1730000000000
function bar({ o, h, l, c }) {
  _t += 5 * 60 * 1000
  return { t: _t, o, h, l, c, v: 100000 }
}

// Reset the synthetic clock between tests so timestamps stay readable.
function reset() { _t = 1730000000000 }

describe('evaluateOrbSignals: defaults', () => {
  it('exposes the spec defaults as exported constants', () => {
    expect(CONFIRMATION_WINDOW_BARS).toBe(3)
    expect(EXTENSION_INVALIDATION_MULT).toBe(0.5)
  })
})

describe('clean break-hold up', () => {
  it('confirms BREAK_HOLD_LONG on the bar that exhausts the window', () => {
    reset()
    const bars = [
      // The break: 5m bar closes above OR High but not into invalidation territory.
      bar({ o: 712.0, h: 713.0, l: 711.8, c: 712.9 }),
      // 3 holding bars, each just above OR High, no extension to 715, no reversal.
      bar({ o: 712.9, h: 713.4, l: 712.7, c: 713.2 }),
      bar({ o: 713.2, h: 713.6, l: 713.0, c: 713.4 }),
      bar({ o: 713.4, h: 713.8, l: 713.2, c: 713.6 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.upper.state).toBe('CONFIRMED')
    expect(r.upper.signal).toBe('BREAK_HOLD_LONG')
    expect(r.lower.state).toBe('WATCHING')
    expect(r.events.map(e => e.type)).toEqual(['BREAK_HOLD_LONG'])
    expect(r.current.signal).toBe('BREAK_HOLD_LONG')
    expect(r.current.direction).toBe('LONG')
  })
})

describe('failed-break-short', () => {
  it('confirms FAILED_BREAK_SHORT when a subsequent bar closes back below OR High inside the window', () => {
    reset()
    const bars = [
      // Break above OR High.
      bar({ o: 712.0, h: 713.4, l: 711.9, c: 713.2 }),
      // Soft second bar, still above the boundary, not strong enough to invalidate.
      bar({ o: 713.2, h: 713.5, l: 712.6, c: 712.8 }),
      // Reversal: closes back below OR High.
      bar({ o: 712.8, h: 712.8, l: 711.4, c: 711.6 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.upper.state).toBe('CONFIRMED')
    expect(r.upper.signal).toBe('FAILED_BREAK_SHORT')
    expect(r.events.map(e => e.type)).toEqual(['FAILED_BREAK_SHORT'])
    expect(r.current.direction).toBe('SHORT')
    expect(r.current.event.boundary).toBe('OR High')
  })
})

describe('sweep-reclaim long', () => {
  it('emits a sweep-reclaim long when a single bar wicks below OR Low and closes back above', () => {
    reset()
    const bars = [
      bar({ o: 708.0, h: 708.4, l: 706.8, c: 707.9 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.lower.state).toBe('WATCHING') // never broke, just wicked
    expect(r.events.map(e => e.type)).toEqual(['SWEEP_RECLAIM_LONG'])
    expect(r.current.signal).toBe('SWEEP_RECLAIM_LONG')
    expect(r.current.direction).toBe('LONG')
  })

  it('does NOT fire sweep-reclaim once the boundary is PENDING from a real break', () => {
    reset()
    const bars = [
      // Real break below OR Low.
      bar({ o: 708.0, h: 708.2, l: 706.5, c: 707.0 }),
      // Wick-and-reclaim pattern but boundary is already PENDING from the prior bar.
      // The state machine resolves this as FAILED_BREAK_LONG, not sweep-reclaim.
      bar({ o: 707.0, h: 707.9, l: 706.0, c: 707.8 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.events.map(e => e.type)).toEqual(['FAILED_BREAK_LONG'])
    expect(r.lower.signal).toBe('FAILED_BREAK_LONG')
  })
})

describe('invalidation kills the failed-break thesis', () => {
  it('resolves to BREAK_HOLD_LONG when a window bar closes more than 0.5 * orRange beyond OR High', () => {
    reset()
    // OR range = 5, threshold = orHigh + 2.5 = 715.0
    const bars = [
      // Break above OR High, but not yet past the invalidation threshold.
      bar({ o: 712.0, h: 713.0, l: 711.9, c: 712.9 }),
      // Strong extension bar: close 716.0 is > 715.0. Invalidates.
      bar({ o: 713.0, h: 716.4, l: 712.9, c: 716.0 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.upper.state).toBe('CONFIRMED')
    expect(r.upper.signal).toBe('BREAK_HOLD_LONG')
    expect(r.events.map(e => e.type)).toEqual(['BREAK_HOLD_LONG'])
  })

  it('does not invalidate when extension is exactly at the threshold', () => {
    reset()
    // close at exactly 715.0 is the threshold. Use strict > so this should NOT invalidate.
    const bars = [
      bar({ o: 712.0, h: 713.0, l: 711.9, c: 712.9 }),
      bar({ o: 712.9, h: 715.1, l: 712.7, c: 715.0 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    // Still in PENDING after the threshold-touching bar.
    expect(r.upper.state).toBe('PENDING')
    expect(r.upper.windowRemaining).toBe(CONFIRMATION_WINDOW_BARS - 1)
  })
})

describe('window expiry resolves to BREAK_HOLD', () => {
  it('confirms BREAK_HOLD_LONG when 3 holding bars pass with neither reversal nor extension', () => {
    reset()
    const bars = [
      bar({ o: 712.0, h: 713.0, l: 711.9, c: 712.9 }), // break, PENDING (window=3)
      bar({ o: 712.9, h: 713.4, l: 712.7, c: 713.0 }), // window=2
      bar({ o: 713.0, h: 713.5, l: 712.8, c: 713.1 }), // window=1
      bar({ o: 713.1, h: 713.6, l: 712.8, c: 713.2 }), // window=0 → CONFIRMED
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.upper.state).toBe('CONFIRMED')
    expect(r.upper.signal).toBe('BREAK_HOLD_LONG')
    expect(r.upper.signalBarIdx).toBe(3)
  })
})

describe('downside mirrors', () => {
  it('confirms BREAK_HOLD_SHORT on a clean break and hold below OR Low', () => {
    reset()
    const bars = [
      bar({ o: 708.0, h: 708.2, l: 706.5, c: 707.0 }), // break PENDING
      bar({ o: 707.0, h: 707.3, l: 706.6, c: 707.1 }), // window=2
      bar({ o: 707.1, h: 707.4, l: 706.7, c: 707.2 }), // window=1
      bar({ o: 707.2, h: 707.4, l: 706.5, c: 706.9 }), // window=0 → CONFIRMED
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.lower.state).toBe('CONFIRMED')
    expect(r.lower.signal).toBe('BREAK_HOLD_SHORT')
  })

  it('confirms FAILED_BREAK_LONG when price closes back above OR Low inside the window', () => {
    reset()
    const bars = [
      bar({ o: 708.0, h: 708.2, l: 706.5, c: 706.9 }), // break PENDING
      bar({ o: 706.9, h: 708.0, l: 706.8, c: 707.9 }), // close back above OR Low
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.lower.state).toBe('CONFIRMED')
    expect(r.lower.signal).toBe('FAILED_BREAK_LONG')
  })

  it('emits SWEEP_RECLAIM_SHORT for a wick above OR High that closes back below', () => {
    reset()
    const bars = [
      bar({ o: 712.0, h: 713.4, l: 711.8, c: 712.0 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.events.map(e => e.type)).toEqual(['SWEEP_RECLAIM_SHORT'])
    expect(r.current.direction).toBe('SHORT')
  })
})

describe('current view selection', () => {
  it('reports PENDING with windowRemaining when a break has just occurred', () => {
    reset()
    const bars = [
      bar({ o: 712.0, h: 713.0, l: 711.9, c: 712.9 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.upper.state).toBe('PENDING')
    expect(r.current.type).toBe('PENDING')
    expect(r.current.state).toBe('PENDING')
    expect(r.current.windowRemaining).toBe(CONFIRMATION_WINDOW_BARS)
    expect(r.current.boundary).toBe('OR High')
  })

  it('reports WATCHING when no boundary has been challenged', () => {
    reset()
    const bars = [
      bar({ o: 710.0, h: 711.5, l: 709.5, c: 710.8 }),
      bar({ o: 710.8, h: 712.0, l: 710.2, c: 711.5 }),
    ]
    const r = evaluateOrbSignals(bars, { orHigh: OR_HIGH, orLow: OR_LOW })
    expect(r.upper.state).toBe('WATCHING')
    expect(r.lower.state).toBe('WATCHING')
    expect(r.events).toHaveLength(0)
    expect(r.current.state).toBe('WATCHING')
  })
})

describe('configuration overrides', () => {
  it('respects a custom confirmationWindowBars value', () => {
    reset()
    const bars = [
      bar({ o: 712.0, h: 713.0, l: 711.9, c: 712.9 }), // break PENDING (window=2 now)
      bar({ o: 712.9, h: 713.3, l: 712.7, c: 713.0 }), // window=1
      bar({ o: 713.0, h: 713.4, l: 712.8, c: 713.1 }), // window=0 → CONFIRMED
    ]
    const r = evaluateOrbSignals(bars, {
      orHigh: OR_HIGH,
      orLow: OR_LOW,
      config: { confirmationWindowBars: 2 },
    })
    expect(r.upper.signal).toBe('BREAK_HOLD_LONG')
    expect(r.upper.signalBarIdx).toBe(2)
  })

  it('respects a custom extensionInvalidationMult value', () => {
    reset()
    // With mult = 0.2, threshold above OR High = 712.5 + 0.2 * 5 = 713.5.
    // A close at 713.6 should invalidate.
    const bars = [
      bar({ o: 712.0, h: 713.0, l: 711.9, c: 712.9 }),
      bar({ o: 712.9, h: 713.8, l: 712.7, c: 713.6 }),
    ]
    const r = evaluateOrbSignals(bars, {
      orHigh: OR_HIGH,
      orLow: OR_LOW,
      config: { extensionInvalidationMult: 0.2 },
    })
    expect(r.upper.signal).toBe('BREAK_HOLD_LONG')
  })
})

describe('detectStaleLevels', () => {
  it('returns true when live price is more than one orRange beyond both boundaries', () => {
    // Range = 5. Above orHigh by > 5 → stale: e.g., orHigh = 712.5, price = 720.
    expect(detectStaleLevels(720, OR_HIGH, OR_LOW)).toBe(true)
  })

  it('returns false when live price is inside or near the range', () => {
    expect(detectStaleLevels(710, OR_HIGH, OR_LOW)).toBe(false)
    expect(detectStaleLevels(714, OR_HIGH, OR_LOW)).toBe(false)
    expect(detectStaleLevels(706, OR_HIGH, OR_LOW)).toBe(false)
  })

  it('returns false when any input is missing or the range is degenerate', () => {
    expect(detectStaleLevels(null, OR_HIGH, OR_LOW)).toBe(false)
    expect(detectStaleLevels(710, null, OR_LOW)).toBe(false)
    expect(detectStaleLevels(710, 700, 700)).toBe(false)
    expect(detectStaleLevels(710, 700, 710)).toBe(false)
  })
})
