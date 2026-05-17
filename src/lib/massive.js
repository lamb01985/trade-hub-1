// Massive.com (formerly Polygon.io) API client
// REST + WebSocket for real-time data

const BASE = 'https://api.polygon.io'

// ── REST helpers ─────────────────────────────────────────────────────────────

async function get(apiKey, path, params = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('apiKey', apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Massive API ${res.status}: ${text.slice(0, 120)}`)
  }
  return res.json()
}

// ── Market data ───────────────────────────────────────────────────────────────

export async function getLastTrade(apiKey, ticker) {
  const d = await get(apiKey, `/v2/last/trade/${ticker}`)
  return d.results?.p ?? null
}

export async function getDayBars(apiKey, ticker, from, to) {
  const d = await get(apiKey, `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: '50' })
  return d.results || []
}

export async function getIntradayBars(apiKey, ticker, multiplier = 1, span = 'minute') {
  const today = new Date().toISOString().slice(0, 10)
  const d = await get(apiKey, `/v2/aggs/ticker/${ticker}/range/${multiplier}/${span}/${today}/${today}`, { adjusted: 'true', sort: 'asc', limit: '500' })
  return d.results || []
}

export async function getPremarketBars(apiKey, ticker) {
  // Last trade and premarket high/low via snapshot
  const d = await get(apiKey, `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`)
  return d.ticker ?? null
}

export async function getOptionChain(apiKey, ticker, expiry, strike, type) {
  const params = { limit: '10' }
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
