// GET /api/polygon/proxy?path=<polygon path>&<...other params>
//
// Single generic proxy for every Polygon REST call the SPA makes. The browser
// composes a Polygon path + query, hits this endpoint, and the server forwards
// to api.polygon.io with POLYGON_API_KEY injected from env. The key never
// reaches the browser. Path allowlist enforces stocks-only paths.

import { isAllowedPath, polygonFetch } from '../_lib/polygon.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('CDN-Cache-Control', 'no-store')
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const { path, ...params } = req.query || {}
  if (!path || typeof path !== 'string') {
    res.status(400).json({ error: 'missing_path' })
    return
  }
  if (!isAllowedPath(path)) {
    res.status(400).json({ error: 'path_not_allowed' })
    return
  }
  try {
    const result = await polygonFetch(path, params)
    res.status(result.status)
    res.setHeader('content-type', result.contentType)
    res.send(result.body)
  } catch (err) {
    if (err?.code === 'invalid_provider_request') return res.status(400).json({ error: 'invalid_provider_request' })
    if (err?.statusCode === 500 && err?.code === 'env_missing') {
      res.status(500).json({ error: 'env_missing' })
      return
    }
    res.status(502).json({ error: 'upstream_failed' })
  }
}
