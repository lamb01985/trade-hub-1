// Starts the Schwab OAuth flow. Issues a CSRF state, binds it to the
// session cookie via KV, and 302-redirects to Schwab's authorize URL.

import crypto from 'node:crypto'
import { ensureSessionId, saveOAuthState, authorizeUrl, sendError } from '../../_lib/schwab.js'

export default async function handler(req, res) {
  try {
    const sessionId = ensureSessionId(req, res)
    const state = crypto.randomBytes(16).toString('hex')
    await saveOAuthState(state, sessionId)

    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(302, { Location: authorizeUrl(state) })
    res.end()
  } catch (err) {
    sendError(res, err)
  }
}
