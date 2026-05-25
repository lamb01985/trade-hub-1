// Massive.com (formerly Polygon.io) API client
// REST + WebSocket for real-time data
//
// The HTTP layer adds three things on top of the raw API:
//   - Token-bucket throttle so we don't outrun the per-second cap on
//     bursty operations like backtests and multi-ticker hydrate loops.
//   - Retry with exponential backoff for 429 (rate limit), 5xx, and
//     network errors. Up to three attempts per call.
//   - In-memory response cache keyed by full URL with per-endpoint TTL.
//     The cache survives within a single session only.
// Every outcome (success / failure / rate-limit retry) is recorded into
// apiHealth so the header indicator reflects current API quality.

import { recordSuccess, recordFailure, recordRateLimit } from './apiHealth.js'

const BASE = 'https://api.polygon.io'

// ── Throttle ───────────────────────────────────────────────────────────────
// Polygon's free tier allows 5 req/s and most paid plans go to 100+ req/s.
// 100ms (10 req/s) is conservative and works across plans without surprising
// the user with paywalled errors. Tunable here in one place.

const REQUEST_INTERVAL_MS = 100
const MAX_RETRIES = 3

let lastRequestTime = 0
let inFlightDelay = Promise.resolve()

async function waitForNextSlot() {
  // Serialize the gate so concurrent callers stagger their slot waits.
  inFlightDelay = inFlightDelay.then(async () => {
    const now = Date.now()
    const elapsed = now - lastRequestTime
    if (elapsed < REQUEST_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS - elapsed))
    }
    lastRequestTime = Date.now()
  })
  await inFlightDelay
}

async function throttledFetch(url, options = {}) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await waitForNextSlot()
    try {
      const r = await fetch(url, options)
      if (r.status === 429) {
        recordRateLimit({ url: shortUrl(url), attempt })
        if (attempt < MAX_RETRIES - 1) {
          const waitMs = (attempt + 1) * 2000
          // eslint-disable-next-line no-console
          console.warn(`[Polygon] rate-limited, retrying in ${waitMs}ms`)
          await new Promise(res => setTimeout(res, waitMs))
          continue
        }
        return r
      }
      if (!r.ok && r.status >= 500 && attempt < MAX_RETRIES - 1) {
        recordFailure({ url: shortUrl(url), status: r.status, attempt })
        await new Promise(res => setTimeout(res, 1000 * (attempt + 1)))
        continue
      }
      return r
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) {
        recordFailure({ url: shortUrl(url), message: err?.message || 'fetch failed' })
        throw err
      }
      recordFailure({ url: shortUrl(url), message: err?.message || 'fetch failed', willRetry: true })
      // eslint-disable-next-line no-console
      console.warn(`[Polygon] fetch failed, retry ${attempt + 1}`, err?.message)
      await new Promise(res => setTimeout(res, 1000 * (attempt + 1)))
    }
  }
  // Should not reach here; the loop either returns or throws above.
  throw new Error('Polygon throttledFetch: exhausted retries')
}

// Short, log-friendly URL (drops apiKey query param).
function shortUrl(u) {
  try {
    const url = new URL(u)
    url.searchParams.delete('apiKey')
    return `${url.pathname}${url.search ? url.search : ''}`
  } catch { return String(u).slice(0, 120) }
}

// ── Response cache ─────────────────────────────────────────────────────────
// Keyed by full URL (incl. params). Per-endpoint TTL via setCache(key, data,
// ttlMs). Capped at 500 entries with FIFO eviction.

const CACHE_TTL_MS = {
  historicalBars: 24 * 60 * 60 * 1000,
  snapshot: 30 * 1000,
  tickerDetails: 7 * 24 * 60 * 60 * 1000,
  financials: 24 * 60 * 60 * 1000,
  weekly: 6 * 60 * 60 * 1000,
}
const CACHE_MAX_ENTRIES = 500
const responseCache = new Map()

function getCached(key, ttlMs) {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    responseCache.delete(key)
    return null
  }
  // Refresh insertion order for LRU-ish eviction.
  responseCache.delete(key)
  responseCache.set(key, entry)
  return entry.data
}

function setCache(key, data) {
  responseCache.set(key, { data, timestamp: Date.now() })
  if (responseCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value
    if (oldestKey) responseCache.delete(oldestKey)
  }
}

export function clearMassiveCache() {
  responseCache.clear()
}

// ── REST helpers ─────────────────────────────────────────────────────────────

function buildUrl(apiKey, path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('apiKey', apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

async function get(apiKey, path, params = {}) {
  const urlStr = buildUrl(apiKey, path, params)
  const res = await throttledFetch(urlStr)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    recordFailure({ url: shortUrl(urlStr), status: res.status })
    throw new Error(`Massive API ${res.status}: ${text.slice(0, 120)}`)
  }
  recordSuccess({ url: shortUrl(urlStr) })
  return res.json()
}

// Cache wrapper: pass an endpoint key so the right TTL applies.
async function getCachedJson(apiKey, path, params, endpoint) {
  const urlStr = buildUrl(apiKey, path, params)
  const ttl = CACHE_TTL_MS[endpoint]
  if (ttl) {
    const cached = getCached(urlStr, ttl)
    if (cached) return cached
  }
  const data = await get(apiKey, path, params)
  if (ttl) setCache(urlStr, data)
  return data
}

// ── Market data ───────────────────────────────────────────────────────────────

export async function getLastTrade(apiKey, ticker) {
  const d = await get(apiKey, `/v2/last/trade/${ticker}`)
  return d.results?.p ?? null
}

export async function getDayBars(apiKey, ticker, from, to) {
  const d = await getCachedJson(apiKey, `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: '50' }, 'historicalBars')
  return d.results || []
}

export async function getIntradayBars(apiKey, ticker, multiplier = 1, span = 'minute') {
  const today = new Date().toISOString().slice(0, 10)
  const d = await get(apiKey, `/v2/aggs/ticker/${ticker}/range/${multiplier}/${span}/${today}/${today}`, { adjusted: 'true', sort: 'asc', limit: '500' })
  return d.results || []
}

export async function getIntradayBarsForDate(apiKey, ticker, dateStr, multiplier = 1, span = 'minute') {
  const d = await get(apiKey, `/v2/aggs/ticker/${ticker}/range/${multiplier}/${span}/${dateStr}/${dateStr}`, { adjusted: 'true', sort: 'asc', limit: '500' })
  return d.results || []
}

// ── Fundamentals & reference (Short Thesis screener) ─────────────────────────

export async function getFinancials(apiKey, ticker, timeframe = 'quarterly', limit = 8) {
  const d = await getCachedJson(apiKey, '/vX/reference/financials', { ticker, timeframe, limit, order: 'desc' }, 'financials')
  return d.results || []
}

export async function getTickerDetails(apiKey, ticker) {
  const d = await getCachedJson(apiKey, `/v3/reference/tickers/${ticker}`, {}, 'tickerDetails')
  return d.results || null
}

export async function getSnapshot(apiKey, ticker) {
  const d = await getCachedJson(apiKey, `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, 'snapshot')
  return d.ticker || null
}

export async function getWeeklyBarsRange(apiKey, ticker, weeks = 52) {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - weeks * 7 * 86400000).toISOString().slice(0, 10)
  const d = await getCachedJson(apiKey, `/v2/aggs/ticker/${ticker}/range/1/week/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: '300' }, 'weekly')
  return d.results || []
}

export async function getRecentNews(apiKey, ticker, limit = 5) {
  const d = await get(apiKey, '/v2/reference/news', { ticker, limit, order: 'desc', sort: 'published_utc' })
  return d.results || []
}

// Short interest is paid-tier on Polygon — we attempt and gracefully return null.
export async function getShortInterest(apiKey, ticker) {
  try {
    const d = await get(apiKey, '/v3/reference/short-interest', { 'ticker.eq': ticker, limit: 1, order: 'desc' })
    return d.results?.[0] || null
  } catch {
    return null
  }
}

export function priorTradingDayStr(refDate = new Date()) {
  const d = new Date(refDate)
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function getPremarketBars(apiKey, ticker) {
  // Last trade and premarket high/low via snapshot
  const d = await get(apiKey, `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`)
  return d.ticker ?? null
}

export async function getOptionChain(apiKey, ticker, expiry, strike, type, limit = 10) {
  const params = { limit: String(Math.max(1, Math.min(250, limit))) }
  if (expiry) params.expiration_date = expiry
  if (strike) params.strike_price = strike
  if (type) params.contract_type = type
  const d = await get(apiKey, `/v3/snapshot/options/${ticker}`, params)
  return d.results || []
}

export async function getPrevDay(apiKey, ticker) {
  const d = await get(apiKey, `/v2/aggs/ticker/${ticker}/prev`, { adjusted: 'true' })
  const bar = d.results?.[0]
  if (!bar) return null
  return { open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v }
}

export async function getWeeklyData(apiKey, ticker) {
  // Get last 7 days to find weekly high/low
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const bars = await getDayBars(apiKey, ticker, from, to)
  if (!bars.length) return null
  return {
    high: Math.max(...bars.map(b => b.h)),
    low: Math.min(...bars.map(b => b.l)),
    bars,
  }
}

export async function getHistoricalBars(apiKey, ticker, days = 20) {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return getDayBars(apiKey, ticker, from, to)
}

export async function getOptionsPCRatio(apiKey, ticker) {
  try {
    const d = await get(apiKey, `/v3/snapshot/options/${ticker}`, { limit: '250' })
    const results = d.results || []
    let callVol = 0, putVol = 0
    for (const r of results) {
      const vol = r.day?.volume || 0
      const type = r.details?.contract_type || ''
      if (type === 'call') callVol += vol
      else if (type === 'put') putVol += vol
    }
    if (callVol + putVol === 0) return { callVol: 0, putVol: 0, pcRatio: null }
    return { callVol, putVol, pcRatio: callVol > 0 ? putVol / callVol : null }
  } catch (e) {
    return { planError: e.message?.includes('403'), error: e.message }
  }
}

export async function getTopMovers(apiKey) {
  const [gData, lData] = await Promise.all([
    get(apiKey, '/v2/snapshot/locale/us/markets/stocks/gainers', { include_otc: 'false' }).catch(() => ({ tickers: [] })),
    get(apiKey, '/v2/snapshot/locale/us/markets/stocks/losers', { include_otc: 'false' }).catch(() => ({ tickers: [] })),
  ])
  const all = [...(gData.tickers || []), ...(lData.tickers || [])]
  const seen = new Set()
  return all.filter(s => { if (seen.has(s.ticker)) return false; seen.add(s.ticker); return true })
}

// ── WebSocket ────────────────────────────────────────────────────────────────

export class MassiveStream {
  constructor(apiKey, { onTrade, onQuote, onConnected, onDisconnected, onError } = {}) {
    this.apiKey = apiKey
    this.handlers = { onTrade, onQuote, onConnected, onDisconnected, onError }
    this.ws = null
    this.subscriptions = new Set()
    this.reconnectTimer = null
    this.intentionalClose = false
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.intentionalClose = false
    this.ws = new WebSocket('wss://socket.polygon.io/stocks')

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }))
    }

    this.ws.onmessage = (evt) => {
      let msgs
      try { msgs = JSON.parse(evt.data) } catch { return }
      for (const msg of msgs) {
        if (msg.ev === 'status') {
          if (msg.status === 'auth_success') {
            this.handlers.onConnected?.()
            // Resubscribe to any existing subscriptions
            if (this.subscriptions.size > 0) {
              this.ws.send(JSON.stringify({ action: 'subscribe', params: [...this.subscriptions].join(',') }))
            }
          } else if (msg.status === 'auth_failed') {
            this.handlers.onError?.('API key invalid or plan does not include WebSocket access')
          }
        } else if (msg.ev === 'T') {
          this.handlers.onTrade?.({ ticker: msg.sym, price: msg.p, size: msg.s, timestamp: msg.t })
        } else if (msg.ev === 'Q') {
          this.handlers.onQuote?.({ ticker: msg.sym, bid: msg.bp, ask: msg.ap, bidSize: msg.bs, askSize: msg.as, timestamp: msg.t })
        }
      }
    }

    this.ws.onclose = () => {
      this.handlers.onDisconnected?.()
      if (!this.intentionalClose) {
        // Auto-reconnect after 3s
        this.reconnectTimer = setTimeout(() => this.connect(), 3000)
      }
    }

    this.ws.onerror = () => {
      this.handlers.onError?.('WebSocket connection error')
    }
  }

  subscribe(ticker) {
    const tradeKey = `T.${ticker}`
    const quoteKey = `Q.${ticker}`
    this.subscriptions.add(tradeKey)
    this.subscriptions.add(quoteKey)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', params: `${tradeKey},${quoteKey}` }))
    }
  }

  unsubscribe(ticker) {
    const tradeKey = `T.${ticker}`
    const quoteKey = `Q.${ticker}`
    this.subscriptions.delete(tradeKey)
    this.subscriptions.delete(quoteKey)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'unsubscribe', params: `${tradeKey},${quoteKey}` }))
    }
  }

  disconnect() {
    this.intentionalClose = true
    clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}
