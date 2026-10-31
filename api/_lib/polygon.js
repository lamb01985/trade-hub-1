import { AccessError } from './access.js'
import { randomUUID } from 'node:crypto'
import { admit, release } from './marketDataBudget.js'

const BASE = 'https://api.polygon.io'
const TICKER = '[A-Za-z0-9][A-Za-z0-9._:-]{0,31}'
const ticker = new RegExp(`^${TICKER}$`)
const integer = value => /^[1-9][0-9]*$/.test(value)
const invalid = () => { throw new AccessError(400, 'invalid_provider_request') }
function realDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
function family(path) {
  if (typeof path !== 'string' || path.length > 512 || /[^\x21-\x7e]|[%\\?#]|\/\//.test(path) || path.split('/').some(v => v === '.' || v === '..')) invalid()
  const url = new URL(path, BASE)
  if (url.origin !== BASE || url.pathname !== path || url.search || url.hash || url.username || url.password) invalid()
  if (new RegExp(`^/v2/last/trade/${TICKER}$`).test(path) || new RegExp(`^/v3/reference/tickers/${TICKER}$`).test(path)) return 'none'
  if (new RegExp(`^/v2/aggs/ticker/${TICKER}/prev$`).test(path)) return 'aggs'
  const range = path.match(new RegExp(`^/v2/aggs/ticker/${TICKER}/range/([1-9][0-9]*)/(minute|hour|day|week|month)/(\\d{4}-\\d{2}-\\d{2})/(\\d{4}-\\d{2}-\\d{2})$`))
  if (range) {
    if (Number(range[1]) > 1000 || !realDate(range[3]) || !realDate(range[4]) || range[3] > range[4]) invalid()
    return 'aggs'
  }
  if (new RegExp(`^/v2/snapshot/locale/us/markets/stocks/(?:tickers/${TICKER}|gainers|losers)$`).test(path)) return 'snapshot'
  if (/^\/v3\/snapshot\/options\/[A-Z][A-Z0-9.-]{0,9}$/.test(path)) return 'options'
  const contract = path.match(/^\/v3\/snapshot\/options\/([A-Z][A-Z0-9.-]{0,9})\/O:([A-Z][A-Z0-9.-]{0,9})([0-9]{6})[CP][0-9]{8}$/)
  if (contract) {
    if (contract[1] !== contract[2] || !realDate(`20${contract[3].slice(0,2)}-${contract[3].slice(2,4)}-${contract[3].slice(4,6)}`)) invalid()
    return 'none'
  }
  if (path === '/v2/reference/news') return 'news'
  if (path === '/v3/reference/short-interest') return 'short'
  if (path === '/vX/reference/financials') return 'financials'
  invalid()
}
const keys = { options: ['expiration_date','expiration_date.gte','contract_type','strike_price','sort','order','limit'], none: [], aggs: ['adjusted', 'sort', 'limit'], snapshot: ['include_otc'], news: ['ticker', 'limit', 'order', 'sort'], short: ['ticker.eq', 'limit', 'order'], financials: ['ticker', 'timeframe', 'limit', 'order'] }
export function validateProviderRequest(path, params = {}) {
  const kind = family(path)
  if (!params || typeof params !== 'object' || Array.isArray(params)) invalid()
  for (const [key, value] of Object.entries(params)) {
    if (!keys[kind].includes(key) || typeof value !== 'string' || !value.length || value.length > 256) invalid()
    if (kind === 'options' && key === 'limit' && Number(value) > 250) invalid()
    if (['expiration_date','expiration_date.gte'].includes(key) && !realDate(value)) invalid()
    if (key === 'contract_type' && !['call','put'].includes(value)) invalid()
    if (key === 'strike_price' && (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/.test(value) || Number(value) <= 0 || Number(value) > 10000000)) invalid()
    if (key === 'limit' && (!integer(value) || Number(value) > 50000)) invalid()
    if (['ticker', 'ticker.eq'].includes(key) && !ticker.test(value)) invalid()
    if (['adjusted', 'include_otc'].includes(key) && !['true', 'false'].includes(value)) invalid()
    if (key === 'order' && !['asc', 'desc'].includes(value)) invalid()
    if (key === 'sort' && !(kind === 'news' ? value === 'published_utc' : kind === 'options' ? ['expiration_date','strike_price'].includes(value) : ['asc', 'desc'].includes(value))) invalid()
    if (key === 'timeframe' && !['quarterly', 'annual', 'trailing'].includes(value)) invalid()
  }
  return new URL(path, BASE)
}
export function isAllowedPath(path) { try { family(path); return true } catch { return false } }
export function requireApiKey() {
  const key = process.env.POLYGON_API_KEY
  if (!key) throw new AccessError(503, 'env_missing')
  return key
}
function redact(value, key) {
  const clean = text => [key, encodeURIComponent(key)].filter(Boolean).reduce((s, secret) => s.split(secret).join('[REDACTED]'), text)
  if (typeof value === 'string') return clean(value)
  if (Array.isArray(value)) return value.map(v => redact(v, key))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [clean(k), redact(v, key)]))
  return value
}
export async function polygonFetch(path, params = {}) {
  const url = validateProviderRequest(path, params)
  const apiKey = requireApiKey()
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('apiKey', apiKey)
  for (let attempt = 0; attempt < 2; attempt++) {
    let admission
    const scope = process.env.MASSIVE_ACCOUNT_BUDGET_SCOPE
    if (process.env.MARKET_DATA_UNIFIED_ENABLED === 'true' || process.env.MASSIVE_BUDGET_ENFORCED === 'true') {
      admission = await admit(scope, randomUUID(), 'legacy', 20000)
      if (!admission.granted) throw new AccessError(['ACCOUNT_LIMIT','NEW_LIMIT','CONCURRENCY_LIMIT'].includes(admission.reason) ? 429 : 503, 'market_data_' + admission.reason.toLowerCase())
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(url.toString(), { signal: controller.signal, redirect: 'error' })
      const text = await response.text()
      if (!text || response.status === 204 || response.status >= 300 && response.status < 400) throw new Error()
      const data = JSON.parse(text)
      const hint = response.headers?.get?.('Retry-After')
      let retryAfter
      if (hint !== null && hint !== undefined) {
        const seconds = /^\d+$/.test(hint) ? Number(hint) : Math.ceil((Date.parse(hint) - Date.now()) / 1000)
        retryAfter = Number.isFinite(seconds) && seconds >= 1 && seconds <= 86400 ? String(seconds) : '86401'
      }
      if (response.status === 429 && attempt === 0 && retryAfter === undefined) { await new Promise(resolve => setTimeout(resolve, 500)); continue }
      return { status: response.status, body: JSON.stringify(redact(data, apiKey)), contentType: 'application/json', ...(retryAfter === undefined ? {} : { retryAfter }) }
    } catch { throw new AccessError(502, 'upstream_unavailable') } finally { clearTimeout(timer); if (admission?.granted) await release(scope, admission.lease_id) }
  }
  throw new AccessError(502, 'upstream_unavailable')
}
