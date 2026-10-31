// Credential-free compatibility transport. CURRENT quality belongs to M2 envelopes.
const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,31}$/
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0
const size = n => Number.isSafeInteger(n) && n >= 0 ? n : null
function sourceMillis(raw) {
  if (!(typeof raw === 'string' && /^\d+$/.test(raw) || typeof raw === 'number' && Number.isInteger(raw) && raw > 0)) return null
  try { const ms = Number(BigInt(raw) / 1000000n); return ms > 0 && Number.isSafeInteger(ms) && ms <= Math.min(8640000000000000, Date.now() + 5000) ? ms : null } catch { return null }
}
export class ProviderPolling {
  constructor(handlers = {}, request) {
    this.handlers = handlers
    this.request = request
    this.subscriptions = new Map()
    this.sequence = 0
    this.running = false
    this.busy = false
    this.generation = 0
    this.failures = 0
    this.paused = false
    this.nextAt = 0
    this.timer = null
    this.controller = null
    this.currentTicker = null
  }
  connect() {
    if (this.running) return
    this.running = true
    this.paused = false
    const generation = ++this.generation
    queueMicrotask(() => {
      if (!this.running || generation !== this.generation) return
      this.handlers.onConnected?.({ transport: 'REST_POLL', current: false })
      this.wake()
    })
  }
  subscribe(ticker) {
    if (!SYMBOL.test(ticker || '') || this.subscriptions.has(ticker)) return
    this.subscriptions.set(ticker, ++this.sequence)
    this.status(ticker, false, false, 'WAITING')
    this.wake()
  }
  unsubscribe(ticker) {
    this.subscriptions.delete(ticker)
    if (this.currentTicker === ticker) this.controller?.abort()
    if (!this.subscriptions.size) clearTimeout(this.timer)
  }
  status(ticker, trade_available, quote_available, reason) {
    this.handlers.onStatus?.({ ticker, trade_available, quote_available, reason, transport: 'REST_POLL' })
  }
  wake() {
    if (!this.running || this.paused || this.busy || !this.subscriptions.size) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.poll(), Math.max(0, this.nextAt - Date.now()))
  }
  async poll() {
    if (!this.running || this.paused || this.busy || !this.subscriptions.size) return
    this.busy = true
    const generation = this.generation
    const active = () => this.running && generation === this.generation
    let failed = false, retrySeconds = 0, stopped = false
    for (const [ticker, version] of [...this.subscriptions]) {
      const current = () => active() && this.subscriptions.get(ticker) === version
      if (!current()) continue
      const controller = new AbortController()
      this.controller = controller
      this.currentTicker = ticker
      let expired = false, timeout
      const deadline = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
        timeout = setTimeout(() => { expired = true; controller.abort(); reject(new Error('timeout')) }, 15000)
      })
      try {
        const response = await Promise.race([(async () => {
          try { return { snapshot: await this.request(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, controller.signal) } }
          catch (error) {
            if (error.status !== 403 || error.authRequired || !current() || controller.signal.aborted) throw error
            return { fallback: await this.request(`/v2/last/trade/${ticker}`, controller.signal) }
          }
        })(), deadline])
        if (!current() || controller.signal.aborted) continue
        let trade = null, quote = null
        if (response.snapshot) {
          const raw = response.snapshot.ticker
          if (!raw || raw.ticker !== ticker) throw new Error('identity')
          const t = sourceMillis(raw.lastTrade?.t), q = sourceMillis(raw.lastQuote?.t)
          if (positive(raw.lastTrade?.p) && t) trade = { ticker, price: raw.lastTrade.p, size: size(raw.lastTrade.s), timestamp: t, transport: 'REST_POLL' }
          if (positive(raw.lastQuote?.p) && positive(raw.lastQuote?.P) && raw.lastQuote.p <= raw.lastQuote.P && q) quote = { ticker, bid: raw.lastQuote.p, ask: raw.lastQuote.P, bidSize: size(raw.lastQuote.s), askSize: size(raw.lastQuote.S), timestamp: q, transport: 'REST_POLL' }
        } else {
          const raw = response.fallback
          const t = sourceMillis(raw?.results?.t)
          if (raw?.results?.T !== ticker) throw new Error('identity')
          if (positive(raw.results?.p) && t) trade = { ticker, price: raw.results.p, size: size(raw.results.s), timestamp: t, transport: 'REST_POLL' }
        }
        this.status(ticker, !!trade, !!quote, trade && quote ? 'AVAILABLE' : trade || quote ? 'PARTIAL' : 'INVALID_DATA')
        if (trade) this.handlers.onTrade?.(trade)
        if (quote) this.handlers.onQuote?.(quote)
        if (!trade && !quote) failed = true
      } catch (error) {
        if (!current() || controller.signal.aborted && !expired) continue
        failed = true
        const hint = error.retryAfter
        if (hint !== undefined) {
          if (!Number.isInteger(hint) || hint < 1 || hint > 86400) stopped = true
          else retrySeconds = Math.max(retrySeconds, hint)
        }
        this.status(ticker, false, false, error.authRequired ? 'SESSION_ENDED' : error.status === 403 ? 'NOT_ENTITLED' : error.status === 429 ? 'RATE_LIMITED' : error.message === 'identity' ? 'INVALID_DATA' : 'UPSTREAM_UNAVAILABLE')
        this.handlers.onError?.(error.authRequired ? 'Operator sign-in required' : error.status === 403 ? 'Requested market fields are not entitled' : 'REST data unavailable; source recency is unverified')
        if (error.authRequired || error.status === 401) { stopped = true; break }
      } finally { clearTimeout(timeout); if (this.controller === controller) { this.controller = null; this.currentTicker = null } }
    }
    this.busy = false
    if (!active()) return
    this.failures = failed ? this.failures + 1 : 0
    this.nextAt = Date.now() + Math.max(retrySeconds * 1000, this.failures >= 3 ? 60000 : this.failures === 2 ? 20000 : 10000)
    if (stopped) { this.paused = true; this.handlers.onError?.('Automatic REST refresh paused. Resolve access or provider delay before reconnecting.') }
    else this.wake()
  }
  disconnect() {
    const wasRunning = this.running
    this.running = false
    this.generation++
    this.controller?.abort()
    clearTimeout(this.timer)
    this.subscriptions.clear()
    if (wasRunning) this.handlers.onDisconnected?.()
  }
}
