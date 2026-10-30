// vitest run
//
// Coverage for the new session-date helpers in massive.js. The actual
// network helpers (getPriorSession, getDayBars, etc) are out of scope here
// since they hit the live proxy; this file pins the pure date math against
// fixed UTC instants so DST and the local machine timezone never matter.

import { describe, it, expect, vi } from 'vitest'
import { mostRecentSessionDate, MARKET_HOLIDAYS_2026, marketDateStr, getIntradayBars } from './massive.js'

describe('intraday session requests', () => {
  it('keeps the current New York market date after UTC midnight', () => {
    expect(marketDateStr(new Date('2026-10-30T02:00:00Z'))).toBe('2026-10-29')
    expect(marketDateStr(new Date('2026-12-02T02:00:00Z'))).toBe('2026-12-01')
    expect(marketDateStr(new Date('2026-10-30T13:30:00Z'))).toBe('2026-10-30')
  })

  it('requests enough minute bars for premarket, regular session and after hours', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-30T02:00:00Z'))
    vi.stubGlobal('window', { location: { origin: 'https://example.test' } })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await getIntradayBars('QQQ')
      const url = new URL(fetchMock.mock.calls[0][0])
      expect(url.searchParams.get('limit')).toBe('50000')
      expect(url.searchParams.get('path')).toContain('/range/1/minute/')
    } finally {
      now.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})

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

  it('Saturday walks past Juneteenth Friday to Thursday', () => {
    // Saturday 2026-06-20 11:00 ET = 15:00 UTC. Friday 2026-06-19 is
    // Juneteenth (closure), so the walk-back skips it.
    const at = new Date('2026-06-20T15:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-18') // Thursday
  })

  it('Sunday walks past Juneteenth Friday to Thursday', () => {
    // Sunday 2026-06-21 13:00 ET = 17:00 UTC. Same reasoning as above.
    const at = new Date('2026-06-21T17:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-18') // Thursday
  })

  it('Monday morning before close walks past Juneteenth Friday to Thursday', () => {
    // Monday 2026-06-22 09:30 ET = 13:30 UTC. Before close, walk back one
    // to Sunday, then weekend + Juneteenth Friday, landing on Thursday.
    const at = new Date('2026-06-22T13:30:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-06-18')
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

  it('crosses year boundary correctly, skipping New Year\'s Day', () => {
    // Friday 2026-01-02 09:00 ET = 14:00 UTC. Before close, walk back to
    // Thursday 2026-01-01 (New Year's Day closure), skip, land on Wednesday
    // 2025-12-31.
    const at = new Date('2026-01-02T14:00:00Z')
    expect(mostRecentSessionDate(at)).toBe('2025-12-31')
  })

  it('MARKET_HOLIDAYS_2026 is exported as a populated array of key dates', () => {
    expect(Array.isArray(MARKET_HOLIDAYS_2026)).toBe(true)
    expect(MARKET_HOLIDAYS_2026.length).toBeGreaterThan(0)
    expect(MARKET_HOLIDAYS_2026).toContain('2026-07-03') // Independence Day (observed)
    expect(MARKET_HOLIDAYS_2026).toContain('2026-06-19') // Juneteenth
    expect(MARKET_HOLIDAYS_2026).toContain('2026-11-26') // Thanksgiving
  })

  it('default parameter uses the current instant and returns a YYYY-MM-DD string', () => {
    const result = mostRecentSessionDate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('regression: Monday 2026-07-06 09:46 ET returns 2026-07-02 (skips Independence Day observed)', () => {
    // Monday 2026-07-06 09:46 ET = 13:46 UTC. Before close: walk back to
    // Sunday 07-05 (weekend), Saturday 07-04 (weekend), Friday 07-03
    // (Independence Day observed closure), landing on Thursday 07-02.
    // Real bug: the empty MARKET_HOLIDAYS_2026 list let the walk-back stop
    // on Friday 07-03, and Polygon returned no bar for that date, so
    // getPriorSession returned null and Evening Prep broke silently.
    const at = new Date('2026-07-06T13:46:00Z')
    expect(mostRecentSessionDate(at)).toBe('2026-07-02')
  })
})
