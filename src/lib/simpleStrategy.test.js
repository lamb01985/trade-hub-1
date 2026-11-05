import { describe, it, expect } from 'vitest'
import { evaluateSimpleStrategy, sessionClock, strategyMessage, MINUTE_MS } from './simpleStrategy.js'
const OPEN = Date.parse('2026-11-05T14:30:00Z')
function fixture() {
  return Array.from({ length: 75 }, (_, i) => ({ t: OPEN + i * MINUTE_MS, o: i < 60 ? 102 : i < 70 ? 106 : 105.6, c: i < 60 ? 102 : i < 70 ? 106 : 105.7, h: i === 0 ? 110 : i < 60 ? 102.1 : i < 70 ? 106.1 : 105.8, l: i === 0 ? 100 : i < 60 ? 101.9 : i < 70 ? 105.9 : 104.9, v: 100 }))
}
const NOW = OPEN + 75 * MINUTE_MS + 5000

describe('simple strategy safety and confirmation', () => {
  it('confirms a long with a defined next-candle expiry and at least 2R', () => {
    const r = evaluateSimpleStrategy(fixture(), NOW)
    expect(r.state).toBe('CONFIRMED')
    expect(r.signal.direction).toBe('LONG')
    expect(r.signal.rr).toBeGreaterThanOrEqual(2)
    expect(r.range.mid).toBe(105)
    expect(r.signal.expiresAt).toBe(OPEN + 80 * MINUTE_MS)
    expect(strategyMessage(r)).toContain('no automatic order')
  })
  it('mirrors the same rules for shorts', () => {
    const rows = fixture().map(b => ({ ...b, o: 210 - b.o, c: 210 - b.c, h: 210 - b.l, l: 210 - b.h }))
    const r = evaluateSimpleStrategy(rows, NOW)
    expect(r.state).toBe('CONFIRMED')
    expect(r.direction).toBe('SHORT')
    expect(r.signal.target).toBe(100)
  })
  it('never reuses yesterday or stale minute bars', () => {
    expect(evaluateSimpleStrategy(fixture().map(b => ({ ...b, t: b.t - 86400000 })), NOW).signal).toBeNull()
    expect(evaluateSimpleStrategy(fixture(), NOW + 3 * MINUTE_MS).state).toBe('STALE')
  })
  it('rejects missing minutes, invalid OHLC and zero volume', () => {
    const gap = fixture(); gap.splice(10, 1)
    expect(evaluateSimpleStrategy(gap, NOW).state).toBe('NO_DATA')
    const bad = fixture(); bad[10].c = NaN
    expect(evaluateSimpleStrategy(bad, NOW).signal).toBeNull()
    const zero = fixture(); zero[10].v = 0
    expect(evaluateSimpleStrategy(zero, NOW).state).toBe('NO_DATA')
  })
  it('ignores an incomplete confirmation candle', () => {
    const r = evaluateSimpleStrategy(fixture(), OPEN + 74 * MINUTE_MS + 5000)
    expect(r.signal).toBeNull()
  })
  it('waits for the whole first hour', () => {
    expect(evaluateSimpleStrategy(fixture().slice(0, 59), OPEN + 59 * MINUTE_MS + 5000).state).toBe('WAIT')
  })
  it('suppresses plans once the next candle traded through entry or stop', () => {
    for (const [h, l] of [[106, 105.5], [105.75, 104]]) {
      const rows = fixture(); rows.push({ t: OPEN + 75 * MINUTE_MS, o: 105.7, c: 105.7, h, l, v: 100 })
      const r = evaluateSimpleStrategy(rows, OPEN + 76 * MINUTE_MS + 5000)
      expect(r.state).toBe('SKIP')
      expect(r.signal).toBeNull()
    }
  })
  it('provides a once-per-direction level heads-up before five-minute confirmation', () => {
    const rows = fixture().slice(0, 71)
    const r = evaluateSimpleStrategy(rows, OPEN + 71 * MINUTE_MS + 5000)
    expect(r.state).toBe('WATCH')
    expect(r.watchAlert.id).toContain('LEVEL:LONG')
    expect(r.signal).toBeNull()
  })
  it('skips inadequate reward to the first-hour edge', () => {
    const rows = fixture(); rows[0].h = 106
    expect(evaluateSimpleStrategy(rows, NOW).signal).toBeNull()
  })
  it('uses New York date and DST rather than UTC or host time', () => {
    expect(sessionClock(Date.parse('2026-07-06T13:30:00Z')).minute).toBe(570)
    expect(sessionClock(OPEN).minute).toBe(570)
    expect(evaluateSimpleStrategy([], Date.parse('2026-11-07T15:00:00Z')).state).toBe('CLOSED')
    expect(evaluateSimpleStrategy([], Date.parse('2026-11-05T21:00:00Z')).state).toBe('CLOSED')
  })
})
