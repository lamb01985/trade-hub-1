// GET /api/schwab/account
// Returns sanitized balance, buying power, positions, and PDT info.

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

export default withErrors(async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }

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
})
