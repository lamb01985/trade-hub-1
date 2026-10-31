// Public Nasdaq calendar proxy. No provider credential is required.
const NASDAQ_TIMEOUT_MS = 8000
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'})
  const date = req.query?.date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return res.status(400).json({error:'valid_date_required'})
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NASDAQ_TIMEOUT_MS)
  try {
    const response = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${encodeURIComponent(date)}`, {signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; TradeHub/1.0)','Accept':'application/json','Accept-Language':'en-US,en;q=0.9'}})
    if (!response.ok) return res.status(502).json({error:'nasdaq_unavailable',upstreamStatus:response.status})
    const data = await response.json()
    // Null rows is a valid empty response; unknown response shapes are not empty calendars.
    if (!data?.data || !Object.hasOwn(data.data,'rows') || (data.data.rows !== null && !Array.isArray(data.data.rows))) return res.status(502).json({error:'nasdaq_response_invalid'})
    res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(data)
  } catch { return res.status(502).json({error:controller.signal.aborted?'nasdaq_timeout':'nasdaq_network_unavailable'}) }
  finally { clearTimeout(timer) }
}
