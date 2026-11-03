import { describe, expect, it } from 'vitest'
import { daysToExpiry, marketDate, normalizeOption, providerTime } from './optionSnapshot.js'
import { isAllowedPath } from '../../api/_lib/polygon.js'

describe('subscription options data', () => {
  it('allows snapshot requests while keeping unrelated server paths blocked', () => {
    expect(isAllowedPath('/v3/snapshot/options/QQQ')).toBe(true)
    expect(isAllowedPath('/v3/snapshot/options/QQQ/O:QQQ261023C00725000')).toBe(true)
    expect(isAllowedPath('/admin/secrets')).toBe(false)
    expect(isAllowedPath('https://elsewhere.test/v3/snapshot/options/QQQ')).toBe(false)
  })
  it('retains Greeks and OI when a subscription snapshot omits quotes and trades', () => {
    const c = normalizeOption({ details: { ticker: 'O:TEST', strike_price: 725, expiration_date: '2026-10-23', contract_type: 'put' }, greeks: { delta: -0.4, gamma: 0, theta: -0.5 }, implied_volatility: 0.3, open_interest: 0 }, 'QQQ')
    expect(c).toMatchObject({ bid: null, ask: null, last: null, spread: null, delta: -0.4, gamma: 0, theta: -0.5, iv: 0.3, openInterest: 0 })
    expect(c.quoteTimeframe).toBe('UNSPECIFIED')
  })
  it('keeps quote and trade status/timestamps separate and calculates valid spreads', () => {
    const c = normalizeOption({ last_quote: { bid: 2, ask: 2.2, timeframe: 'DELAYED', last_updated: 1792627198000000000 }, last_trade: { price: 2.1, timeframe: 'DELAYED', sip_timestamp: 1792627197000000000 }, underlying_asset: { price: 725 } }, 'QQQ')
    expect(c.spread).toBeCloseTo(0.2)
    expect(c.spreadPct).toBeCloseTo(0.2 / 2.1 * 100)
    expect(c.quoteTimeframe).toBe('DELAYED')
    expect(c.quoteTime).not.toBe(c.tradeTime)
    expect(c.underlyingPrice).toBe(725)
  })
  it('does not turn zero or crossed quotes into a usable spread', () => {
    expect(normalizeOption({ last_quote: { bid: 0, ask: 0 } }, 'QQQ').spread).toBeNull()
    expect(normalizeOption({ last_quote: { bid: 3, ask: 2 } }, 'QQQ').spread).toBeNull()
  })
  it('anchors DTE and default expiry filters to New York rather than UTC midnight', () => {
    const now = new Date('2026-10-22T00:54:00Z')
    expect(marketDate(now)).toBe('2026-10-21')
    expect(daysToExpiry('2026-10-22', now)).toBe(1)
    expect(daysToExpiry('2026-10-21', now)).toBe(0)
  })
  it('does not invent timestamps for absent values', () => {
    expect(providerTime(null)).toBeNull()
    expect(providerTime(0)).toBeNull()
    expect(providerTime('invalid')).toBeNull()
  })
})
