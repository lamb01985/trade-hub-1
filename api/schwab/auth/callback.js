// Schwab redirects here after the user authorizes. Verifies the state
// param against the row written by /login (bound to the same session
// cookie), exchanges the code for tokens, stores them in KV under the
// session id, and 302s back to the SPA.

import {
  getSessionId,
  consumeOAuthState,
  exchangeCode,
  saveTokens,
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

export default async function handler(req, res) {
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
