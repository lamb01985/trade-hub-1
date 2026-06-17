// /api/schwab/[resource]
//
// Consolidated read-only Schwab utility endpoints. Dynamic segment routes
// the three near-identical handlers (account, quote, chain) into a single
// Vercel function. Same dynamic-segment trick we used for auth/[action] and
// debug/[action], lets us stay under the Hobby 12-function limit so we can
// add the AI proxy without a deploy block.
//
// Routes:
//   GET /api/schwab/account               positions + balances + day trades
//   GET /api/schwab/quote?symbol=         sanitized real-time quote
//   GET /api/schwab/chain?symbol=...      sanitized option chain with greeks
//
// Static neighbors (orders.js, sync.js) keep their own files; Vercel routes
// specific files before dynamic segments, so /api/schwab/orders does not
// fall through to this handler.

import { getSessionId, schwabFetch, getAccountHandle, withErrors } from '../_lib/schwab.js'

function pickPosition(p) {
  const i = p?.instrument || {}
  return {
    symbol: i.symbol || null,
    underlyingSymbol: i.underlyingSymbol || null,
    assetType: i.assetType || null,
    putCall: i.putCall || null,
    strikePrice: i.strikePrice ?? null,
    expirationDate: i.optionExpirationDate?.slice(0, 10) || null,
    longQty: p.longQuantity ?? 0,
    shortQty: p.shortQuantity ?? 0,
    avgPrice: p.averagePrice ?? null,
    marketValue: p.marketValue ?? null,
    dayPL: p.currentDayProfitLoss ?? null,
  }
}

function countDayTrades(orders) {
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
  let n = 0
  for (const v of bySym.values()) n += Math.min(v.buy, v.sell)
  return n
}

function flattenChainSide(map) {
  const out = []
  if (!map || typeof map !== 'object') return out
  for (const dateKey of Object.keys(map)) {
    const strikes = map[dateKey] || {}
    for (const strikeKey of Object.keys(strikes)) {
      const list = strikes[strikeKey] || []
      const c = list[0]
      if (!c) continue
      out.push({
        symbol: c.symbol,
        putCall: c.putCall?.toLowerCase() === 'put' ? 'put' : 'call',
        expiry: c.expirationDate?.slice(0, 10) || dateKey.split(':')[0],
        strike: parseFloat(strikeKey),
        bid: c.bid ?? null,
        ask: c.ask ?? null,
        last: c.last ?? null,
        mark: c.mark ?? null,
        volume: c.totalVolume ?? null,
        openInterest: c.openInterest ?? null,
        iv: c.volatility ?? null,
        delta: c.delta ?? null,
        gamma: c.gamma ?? null,
        theta: c.theta ?? null,
        vega: c.vega ?? null,
        rho: c.rho ?? null,
        inTheMoney: !!c.inTheMoney,
      })
    }
  }
  return out
}

async function handleAccount(req, res) {
  const sessionId = getSessionId(req)
  const { hash, number, warning } = await getAccountHandle(sessionId)

  const { data } = await schwabFetch(sessionId, `/trader/v1/accounts/${hash}`, {
    query: { fields: 'positions' },
  })

  const today = new Date().toISOString().slice(0, 10)
  let dayTrades = 0
  try {
    const { data: orders } = await schwabFetch(sessionId, `/trader/v1/accounts/${hash}/orders`, {
      query: {
        fromEnteredTime: `${today}T00:00:00.000Z`,
        toEnteredTime: `${today}T23:59:59.999Z`,
        status: 'FILLED',
        maxResults: 250,
      },
    })
    dayTrades = countDayTrades(Array.isArray(orders) ? orders : [])
  } catch {}

  const acct = data?.securitiesAccount || data || {}
  const positions = Array.isArray(acct.positions) ? acct.positions.map(pickPosition) : []

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    accountNumber: number || null,
    buyingPower: acct.currentBalances?.buyingPower ?? acct.currentBalances?.availableFunds ?? null,
    dayTradingBuyingPower: acct.currentBalances?.dayTradingBuyingPower ?? null,
    cashBalance: acct.currentBalances?.cashBalance ?? null,
    liquidationValue: acct.currentBalances?.liquidationValue ?? null,
    roundTrips: acct.roundTrips ?? 0,
    isDayTrader: !!acct.isDayTrader,
    dayTrades,
    positions,
    warning,
  })
}

async function handleQuote(req, res) {
  const symbol = String(req.query?.symbol || '').toUpperCase().trim()
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol query parameter', code: 'BAD_REQUEST' })
    return
  }
  const { data, warning } = await schwabFetch(
    getSessionId(req),
    '/marketdata/v1/quotes',
    { query: { symbols: symbol, fields: 'quote,reference' } },
  )
  const row = data?.[symbol]
  if (!row) {
    res.status(404).json({ error: `No quote for ${symbol}`, code: 'NOT_FOUND' })
    return
  }
  const q = row.quote || {}
  const ref = row.reference || {}
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    symbol,
    description: ref.description || null,
    assetType: row.assetMainType || null,
    bid: q.bidPrice ?? null,
    ask: q.askPrice ?? null,
    last: q.lastPrice ?? null,
    mark: q.mark ?? null,
    open: q.openPrice ?? null,
    high: q.highPrice ?? null,
    low: q.lowPrice ?? null,
    close: q.closePrice ?? null,
    volume: q.totalVolume ?? null,
    netChange: q.netChange ?? null,
    pctChange: q.netPercentChange ?? null,
    ts: q.quoteTime ?? Date.now(),
    warning,
  })
}

async function handleChain(req, res) {
  const symbol = String(req.query?.symbol || '').toUpperCase().trim()
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol query parameter', code: 'BAD_REQUEST' })
    return
  }
  const type = String(req.query?.type || 'ALL').toUpperCase()
  const expiry = req.query?.expiry ? String(req.query.expiry) : null
  const strike = req.query?.strike ? parseFloat(req.query.strike) : null
  const strikeCount = parseInt(req.query?.strikeCount || '10', 10)

  const query = { symbol, strikeCount }
  if (type === 'CALL' || type === 'PUT') query.contractType = type
  if (expiry) { query.fromDate = expiry; query.toDate = expiry }
  if (strike != null && !isNaN(strike)) query.strike = strike

  const { data, warning } = await schwabFetch(getSessionId(req), '/marketdata/v1/chains', { query })

  const calls = type === 'PUT' ? [] : flattenChainSide(data?.callExpDateMap)
  const puts = type === 'CALL' ? [] : flattenChainSide(data?.putExpDateMap)

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    symbol,
    underlyingPrice: data?.underlyingPrice ?? null,
    interestRate: data?.interestRate ?? null,
    daysToExpiration: data?.daysToExpiration ?? null,
    calls,
    puts,
    warning,
  })
}

const ROUTES = {
  account: handleAccount,
  quote: handleQuote,
  chain: handleChain,
}

export default withErrors(async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }
  const resource = String(req.query?.resource || '').toLowerCase()
  const route = ROUTES[resource]
  if (!route) {
    res.status(404).json({ error: 'unknown_resource', resource, available: Object.keys(ROUTES) })
    return
  }
  await route(req, res)
})
