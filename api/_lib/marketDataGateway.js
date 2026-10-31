import { randomUUID } from 'node:crypto'
import { AccessError, privateResponse, requireOperator } from './access.js'
import { budgetConfiguration } from './marketDataBudget.js'
import { assertMarketDataEnvelope } from '../../src/lib/marketDataContract.js'
const RESOURCES = ['capabilities','snapshot','bars','options','intelligence']
const SYMBOLS = ['QQQ','SPY','IWM']
const fail = (status,code) => { throw new AccessError(status,code) }
function date(value) { return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value }
export function serviceConfiguration(env=process.env) {
  let url
  try { url = new URL(env.MARKET_DATA_SERVICE_URL) } catch { fail(503,'DEPENDENCY_UNCONFIGURED') }
  const loopback = env.NODE_ENV==='development' && ['127.0.0.1','[::1]'].includes(url.hostname)
  if ((url.protocol!=='https:' && !(url.protocol==='http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname!=='/') fail(503,'DEPENDENCY_UNCONFIGURED')
  const token=env.MARKET_DATA_SERVICE_TOKEN
  if (typeof token!=='string' || Buffer.byteLength(token)<32 || /[^\x21-\x7e]/.test(token)) fail(503,'DEPENDENCY_UNCONFIGURED')
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(env.MARKET_DATA_DEPLOYMENT_PROFILE || '') || env.MARKET_DATA_DEPLOYMENT_PROFILE==='UNCONFIGURED') fail(503,'DEPENDENCY_UNCONFIGURED')
  budgetConfiguration(env)
  let storeUrl
  try { storeUrl = new URL(env.MASSIVE_BUDGET_REDIS_REST_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) } catch { fail(503,'DEPENDENCY_UNCONFIGURED') }
  if (storeUrl.protocol!=='https:' || storeUrl.username || storeUrl.password || storeUrl.search || storeUrl.hash || !String(env.MASSIVE_BUDGET_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '').trim()) fail(503,'DEPENDENCY_UNCONFIGURED')
  return {url,token,profile:env.MARKET_DATA_DEPLOYMENT_PROFILE}
}
export function validateMarketQuery(resource, query={}) {
  if (!RESOURCES.includes(resource)) fail(404,'RESOURCE_NOT_FOUND')
  const allowed=resource==='snapshot' ? ['symbol'] : resource==='bars' ? ['symbol','interval','from','to','adjusted'] : []
  for (const [k,v] of Object.entries(query)) if (k!=='resource' && (!allowed.includes(k) || typeof v!=='string')) fail(400,'INVALID_QUERY')
  if (['snapshot','bars'].includes(resource) && !SYMBOLS.includes(query.symbol)) fail(400,'UNSUPPORTED_INSTRUMENT')
  if (resource==='bars') {
    if (query.interval!=='1m') fail(400,'UNSUPPORTED_INTERVAL')
    if (!date(query.from) || !date(query.to) || query.from>query.to || (query.adjusted!==undefined && !['true','false'].includes(query.adjusted))) fail(400,'INVALID_QUERY')
    // Actual exchange-session bound is owned and checked by the calendar service.
    if ((Date.parse(query.to)-Date.parse(query.from))/86400000>31) fail(400,'WINDOW_TOO_LARGE')
  }
  return Object.fromEntries(allowed.filter(k=>query[k]!==undefined).map(k=>[k,query[k]]))
}
export function marketErrorEnvelope(resource, symbol, code, env=process.env, retryable=true) {
  const instrument=SYMBOLS.includes(symbol) ? {canonical_id:`ETF:US:${symbol}`,provider_symbol:symbol,asset_class:'ETF',currency:'USD'} : null
  return {schema_version:'market-data-envelope-v1',request_id:randomUUID(),deployment_profile:env.MARKET_DATA_DEPLOYMENT_PROFILE || 'UNCONFIGURED',generated_at:new Date().toISOString(),instrument,source:{provider:'Massive',transport:'REST',endpoint_family:RESOURCES.includes(resource)?resource:'unknown'},availability:'ERROR',data:null,quality:{freshness:'UNKNOWN',coverage:'UNKNOWN',policy_version:'market-data-policy-v1',source_age_seconds:null,missing_fields:[],invalid_fields:[],reasons:[code]},coverage_details:{requested_window:null,returned_window:null,pages_read:0,pagination_complete:null,observations:0,minimum_required:null,missing_intervals:[]},error:{code,retryable,retry_after_seconds:null}}
}
export async function marketDataGateway(req,res) {
  privateResponse(res)
  let resource=req.query?.resource
  let authenticated=false
  try {
    await requireOperator(req); authenticated=true
    res.setHeader('X-Market-Data-Unified-Enabled',String(process.env.MARKET_DATA_UNIFIED_ENABLED==='true'))
    let ready=false
    try { serviceConfiguration(); ready=true } catch { /* readiness exposes no configuration */ }
    res.setHeader('X-Market-Data-Ready',String(ready))
    res.setHeader('X-Market-Data-Preview-Only',String(process.env.TRADEHUB_PREVIEW_ONLY==='true'))
    if (req.method!=='GET') { res.setHeader('Allow','GET'); fail(405,'METHOD_NOT_ALLOWED') }
    // Parse original query to prevent framework duplicate-key flattening.
    const incoming=new URL(req.url || '/', 'http://gateway.invalid')
    for (const key of incoming.searchParams.keys()) if (incoming.searchParams.getAll(key).length!==1 || key==='resource') fail(400,'INVALID_QUERY')
    const query=validateMarketQuery(resource,req.query)
    if (['options','intelligence'].includes(resource)) fail(503,'FEATURE_NOT_ENABLED')
    if (process.env.MARKET_DATA_UNIFIED_ENABLED!=='true' && resource!=='capabilities') fail(503,'FEATURE_NOT_ENABLED')
    const config=serviceConfiguration()
    const target=new URL(`/api/v1/market-data/${resource}`,config.url)
    for (const [key,value] of Object.entries(query)) target.searchParams.set(key,value)
    const controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(),30000)
    let response,body
    try {
      response=await fetch(target,{method:'GET',headers:{Authorization:`Bearer ${config.token}`,'X-TradeHub-Audience':'market-data-v1',Accept:'application/json'},signal:controller.signal,redirect:'error'})
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail(502,'INVALID_UPSTREAM_RESPONSE')
      const text=await response.text()
      if (Buffer.byteLength(text)>5_000_000) fail(502,'INVALID_UPSTREAM_RESPONSE')
      body=JSON.parse(text)
      assertMarketDataEnvelope(body,{resource,symbol:query.symbol,profile:config.profile})
      if (![200,400,401,403,429,502,503,504].includes(response.status) || (response.status!==200 && (!body.error || body.data!==null)) || (response.status===200 && body.error)) fail(502,'INVALID_UPSTREAM_RESPONSE')
      if ([401,403].includes(response.status) && body.error?.code!=='PROVIDER_NOT_ENTITLED') fail(502,'SERVICE_AUTHENTICATION_FAILED')
      // Service/provider credentials must never leave the server, even in a malformed echo.
      const normalized = JSON.stringify(body)
      if ([config.token,process.env.POLYGON_API_KEY,process.env.MASSIVE_API_KEY].filter(Boolean).some(secret=>[secret,encodeURIComponent(secret)].some(value=>text.includes(value) || normalized.includes(value)))) fail(502,'INVALID_UPSTREAM_RESPONSE')
    } catch(error) {
      if (error instanceof AccessError) throw error
      fail(controller.signal.aborted?504:502,controller.signal.aborted?'REFRESH_DEADLINE':'INVALID_UPSTREAM_RESPONSE')
    } finally { clearTimeout(timer) }
    if (body.error?.retry_after_seconds) res.setHeader('Retry-After',String(body.error.retry_after_seconds))
    return res.status(response.status).json(body)
  } catch(error) {
    const status=error instanceof AccessError ? error.status : 503
    const code=error instanceof AccessError ? error.code : 'DEPENDENCY_UNCONFIGURED'
    if (!authenticated && [401,403].includes(status)) res.setHeader('X-TradeHub-Auth-Required','true')
    return res.status(status).json(marketErrorEnvelope(resource,req.query?.symbol,code,process.env,status>=429))
  }
}
