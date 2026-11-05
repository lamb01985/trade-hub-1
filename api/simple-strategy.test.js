import { beforeEach, describe, expect, it, vi } from 'vitest'
const { get, set, polygonFetch, phoneFetch } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), polygonFetch: vi.fn(), phoneFetch: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({ get, set }) } }))
vi.mock('./_lib/polygon.js', () => ({ polygonFetch }))
vi.mock('./_lib/access.js', () => ({ privateResponse: vi.fn(), requireOperator: vi.fn().mockResolvedValue('operator'), sendFailure: (res) => res.status(401).json({error:'operator_login_required'}), reserve: vi.fn().mockResolvedValue(true) }))
import handler from './simple-strategy.js'
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() } }
beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks(); vi.stubGlobal('fetch', phoneFetch)
  get.mockResolvedValue(null); set.mockResolvedValue('OK')
})
describe('strategy worker access and readiness', () => {
  it('returns missing configuration without sending or exposing secrets', async () => {
    vi.stubEnv('CRON_SECRET', 'private-secret')
    const res = response()
    await handler({ method: 'GET', query: { mode: 'status' }, headers: {} }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-secret')
    expect(phoneFetch).not.toHaveBeenCalled()
  })
  it('rejects unauthorized checks and tests before any provider call', async () => {
    for (const [mode, method] of [['check', 'GET'], ['test', 'POST']]) {
      const res = response()
      await handler({ method, query: { mode }, headers: {} }, res)
      expect(res.status).toHaveBeenCalledWith(401)
    }
    expect(polygonFetch).not.toHaveBeenCalled(); expect(phoneFetch).not.toHaveBeenCalled()
  })
  it('keeps enabled monitoring off without full configuration', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    const res = response()
    await handler({ method: 'GET', query: { mode: 'check' }, headers: { authorization: 'Bearer secret' } }, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(phoneFetch).not.toHaveBeenCalled()
  })
  it('uses a fixed test recipient and requests audible delivery', async () => {
    for (const [key, value] of Object.entries({ CRON_SECRET: 'secret', TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: 'verified-chat', UPSTASH_REDIS_REST_URL: 'url', UPSTASH_REDIS_REST_TOKEN: 'token' })) vi.stubEnv(key, value)
    phoneFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const res = response()
    await handler({ method: 'POST', query: { mode: 'test' }, headers: { authorization: 'Bearer secret' }, body: { chatId: 'attacker', message: 'arbitrary' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const sent = JSON.parse(phoneFetch.mock.calls[0][1].body)
    expect(sent.chat_id).toBe('verified-chat'); expect(sent.disable_notification).toBe(false)
    expect(sent.text).not.toBe('arbitrary')
  })
})
