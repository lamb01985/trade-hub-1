import { timingSafeEqual } from 'node:crypto'
import { privateResponse, requireOperator, sendFailure, reserve } from './_lib/access.js'
import { sessionAt, stockEvidence, validateBars, verifiedAlertInputs } from '../src/lib/marketEvidence.js'
import { Redis } from '@upstash/redis'
import { polygonFetch } from './_lib/polygon.js'
import { evaluateSimpleStrategy, sessionClock, strategyMessage } from '../src/lib/simpleStrategy.js'

const META_KEY = 'simple-strategy:meta:v1'
const DEDUPE_TTL_SECONDS = 86_400
const REQUEST_TIMEOUT_MS = 10_000
const WORKER_FRESH_MS = 150_000
function configuration() {
  return { enabled: process.env.SIMPLE_STRATEGY_ENABLED === 'true', delivery: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), marketData: !!process.env.POLYGON_API_KEY, realtimeVerified: process.env.SIMPLE_STRATEGY_REALTIME_VERIFIED === 'true', storage: !!((process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) || (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)), authorization: !!process.env.CRON_SECRET }
}
function authorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const actual = Buffer.from(req.headers.authorization || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
async function sendPhone(text) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, disable_notification: false }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  const data = await r.json()
  if (!r.ok || !data.ok) throw new Error('Phone delivery failed. Check Telegram configuration.')
}
async function marketJson(path, params) {
  const r = await polygonFetch(path, params)
  if (r.status !== 200) {
    const error = new Error('Market data unavailable. Alerts paused.')
    if (r.status === 429 || r.retryAfter !== undefined) error.cooldown = Number(r.retryAfter) > 0 && Number(r.retryAfter) <= 86400 ? Number(r.retryAfter) : 86400
    throw error
  }
  return JSON.parse(r.body)
}
export default async function handler(req, res) {
  privateResponse(res)
  const config = configuration()
  const mode = req.query?.mode || 'status'
  if (mode === 'status' && req.method === 'GET') {
    try {
      await requireOperator(req)
      const meta = config.storage ? await Redis.fromEnv().get(META_KEY) : null
      return res.status(200).json({ config, meta, workerFresh: !!(meta?.checkedAt && Date.now() - meta.checkedAt < WORKER_FRESH_MS) })
    } catch (error) { return sendFailure(res, error) }
  }
  if (!['check', 'test'].includes(mode)) return res.status(400).json({ error: 'Unknown action.' })
  if ((mode === 'check' && req.method !== 'GET') || (mode === 'test' && req.method !== 'POST')) return res.status(405).json({ error: 'Method not allowed.' })
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized.' })
  if (!config.delivery || !config.storage) return res.status(503).json({ error: 'Phone delivery or alert storage is not configured.' })
  const redis = Redis.fromEnv()
  try {
    if (mode === 'test') {
      const acquired = await redis.set('simple-strategy:test-limit', '1', { nx: true, ex: 60 })
      if (!acquired) return res.status(429).json({ error: 'Wait one minute before another test.' })
      await sendPhone('TradeHub phone alert test. Delivery reached Telegram. Confirm that your phone played a sound with its screen locked.')
      return res.status(200).json({ delivered: true, sound: 'Verify on your phone; device settings control sound.' })
    }
    if (!config.enabled || !config.marketData || !config.realtimeVerified) return res.status(503).json({ error: 'Background strategy is disabled or market data is missing.' })
    const now = Date.now(), clock = sessionClock(now)
    const retryAt = await redis.get('simple-strategy:retry-at')
    if (retryAt > now) return res.status(429).json({ error: 'Provider cooldown active.', retryAt })
    let result
    if (sessionAt(now) !== 'REGULAR') result = { state: 'CLOSED', reason: 'Closed session or unverified exchange calendar.', signal: null }
    else {
      if (!await reserve(`simple-strategy:poll:${Math.floor(now / 60000)}`, 1, 1, 120)) return res.status(429).json({ error: 'Already checked this minute.' })
      const [data, snapshot] = await Promise.all([
        marketJson(`/v2/aggs/ticker/QQQ/range/1/minute/${clock.date}/${clock.date}`, { adjusted: true, sort: 'asc', limit: 50000 }),
        marketJson('/v2/snapshot/locale/us/markets/stocks/tickers/QQQ'),
      ])
      const bars = validateBars('QQQ', data, clock.date)
      const row = stockEvidence('QQQ', snapshot.ticker)
      // Activation requires separately verified real-time entitlement; payload delay flags still win.
      row.trade.timeframe = snapshot.ticker?.lastTrade?.timeframe || 'REAL-TIME'
      const verifiedBars = bars.map(b => ({ ...b, timeframe: data.timeframe || data.results?.find(raw => raw.t === b.t)?.timeframe || 'REAL-TIME' }))
      const context = { symbol: 'QQQ', period: 'current', date: clock.date, bars: { data: verifiedBars, error: null } }
      if (!verifiedAlertInputs(row, context, Date.now())) result = { state: 'PAUSED', reason: 'Real-time source evidence unavailable. Alerts paused.', signal: null }
      else result = evaluateSimpleStrategy(verifiedBars, Date.now())
    }
    let delivered = false
    if (result.signal || result.watchAlert) {
      const key = `simple-strategy:sent:${(result.signal || result.watchAlert).id}`
      const acquired = await redis.set(key, 'sending', { nx: true, ex: DEDUPE_TTL_SECONDS })
      if (acquired) {
        // Keep the claim on an ambiguous send failure to avoid repeated phone alerts.
        await sendPhone(strategyMessage(result))
        await redis.set(key, 'sent', { ex: DEDUPE_TTL_SECONDS })
        delivered = true
      }
    }
    const meta = { checkedAt: Date.now(), state: result.state, reason: result.reason, asOf: result.asOf || null, delivered, error: null }
    await redis.set(META_KEY, meta, { ex: DEDUPE_TTL_SECONDS })
    return res.status(200).json({ ...meta, result })
  } catch (error) {
    if (error.cooldown) await redis.set('simple-strategy:retry-at', Date.now() + error.cooldown * 1000, { ex: error.cooldown }).catch(() => {})
    const meta = { checkedAt: Date.now(), state: 'ERROR', error: 'Background check or delivery failed. Alerts paused.' }
    await redis.set(META_KEY, meta, { ex: DEDUPE_TTL_SECONDS }).catch(() => {})
    return res.status(502).json(meta)
  }
}
