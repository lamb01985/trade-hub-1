// GET /api/schwab/orders
// Returns today's filled orders for the connected account. Read-only.

import { getSessionId, schwabFetch, getAccountHandle, withErrors } from '../_lib/schwab.js'

function sanitizeLeg(leg) {
  const i = leg?.instrument || {}
  return {
    instruction: leg.instruction || null,
    quantity: leg.quantity ?? null,
    filledQuantity: leg.filledQuantity ?? null,
    assetType: i.assetType || null,
    symbol: i.symbol || null,
    underlyingSymbol: i.underlyingSymbol || null,
    putCall: i.putCall?.toLowerCase() === 'put' ? 'put'
      : i.putCall?.toLowerCase() === 'call' ? 'call' : null,
    strikePrice: i.strikePrice ?? null,
    optionExpirationDate: i.optionExpirationDate?.slice(0, 10) || null,
  }
}

function sanitizeOrder(o) {
  const exec = o?.orderActivityCollection?.[0]?.executionLegs?.[0]
  return {
    orderId: o.orderId || null,
    status: o.status || null,
    price: o.price ?? exec?.price ?? null,
    enteredTime: o.enteredTime || null,
    closeTime: o.closeTime || null,
    legs: Array.isArray(o.orderLegCollection) ? o.orderLegCollection.map(sanitizeLeg) : [],
  }
}

export default withErrors(async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }

  const sessionId = getSessionId(req)
  const { hash, warning } = await getAccountHandle(sessionId)

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await schwabFetch(sessionId, `/trader/v1/accounts/${hash}/orders`, {
    query: {
      fromEnteredTime: `${today}T00:00:00.000Z`,
      toEnteredTime: `${today}T23:59:59.999Z`,
      status: 'FILLED',
      maxResults: 250,
    },
  })

  const orders = Array.isArray(data) ? data.map(sanitizeOrder) : []

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ orders, warning })
})
