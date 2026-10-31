import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { Redis } from '@upstash/redis'

const scrypt = promisify(crypto.scrypt)
const SESSION_SECONDS = 8 * 60 * 60
const LOGIN_WINDOW_SECONDS = 15 * 60
const MAX_LOGIN_ATTEMPTS = 10
const COOKIE = 'th_operator'
let redis
const memory = new Map()
export function localMode() {
  if (process.env.NODE_ENV !== 'development' || !['TRADEHUB_LOCAL_PREVIEW', 'TRADEHUB_LOCAL_AUTH'].some(key => process.env[key] === 'true')) return false
  try {
    const origin = new URL(process.env.TRADEHUB_APP_ORIGIN)
    return origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && origin.origin === process.env.TRADEHUB_APP_ORIGIN
  } catch { return false }
}
export class AccessError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
function store() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new AccessError(503, 'access_store_unconfigured')
  return redis ||= Redis.fromEnv()
}
export async function stateGet(key) {
  if (!localMode()) return store().get(key)
  const row = memory.get(key)
  if (!row || row.expires <= Date.now()) { memory.delete(key); return null }
  return row.value
}
export async function stateSet(key, value, seconds) {
  if (!localMode()) return store().set(key, value, { ex: seconds })
  memory.set(key, { value, expires: Date.now() + seconds * 1000 })
}
export async function stateDelete(key) {
  if (!localMode()) return store().del(key)
  memory.delete(key)
}
// One atomic reservation survives cold starts and concurrent serverless requests.
export async function reserve(key, amount, ceiling, seconds) {
  if (localMode()) {
    const entry = memory.get(key)
    const current = entry && entry.expires > Date.now() ? entry.value : 0
    if (current + amount > ceiling) return false
    memory.set(key, { value: current + amount, expires: entry && entry.expires > Date.now() ? entry.expires : Date.now() + seconds * 1000 })
    return true
  }
  const script = `local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n+tonumber(ARGV[1])>tonumber(ARGV[2]) then return 0 end; redis.call('INCRBY',KEYS[1],ARGV[1]); if n==0 then redis.call('EXPIRE',KEYS[1],ARGV[3]) end; return 1`
  return Number(await store().eval(script, [key], [amount, ceiling, seconds])) === 1
}
export function privateResponse(res) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Vary', 'Cookie')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}
export function requireOrigin(req) {
  const expected = process.env.TRADEHUB_APP_ORIGIN
  if (!expected || req.headers?.origin !== expected) throw new AccessError(403, 'origin_not_allowed')
  if (!localMode() && !expected.startsWith('https://')) throw new AccessError(503, 'secure_origin_required')
}
function sessionKey(id) { return `th:operator:session:${crypto.createHash('sha256').update(id).digest('hex')}` }
function cookieId(req) {
  const part = (req.headers?.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))
  const id = part?.slice(COOKIE.length + 1)
  return /^[a-f0-9]{64}$/.test(id || '') ? id : null
}
export async function requireOperator(req) {
  const id = cookieId(req)
  if (!id) throw new AccessError(401, 'operator_login_required')
  const session = await stateGet(sessionKey(id))
  if (!session || !process.env.TRADEHUB_OPERATOR_ID || session.operator !== process.env.TRADEHUB_OPERATOR_ID) throw new AccessError(403, 'operator_not_authorized')
  return session.operator
}
export async function login(req, res, password) {
  requireOrigin(req)
  // Global attempts cap prevents IP-header spoofing from bypassing the single-operator guard.
  if (!await reserve('th:operator:login-attempts', 1, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_SECONDS)) throw new AccessError(429, 'login_rate_limited')
  const configured = process.env.TRADEHUB_OPERATOR_PASSWORD_HASH || ''
  const [salt, hash] = configured.split(':')
  if (!process.env.TRADEHUB_OPERATOR_ID || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) throw new AccessError(503, 'operator_login_unconfigured')
  if (typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password) > 256) throw new AccessError(400, 'invalid_login')
  const candidate = await scrypt(password, salt, 64)
  if (!crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'))) throw new AccessError(401, 'invalid_login')
  const id = crypto.randomBytes(32).toString('hex')
  await stateSet(sessionKey(id), { operator: process.env.TRADEHUB_OPERATOR_ID }, SESSION_SECONDS)
  res.setHeader('Set-Cookie', `${COOKIE}=${id}; HttpOnly; ${localMode() ? '' : 'Secure; '}SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`)
}
export async function logout(req, res) {
  requireOrigin(req)
  const id = cookieId(req)
  if (id) await stateDelete(sessionKey(id))
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; ${localMode() ? '' : 'Secure; '}SameSite=Strict; Path=/; Max-Age=0`)
}
export function sendFailure(res, error) {
  const status = error instanceof AccessError ? error.status : 503
  if (status === 401 || status === 403) res.setHeader('X-TradeHub-Auth-Required', 'true')
  if (status === 429) res.setHeader('Retry-After', '60')
  res.status(status).json({ error: error instanceof AccessError ? error.code : 'service_unavailable' })
}
export function jsonBody(req, maxBytes) {
  if (!String(req.headers?.['content-type'] || '').startsWith('application/json')) throw new AccessError(415, 'json_required')
  let raw
  try { raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}) } catch { throw new AccessError(400, 'invalid_json') }
  if (Buffer.byteLength(raw) > maxBytes) throw new AccessError(413, 'input_too_large')
  try { return JSON.parse(raw) } catch { throw new AccessError(400, 'invalid_json') }
}
