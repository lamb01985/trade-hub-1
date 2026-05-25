// Vercel serverless function. Proxies the NASDAQ earnings calendar so the
// browser doesn't fight CORS. Direct calls to api.nasdaq.com from the
// frontend are blocked in production; this function does the fetch server-side
// and returns the JSON unchanged.
//
// Request: GET /api/calendar-earnings?date=YYYY-MM-DD
// Response: { data: { rows: [...] } } from NASDAQ, or { error } on failure.
//
// Edge cache: 1h s-maxage, 24h stale-while-revalidate. Earnings dates only
// shift on rare confirmations; the staleness is fine.

export default async function handler(req, res) {
  const date = req.query?.date
  if (!date) {
    res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' })
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    return
  }
  try {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${encodeURIComponent(date)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TradeHub/1.0)',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      res.status(r.status).json({ error: 'NASDAQ API error', status: r.status, body: text.slice(0, 200) })
      return
    }
    const data = await r.json()
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: err?.message || 'NASDAQ proxy failed' })
  }
}
