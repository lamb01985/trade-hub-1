// ─────────────────────────────────────────────────────────────────────────────
// Server-side trade sync helpers. Persists fills + trades in Upstash Redis,
// resolves the operator session for the cron path, and wraps the pure sync
// core in IO. The pure logic itself lives in src/lib/tradeSyncCore.js so
// vitest can exercise it without touching KV.
//
// KV layout:
//   trades:<sessionId>          JSON-encoded Trade[]
//   fills:<sessionId>           JSON-encoded Fill[]
//   tradesync:meta:<sessionId>  { lastSyncAt, lastSyncError }
//
// The session id is whatever the operator's Schwab OAuth flow produced
// originally and which now indexes their tokens in schwab:tokens:<sessionId>.
// The cron path uses OPERATOR_SESSION_ID from env to pick a specific operator
// without a browser cookie. For single-operator deployments this is the
// session id you saw printed by the Schwab connect flow.
// ─────────────────────────────────────────────────────────────────────────────

import { Redis } from '@upstash/redis'
import { getValidTokens } from './schwab.js'

let _redis = null
function kv() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

const KEY_FILLS = (sid) => `fills:${sid}`
const KEY_TRADES = (sid) => `trades:${sid}`
const KEY_META = (sid) => `tradesync:meta:${sid}`

// Operator session for the cron. Throws clearly if not configured so the cron
// invocation fails loudly instead of silently returning zero. Same pattern
// the schwab.js shared lib uses for SCHWAB_APP_KEY etc.
export function operatorSessionId() {
  const sid = process.env.OPERATOR_SESSION_ID
  if (!sid) {
    const err = new Error('OPERATOR_SESSION_ID is not set on the server')
    err.code = 'operator_session_missing'
    err.statusCode = 500
    throw err
  }
  return sid
}

// Confirms the configured operator session still has live Schwab tokens.
// getValidTokens auto-refreshes if the access token is within 5 min of
// expiry. Throws (loudly, with .code) when the refresh token itself is
// expired and manual reauth is required, which is what the spec wants the
// cron to fail on rather than silently no-op.
export async function ensureOperatorTokens(sessionId) {
  return getValidTokens(sessionId)
}

export async function loadStoredFills(sessionId) {
  const raw = await kv().get(KEY_FILLS(sessionId))
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export async function loadStoredTrades(sessionId) {
  const raw = await kv().get(KEY_TRADES(sessionId))
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

export async function persistSyncResult(sessionId, { mergedFills, trades, summary }) {
  const at = new Date().toISOString()
  await Promise.all([
    kv().set(KEY_FILLS(sessionId), JSON.stringify(mergedFills)),
    kv().set(KEY_TRADES(sessionId), JSON.stringify(trades)),
    kv().set(KEY_META(sessionId), JSON.stringify({ lastSyncAt: at, lastSyncError: null, summary })),
  ])
  return { at, summary }
}

export async function recordSyncError(sessionId, err) {
  const at = new Date().toISOString()
  const payload = {
    lastSyncAt: at,
    lastSyncError: { code: err?.code || 'unknown', message: err?.message || 'sync failed' },
  }
  await kv().set(KEY_META(sessionId), JSON.stringify(payload))
  return payload
}

export async function loadSyncMeta(sessionId) {
  const raw = await kv().get(KEY_META(sessionId))
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}

// Authorization helper for the sync endpoint. Returns the sessionId to act
// on, or throws with .statusCode set so the endpoint can return the right
// HTTP code. Order of precedence:
//   1. CRON_SECRET bearer header → operator session id from env.
//   2. Schwab session cookie (browser-driven manual button).
// This way the cron path and the manual UI path share one endpoint without
// either leaking into the other.
export function resolveSyncCaller(req, getSessionId) {
  const auth = req.headers?.authorization || req.headers?.Authorization || ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return { sessionId: operatorSessionId(), caller: 'cron' }
  }
  const sid = getSessionId(req)
  if (sid) return { sessionId: sid, caller: 'browser' }
  const err = new Error('not_authorized')
  err.statusCode = 401
  err.code = 'not_authorized'
  throw err
}
