// GET /api/polygon/proxy?path=<polygon path>&<...other params>
//
// Single generic proxy for every Polygon REST call the SPA makes. The browser
// composes a Polygon path + query, hits this endpoint, and the server forwards
// to api.polygon.io with POLYGON_API_KEY injected from env. The key never
// reaches the browser. Path allowlist enforces stocks-only paths.

import { isAllowedPath, polygonFetch } from '../_lib/polygon.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const { path, ...params } = req.query
  if (!path || typeof path !== 'string') {
    res.status(400).json({ error: 'missing_path' })
    return
  }
  if (!isAllowedPath(path)) {
    res.status(400).json({ error: 'path_not_allowed', path })
    return
  }
  try {
    const result = await polygonFetch(path, params)
    res.status(result.status)
    res.setHeader('content-type', result.contentType)
    res.send(result.body)
  } catch (err) {
    if (err?.statusCode === 500 && err?.code === 'env_missing') {
      res.status(500).json({ error: 'env_missing', message: err.message })
      return
    }
    res.status(502).json({ error: 'upstream_failed', message: err?.message || 'fetch failed' })
  }
}
