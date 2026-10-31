// Run only after preview activation is explicitly approved. Never logs credentials/data.
import { pathToFileURL } from 'node:url'
import { assertMarketDataEnvelope } from '../src/lib/marketDataContract.js'
export async function verifyProtectedPreview(env=process.env, fetcher=fetch) {
  const url=new URL(env.PREVIEW_URL)
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || url.pathname!=='/' || env.PREVIEW_TARGET_VERIFIED!=='true') throw Error('EXPLICIT_HTTPS_PREVIEW_REQUIRED')
  if(!/^th_operator=[a-f0-9]{64}$/.test(env.PREVIEW_OPERATOR_COOKIE || '') || !env.MARKET_DATA_DEPLOYMENT_PROFILE) throw Error('PREVIEW_AUTHENTICATION_REQUIRED')
  let calls=0
  const get=async(path,authenticated=true,bypass=true,cookie=env.PREVIEW_OPERATOR_COOKIE)=>{
    if(++calls>12)throw Error('CHECK_REQUEST_LIMIT')
    const headers={Accept:'application/json'}
    if(authenticated)headers.Cookie=cookie
    if(bypass && env.PREVIEW_PROTECTION_BYPASS)headers['x-vercel-protection-bypass']=env.PREVIEW_PROTECTION_BYPASS
    const response=await fetcher(new URL(path,url),{headers,redirect:'manual',signal:AbortSignal.timeout(35000)})
    const text=await response.text()
    if(text.length>5000000)throw Error('INVALID_PREVIEW_RESPONSE')
    for(const secret of [env.PREVIEW_OPERATOR_COOKIE,env.PREVIEW_PROTECTION_BYPASS].filter(Boolean))if(text.includes(secret))throw Error('CREDENTIAL_ECHO')
    return {response,text}
  }
  const checks={}
  const outside=await get('/',false,false)
  checks.outer_protection=[401,403,302,303,307,308].includes(outside.response.status)
  const anonymous=await get('/api/market/capabilities',false)
  checks.operator_denial=[401,403].includes(anonymous.response.status) && anonymous.response.headers.get('X-TradeHub-Auth-Required')==='true'
  const expired=await get('/api/market/capabilities',true,true,`th_operator=${'0'.repeat(64)}`)
  checks.invalid_operator_session=[401,403].includes(expired.response.status) && expired.response.headers.get('X-TradeHub-Auth-Required')==='true'
  checks.service_denial_is_dependency=false
  if(env.PREVIEW_SERVICE_DENIAL_URL && env.PREVIEW_DENIAL_TARGET_VERIFIED==='true') {
    const canary=new URL(env.PREVIEW_SERVICE_DENIAL_URL)
    if(canary.protocol!=='https:' || canary.username || canary.password || canary.search || canary.hash || canary.pathname!=='/' || canary.origin===url.origin) throw Error('SEPARATE_APPROVED_DENIAL_CANARY_REQUIRED')
    const denial=await get(new URL('/api/market/capabilities',canary).href)
    checks.service_denial_is_dependency=denial.response.status===502 && denial.response.headers.get('X-TradeHub-Auth-Required')!=='true' && JSON.parse(denial.text).error?.code==='SERVICE_AUTHENTICATION_FAILED'
  }
  const retired=await get('/api/polygon/ws-auth')
  checks.no_provider_key_delivery=retired.response.status===410 && JSON.parse(retired.text).error==='STREAMING_CREDENTIAL_DELIVERY_RETIRED' && !/apiKey|api_key/.test(retired.text)
  const caps=await get('/api/market/capabilities')
  assertMarketDataEnvelope(JSON.parse(caps.text),{resource:'capabilities',profile:env.MARKET_DATA_DEPLOYMENT_PROFILE})
  checks.preview_only=caps.response.headers.get('X-Market-Data-Preview-Only')==='true'
  checks.private_cache=/private/.test(caps.response.headers.get('cache-control')||'') && /no-store/.test(caps.response.headers.get('cache-control')||'')
  const observations=[]
  for(const symbol of ['QQQ','SPY','IWM']) {
    const item=await get(`/api/market/snapshot?symbol=${symbol}`)
    const body=assertMarketDataEnvelope(JSON.parse(item.text),{resource:'snapshot',symbol,profile:env.MARKET_DATA_DEPLOYMENT_PROFILE})
    checks[`${symbol}_auth_classification`]=item.response.status!==403 || (item.response.headers.get('X-TradeHub-Auth-Required')!=='true' && body.error?.code==='PROVIDER_NOT_ENTITLED')
    const current=item.response.status===200 && body.quality.freshness==='CURRENT'
    observations.push({symbol,http_status:item.response.status,availability:body.availability,freshness:body.quality.freshness,coverage:body.quality.coverage,source_age_seconds:body.quality.source_age_seconds})
    checks[`${symbol}_current`]=current
  }
  const unsupported=await get('/api/market/snapshot?symbol=NQ')
  checks.unsupported_symbol_rejected=unsupported.response.status===400
  const disabled=await get('/api/market/options')
  checks.options_disabled=disabled.response.status===503
  return {passed:Object.values(checks).every(Boolean),checks,observations,requests:calls,full_rth_gate_satisfied:false}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(!process.argv.includes('--allow-preview-reads')) { console.log(JSON.stringify({status:'NOT_EXECUTED',requires:'--allow-preview-reads after explicit approval'}));process.exitCode=1 }
  else try{const result=await verifyProtectedPreview();console.log(JSON.stringify(result,null,2));process.exitCode=result.passed?0:1}catch{console.log(JSON.stringify({status:'PREVIEW_CHECK_FAILED',detail:'Check private configuration and sanitized deployment diagnostics. No credentials logged.'}));process.exitCode=1}
}
