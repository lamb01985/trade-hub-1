// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
let client
const reply = (status, data = {}, auth = false) => ({
  ok: status === 200, status,
  headers: { get: name => name === 'X-TradeHub-Auth-Required' && auth ? 'true' : null },
  json: async () => data, text: async () => 'denied',
})
const logout = () => window.dispatchEvent(new Event('tradehub-operator-logout'))
beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn())
  client = await import('../src/lib/massive.js')
})
afterEach(() => { logout(); vi.unstubAllGlobals() })
it('handles application 403 as expiry without retries or provider denial', async () => {
  const expired = vi.fn()
  window.addEventListener('tradehub-operator-expired', expired, { once: true })
  fetch.mockResolvedValue(reply(403, {}, true))
  await expect(client.getSnapshot('AAA')).rejects.toMatchObject({ authRequired: true })
  expect(expired).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(client.listUnavailableEndpoints()).toEqual([])
  fetch.mockResolvedValue(reply(200, { ticker: { price: 10 } }))
  await expect(client.getSnapshot('AAA')).resolves.toEqual({ price: 10 })
})
it('limits provider denial to its route family and clears it on logout', async () => {
  fetch.mockResolvedValueOnce(reply(403)).mockResolvedValue(reply(200, { results: { p: 9 } }))
  await expect(client.getSnapshot('AAA')).rejects.toMatchObject({ unavailable: true })
  await expect(client.getSnapshot('BBB')).rejects.toMatchObject({ unavailable: true })
  expect(fetch).toHaveBeenCalledTimes(1)
  await expect(client.getLastTrade('AAA')).resolves.toBe(9)
  logout()
  fetch.mockResolvedValue(reply(200, { ticker: { price: 11 } }))
  await expect(client.getSnapshot('AAA')).resolves.toEqual({ price: 11 })
})
it.each([200, 403])('rejects delayed %s after logout without poisoning next session', async status => {
  let resolve
  fetch.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const pending = client.getSnapshot('AAA')
  const rejected = expect(pending).rejects.toMatchObject({ sessionChanged: true })
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  logout()
  resolve(reply(status, { ticker: { stale: true } }, status === 403))
  await rejected
  expect(client.listUnavailableEndpoints()).toEqual([])
  fetch.mockResolvedValue(reply(200, { ticker: { fresh: true } }))
  await expect(client.getSnapshot('AAA')).resolves.toEqual({ fresh: true })
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('does not cache a body that completes after session invalidation', async () => {
  let resolveBody
  fetch.mockResolvedValue(reply(200))
  fetch.mockResolvedValueOnce({ ...reply(200), json: () => new Promise(r => { resolveBody = r }) })
  const pending = client.getSnapshot('AAA')
  const rejected = expect(pending).rejects.toMatchObject({ sessionChanged: true })
  await vi.waitFor(() => expect(resolveBody).toBeTypeOf('function'))
  logout()
  resolveBody({ ticker: { stale: true } })
  await rejected
  fetch.mockResolvedValue(reply(200, { ticker: { fresh: true } }))
  await expect(client.getSnapshot('AAA')).resolves.toEqual({ fresh: true })
})

it('cancels a scheduled retry across logout', async () => {
  vi.useFakeTimers()
  try {
    fetch.mockResolvedValue(reply(429))
    const pending = client.getDayBars('AAA', '2026-01-01', '2026-01-02', { priority: true, fresh: true })
    const rejected = expect(pending).rejects.toMatchObject({ sessionChanged: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    logout()
    await vi.advanceTimersByTimeAsync(2000)
    await rejected
    expect(fetch).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})
it('expires shared REST transport and never creates a provider socket for its denial', async () => {
  const Socket = vi.fn()
  vi.stubGlobal('WebSocket', Socket)
  const expired = vi.fn()
  window.addEventListener('tradehub-operator-expired', expired, { once: true })
  fetch.mockResolvedValue(reply(401, {}, true))
  const stream = new client.MassiveStreamClient({})
  stream.connect()
  stream.subscribe('QQQ')
  await vi.waitFor(() => expect(expired).toHaveBeenCalledTimes(1))
  expect(Socket).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledTimes(1)
  stream.disconnect()
})
