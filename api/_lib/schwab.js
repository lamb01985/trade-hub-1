// Shared server-side Schwab helpers. Never bundled into the SPA.
//
// Responsibilities:
//   - KV access via @upstash/redis (Redis.fromEnv() reads KV_REST_API_URL +
//     KV_REST_API_TOKEN automatically)
//   - Signed HttpOnly session cookie (HMAC-SHA256 with SCHWAB_SESSION_SECRET)
//   - Fetch with 10s timeout and a single retry on 429 with backoff
//   - Refresh-before-call: if access token is within 5 min of expiry, refresh
//   - Sanitized error responses: { error, code } with appropriate status
//
// KV keys:
//   schwab:tokens:<sessionId>   { access_token, refresh_token, expires_at,
//                                  refresh_expires_at, account_hash,
//                                  account_number }
//   schwab:state:<state>        { sessionId, createdAt }    (TTL 600s)

import { Redis } from '@upstash/redis'
import crypto from 'node:crypto'

const SCHWAB_BASE = 'https://api.schwabapi.com'
const TOKEN_URL = `${SCHWAB_BASE}/v1/oauth/token`
const AUTHORIZE_URL = `${SCHWAB_BASE}/v1/oauth/authorize`

const ACCESS_TTL_MS = 30 * 60 * 1000          // 30 min per Schwab spec
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days per Schwab spec
const REFRESH_GUARD_MS = 5 * 60 * 1000         // refresh when < 5 min left
const REFRESH_WARN_MS = 24 * 60 * 60 * 1000    // warn when < 24 hr left
const SESSION_TTL_S = 7 * 24 * 60 * 60         // session cookie life = 7 days
const STATE_TTL_S = 600                        // OAuth state row life = 10 min
const FETCH_TIMEOUT_MS = 10_000

let _redis = null
function redis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

// ── Session cookie (signed, HttpOnly) ────────────────────────────────────────

function sessionSecret() {
  const s = process.env.SCHWAB_SESSION_SECRET
  if (!s) throw new Error('SCHWAB_SESSION_SECRET not set')
  return s
}

function signSession(sessionId) {
  const h = crypto.createHmac('sha256', sessionSecret()).update(sessionId).digest('hex')
  return `${sessionId}.${h}`
}

function verifySession(signed) {
  if (!signed || typeof signed !== 'string') return null
  const dot = signed.lastIndexOf('.')
  if (dot < 0) return null
  const sessionId = signed.slice(0, dot)
  const sig = signed.slice(dot + 1)
  const expected = crypto.createHmac('sha256', sessionSecret()).update(sessionId).digest('hex')
  if (sig.length !== expected.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null
  } catch { return null }
  return sessionId
}

function newSessionId() {
  return crypto.randomBytes(32).toString('hex')
}

function parseCookies(header) {
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

export function getSessionId(req) {
  const cookies = parseCookies(req.headers?.cookie || '')
  const raw = cookies['th_sess']
  if (!raw) return null
  return verifySession(raw)
}

export function setSessionCookie(res, sessionId) {
  const value = signSession(sessionId)
  res.setHeader('Set-Cookie', [
    `th_sess=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL_S}`,
  ].join('; '))
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    'th_sess=',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ].join('; '))
}

export function ensureSessionId(req, res) {
  let sid = getSessionId(req)
  if (sid) return sid
  sid = newSessionId()
  setSessionCookie(res, sid)
  return sid
}

// ── KV: state (CSRF) and tokens ──────────────────────────────────────────────

export async function saveOAuthState(state, sessionId) {
  await redis().set(`schwab:state:${state}`, { sessionId, createdAt: Date.now() }, { ex: STATE_TTL_S })
}

export async function consumeOAuthState(state) {
  const key = `schwab:state:${state}`
  const value = await redis().get(key)
  if (value) await redis().del(key)
  return value
}

export async function loadTokens(sessionId) {
  if (!sessionId) return null
  const value = await redis().get(`schwab:tokens:${sessionId}`)
  return value || null
}

export async function saveTokens(sessionId, tokens) {
  await redis().set(`schwab:tokens:${sessionId}`, tokens, { ex: SESSION_TTL_S })
}

export async function deleteTokens(sessionId) {
  if (!sessionId) return
  await redis().del(`schwab:tokens:${sessionId}`)
}

// ── HTTP: timeout + 429 retry ────────────────────────────────────────────────

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function fetchWithRetry(url, opts) {
  let res = await fetchWithTimeout(url, opts)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '1', 10)
    const wait = Math.min(Math.max(retryAfter * 1000, 500), 4000)
    await new Promise(r => setTimeout(r, wait))
    res = await fetchWithTimeout(url, opts)
  }
  return res
}

// ── OAuth: code exchange and refresh ─────────────────────────────────────────

function basicAuth() {
  const key = process.env.SCHWAB_APP_KEY
  const secret = process.env.SCHWAB_APP_SECRET
  if (!key || !secret) throw new Error('SCHWAB_APP_KEY / SCHWAB_APP_SECRET not set')
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
}

export function callbackUrl() {
  const u = process.env.SCHWAB_CALLBACK_URL
  if (!u) throw new Error('SCHWAB_CALLBACK_URL not set')
  return u
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SCHWAB_APP_KEY || '',
    redirect_uri: callbackUrl(),
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(),
  })
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`Schwab token exchange failed (${res.status})`)
    err.status = res.status
    err.code = 'EXCHANGE_FAILED'
    throw err
  }
  const data = JSON.parse(text)
  const now = Date.now()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: now + (data.expires_in || 1800) * 1000,
    refresh_expires_at: now + REFRESH_TTL_MS,
  }
}

async function refreshAccess(refreshToken) {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = new Error(`Schwab refresh failed (${res.status})`)
    err.status = res.status
    err.code = 'REFRESH_FAILED'
    throw err
  }
  const data = await res.json()
  const now = Date.now()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: now + (data.expires_in || 1800) * 1000,
  }
}

// Returns { tokens, warning } where warning is set if the refresh token is
// within 24 hr of its 7-day life. Throws { code: NOT_CONNECTED } when there
// are no tokens, and { code: REFRESH_EXPIRED } when the refresh token life
// is already past (reconnect required).
export async function getValidTokens(sessionId) {
  const tokens = await loadTokens(sessionId)
  if (!tokens) {
    const err = new Error('Not connected to Schwab')
    err.status = 401
    err.code = 'NOT_CONNECTED'
    throw err
  }
  const now = Date.now()
  if (tokens.refresh_expires_at && tokens.refresh_expires_at <= now) {
    await deleteTokens(sessionId)
    const err = new Error('Schwab refresh token expired, reconnect required')
    err.status = 401
    err.code = 'REFRESH_EXPIRED'
    throw err
  }

  let next = tokens
  if (!tokens.expires_at || tokens.expires_at - now < REFRESH_GUARD_MS) {
    const fresh = await refreshAccess(tokens.refresh_token)
    next = {
      ...tokens,
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: fresh.expires_at,
    }
    await saveTokens(sessionId, next)
  }

  const refreshMsLeft = (next.refresh_expires_at || 0) - now
  const warning = refreshMsLeft > 0 && refreshMsLeft < REFRESH_WARN_MS
    ? `Schwab refresh token expires in ${Math.max(1, Math.round(refreshMsLeft / (60 * 60 * 1000)))} hours, reconnect soon.`
    : null

  return { tokens: next, warning }
}

// ── Authenticated Schwab call ────────────────────────────────────────────────

export async function schwabFetch(sessionId, path, { method = 'GET', query, body } = {}) {
  const { tokens, warning } = await getValidTokens(sessionId)
  let url = SCHWAB_BASE + path
  if (query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') qs.set(k, String(v))
    }
    const q = qs.toString()
    if (q) url += (path.includes('?') ? '&' : '?') + q
  }
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
    },
  }
  if (body && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetchWithRetry(url, opts)
  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!res.ok) {
    const err = new Error(`Schwab ${path} failed (${res.status})`)
    err.status = res.status === 401 ? 401 : 502
    err.code = res.status === 429 ? 'RATE_LIMITED' : res.status === 401 ? 'TOKEN_REJECTED' : 'UPSTREAM_ERROR'
    err.upstreamStatus = res.status
    throw err
  }
  return { data, tokens, warning }
}

// Fetches accountHash + accountNumber for the user's first Schwab account.
// Cached on the token row so we don't ping Schwab on every account call.
export async function getAccountHandle(sessionId) {
  const { tokens, warning } = await getValidTokens(sessionId)
  if (tokens.account_hash) return { hash: tokens.account_hash, number: tokens.account_number, warning }
  const { data } = await schwabFetch(sessionId, '/trader/v1/accounts/accountNumbers')
  const first = Array.isArray(data) ? data[0] : null
  if (!first?.hashValue) {
    const err = new Error('Schwab returned no accounts')
    err.status = 502
    err.code = 'NO_ACCOUNT'
    throw err
  }
  const updated = { ...tokens, account_hash: first.hashValue, account_number: first.accountNumber }
  await saveTokens(sessionId, updated)
  return { hash: first.hashValue, number: first.accountNumber, warning }
}

// ── Error → response helper ──────────────────────────────────────────────────

export function sendError(res, err) {
  const status = err?.status || 500
  const code = err?.code || 'INTERNAL_ERROR'
  const message = err?.message || 'Internal error'
  res.status(status).json({ error: message, code })
}

// Convenience: wraps a handler with try/catch + JSON error shape.
export function withErrors(handler) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      sendError(res, err)
    }
  }
}
