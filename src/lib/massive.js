// Massive.com (formerly Polygon.io) API client
// Authenticated server REST; no provider credentials in browsers
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
import { MARKET_HOLIDAYS_2026 as HOLIDAY_MAP_2026 } from '../constants.js'

// Provider credentials exist only on the server. Legacy observations use
// authenticated same-origin REST polling; Unified quality belongs to Python.
import { ProviderPolling } from './providerPolling.js'
const PROXY_PATH = '/api/polygon/proxy'

// ── Plan-tier 403 tracking ─────────────────────────────────────────────────
// Polygon returns 403 for endpoints not included in the user's plan tier.
// These are PERMANENT for the session — retrying does nothing but burn time
// and log spam. We remember the endpoint pattern (path with ticker/dates
// stripped) and short-circuit future calls to it with a synthetic 403.
//
// A small per-endpoint hint helps the user understand why something is
// missing in the UI without having to read Polygon's pricing page.

const unavailableEndpoints = new Set()
let sessionGeneration = 0
function assertSession(generation) {
  if (generation !== sessionGeneration) {
    const error = new Error('Operator session changed')
    error.sessionChanged = true
    throw error
  }
}
function requireAuthentication(response, generation) {
  assertSession(generation)
  if (response.headers?.get('X-TradeHub-Auth-Required') !== 'true') return
  window.dispatchEvent(new Event('tradehub-operator-expired'))
  const error = new Error('Operator authentication required')
  error.authRequired = true
  error.status = response.status
  throw error
}

function endpointPattern(urlStr) {
  try {
    const u = new URL(urlStr)
    let p = u.searchParams.get('path') || u.pathname
    // /v2/aggs/ticker/NVDA/range/1/day/2026-01-01/2026-05-01 →
    // /v2/aggs/ticker/{TICKER}/range/1/day/{DATE}/{DATE}
    p = p.replace(/(\/(?:ticker|tickers|trade|options)\/)[^/]+/g, '$1{TICKER}')
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
// Every background call in the app shares one FIFO gate. Paid Massive stock
// plans have no per-second cap, so the gate only exists to smooth bursts into
// the Vercel proxy. At the old 100ms spacing a 5-minute context refresh across
// all watchlists (100+ calls) queued user clicks for 10+ seconds.
//
// Calls made with { priority: true } (user-initiated, like Load Market Data)
// skip the gate entirely so they never wait behind background refreshes.
// CLIENT_TIMEOUT_MS bounds each attempt so a hung proxy fails fast instead of
// leaving the button spinning.

const REQUEST_INTERVAL_MS = 25
const MAX_RETRIES = 3
const CLIENT_TIMEOUT_MS = 15_000
const INTRADAY_BAR_LIMIT = '50000'

export function marketDateStr(at = new Date()) {
  return ymdFromParts(etParts(at))
}

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

async function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`request timed out after ${CLIENT_TIMEOUT_MS / 1000}s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function throttledFetch(url, rawOptions = {}, generation = sessionGeneration) {
  assertSession(generation)
  const { priority = false, ...options } = rawOptions
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
    if (!priority) await waitForNextSlot()
    assertSession(generation)
    try {
      const r = await fetchWithTimeout(url, options)
      assertSession(generation)
      requireAuthentication(r, generation)
      if (r.headers?.get('X-TradeHub-Service-Disabled') === 'true') return r
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
      if (err.authRequired || err.sessionChanged) throw err
      assertSession(generation)
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
  const generation = sessionGeneration
  const urlStr = buildUrl(path, params)
  const res = await throttledFetch(urlStr, options, generation)
  assertSession(generation)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    assertSession(generation)
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
  const data = await res.json()
  assertSession(generation)
  recordSuccess({ url: shortUrl(urlStr) })
  return data
}

// Cache wrapper: pass an endpoint key so the right TTL applies.
async function getCachedJson(path, params, endpoint) {
  const generation = sessionGeneration
  const urlStr = buildUrl(path, params)
  const ttl = CACHE_TTL_MS[endpoint]
  if (ttl) {
    const cached = getCached(urlStr, ttl)
    if (cached) return cached
  }
  const data = await get(path, params)
  assertSession(generation)
  if (ttl) setCache(urlStr, data)
  return data
}

// ── Market data ───────────────────────────────────────────────────────────────

export async function getLastTrade(ticker, { priority = false } = {}) {
  const d = await get(`/v2/last/trade/${ticker}`, {}, { priority })
  return d.results?.p ?? null
}

export async function getDayBars(ticker, from, to, { priority = false, fresh = false } = {}) {
  const path = `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`
  const params = { adjusted: 'true', sort: 'asc', limit: '50' }
  const d = fresh
    ? await get(path, params, { priority })
    : await getCachedJson(path, params, 'historicalBars')
  return d.results || []
}

export async function getIntradayBars(ticker, multiplier = 1, span = 'minute') {
  return getIntradayBarsForDate(ticker, marketDateStr(), multiplier, span)
}

export async function getIntradayBarsForDate(ticker, dateStr, multiplier = 1, span = 'minute') {
  const d = await get(`/v2/aggs/ticker/${ticker}/range/${multiplier}/${span}/${dateStr}/${dateStr}`, { adjusted: 'true', sort: 'asc', limit: INTRADAY_BAR_LIMIT })
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

// Market holidays for 2026 (full-day market closures). Sourced from
// src/constants.js as a { 'YYYY-MM-DD': 'Holiday Name' } map (the canonical
// list, populated per nyse.com); we re-export just the keys here as an array
// so the walk-back below can do a simple `.includes` check. Aliasing the
// import (HOLIDAY_MAP_2026) avoids a name collision with this export.
export const MARKET_HOLIDAYS_2026 = Object.keys(HOLIDAY_MAP_2026)

// 4:15 PM Eastern. The 15-minute pad past the 4:00 PM close lets the
// settlement print land before we consider "today" the most recent session,
// so we don't pull a half-formed bar when the proxy responds in the first
// few minutes after the bell.
const SESSION_CLOSE_ET_HOUR = 16
const SESSION_CLOSE_ET_MIN = 15

// Pull the wall-clock parts (year, month, day, hour, minute, weekday) for a
// given absolute instant, expressed in America/New_York. Uses
// Intl.DateTimeFormat with timeZone: 'America/New_York' so DST and the
// machine's locale never come into play; the boundary holds regardless of
// where the server or browser is running.
function etParts(at) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  })
  const lookup = {}
  for (const p of fmt.formatToParts(at)) lookup[p.type] = p.value
  return {
    year: parseInt(lookup.year, 10),
    month: parseInt(lookup.month, 10),
    day: parseInt(lookup.day, 10),
    // Some ICU builds report midnight hour as '24'; normalize to 0.
    hour: parseInt(lookup.hour, 10) % 24,
    minute: parseInt(lookup.minute, 10),
    weekday: lookup.weekday, // 'Mon' / 'Tue' / ... / 'Sun'
  }
}

function ymdFromParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Calendar subtraction by one day on a YMD string. Uses UTC date arithmetic
// so DST transitions never shift the result (we are only doing calendar math,
// never wall-clock math).
function subtractDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function dayOfWeekUtc(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sun, 6 = Sat
}

// Returns the YYYY-MM-DD for the most recently completed regular US equity
// session, anchored to America/New_York. Logic:
//   1. Compute the current ET wall clock for the given instant (default: now).
//   2. If it is a weekday and the ET time is at or after 16:15, the session
//      is today; otherwise the candidate is the prior calendar day.
//   3. Walk back over Saturdays, Sundays, and MARKET_HOLIDAYS_2026 until a
//      regular session date is reached.
//
// Pure helper. Same instant always produces the same output. Exported so
// callers (and tests) can reason about session dates without leaking time
// math into the call sites.
export function mostRecentSessionDate(at = new Date()) {
  const et = etParts(at)
  const isWeekday = et.weekday !== 'Sat' && et.weekday !== 'Sun'
  const afterClose = et.hour > SESSION_CLOSE_ET_HOUR
    || (et.hour === SESSION_CLOSE_ET_HOUR && et.minute >= SESSION_CLOSE_ET_MIN)
  let candidate = ymdFromParts(et)
  if (!isWeekday || !afterClose) {
    candidate = subtractDay(candidate)
  }
  while (true) {
    const dow = dayOfWeekUtc(candidate)
    const isWeekend = dow === 0 || dow === 6
    const isHoliday = MARKET_HOLIDAYS_2026.includes(candidate)
    if (!isWeekend && !isHoliday) return candidate
    candidate = subtractDay(candidate)
  }
}

export async function getPremarketBars(ticker) {
  // Last trade and premarket high/low via snapshot
  const d = await get(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`)
  return d.ticker ?? null
}

// Internal-consistency guard shared by getPriorSession and getPrevDay. A
// valid daily bar must have finite positive OHLC and satisfy the ordering
// low <= open <= high and low <= close <= high. A bar that fails this is a
// bad feed response (stale, halted-day, or wrong adjustment) and must not
// be turned into trading levels.
function isBarConsistent(o, h, l, c) {
  const nums = [o, h, l, c]
  const allFinitePos = nums.every(n => typeof n === 'number' && isFinite(n) && n > 0)
  return allFinitePos && l <= o && o <= h && l <= c && c <= h && l <= h
}

// Convert a Polygon bar's `t` timestamp (ms since epoch) to a YYYY-MM-DD
// string anchored to America/New_York. en-CA locale outputs ISO-8601 dates,
// so no reordering is needed.
function tToNyDate(t) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(new Date(t))
}

// Subtract N calendar days from a YMD string via UTC date math. Never uses
// wall-clock arithmetic; DST transitions cannot shift the result.
function subtractDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - n)
  return date.toISOString().slice(0, 10)
}

// Returns the most-recently-completed regular session bar for `ticker`.
// Instead of pinning a single expected session date and failing when the
// exchange was closed for a holiday the local list doesn't know about, this
// pulls a 10-day trailing window and walks newest to oldest, returning the
// first bar that passes isBarConsistent. The window's upper bound is
// mostRecentSessionDate() so a half-formed intraday bar for today cannot be
// selected before 16:15 ET.
//
// Shape: { date, open, high, low, close } with date derived from the bar's
// `t` timestamp in America/New_York. Returns null when the window is empty
// (recorded as 'no_bars_in_window') or when every bar in the window fails
// the guard (each bad bar recorded as 'bad_bar' before walking further).
export async function getPriorSession(ticker, { priority = true } = {}) {
  const endDate = mostRecentSessionDate()
  const startDate = subtractDays(endDate, 9)
  // Fresh + priority: this backs the Load Market Data button. Skipping the
  // cache prevents a window fetched before the newest daily bar posted from
  // being served for 24h; priority skips the background request queue.
  const bars = await getDayBars(ticker, startDate, endDate, { priority, fresh: true })
  if (!bars || bars.length === 0) {
    recordFailure({ url: `priorSession:${ticker}`, status: 'no_bars_in_window' })
    return null
  }
  // getDayBars requests sort=asc, so walk from the end for newest-first.
  for (let i = bars.length - 1; i >= 0; i--) {
    const bar = bars[i]
    if (isBarConsistent(bar.o, bar.h, bar.l, bar.c)) {
      return {
        date: tToNyDate(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
      }
    }
    recordFailure({ url: `priorSession:${ticker}`, status: 'bad_bar' })
  }
  return null
}

export async function getPrevDay(ticker) {
  const d = await get(`/v2/aggs/ticker/${ticker}/prev`, { adjusted: 'true' })
  const bar = d.results?.[0]
  if (!bar) return null
  const out = { open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v }
  if (!isBarConsistent(out.open, out.high, out.low, out.close)) {
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

// ── Authenticated REST compatibility transport ────────────────────────────
export class MassiveStream extends ProviderPolling {
  constructor(handlers = {}) {
    const generation = sessionGeneration
    super(handlers, async (path, signal) => {
      assertSession(generation)
      const query = new URLSearchParams({ path })
      const url = `${PROXY_PATH}?${query}`
      const pattern = endpointPattern(new URL(url, 'http://same-origin.invalid').href)
      if (unavailableEndpoints.has(pattern)) { const error = new Error('Provider endpoint unavailable'); error.status = 403; throw error }
      const response = await fetch(url, { signal, credentials: 'same-origin', cache: 'no-store' })
      assertSession(generation)
      requireAuthentication(response, generation)
      if (!response.ok) {
        if (response.status === 403) { unavailableEndpoints.add(pattern); recordUnavailable(pattern, ENDPOINT_HINTS[pattern] || null) }
        const error = new Error('REST market data unavailable')
        error.status = response.status
        const hint = response.headers?.get('Retry-After')
        if (hint !== null && hint !== undefined) error.retryAfter = /^\d+$/.test(hint) ? Number(hint) : 86401
        throw error
      }
      const data = await response.json()
      assertSession(generation)
      return data
    })
  }
}

// ── Shared stream ────────────────────────────────────────────────────────────
// All legacy live-data hooks share a credential-free polling adapter. Each hook
// used to open its own, so four sockets evicted each other in a reconnect
// loop, and every drop pushed all hooks into 10s REST polling that clogged the
// request queue. All hooks now share one socket through MassiveStreamClient,
// which keeps the old MassiveStream interface (connect / subscribe /
// unsubscribe / disconnect) and ref-counts ticker subscriptions.

const hub = {
  socket: null,
  connected: false,
  clients: new Set(),
  refCounts: new Map(),
}

function hubSocket() {
  if (hub.socket) return hub.socket
  hub.socket = new MassiveStream({
    onConnected: () => {
      hub.connected = true
      for (const c of hub.clients) c.handlers.onConnected?.()
    },
    onDisconnected: () => {
      hub.connected = false
      for (const c of hub.clients) c.handlers.onDisconnected?.()
    },
    onError: (msg) => {
      for (const c of hub.clients) c.handlers.onError?.(msg)
    },
    onTrade: (evt) => {
      for (const c of hub.clients) if (c.tickers.has(evt.ticker)) c.handlers.onTrade?.(evt)
    },
    onQuote: (evt) => {
      for (const c of hub.clients) if (c.tickers.has(evt.ticker)) c.handlers.onQuote?.(evt)
    },
    onStatus: (evt) => {
      for (const c of hub.clients) if (c.tickers.has(evt.ticker)) c.handlers.onStatus?.(evt)
    },
  })
  hub.socket.connect()
  return hub.socket
}

export class MassiveStreamClient {
  constructor(handlers = {}) {
    this.handlers = handlers
    this.tickers = new Set()
    this.active = false
  }

  connect() {
    if (this.active) return
    this.active = true
    hub.clients.add(this)
    hubSocket()
    if (hub.connected) queueMicrotask(() => { if (this.active) this.handlers.onConnected?.() })
  }

  subscribe(ticker) {
    if (!ticker || this.tickers.has(ticker)) return
    this.tickers.add(ticker)
    const n = (hub.refCounts.get(ticker) || 0) + 1
    hub.refCounts.set(ticker, n)
    if (n === 1) hubSocket().subscribe(ticker)
  }

  unsubscribe(ticker) {
    if (!this.tickers.has(ticker)) return
    this.tickers.delete(ticker)
    const n = (hub.refCounts.get(ticker) || 1) - 1
    if (n <= 0) {
      hub.refCounts.delete(ticker)
      hub.socket?.unsubscribe(ticker)
    } else {
      hub.refCounts.set(ticker, n)
    }
  }

  disconnect() {
    for (const t of Array.from(this.tickers)) this.unsubscribe(t)
    this.active = false
    hub.clients.delete(this)
    if (hub.clients.size === 0 && hub.socket) {
      hub.socket.disconnect()
      hub.socket = null
      hub.connected = false
    }
  }
}

// Session boundaries invalidate pending work as well as already cached data.
function invalidateOperatorSession() {
  sessionGeneration++
  responseCache.clear()
  unavailableEndpoints.clear()
  for (const client of [...hub.clients]) client.disconnect()
}
if (typeof window !== 'undefined') {
  window.addEventListener('tradehub-operator-logout', invalidateOperatorSession)
  window.addEventListener('tradehub-operator-expired', invalidateOperatorSession)
  window.addEventListener('tradehub-market-session-reset', invalidateOperatorSession)
}
