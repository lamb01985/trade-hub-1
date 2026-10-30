import { describe, it, expect } from 'vitest'
import { normalizeTradeTimestamp, selectLatestTrade, tradeFreshness, tradeSession, STALE_TRADE_MS } from './quoteQuality.js'

describe('trade provenance and freshness', () => {
  const stamp = Date.parse('2026-10-29T23:59:59.615Z')

  it('normalizes REST nanoseconds and stream milliseconds to the same time', () => {
    expect(normalizeTradeTimestamp('1793318399615239567')).toBe(stamp)
    expect(normalizeTradeTimestamp(stamp)).toBe(stamp)
    expect(normalizeTradeTimestamp(stamp * 1000)).toBe(stamp)
    expect(normalizeTradeTimestamp(stamp / 1000)).toBe(stamp)
    expect(normalizeTradeTimestamp(null)).toBe(null)
  })

  it('labels the screenshot scenario as uncovered overnight, despite an open socket', () => {
    const status = tradeFreshness(stamp, Date.parse('2026-10-30T02:52:10Z'))
    expect(status.label).toBe('OVERNIGHT NOT COVERED')
    expect(status.fresh).toBe(false)
    expect(status.ageMs).toBeGreaterThan(2 * 60 * 60 * 1000)
    expect(tradeSession(stamp)).toBe('After-hours trade')
  })

  it('ages an unchanged trade without pretending REST receipt time is trade time', () => {
    const at = Date.parse('2026-10-29T15:00:00Z')
    const incoming = { price: 704.31, timestamp: at, source: 'Massive REST' }
    const repeated = selectLatestTrade(incoming, incoming, at + STALE_TRADE_MS + 1)
    expect(repeated.timestamp).toBe(at)
    expect(tradeFreshness(repeated.timestamp, at + STALE_TRADE_MS + 1).fresh).toBe(false)
    expect(tradeFreshness(at, at + 1000).fresh).toBe(true)
  })

  it('does not replace newer streaming data with an older REST result', () => {
    const previous = { price: 705, timestamp: stamp }
    expect(selectLatestTrade(previous, { price: 704, timestamp: stamp - 1000 }, stamp)).toBe(previous)
    expect(selectLatestTrade(previous, { price: 704, timestamp: null }, stamp)).toBe(previous)
    expect(selectLatestTrade(previous, { price: NaN, timestamp: stamp }, stamp)).toBe(previous)
    expect(selectLatestTrade(previous, { price: 706, timestamp: stamp + 60000 }, stamp)).toBe(previous)
  })

  it('does not call missing timestamps or weekend prices fresh', () => {
    expect(tradeFreshness(null, Date.parse('2026-10-29T15:00:00Z')).label).toBe('TIME UNVERIFIED')
    const weekend = Date.parse('2026-10-31T15:00:00Z')
    expect(tradeFreshness(weekend, weekend).label).toBe('FEED CLOSED')
  })
})
