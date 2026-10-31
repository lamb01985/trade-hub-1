// Shared server-side Polygon helpers. Never bundled into the SPA.
//
// The browser hits /api/polygon/proxy (and /api/polygon/ws-auth) which call
// into here. POLYGON_API_KEY must be set in Vercel project env vars as a
// Sensitive variable for Production and Preview environments. For local dev,
// run `vercel env pull .env.development.local` so vite dev sees it via
// process.env on the API side.
//
// Path allowlist: only stocks endpoints. Options paths are blocked because
// the current Polygon plan returns 403 for them — letting them through just
// wastes a roundtrip and pollutes server logs.

const POLYGON_BASE = 'https://api.polygon.io'
const FETCH_TIMEOUT_MS = 10_000

// Stocks-only path prefixes. Each entry is matched as a startsWith() check.
// Add new prefixes here when new massive.js functions land.
const ALLOWED_PREFIXES = [
  '/v2/last/trade/',
  '/v2/aggs/ticker/',
  '/v2/snapshot/locale/us/markets/stocks/',
  '/v2/reference/news',
  '/v3/reference/tickers/',
  '/v3/reference/short-interest',
  '/vX/reference/financials',
]

// Block these explicitly even if they would otherwise match an allowed
// prefix. The plan-tier 403 wall makes them a waste of a serverless call.
const BLOCKED_PREFIXES = [
  '/v3/snapshot/options/',
]

export function isAllowedPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 512 || /[%\\?#]|\/\//.test(path) || path.split('/').some(part => part === '.' || part === '..')) return false
  const url = new URL(path, POLYGON_BASE)
  if (url.origin !== POLYGON_BASE || url.pathname !== path || url.username || url.password || url.search || url.hash) return false
  if (BLOCKED_PREFIXES.some(prefix => path.startsWith(prefix))) return false
  return ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))
}
function redact(value, key) {
  const variants = [...new Set([key, encodeURIComponent(key), encodeURIComponent(encodeURIComponent(key))])].filter(Boolean)
  const clean = text => variants.reduce((result, secret) => result.split(secret).join('[REDACTED]'), text)
  if (typeof value === 'string') return clean(value)
  if (Array.isArray(value)) return value.map(item => redact(item, key))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [clean(name), /^(?:api_?key|access_token|refresh_token|client_secret)$/i.test(name) ? '[REDACTED]' : redact(item, key)]))
  return value
}

export function requireApiKey() {
  const key = process.env.POLYGON_API_KEY
  if (!key) {
    const err = new Error('POLYGON_API_KEY is not set on the server')
    err.statusCode = 500
    err.code = 'env_missing'
    throw err
  }
  return key
}

// Forwards a request to api.polygon.io with the key injected from env. One
// retry on 429 with a short backoff; everything else passes through as-is.
export async function polygonFetch(path, params = {}) {
  if (!isAllowedPath(path) || !params || typeof params !== 'object' || Array.isArray(params) || Object.entries(params).some(([name, value]) => /key|token|secret|authorization/i.test(name) || Array.isArray(value) || value && typeof value === 'object')) {
    const error = new Error('Invalid provider request'); error.code = 'invalid_provider_request'; error.statusCode = 400; throw error
  }
  const apiKey = requireApiKey()
  const url = new URL(POLYGON_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }

  url.searchParams.set('apiKey', apiKey)

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url.toString(), { signal: controller.signal, redirect: 'error' })
      if (res.status === 429 && attempt === 0) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      const body = await res.text()
      let parsed
      try { parsed = JSON.parse(body) } catch { throw new Error('Invalid provider response') }
      return { status: res.status, body: JSON.stringify(redact(parsed, apiKey)), contentType: 'application/json' }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('polygonFetch: exhausted retries')
}
