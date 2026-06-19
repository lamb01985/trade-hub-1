// vitest run
//
// Coverage for the new session-date helpers in massive.js. The actual
// network helpers (getPriorSession, getDayBars, etc) are out of scope here
// since they hit the live proxy; this file pins the pure date math against
// fixed UTC instants so DST and the local machine timezone never matter.

import { describe, it, expect } from 'vitest'
import { mostRecentSessionDate, MARKET_HOLIDAYS_2026 } from './massive.js'

describe('mostRecentSessionDate', () => {
  // Reference calendar (verified): June 15, 2026 is a Monday.
  // ET is UTC-4 during DST (in effect for June).

  it('weekday before 16:15 ET returns the prior trading day', () => {
    // Monday 2026-06-15 16:14:59 ET = 20:14:59 UTC during DST.
    const at = new Date('2026-06-15T20:14:59Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-12') // prior Friday
  })

  it('weekday exactly at 16:15 ET returns today', () => {
    // Monday 2026-06-15 16:15:00 ET = 20:15:00 UTC.
    const at = new Date('2026-06-15T20:15:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-15')
  })

  it('weekday after 16:15 ET returns today', () => {
    // Monday 2026-06-15 17:00 ET = 21:00 UTC.
    const at = new Date('2026-06-15T21:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-15')
  })

  it('weekday late-evening (well past close) still returns today', () => {
    // Monday 2026-06-15 23:30 ET = Tuesday 2026-06-16 03:30 UTC.
    const at = new Date('2026-06-16T03:30:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-15')
  })

  it('Saturday returns the prior Friday', () => {
    // Saturday 2026-06-20 11:00 ET = 15:00 UTC.
    const at = new Date('2026-06-20T15:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-19') // Friday
  })

  it('Sunday returns the prior Friday', () => {
    // Sunday 2026-06-21 13:00 ET = 17:00 UTC.
    const at = new Date('2026-06-21T17:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-19') // Friday
  })

  it('Monday morning before close returns the prior Friday', () => {
    // Monday 2026-06-22 09:30 ET = 13:30 UTC.
    const at = new Date('2026-06-22T13:30:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-19')
  })

  it('Tuesday early morning before close returns the prior Monday', () => {
    // Tuesday 2026-06-16 06:00 ET = 10:00 UTC.
    const at = new Date('2026-06-16T10:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-15')
  })

  it('crosses month boundary correctly', () => {
    // Wednesday 2026-07-01 02:00 ET = 06:00 UTC. Before close, walk back to
    // Tuesday 2026-06-30.
    const at = new Date('2026-07-01T06:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-30')
  })

  it('crosses year boundary correctly', () => {
    // Friday 2026-01-02 09:00 ET = 14:00 UTC. Before close, walk back to
    // Thursday 2026-01-01. New Year's Day is a market closure but is not
    // yet in MARKET_HOLIDAYS_2026, so this test asserts the no-holiday path.
    // When the holiday list is populated, the expected value would shift to
    // 2025-12-31.
    const at = new Date('2026-01-02T14:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-01-01')
  })

  it('MARKET_HOLIDAYS_2026 is exported as an empty array by default', () => {
    expect(Array.isArray(MARKET_HOLIDAYS_2026)).toBe(true)
    expect(MARKET_HOLIDAYS_2026.length).toBe(0)
  })

  it('default parameter uses the current instant and returns a YYYY-MM-DD string', () => {
    const result = mostRecentSessionDate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
