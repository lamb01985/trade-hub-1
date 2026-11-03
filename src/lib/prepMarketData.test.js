import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('./massive.js', () => ({ getPriorSession: vi.fn(), getLastTrade: vi.fn() }))
import { getPriorSession, getLastTrade } from './massive.js'
import { loadPrepMarketData } from './prepMarketData.js'

beforeEach(() => vi.resetAllMocks())

it('loads ticker-owned price without requiring background context', async () => {
  getPriorSession.mockResolvedValue({ high: 727.95, low: 719.71, close: 725.2 })
  getLastTrade.mockResolvedValue(719.45)
  const result = await loadPrepMarketData('QQQ')
  expect(result.price).toBe(719.45)
  expect(result.priceError).toBeNull()
  expect(getPriorSession).toHaveBeenCalledWith('QQQ', { priority: true })
  expect(getLastTrade).toHaveBeenCalledWith('QQQ', { priority: true })
})

it('keeps session levels when price access fails and reports the actual error', async () => {
  getPriorSession.mockResolvedValue({ close: 725.2 })
  getLastTrade.mockRejectedValue(new Error('403: access denied'))
  const result = await loadPrepMarketData('QQQ')
  expect(result.session.close).toBe(725.2)
  expect(result.price).toBeNull()
  expect(result.priceError).toContain('403: access denied')
})

it.each([null, NaN, Infinity, 0, -1])('leaves missing or invalid price %s blank', async price => {
  getPriorSession.mockResolvedValue({ close: 725.2 })
  getLastTrade.mockResolvedValue(price)
  expect((await loadPrepMarketData('QQQ')).price).toBeNull()
})

it('does not hide a failed session request behind a successful price', async () => {
  getPriorSession.mockRejectedValue(new Error('session failed'))
  getLastTrade.mockResolvedValue(725)
  await expect(loadPrepMarketData('QQQ')).rejects.toThrow('session failed')
})
