// Disconnects the current session from Schwab by deleting the token row
// in KV and clearing the session cookie. The Schwab side stays valid until
// its own expiry; we just drop our copy.

import { getSessionId, deleteTokens, clearSessionCookie, withErrors } from '../../_lib/schwab.js'

export default withErrors(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }
  const sessionId = getSessionId(req)
  if (sessionId) await deleteTokens(sessionId)
  clearSessionCookie(res)
  res.status(200).json({ ok: true })
})
