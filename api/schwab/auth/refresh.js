// Manual refresh trigger. The shared lib calls refresh automatically when
// the access token is within 5 min of expiry, so this endpoint exists for
// callers that want to surface explicit refresh state (eg. UI button).

import { getSessionId, getValidTokens, withErrors } from '../../_lib/schwab.js'

export default withErrors(async function handler(req, res) {
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
})
