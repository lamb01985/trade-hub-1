// Proxies authenticated calls to Schwab's API. Avoids browser CORS issues
// against api.schwabapi.com. The frontend never talks to Schwab directly.
//
// Body: { endpoint, method?, params?, body?, access_token }
//   - endpoint: path starting with /trader/v1/... or /marketdata/v1/...
//   - method: GET (default), POST, PUT, DELETE
//   - params: object of query-string params
//   - body: JSON body (for POST/PUT)
//   - access_token: bearer token

const SCHWAB_BASE = 'https://api.schwabapi.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed — use POST with a body' })
    return
  }

  const { endpoint, method = 'GET', params, body, access_token } = req.body || {}

  if (!endpoint || !access_token) {
    res.status(400).json({ error: 'Missing endpoint or access_token' })
    return
  }

  if (!endpoint.startsWith('/')) {
    res.status(400).json({ error: 'endpoint must start with /' })
    return
  }

  // Whitelist Schwab paths — never proxy to anything else
  if (!endpoint.startsWith('/trader/') && !endpoint.startsWith('/marketdata/')) {
    res.status(400).json({ error: 'endpoint must be under /trader/ or /marketdata/' })
    return
  }

  let url = SCHWAB_BASE + endpoint
  if (params && typeof params === 'object') {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, String(v))
    }
    const q = qs.toString()
    if (q) url += (endpoint.includes('?') ? '&' : '?') + q
  }

  const fetchOpts = {
    method,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
    },
  }
  if (body && method !== 'GET') {
    fetchOpts.headers['Content-Type'] = 'application/json'
    fetchOpts.body = JSON.stringify(body)
  }

  try {
    const upstream = await fetch(url, fetchOpts)
    const text = await upstream.text()

    res.status(upstream.status)
    res.setHeader('Cache-Control', 'no-store')

    if (!text) {
      res.end()
      return
    }
    try {
      res.json(JSON.parse(text))
    } catch {
      res.send(text)
    }
  } catch (err) {
    res.status(502).json({ error: 'Upstream Schwab request failed', message: err.message })
  }
}
