import { Readable } from 'node:stream'
import crypto from 'node:crypto'
import { login } from '../api/_lib/access.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createApiMiddleware, loadServerEnv, localApiPlugin, resolveApiRoute } from '../scripts/vite-api.mjs'
import proxy from '../api/polygon/proxy.js'
import wsAuth from '../api/polygon/ws-auth.js'
import intelligence from '../api/intelligence/[action].js'

const directories = []
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
async function request(middleware, url, { method = 'GET', body = '', headers = {} } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : [])
  Object.assign(req, { url, method, headers: { host: '127.0.0.1:5173', ...headers } })
  const res = {
    statusCode: 200, headers: {}, writableEnded: false,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value },
    end(value = '') { this.text = String(value); this.writableEnded = true },
  }
  const next = vi.fn()
  await middleware(req, res, next)
  return { ...res, next, json: res.text ? JSON.parse(res.text) : undefined }
}

it('maps static routes before dynamic routes and never serves API source/helper files', () => {
  expect(resolveApiRoute('/api/schwab/orders').file).toBe('/api/schwab/orders.js')
  expect(resolveApiRoute('/api/schwab/quote')).toEqual({ file: '/api/schwab/[resource].js', params: { resource: 'quote' } })
  expect(resolveApiRoute('/api/schwab/auth/callback').params).toEqual({ action: 'callback' })
  expect(resolveApiRoute('/api/schwab/debug/whoami').params).toEqual({ action: 'whoami' })
  for (const route of ['/api/polygon/ws-auth.js', '/api/_lib/polygon.js', '/api/../package.json']) expect(resolveApiRoute(route)).toBeNull()
})

it('passes query, dynamic parameters and JSON bodies to the handler', async () => {
  const load = vi.fn(async () => ({ default: (req, res) => res.status(201).json({ query: req.query, body: req.body }) }))
  const result = await request(createApiMiddleware(load), '/api/ai/brief?action=other&tag=a&tag=b', {
    method: 'POST', body: '{"prompt":"test"}', headers: { 'content-type': 'application/json' },
  })
  expect(load).toHaveBeenCalledWith('/api/ai/[action].js')
  expect(result.statusCode).toBe(201)
  expect(result.json).toEqual({ query: { action: 'brief', tag: ['a', 'b'] }, body: { prompt: 'test' } })
  expect(result.headers['content-type']).toContain('application/json')
})

it('returns JSON 404s for unknown API routes while leaving SPA navigation to Vite', async () => {
  const load = vi.fn()
  const middleware = createApiMiddleware(load)
  for (const url of ['/api', '/api/unknown', '/api/polygon/ws-auth.js', '/api/_lib/polygon.js']) {
    const result = await request(middleware, url)
    expect(result.statusCode).toBe(404)
    expect(result.json.error).toBe('api_route_not_found')
    expect(result.next).not.toHaveBeenCalled()
  }
  expect((await request(middleware, '/plan')).next).toHaveBeenCalled()
  expect(load).not.toHaveBeenCalled()
})

it('bounds and validates input, rejects foreign hosts/origins, and hides loader errors', async () => {
  const load = vi.fn(async () => { throw new Error('synthetic-sensitive-value') })
  const middleware = createApiMiddleware(load)
  expect((await request(middleware, '/api/ai/brief', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } })).statusCode).toBe(400)
  expect((await request(middleware, '/api/ai/brief', { method: 'POST', body: 'a'.repeat(40_001) })).statusCode).toBe(413)
  expect((await request(middleware, '/api/polygon/ws-auth', { headers: { host: 'other.test' } })).statusCode).toBe(403)
  expect((await request(middleware, '/api/polygon/ws-auth', { headers: { origin: 'https://other.test' } })).statusCode).toBe(403)
  const failure = await request(middleware, '/api/polygon/ws-auth')
  expect(failure.json).toEqual({ error: 'local_api_unavailable' })
  expect(failure.text).not.toContain('synthetic-sensitive-value')
})

it('runs real market handlers with explicit missing-key JSON and preserves upstream status/JSON', async () => {
  vi.stubEnv('POLYGON_API_KEY', '')
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('TRADEHUB_LOCAL_AUTH', 'true')
  vi.stubEnv('TRADEHUB_APP_ORIGIN', 'http://127.0.0.1:5173')
  vi.stubEnv('TRADEHUB_OPERATOR_ID', 'synthetic-local-operator')
  const salt = 'b'.repeat(32)
  vi.stubEnv('TRADEHUB_OPERATOR_PASSWORD_HASH', `${salt}:${crypto.scryptSync('synthetic-password', salt, 64).toString('hex')}`)
  const cookieResponse = { setHeader(k, v) { this[k] = v } }
  await login({ headers: { origin: 'http://127.0.0.1:5173' } }, cookieResponse, 'synthetic-password')
  const cookie = cookieResponse['Set-Cookie'].split(';')[0]
  const headers = { cookie }
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const middleware = createApiMiddleware(async file => ({ default: file.endsWith('/proxy.js') ? proxy : wsAuth }))
  const missing = await request(middleware, '/api/polygon/proxy?path=%2Fv2%2Flast%2Ftrade%2FQQQ', { headers })
  expect(missing.statusCode).toBe(503)
  expect(missing.json.error).toBe('env_missing')
  expect((await request(middleware, '/api/polygon/ws-auth', { headers })).statusCode).toBe(410)
  expect(fetch).not.toHaveBeenCalled()
  vi.stubEnv('POLYGON_API_KEY', 'synthetic-test-only')
  fetch.mockResolvedValue({ status: 200, text: async () => '{"results":{"p":123}}', headers: new Headers({ 'content-type': 'application/json' }) })
  const success = await request(middleware, '/api/polygon/proxy?path=%2Fv2%2Flast%2Ftrade%2FQQQ', { headers })
  expect(success.json).toEqual({ results: { p: 123 } })
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get('apiKey')).toBe('synthetic-test-only')
  expect(success.text).not.toContain('synthetic-test-only')
  fetch.mockResolvedValue({ status: 403, text: async () => '{"status":"NOT_AUTHORIZED"}', headers: new Headers({ 'content-type': 'application/json' }) })
  expect((await request(middleware, '/api/polygon/proxy?path=%2Fv2%2Flast%2Ftrade%2FQQQ', { headers })).statusCode).toBe(403)
})

it('keeps protected handlers protected and reports configuration without values', async () => {
  const middleware = createApiMiddleware(async () => ({ default: intelligence }), { POLYGON_API_KEY: 'synthetic-private-value' })
  expect((await request(middleware, '/api/intelligence/latest')).statusCode).toBe(401)
  const status = await request(middleware, '/api/dev/status')
  expect(status.json.massive).toEqual({ configured: true, variable: 'POLYGON_API_KEY', aliasOnly: false })
  expect(status.text).not.toContain('synthetic-private-value')
})

it('loads server-only .env.local configuration without overwriting shell values', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'tradehub-env-test-'))
  directories.push(directory)
  writeFileSync(path.join(directory, '.env.local'), 'POLYGON_API_KEY=synthetic-file-only\nSCHWAB_APP_KEY=synthetic-broker\nVITE_UNRELATED=test\n')
  const target = { POLYGON_API_KEY: 'synthetic-shell-only' }
  loadServerEnv('development', directory, target)
  expect(target).toMatchObject({ POLYGON_API_KEY: 'synthetic-shell-only', SCHWAB_APP_KEY: 'synthetic-broker' })
  expect(target).not.toHaveProperty('VITE_UNRELATED')
})

it('does not take over historical preview or native Vercel routing', () => {
  const server = { middlewares: { use: vi.fn() } }
  vi.stubEnv('TRADEHUB_LOCAL_PREVIEW', 'true')
  localApiPlugin().configureServer(server)
  vi.stubEnv('TRADEHUB_LOCAL_PREVIEW', '')
  vi.stubEnv('VERCEL', '1')
  localApiPlugin().configureServer(server)
  expect(server.middlewares.use).not.toHaveBeenCalled()
  expect(localApiPlugin().apply).toBe('serve')
})
