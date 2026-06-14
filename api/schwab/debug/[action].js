// /api/schwab/debug/[action]
//
// Debug-only Schwab endpoints, consolidated into one Vercel function so we
// stay under the Hobby plan's 12-function limit. Same dynamic-segment trick
// we used for api/schwab/auth/[action].js.
//
// Routes:
//   GET  /api/schwab/debug/whoami       Echo back the resolved session id
//                                       for the caller. Used to discover the
//                                       OPERATOR_SESSION_ID value to set in
//                                       Vercel env after a fresh Schwab
//                                       reconnect.
//
//   GET  /api/schwab/debug/orders-raw   Raw Schwab /orders response with
//                                       orderActivityCollection[]
//                                       .executionLegs[] intact, so the
//                                       sync adapter can be mapped against
//                                       authoritative per-execution fields.
//
// Auth: both routes share one guard. Two acceptance paths, in order:
//
//   1. X-Debug-Token header matching DEBUG_PASSTHROUGH_SECRET env var,
//      uses OPERATOR_SESSION_ID for the Schwab tokens. Convenient for
//      terminal curl since it skips the browser cookie dance. For whoami,
//      this path returns the operator session id directly.
//
//   2. Schwab session cookie (browser). For whoami, this returns the
//      session id the browser's cookie identifies.
//
// If DEBUG_PASSTHROUGH_SECRET is not set, the endpoint is disabled and
// returns 503. Keeps the debug surface off by default.

import { getSessionId, schwabFetch, getAccountHandle, sendError } from '../../_lib/schwab.js'
import { operatorSessionId } from '../../_lib/tradeSync.js'

function debugGuard(req) {
  const debugSecret = process.env.DEBUG_PASSTHROUGH_SECRET
  if (!debugSecret) {
    const err = new Error('debug endpoints disabled: DEBUG_PASSTHROUGH_SECRET is not set on the server')
    err.statusCode = 503
    err.code = 'debug_disabled'
    throw err
  }
  return debugSecret
}

function resolveCaller(req, debugSecret) {
  const debugHeader = req.headers?.['x-debug-token'] || req.headers?.['X-Debug-Token']
  if (debugHeader && debugHeader === debugSecret) {
    let opSid = null
    try { opSid = operatorSessionId() } catch { opSid = null }
    return { sessionId: opSid, caller: 'debug', operatorSessionConfigured: !!opSid }
  }
  const sid = getSessionId(req)
  if (sid) return { sessionId: sid, caller: 'browser', operatorSessionConfigured: null }
  const err = new Error('not_authorized')
  err.statusCode = 401
  err.code = 'not_authorized'
  throw err
}

function startOfTodayUtc() {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
}

function endOfTodayUtc() {
  return `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`
}

async function handleWhoami(req, res, { sessionId, caller, operatorSessionConfigured }) {
  // For the debug-token path, sessionId comes from OPERATOR_SESSION_ID. If
  // that env var is also unset we still surface the caller path so the user
  // can see they need to set OPERATOR_SESSION_ID. For the browser path, the
  // sessionId is whatever the schwab_session cookie carries.
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    caller,
    sessionId,
    operatorSessionConfigured,
    hint: caller === 'browser'
      ? 'This is your live Schwab session id. Copy it into Vercel env as OPERATOR_SESSION_ID so the cron and the debug token path can act on your account.'
      : 'This is OPERATOR_SESSION_ID from the server env. If sessionId is null, set OPERATOR_SESSION_ID in Vercel env first.',
  })
}

async function handleOrdersRaw(req, res, { sessionId, caller }) {
  if (!sessionId) {
    const err = new Error('no session: set OPERATOR_SESSION_ID or call from a browser with the Schwab session cookie')
    err.statusCode = 401
    err.code = 'no_session'
    throw err
  }
  const q = req.query || {}
  const accountHash = q.accountHash || (await getAccountHandle(sessionId)).hash
  const from = q.from || startOfTodayUtc()
  const to = q.to || endOfTodayUtc()
  const status = q.status || 'FILLED'
  const maxResults = q.maxResults || 250

  const { data, warning } = await schwabFetch(sessionId, `/trader/v1/accounts/${accountHash}/orders`, {
    query: {
      fromEnteredTime: from,
      toEnteredTime: to,
      status,
      maxResults,
    },
  })

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    caller,
    accountHash,
    query: { from, to, status, maxResults },
    warning: warning || null,
    data,
  })
}

const ROUTES = {
  whoami: handleWhoami,
  'orders-raw': handleOrdersRaw,
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }
    const debugSecret = debugGuard(req)
    const action = String(req.query?.action || '').toLowerCase()
    const route = ROUTES[action]
    if (!route) {
      res.status(404).json({ error: 'unknown_debug_action', action, available: Object.keys(ROUTES) })
      return
    }
    const ctx = resolveCaller(req, debugSecret)
    await route(req, res, ctx)
  } catch (err) {
    sendError(res, err)
  }
}
