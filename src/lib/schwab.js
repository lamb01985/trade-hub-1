// Client-side Schwab helpers. All Schwab API calls go through /api/schwab-proxy
// so the browser never hits api.schwabapi.com directly (CORS + token hygiene).
//
// Token storage shape (localStorage key: th-schwab-token):
//   { access_token, refresh_token, expires_at, account_hash, account_number }
//
// app_key and app_secret are stored separately (th-schwab-creds).

const REDIRECT_URI = 'https://trade-hub-1.vercel.app/callback'

export const SCHWAB_BLUE = '#3B82F6'

// ── PKCE-less OAuth: we use the server-side flow with app_secret. ──────────

export function buildAuthUrl(appKey) {
  return `/api/schwab-auth?app_key=${encodeURIComponent(appKey)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
}

export async function exchangeCode({ code, app_key, app_secret }) {
  const res = await fetch('/api/schwab-callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, app_key, app_secret, redirect_uri: REDIRECT_URI }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Token exchange failed')
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 1800) * 1000,
  }
}

export async function refreshTokens({ refresh_token, app_key, app_secret }) {
  const res = await fetch('/api/schwab-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token, app_key, app_secret }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Token refresh failed')
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + (data.expires_in || 1800) * 1000,
  }
}

// ── Proxy wrapper ────────────────────────────────────────────────────────────

async function call(token, endpoint, { method = 'GET', params, body } = {}) {
  if (!token?.access_token) throw new Error('Not connected to Schwab')
  const res = await fetch('/api/schwab-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, method, params, body, access_token: token.access_token }),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : data?.error || `Schwab ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.details = data
    throw err
  }
  return data
}

// ── Accounts ────────────────────────────────────────────────────────────────

// Schwab requires fetching the hashed account ID before any per-account call.
export async function getAccountNumbers(token) {
  const data = await call(token, '/trader/v1/accounts/accountNumbers')
  return Array.isArray(data) ? data : []
}

// Returns: { buyingPower, dayTradingBuyingPower, roundTrips, isDayTrader, accountNumber }
export async function getAccountSummary(token, accountHash) {
  const data = await call(token, `/trader/v1/accounts/${accountHash}`)
  const acct = data?.securitiesAccount || data
  if (!acct) return null
  return {
    buyingPower: acct.currentBalances?.buyingPower ?? acct.currentBalances?.availableFunds ?? null,
    dayTradingBuyingPower: acct.currentBalances?.dayTradingBuyingPower ?? null,
    cashBalance: acct.currentBalances?.cashBalance ?? null,
    roundTrips: acct.roundTrips ?? 0,
    isDayTrader: !!acct.isDayTrader,
    accountNumber: acct.accountNumber,
  }
}

// ── Orders ──────────────────────────────────────────────────────────────────

export async function getTodaysFilledOrders(token, accountHash) {
  const today = new Date().toISOString().slice(0, 10)
  const params = {
    fromEnteredTime: `${today}T00:00:00.000Z`,
    toEnteredTime: `${today}T23:59:59.999Z`,
    status: 'FILLED',
    maxResults: 250,
  }
  const data = await call(token, `/trader/v1/accounts/${accountHash}/orders`, { params })
  return Array.isArray(data) ? data : []
}

// Count round-trip options day trades from today's filled orders. A round
// trip = same OCC symbol with both a BUY and a SELL (any open/close pair).
export function countDayTrades(orders) {
  if (!orders?.length) return 0
  const bySym = new Map()
  for (const order of orders) {
    if (order.status !== 'FILLED') continue
    for (const leg of (order.orderLegCollection || [])) {
      if (leg.instrument?.assetType !== 'OPTION') continue
      const sym = leg.instrument.symbol
      const instr = (leg.instruction || '').toUpperCase()
      if (!sym) continue
      const entry = bySym.get(sym) || { buy: 0, sell: 0 }
      if (instr.includes('BUY')) entry.buy++
      else if (instr.includes('SELL')) entry.sell++
      bySym.set(sym, entry)
    }
  }
  let count = 0
  for (const v of bySym.values()) count += Math.min(v.buy, v.sell)
  return count
}

// ── Market data: option chain quote ──────────────────────────────────────────

// Returns { bid, ask, last, mark, symbol } for the best-matching contract.
export async function getOptionAsk(token, { ticker, optType, strike, expiry }) {
  const params = {
    symbol: ticker.toUpperCase(),
    contractType: optType.toLowerCase() === 'put' ? 'PUT' : 'CALL',
    fromDate: expiry,
    toDate: expiry,
    strikeCount: 4,
  }
  if (strike) params.strike = strike
  const data = await call(token, '/marketdata/v1/chains', { params })

  // The response has callExpDateMap or putExpDateMap → { "2026-05-17:0": { "475.0": [{ bid, ask, last, ...}] } }
  const isCall = params.contractType === 'CALL'
  const map = isCall ? data?.callExpDateMap : data?.putExpDateMap
  if (!map) return null

  for (const dateKey of Object.keys(map)) {
    const strikes = map[dateKey] || {}
    for (const strikeKey of Object.keys(strikes)) {
      const list = strikes[strikeKey] || []
      const c = list[0]
      if (!c) continue
      if (strike && parseFloat(strikeKey) !== parseFloat(strike)) continue
      return {
        symbol: c.symbol,
        bid: c.bid,
        ask: c.ask,
        last: c.last,
        mark: c.mark,
        volume: c.totalVolume,
        openInterest: c.openInterest,
        iv: c.volatility,
      }
    }
  }
  return null
}

// ── OCC symbol (for staging/copy-to-clipboard) ──────────────────────────────

// "QQQ   260117C00500000" — 6-char padded ticker + YYMMDD + C/P + 8-digit strike (*1000)
export function occSymbol({ ticker, expiry, strike, optType }) {
  if (!ticker || !expiry || !strike || !optType) return ''
  const [y, m, d] = expiry.split('-')
  const cp = optType.toLowerCase() === 'put' ? 'P' : 'C'
  const strikePadded = String(Math.round(parseFloat(strike) * 1000)).padStart(8, '0')
  return `${ticker.toUpperCase().padEnd(6, ' ')}${y.slice(2)}${m}${d}${cp}${strikePadded}`
}

// ── Convert Schwab filled orders → Trade Hub journal entries ────────────────

export function ordersToTrades(orders, existingTrades = []) {
  const existingSchwabIds = new Set(existingTrades.filter(t => t.schwabOrderId).map(t => String(t.schwabOrderId)))

  // Group legs by symbol with side
  const bySym = {}
  for (const order of (orders || [])) {
    if (order.status !== 'FILLED') continue
    for (const leg of (order.orderLegCollection || [])) {
      if (leg.instrument?.assetType !== 'OPTION') continue
      const sym = leg.instrument.symbol
      const price = parseFloat(order.price ?? order.orderActivityCollection?.[0]?.executionLegs?.[0]?.price ?? 0)
      if (!sym || !price) continue
      const isBuy = (leg.instruction || '').toUpperCase().includes('BUY')
      const entry = {
        orderId: order.orderId,
        price,
        qty: leg.filledQuantity || leg.quantity || 1,
        time: order.closeTime || order.enteredTime,
        ticker: (leg.instrument.underlyingSymbol || sym.slice(0, 6)).trim(),
        strike: leg.instrument.strikePrice,
        putCall: leg.instrument.putCall?.toLowerCase() === 'put' ? 'put' : 'call',
        expiry: leg.instrument.optionExpirationDate?.slice(0, 10),
      }
      if (!bySym[sym]) bySym[sym] = {}
      bySym[sym][isBuy ? 'buy' : 'sell'] = entry
    }
  }

  const result = []
  for (const sym of Object.keys(bySym)) {
    const { buy, sell } = bySym[sym]
    const ref = buy || sell
    if (!ref || existingSchwabIds.has(String(ref.orderId))) continue
    const entryPrice = buy?.price ?? null
    const exitPrice = sell?.price ?? null
    const qty = ref.qty
    const pnl = entryPrice != null && exitPrice != null ? (exitPrice - entryPrice) * qty * 100 : null
    result.push({
      id: `schwab-${ref.orderId}-${sym}`,
      schwabOrderId: ref.orderId,
      ticker: ref.ticker,
      instrument: 'options',
      optType: ref.putCall,
      strike: ref.strike,
      expiry: ref.expiry,
      contracts: qty,
      setupType: 'Schwab Sync',
      entry: entryPrice ?? exitPrice,
      stop: null,
      target: null,
      exitPrice,
      entryTime: buy?.time ? new Date(buy.time).toTimeString().slice(0, 5) : null,
      exitTime: sell?.time ? new Date(sell.time).toTimeString().slice(0, 5) : null,
      status: pnl == null ? 'open' : pnl >= 0 ? 'win' : 'loss',
      pnl,
      rr: null,
      dollarRisk: null,
      dollarReward: pnl,
      totalCost: entryPrice ? entryPrice * qty * 100 : null,
      currentPrice: null,
      notes: `Synced from Schwab — ${sym}`,
      date: ref.time || new Date().toISOString(),
    })
  }
  return result
}

// Schwab Trade page (no documented deep-link URL params — user enters manually)
export const SCHWAB_TRADE_URL = 'https://client.schwab.com/app/trade/tom/#/trade'
