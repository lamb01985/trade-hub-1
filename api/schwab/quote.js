// GET /api/schwab/quote?symbol=QQQ
// Returns sanitized real-time quote for one equity symbol.

import { getSessionId, schwabFetch, withErrors } from '../_lib/schwab.js'

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
})
