// Consolidated Schwab OAuth handler. One file = one serverless function on
// Vercel, which keeps us under the Hobby plan's 12-function limit.
//
// Routes via the [action] path segment so the existing URLs continue to work
// untouched:
//   GET  /api/schwab/auth/login       → start OAuth, 302 to Schwab
//   GET  /api/schwab/auth/callback    → OAuth return, exchange code, 302 to SPA
//   GET|POST /api/schwab/auth/refresh → token freshness info (auto-refresh on call)
//   POST /api/schwab/auth/disconnect  → drop tokens, clear session cookie
//
// This preserves the Schwab developer-portal-registered callback URL and the
// SCHWAB_CALLBACK_URL env var, so no Schwab re-approval is required.

import crypto from 'node:crypto'
import {
  ensureSessionId,
  getSessionId,
  saveOAuthState,
  consumeOAuthState,
  authorizeUrl,
  exchangeCode,
  saveTokens,
  getValidTokens,
  deleteTokens,
  clearSessionCookie,
  sendError,
} from '../../_lib/schwab.js'

function redirectAfterAuth() {
  return process.env.SCHWAB_REDIRECT_AFTER_AUTH || '/'
}

function redirectWithError(res, code) {
  const url = redirectAfterAuth()
  const sep = url.includes('?') ? '&' : '?'
  res.writeHead(302, { Location: `${url}${sep}schwab_error=${encodeURIComponent(code)}` })
  res.end()
}

async function handleLogin(req, res) {
  const sessionId = ensureSessionId(req, res)
  const state = crypto.randomBytes(16).toString('hex')
  await saveOAuthState(state, sessionId)
  res.setHeader('Cache-Control', 'no-store')
  res.writeHead(302, { Location: authorizeUrl(state) })
  res.end()
}

async function handleCallback(req, res) {
  try {
    const { code, state, error } = req.query || {}
    if (error) return redirectWithError(res, String(error))
    if (!code || !state) return redirectWithError(res, 'missing_code_or_state')

    const sessionId = getSessionId(req)
    if (!sessionId) return redirectWithError(res, 'no_session')

    const stateRow = await consumeOAuthState(String(state))
    if (!stateRow || stateRow.sessionId !== sessionId) {
      return redirectWithError(res, 'state_mismatch')
    }

    const tokens = await exchangeCode(String(code))
    await saveTokens(sessionId, tokens)

    res.setHeader('Cache-Control', 'no-store')
    const url = redirectAfterAuth()
    const sep = url.includes('?') ? '&' : '?'
    res.writeHead(302, { Location: `${url}${sep}schwab_connected=1` })
    res.end()
  } catch (err) {
    return redirectWithError(res, err?.code || 'callback_failed')
  }
}

async function handleRefresh(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }
  const sessionId = getSessionId(req)
  const { tokens, warning } = await getValidTokens(sessionId)
  const now = Date.now()
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    expiresInMs: Math.max(0, (tokens.expires_at || 0) - now),
    refreshExpiresInMs: Math.max(0, (tokens.refresh_expires_at || 0) - now),
    warning,
  })
}

async function handleDisconnect(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }
  const sessionId = getSessionId(req)
  if (sessionId) await deleteTokens(sessionId)
  clearSessionCookie(res)
  res.status(200).json({ ok: true })
}

const ACTIONS = {
  login: handleLogin,
  callback: handleCallback,
  refresh: handleRefresh,
  disconnect: handleDisconnect,
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase()
  const fn = ACTIONS[action]
  if (!fn) {
    res.status(404).json({ error: 'unknown_action', action })
    return
  }
  try {
    await fn(req, res)
  } catch (err) {
    // Refresh and disconnect callers expect JSON; callback redirects.
    if (action === 'callback' || action === 'login') {
      return redirectWithError(res, err?.code || `${action}_failed`)
    }
    sendError(res, err)
  }
}
