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

import { recordSuccess, recordFailure, recordRateLimit, recordUnavailable } from './apiHealth.js'

// Polygon REST calls are proxied through /api/polygon/proxy so the
// POLYGON_API_KEY never reaches the browser. The proxy takes the original
// Polygon path as a `path` query param and forwards everything else, then
// injects the key from env on the server side. WebSocket auth still needs the
// key client-side (Polygon has no token alternative); MassiveStream fetches it
// from /api/polygon/ws-auth on connect rather than keeping it in localStorage.
const PROXY_PATH = '/api/polygon/proxy'
const WS_AUTH_PATH = '/api/polygon/ws-auth'

// ── Plan-tier 403 tracking ─────────────────────────────────────────────────
// Polygon returns 403 for endpoints not included in the user's plan tier.
// These are PERMANENT for the session — retrying does nothing but burn time
// and log spam. We remember the endpoint pattern (path with ticker/dates
// stripped) and short-circuit future calls to it with a synthetic 403.
//
// A small per-endpoint hint helps the user understand why something is
// missing in the UI without having to read Polygon's pricing page.

const unavailableEndpoints = new Set()

function endpointPattern(urlStr) {
  try {
    const u = new URL(urlStr)
    let p = u.pathname
    // /v2/aggs/ticker/NVDA/range/1/day/2026-01-01/2026-05-01 →
    // /v2/aggs/ticker/{TICKER}/range/1/day/{DATE}/{DATE}
    p = p.replace(/\/[A-Z][A-Z0-9.\-]{0,9}(?=\/|$)/g, '/{TICKER}')
    p = p.replace(/\d{4}-\d{2}-\d{2}/g, '{DATE}')
    return p
  } catch {
    return String(urlStr).slice(0, 80)
  }
}

const ENDPOINT_HINTS = {
  '/v3/snapshot/options/{TICKER}': 'Options chain (Polygon Options plan).',
  '/v3/reference/short-interest': 'Short interest (Polygon Stocks Advanced).',
  '/vX/reference/financials': 'Fundamentals (Polygon Stocks Advanced).',
  '/v2/snapshot/locale/us/markets/stocks/tickers/{TICKER}': 'Full snapshot (Polygon Stocks Starter+).',
}

export function isEndpointUnavailable(urlStr) {
  return unavailableEndpoints.has(endpointPattern(urlStr))
}
export function listUnavailableEndpoints() {
  return [...unavailableEndpoints]
}

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
  // Short-circuit: this endpoint pattern has already 403'd on this session,
  // so don't waste a request slot. We synthesize a Response-shape object the
  // callers can branch on, identical to what fetch would have produced.
  const pattern = endpointPattern(url)
  if (unavailableEndpoints.has(pattern)) {
    return {
      ok: false,
      status: 403,
      _unavailable: true,
      _pattern: pattern,
      text: async () => 'endpoint unavailable on current Polygon plan',
      json: async () => ({ error: 'endpoint unavailable on current Polygon plan' }),
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await waitForNextSlot()
    try {
      const r = await fetch(url, options)
      if (r.status === 403) {
        // Permanent for the session — don't retry, don't poll. Remember the
        // pattern so future callers for the same endpoint short-circuit too.
        if (!unavailableEndpoints.has(pattern)) {
          unavailableEndpoints.add(pattern)
          const hint = ENDPOINT_HINTS[pattern] || null
          recordUnavailable(pattern, hint)
          // eslint-disable-next-line no-console
          console.warn(`[Polygon] endpoint unavailable on current plan: ${pattern}${hint ? ` — ${hint}` : ''}`)
        }
        return r
      }
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

// Short, log-friendly URL. Drops apiKey if it somehow shows up (it shouldn't
// after the server-side migration, but harmless to keep the scrub).
function shortUrl(u) {
  try {
    const url = new URL(u, window.location.origin)
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

function buildUrl(path, params = {}) {
  const url = new URL(PROXY_PATH, window.location.origin)
  url.searchParams.set('path', path)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  return url.toString()
}

async function get(path, params = {}, options = {}) {
  const urlStr = buildUrl(path, params)
  const res = await throttledFetch(urlStr, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // 403 is already recorded as 'unavailable' by throttledFetch; don't
    // double-record it as a generic failure (which would inflate the error
    // rate and turn the header indicator red over a permanent plan limit).
    if (res.status !== 403) {
      recordFailure({ url: shortUrl(urlStr), status: res.status })
    }
    const err = new Error(`Polygon API ${res.status}: ${text.slice(0, 120)}`)
    err.status = res.status
    err.unavailable = res.status === 403
    throw err
  }
  recordSuccess({ url: shortUrl(urlStr) })
  return res.json()
}

// Cache wrapper: pass an endpoint key so the right TTL applies.
async function getCachedJson(path, params, endpoint) {
  const urlStr = buildUrl(path, params)
  const ttl = CACHE_TTL_MS[endpoint]
  if (ttl) {
    const cached = getCached(urlStr, ttl)
    if (cached) return cached
  }
  const data = await get(path, params)
  if (ttl) setCache(urlStr, data)
  return data
}

// ── Market data ───────────────────────────────────────────────────────────────

export async function getLastTrade(ticker) {
  const d = await get(`/v2/last/trade/${ticker}`)
  return d.results?.p ?? null
}

export async function getDayBars(ticker, from, to) {
  const d = await getCachedJson(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: '50' }, 'historicalBars')
  return d.results || []
}

export async function getIntradayBars(ticker, multiplier = 1, span = 'minute') {
  const today = new Date().toISOString().slice(0, 10)
  const d = await get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${span}/${today}/${today}`, { adjusted: 'true', sort: 'asc', limit: '500' })
  return d.results || []
}

export async function getIntradayBarsForDate(ticker, dateStr, multiplier = 1, span = 'minute') {
  const d = await get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${span}/${dateStr}/${dateStr}`, { adjusted: 'true', sort: 'asc', limit: '500' })
  return d.results || []
}

// ── Fundamentals & reference (Short Thesis screener) ─────────────────────────

export async function getFinancials(ticker, timeframe = 'quarterly', limit = 8) {
  const d = await getCachedJson('/vX/reference/financials', { ticker, timeframe, limit, order: 'desc' }, 'financials')
  return d.results || []
}

export async function getTickerDetails(ticker) {
  const d = await getCachedJson(`/v3/reference/tickers/${ticker}`, {}, 'tickerDetails')
  return d.results || null
}

export async function getSnapshot(ticker) {
  const d = await getCachedJson(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, 'snapshot')
  return d.ticker || null
}

export async function getWeeklyBarsRange(ticker, weeks = 52) {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - weeks * 7 * 86400000).toISOString().slice(0, 10)
  const d = await getCachedJson(`/v2/aggs/ticker/${ticker}/range/1/week/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: '300' }, 'weekly')
  return d.results || []
}

export async function getRecentNews(ticker, limit = 5) {
  const d = await get('/v2/reference/news', { ticker, limit, order: 'desc', sort: 'published_utc' })
  return d.results || []
}

// Short interest is paid-tier on Polygon — we attempt and gracefully return null.
export async function getShortInterest(ticker) {
  try {
    const d = await get('/v3/reference/short-interest', { 'ticker.eq': ticker, limit: 1, order: 'desc' })
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

export async function getPremarketBars(ticker) {
  // Last trade and premarket high/low via snapshot
  const d = await get(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`)
  return d.ticker ?? null
}

export async function getPrevDay(ticker) {
  const d = await get(`/v2/aggs/ticker/${ticker}/prev`, { adjusted: 'true' })
  const bar = d.results?.[0]
  if (!bar) return null
  const out = { open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v }
  // Internal-consistency guard. A valid daily bar must satisfy
  // low <= open/close <= high and have positive, finite numbers. A bar that
  // fails this is a bad feed response (stale, halted-day, or wrong adjustment)
  // and must NOT be turned into trading levels. Return null so callers treat
  // it as "no live data" rather than silently loading garbage.
  const nums = [out.open, out.high, out.low, out.close]
  const allFinitePos = nums.every(n => typeof n === 'number' && isFinite(n) && n > 0)
  const ordered = allFinitePos && out.low <= out.open && out.open <= out.high
    && out.low <= out.close && out.close <= out.high && out.low <= out.high
  if (!ordered) {
    recordFailure({ url: `prevDay:${ticker}`, status: 'bad_bar' })
    return null
  }
  return out
}

// Cross-check prev-day levels against a known-good reference price (live last
// trade). Returns true if the prev-day bar is plausibly the same instrument at
// the current price scale. A gap this large almost always means an adjustment
// or stale-bar problem, not a real overnight move.
export function prevDayPlausible(prevDay, refPrice, maxGapPct = 0.40) {
  if (!prevDay || refPrice == null || !isFinite(refPrice) || refPrice <= 0) return true
  const mid = (prevDay.high + prevDay.low) / 2
  if (!isFinite(mid) || mid <= 0) return false
  return Math.abs(mid - refPrice) / refPrice <= maxGapPct
}

export async function getWeeklyData(ticker) {
  // Get last 7 days to find weekly high/low
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const bars = await getDayBars(ticker, from, to)
  if (!bars.length) return null
  return {
    high: Math.max(...bars.map(b => b.h)),
    low: Math.min(...bars.map(b => b.l)),
    bars,
  }
}

export async function getHistoricalBars(ticker, days = 20) {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return getDayBars(ticker, from, to)
}

export async function getTopMovers({ signal } = {}) {
  const [gData, lData] = await Promise.all([
    get('/v2/snapshot/locale/us/markets/stocks/gainers', { include_otc: 'false' }, { signal }).catch(() => ({ tickers: [] })),
    get('/v2/snapshot/locale/us/markets/stocks/losers', { include_otc: 'false' }, { signal }).catch(() => ({ tickers: [] })),
  ])
  const all = [...(gData.tickers || []), ...(lData.tickers || [])]
  const seen = new Set()
  return all.filter(s => { if (seen.has(s.ticker)) return false; seen.add(s.ticker); return true })
}

// ── WebSocket ────────────────────────────────────────────────────────────────

export class MassiveStream {
  constructor({ onTrade, onQuote, onConnected, onDisconnected, onError } = {}) {
    this.apiKey = null
    this.handlers = { onTrade, onQuote, onConnected, onDisconnected, onError }
    this.ws = null
    this.subscriptions = new Set()
    this.reconnectTimer = null
    this.intentionalClose = false
  }

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.intentionalClose = false
    // Fetch the Polygon key from our server-side endpoint. The key is held in
    // memory for the WebSocket auth frame and never persisted to storage.
    if (!this.apiKey) {
      try {
        const res = await fetch(WS_AUTH_PATH)
        if (!res.ok) throw new Error(`ws-auth ${res.status}`)
        const data = await res.json()
        this.apiKey = data.apiKey
      } catch (err) {
        this.handlers.onError?.(`WebSocket auth failed: ${err?.message || 'unknown'}`)
        return
      }
    }
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
