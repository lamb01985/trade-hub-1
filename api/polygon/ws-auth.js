// GET /api/polygon/ws-auth
//
// Returns the Polygon API key so the browser's MassiveStream WebSocket can
// authenticate with wss://socket.polygon.io/stocks. The WebSocket protocol
// requires the client to send `{ action: 'auth', params: <key> }` in the
// first frame, and Polygon doesn't expose a short-lived token alternative,
// so the key necessarily reaches the browser when WebSocket is in use.
//
// Compared to the prior setup, the key is no longer persisted in localStorage
// or echoed in REST URL query params. It lives only in browser memory during
// the WebSocket session.
//
// This endpoint is intentionally simple: no origin check, no rate limiting.
// For an internal-use single-operator app this matches the existing security
// posture. Add a same-origin check here if the deployment becomes shared.

import { requireApiKey } from '../_lib/polygon.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  try {
    const apiKey = requireApiKey()
    res.status(200).json({ apiKey })
  } catch (err) {
    res.status(500).json({ error: err?.code || 'unknown', message: err?.message || 'failed' })
  }
}
