// GET /api/schwab/chain?symbol=QQQ&expiry=YYYY-MM-DD&type=CALL|PUT&strike=&strikeCount=
// Returns a sanitized option chain with greeks.
//
// Query params:
//   symbol      required
//   expiry      optional, YYYY-MM-DD. When set, fromDate=toDate=expiry.
//   type        optional, CALL or PUT. Default ALL.
//   strike      optional, narrows to one strike
//   strikeCount optional, number of strikes around at-the-money (default 10)

import { getSessionId, schwabFetch, withErrors } from '../_lib/schwab.js'

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

export default withErrors(async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
    return
  }

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
})
