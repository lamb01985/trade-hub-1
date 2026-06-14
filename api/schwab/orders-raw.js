// GET /api/schwab/orders-raw
//
// Debug passthrough that returns the raw Schwab /orders response with
// orderActivityCollection[].executionLegs[] intact, so the sync adapter can
// be mapped against authoritative per-execution fields (price, time,
// quantity per partial fill) instead of the flattened shape that
// /api/schwab/orders returns for the UI.
//
// Guarded by a debug header. Two auth paths, in order:
//
//   1. X-Debug-Token header matching DEBUG_PASSTHROUGH_SECRET env var
//      uses OPERATOR_SESSION_ID for the Schwab tokens. Convenient for
//      terminal curl since it bypasses the browser session cookie.
//
//   2. Schwab session cookie (browser-driven) uses whatever session the
//      cookie identifies. Same auth path as the rest of api/schwab/*.
//
// If DEBUG_PASSTHROUGH_SECRET is not set on the server, the endpoint is
// disabled and returns 503. This keeps the raw passthrough off by default
// and means a deploy without the env var refuses to leak unsanitized
// Schwab payloads even if the URL is hit.
//
// Query params:
//   from         ISO datetime, default = start of today UTC
//   to           ISO datetime, default = end of today UTC
//   status       default = FILLED
//   maxResults   default = 250
//   accountHash  optional override; default = first account on the session
//
// Once the adapter mapping is locked in (Phase 2), this endpoint can stay
// around for future debugging or be removed in favor of the production
// /api/schwab/sync flow.

import { getSessionId, schwabFetch, getAccountHandle, sendError } from '../_lib/schwab.js'
import { operatorSessionId } from '../_lib/tradeSync.js'

function resolveCaller(req) {
  const debugSecret = process.env.DEBUG_PASSTHROUGH_SECRET
  if (!debugSecret) {
    const err = new Error('orders-raw is disabled: DEBUG_PASSTHROUGH_SECRET is not set on the server')
    err.statusCode = 503
    err.code = 'debug_disabled'
    throw err
  }
  const debugHeader = req.headers?.['x-debug-token'] || req.headers?.['X-Debug-Token']
  if (debugHeader && debugHeader === debugSecret) {
    return { sessionId: operatorSessionId(), caller: 'debug' }
  }
  const sid = getSessionId(req)
  if (sid) return { sessionId: sid, caller: 'browser' }
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

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' })
      return
    }
    const { sessionId, caller } = resolveCaller(req)

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
  } catch (err) {
    sendError(res, err)
  }
}
