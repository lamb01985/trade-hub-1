// Shared WebSocket hub: Massive allows one stocks socket per key, so every
// MassiveStreamClient must ride a single underlying WebSocket.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sockets = []
class FakeWS {
  static OPEN = 1
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    sockets.push(this)
  }
  send(m) { this.sent.push(JSON.parse(m)) }
  close() { this.readyState = 3 }
  open() {
    this.readyState = 1
    this.onopen?.()
    this.onmessage?.({ data: JSON.stringify([{ ev: 'status', status: 'auth_success' }]) })
  }
  emit(msgs) { this.onmessage?.({ data: JSON.stringify(msgs) }) }
}

beforeEach(() => {
  sockets.length = 0
  vi.stubGlobal('WebSocket', FakeWS)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ apiKey: 'k' }) })))
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

const flush = () => new Promise(r => setTimeout(r, 0))

describe('MassiveStreamClient', () => {
  it('opens one socket for many clients and filters events per client', async () => {
    const { MassiveStreamClient } = await import('./massive.js')
    const a = { onTrade: vi.fn(), onConnected: vi.fn() }
    const b = { onTrade: vi.fn(), onConnected: vi.fn() }
    const ca = new MassiveStreamClient(a)
    const cb = new MassiveStreamClient(b)
    ca.connect(); cb.connect()
    ca.subscribe('QQQ'); cb.subscribe('NVDA'); cb.subscribe('QQQ')
    await flush()
    expect(sockets).toHaveLength(1)
    sockets[0].open()
    expect(a.onConnected).toHaveBeenCalled()
    expect(b.onConnected).toHaveBeenCalled()

    sockets[0].emit([{ ev: 'T', sym: 'NVDA', p: 190 }])
    expect(a.onTrade).not.toHaveBeenCalled()
    expect(b.onTrade).toHaveBeenCalledTimes(1)
  })

  it('keeps a ticker subscribed until the last client releases it', async () => {
    const { MassiveStreamClient } = await import('./massive.js')
    const ca = new MassiveStreamClient({})
    const cb = new MassiveStreamClient({})
    ca.connect(); cb.connect()
    ca.subscribe('QQQ'); cb.subscribe('QQQ')
    await flush()
    sockets[0].open()
    ca.disconnect()
    expect(sockets[0].sent.some(m => m.action === 'unsubscribe')).toBe(false)
    cb.unsubscribe('QQQ')
    expect(sockets[0].sent.some(m => m.action === 'unsubscribe' && m.params.includes('T.QQQ'))).toBe(true)
  })

  it('late joiner gets onConnected when the socket is already live', async () => {
    const { MassiveStreamClient } = await import('./massive.js')
    const first = new MassiveStreamClient({})
    first.connect()
    await flush()
    sockets[0].open()
    const late = { onConnected: vi.fn() }
    new MassiveStreamClient(late).connect()
    await flush()
    expect(late.onConnected).toHaveBeenCalledTimes(1)
    expect(sockets).toHaveLength(1)
  })
})
