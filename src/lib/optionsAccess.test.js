import { afterEach, expect, it, vi } from 'vitest'
import { getOptionChain, getLastTrade } from './massive.js'
afterEach(() => vi.unstubAllGlobals())

it('queries server-managed snapshot access with filters and reports partial chains', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://tradehub.test' } })
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [{ details: { ticker: 'O:TEST', strike_price: 725 }, greeks: { delta: 0.5 } }], next_url: 'https://api.massive.com/next' }) })
  vi.stubGlobal('fetch', fetcher)
  const data = await getOptionChain('qqq', { expiry: '2026-10-23', type: 'call', strike: 725 })
  const url = new URL(fetcher.mock.calls[0][0])
  expect(url.pathname).toBe('/api/polygon/proxy')
  expect(url.searchParams.get('path')).toBe('/v3/snapshot/options/QQQ')
  expect(url.searchParams.get('expiration_date')).toBe('2026-10-23')
  expect(url.searchParams.get('contract_type')).toBe('call')
  expect(url.searchParams.has('apiKey')).toBe(false)
  expect(data.hasMore).toBe(true)
  expect(data.contracts[0].ask).toBeNull()
  expect(data.contracts[0].delta).toBe(0.5)
})

it('reports actual entitlement denial rather than hardcoding a stock-only plan', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://tradehub.test' } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'NOT_AUTHORIZED' }))
  await expect(getOptionChain('SPY')).rejects.toMatchObject({ status: 403 })
  const stocksFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: { p: 725.2 } }) })
  vi.stubGlobal('fetch', stocksFetch)
  await expect(getLastTrade('QQQ')).resolves.toBe(725.2)
  expect(stocksFetch).toHaveBeenCalledTimes(1)
})
