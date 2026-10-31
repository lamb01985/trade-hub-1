import { loadEnv } from 'vite'

const SERVER_ENV_KEYS = [
  'THESIS_ENABLED', 'THESIS_DEV_FIXTURES',
  'MASSIVE_BUDGET_ENFORCED', 'MASSIVE_BUDGET_REDIS_REST_URL', 'MASSIVE_BUDGET_REDIS_REST_TOKEN', 'TRADEHUB_PREVIEW_ONLY',
  'MARKET_DATA_SERVICE_URL', 'MARKET_DATA_SERVICE_TOKEN', 'MARKET_DATA_DEPLOYMENT_PROFILE',
  'MASSIVE_ACCOUNT_BUDGET_SCOPE', 'MASSIVE_REQUESTS_PER_MINUTE', 'MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE', 'MARKET_DATA_UNIFIED_ENABLED',
  'POLYGON_API_KEY', 'MASSIVE_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
  'AI_ENABLE_BILLING', 'AI_DAILY_BUDGET_USD', 'KV_REST_API_URL', 'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'TRADEHUB_APP_ORIGIN',
  'TRADEHUB_OPERATOR_ID', 'TRADEHUB_OPERATOR_PASSWORD_HASH', 'TRADEHUB_REPORT_FILE',
  'SCHWAB_APP_KEY', 'SCHWAB_APP_SECRET', 'SCHWAB_CALLBACK_URL', 'SCHWAB_REDIRECT_AFTER_AUTH',
  'SCHWAB_SESSION_SECRET', 'OPERATOR_SESSION_ID', 'CRON_SECRET', 'DEBUG_PASSTHROUGH_SECRET',
  'RESEND_API_KEY', 'NOTIFICATION_EMAIL', 'RESEND_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
]
const STATIC_ROUTES = new Map([
  ['/api/calendar-earnings', '/api/calendar-earnings.js'],
  ['/api/notify-email', '/api/notify-email.js'],
  ['/api/notify-telegram', '/api/notify-telegram.js'],
  ['/api/polygon/proxy', '/api/polygon/proxy.js'],
  ['/api/polygon/ws-auth', '/api/polygon/ws-auth.js'],
  ['/api/schwab/orders', '/api/schwab/orders.js'],
  ['/api/schwab/sync', '/api/schwab/sync.js'],
])
const MAX_BODY_BYTES = 40_000

export function resolveApiRoute(pathname) {
  if (STATIC_ROUTES.has(pathname)) return { file: STATIC_ROUTES.get(pathname), params: {} }
  if (/^\/api\/market\/(capabilities|snapshot|bars|options|intelligence)$/.test(pathname)) return { file: '/api/market/[resource].js', params: { resource: pathname.split('/').pop() } }
  const action = pathname.match(/^\/api\/(ai|intelligence|thesis|schwab\/auth|schwab\/debug)\/([a-z-]+)$/)
  if (action) return { file: `/api/${action[1]}/[action].js`, params: { action: action[2] } }
  const resource = pathname.match(/^\/api\/schwab\/([a-z-]+)$/)
  if (resource) return { file: '/api/schwab/[resource].js', params: { resource: resource[1] } }
  return null
}

export function loadServerEnv(mode, directory, target = process.env) {
  const loaded = loadEnv(mode, directory, '')
  for (const key of SERVER_ENV_KEYS) {
    if (target[key] === undefined && loaded[key] !== undefined) target[key] = loaded[key]
  }
}

function responseHelpers(res) {
  res.status = code => { res.statusCode = code; return res }
  res.json = value => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(value))
    return res
  }
  res.send = value => {
    if (value !== null && typeof value === 'object' && !Buffer.isBuffer(value)) return res.json(value)
    res.end(value)
    return res
  }
}

async function requestBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error(), { status: 413, code: 'input_too_large' })
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return undefined
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return raw
  try { return JSON.parse(raw) }
  catch { throw Object.assign(new Error(), { status: 400, code: 'invalid_json' }) }
}

export function createApiMiddleware(loadModule, env = process.env) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return next()
    responseHelpers(res)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const host = req.headers.host || ''
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return res.status(403).json({ error: 'local_host_required' })
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return res.status(403).json({ error: 'origin_not_allowed' })
    if (url.pathname === '/api/dev/status' && req.method === 'GET') {
      return res.status(200).json({
        mode: 'LOCAL_API',
        massive: { configured: Boolean(env.POLYGON_API_KEY), variable: 'POLYGON_API_KEY', aliasOnly: Boolean(env.MASSIVE_API_KEY) && !env.POLYGON_API_KEY },
      })
    }
    const route = resolveApiRoute(url.pathname)
    if (!route) return res.status(404).json({ error: 'api_route_not_found' })
    try {
      req.query = Object.fromEntries([...new Set(url.searchParams.keys())].map(key => {
        const values = url.searchParams.getAll(key)
        return [key, values.length === 1 ? values[0] : values]
      }))
      Object.assign(req.query, route.params)
      req.body = await requestBody(req)
      const mod = await loadModule(route.file)
      await mod.default(req, res)
      if (!res.writableEnded) res.status(500).json({ error: 'api_response_missing' })
    } catch (error) {
      // Never return module-loader errors or request URLs containing credentials.
      if (!res.writableEnded) {
        if (res.headersSent) return res.end()
        res.status(error.code === 'invalid_json' ? 400 : error.code === 'input_too_large' ? 413 : 500)
          .json({ error: ['invalid_json', 'input_too_large'].includes(error.code) ? error.code : 'local_api_unavailable' })
      }
    }
  }
}

export function localApiPlugin() {
  return {
    name: 'tradehub-local-vercel-handlers',
    apply: 'serve',
    configureServer(server) {
      // The historical review harness and Vercel CLI own routing in their modes.
      if (process.env.TRADEHUB_LOCAL_PREVIEW === 'true' || process.env.VERCEL === '1') return
      loadServerEnv(server.config.mode, server.config.envDir)
      const { host, port } = server.config.server
      if (!['127.0.0.1', 'localhost', '::1'].includes(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Local API requires an explicit loopback host and port')
      const origin = `http://${host === '::1' ? '[::1]' : host}:${port}`
      if (process.env.TRADEHUB_APP_ORIGIN && process.env.TRADEHUB_APP_ORIGIN !== origin) throw new Error('TRADEHUB_APP_ORIGIN must match the local server origin')
      process.env.TRADEHUB_APP_ORIGIN = origin
      process.env.TRADEHUB_LOCAL_AUTH = 'true'
      server.middlewares.use(createApiMiddleware(file => server.ssrLoadModule(file)))
      server.config.logger.info(`Local API handlers enabled. POLYGON_API_KEY: ${process.env.POLYGON_API_KEY ? 'configured' : 'missing (set it in .env.local and restart)'}`)
    },
  }
}
