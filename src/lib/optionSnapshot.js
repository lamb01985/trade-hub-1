// Preserve absent provider fields as null; never substitute theoretical quotes.
const num = value => typeof value === 'number' && Number.isFinite(value) ? value : null
export function marketDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = type => parts.find(p => p.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function daysToExpiry(expiry, now = new Date()) {
  return Math.max(0, Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${marketDate(now)}T00:00:00Z`)) / 86400000))
}
export function providerTime(value) {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const date = new Date(n > 1e17 ? n / 1e6 : n > 1e14 ? n / 1e3 : n > 1e11 ? n : n * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
export function normalizeOption(raw, underlying) {
  const d = raw.details || {}, q = raw.last_quote || {}, t = raw.last_trade || {}
  const validQuote = num(q.bid) != null && num(q.ask) != null && q.bid >= 0 && q.ask > 0 && q.ask >= q.bid
  const bid = validQuote ? q.bid : null, ask = validQuote ? q.ask : null
  const spread = bid != null && ask != null && ask > 0 && bid >= 0 && ask >= bid ? ask - bid : null
  return {
    symbol: d.ticker || '', underlying, type: d.contract_type || '',
    strike: num(d.strike_price), expiry: d.expiration_date || '',
    sharesPerContract: num(d.shares_per_contract),
    bid, ask, spread, spreadPct: spread != null ? spread / ((ask + bid) / 2) * 100 : null,
    quoteTime: providerTime(q.last_updated), quoteTimeframe: q.timeframe || 'UNSPECIFIED',
    last: num(t.price), tradeTime: providerTime(t.sip_timestamp || t.last_updated), tradeTimeframe: t.timeframe || 'UNSPECIFIED',
    iv: num(raw.implied_volatility), delta: num(raw.greeks?.delta), gamma: num(raw.greeks?.gamma),
    theta: num(raw.greeks?.theta), vega: num(raw.greeks?.vega),
    openInterest: num(raw.open_interest), volume: num(raw.day?.volume),
    underlyingPrice: num(raw.underlying_asset?.price ?? raw.underlying_asset?.value),
    underlyingTime: providerTime(raw.underlying_asset?.last_updated),
  }
}

// Validate OCC identity before any chain row reaches a view or calculator.
export function validateOptionIdentity(raw, underlying, filters = {}) {
  const d = raw?.details || {}
  const m = /^O:([A-Z][A-Z0-9.-]{0,9})([0-9]{6})([CP])([0-9]{8})$/.exec(d.ticker || '')
  if (!m) throw new Error('Invalid option contract identity')
  const expiry = `20${m[2].slice(0,2)}-${m[2].slice(2,4)}-${m[2].slice(4,6)}`
  if (!Number.isFinite(Date.parse(expiry)) || new Date(expiry).toISOString().slice(0,10) !== expiry) throw new Error('Invalid option expiry')
  if (filters.minExpiry && expiry < filters.minExpiry) throw new Error('Expired contract outside requested date range')
  const type = m[3] === 'C' ? 'call' : 'put'
  if (m[1] !== underlying || raw.underlying_asset?.ticker && raw.underlying_asset.ticker !== underlying || d.underlying_ticker && d.underlying_ticker !== underlying || d.expiration_date !== expiry || d.contract_type !== type || d.strike_price !== Number(m[4])/1000 || filters.expiry && filters.expiry !== expiry || filters.type && ['call','put'].includes(filters.type) && filters.type !== type || filters.strike != null && filters.strike !== '' && Number(filters.strike) !== d.strike_price) throw new Error('Option contract does not match requested instrument or filters')
  return raw
}
