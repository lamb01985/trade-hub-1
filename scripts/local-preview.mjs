import { createServer } from 'vite'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = 4180
const reviewPassword = crypto.randomBytes(32).toString('hex')
const salt = crypto.randomBytes(16).toString('hex')
const hash = await promisify(crypto.scrypt)(reviewPassword, salt, 64)
Object.assign(process.env, {
  NODE_ENV: 'development', TRADEHUB_LOCAL_PREVIEW: 'true', TRADEHUB_APP_ORIGIN: `http://127.0.0.1:${port}`,
  TRADEHUB_OPERATOR_ID: 'local-review', TRADEHUB_OPERATOR_PASSWORD_HASH: `${salt}:${hash.toString('hex')}`,
  TRADEHUB_REPORT_FILE: path.join(root, 'private-reports/october-26.json'), AI_ENABLE_BILLING: 'false',
})
// This preview never uses inherited provider credentials or broker functions.
for (const key of ['ANTHROPIC_API_KEY', 'POLYGON_API_KEY', 'MASSIVE_API_KEY', 'KV_REST_API_TOKEN', 'KV_REST_API_URL']) delete process.env[key]
const vite = await createServer({ root, define: { 'import.meta.env.VITE_LOCAL_SERVICE_PREVIEW': JSON.stringify('true') }, server: { host: '127.0.0.1', port, strictPort: true }, plugins: [{
  name: 'local-protected-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const origin = `http://127.0.0.1:${port}`
      if (req.headers.host !== `127.0.0.1:${port}`) { res.statusCode = 403; return res.end('Local preview host required') }
      if (req.url?.split('?')[0] === '/' && req.method === 'GET') {
        const access = await server.ssrLoadModule('/api/_lib/access.js')
        try { await access.requireOperator(req) }
        catch { await access.login({ ...req, headers: { ...req.headers, origin } }, res, reviewPassword) }
        return next()
      }
      if (!req.url?.startsWith('/api/')) return next()
      res.status = code => { res.statusCode = code; return res }
      res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }
      const url = new URL(req.url, `http://127.0.0.1:${port}`)
      if (url.pathname === '/api/local-preview/status' && req.method === 'GET') return res.status(200).json({mode:'LOCAL_REVIEW',market:'DISABLED_NO_CREDENTIALS',broker:'DISABLED',ai:'DISABLED',earnings:'PUBLIC_NASDAQ_PROXY',fixtures:'EXPLICIT_FRIDAY_INTELLIGENCE_SAMPLE_ONLY'})
      if (url.pathname === '/api/calendar-earnings') {
        try {
          req.query = Object.fromEntries(url.searchParams)
          const mod = await server.ssrLoadModule('/api/calendar-earnings.js')
          return await mod.default(req, res)
        } catch { return res.status(502).json({error:'public_calendar_proxy_unavailable'}) }
      }
      const route = url.pathname.match(/^\/api\/(intelligence|ai)\/([a-z-]+)$/)
      if (!route) {
        res.setHeader('X-TradeHub-Service-Disabled', 'true')
        return res.status(503).json({ error: 'local_service_disabled', message: 'Live provider and broker services are intentionally disabled in this local review. No fixture replaces them.' })
      }
      req.query = { action: route[2] }
      try {
        const chunks = []; let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 40000) return res.status(413).json({ error: 'input_too_large' })
          chunks.push(chunk)
        }
        req.body = Buffer.concat(chunks).toString('utf8')
        const mod = await server.ssrLoadModule(`/api/${route[1]}/[action].js`)
        await mod.default(req, res)
      } catch { if (!res.writableEnded) res.status(503).json({ error: 'preview_service_unavailable' }) }
    })
  },
}] })
await vite.listen()
console.log(`Local TradeHub review: http://127.0.0.1:${port}`)
console.log('This loopback preview creates a local-only review session. Live Massive, AI billing and broker calls are disabled; the public Nasdaq calendar proxy is enabled.')
