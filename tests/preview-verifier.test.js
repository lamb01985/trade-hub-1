import {it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {verifyProtectedPreview} from '../scripts/verify-protected-preview.mjs'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/market-data-python.json',import.meta.url),'utf8'))
it('does not contact a target without explicit verified-preview authorization',async()=>{
 const fetcher=vi.fn();await expect(verifyProtectedPreview({PREVIEW_URL:'https://preview.example'},fetcher)).rejects.toThrow('EXPLICIT_HTTPS_PREVIEW_REQUIRED');expect(fetcher).not.toHaveBeenCalled()
})
it('proves operator/dependency denial separation and never passes UNKNOWN data as live',async()=>{
 const env={PREVIEW_URL:'https://preview.example',PREVIEW_TARGET_VERIFIED:'true',PREVIEW_OPERATOR_COOKIE:`th_operator=${'a'.repeat(64)}`,MARKET_DATA_DEPLOYMENT_PROFILE:'preview-test',PREVIEW_SERVICE_DENIAL_URL:'https://denial.example',PREVIEW_DENIAL_TARGET_VERIFIED:'true'}
 const envelope=resource=>{const values=Array.isArray(fixtures)?fixtures:Object.values(fixtures);const raw=values.find(x=>x.source?.endpoint_family===resource) || values.find(x=>x.envelope?.source?.endpoint_family===resource)?.envelope;if(!raw)throw Error('fixture');const body=structuredClone(raw);body.deployment_profile=env.MARKET_DATA_DEPLOYMENT_PROFILE;return body}
 const fetcher=vi.fn(async(target,options)=>{
  const url=new URL(target),cookie=options.headers.Cookie
  if(url.hostname==='denial.example')return new Response(JSON.stringify({error:{code:'SERVICE_AUTHENTICATION_FAILED'}}),{status:502})
  if(url.pathname==='/')return new Response('',{status:401})
  if(!cookie || cookie.endsWith('0'.repeat(64)))return new Response('{}',{status:403,headers:{'X-TradeHub-Auth-Required':'true'}})
  if(url.pathname.endsWith('ws-auth'))return new Response(JSON.stringify({error:'STREAMING_CREDENTIAL_DELIVERY_RETIRED'}),{status:410})
  if(url.searchParams.get('symbol')==='NQ')return new Response('{}',{status:400})
  if(url.pathname.endsWith('options'))return new Response('{}',{status:503})
  const resource=url.pathname.split('/').pop(),body=envelope(resource)
  if(resource==='snapshot'){const symbol=url.searchParams.get('symbol');body.instrument={...body.instrument,provider_symbol:symbol,canonical_id:`ETF:US:${symbol}`};for(const field of ['bid','ask','last_trade'])if(body.data?.[field])body.data[field].instrument_id=`ETF:US:${symbol}`}
  return new Response(JSON.stringify(body),{headers:{'X-Market-Data-Preview-Only':'true','Cache-Control':'private, no-store'}})
 })
 const result=await verifyProtectedPreview(env,fetcher)
 expect(result.checks.service_denial_is_dependency).toBe(true);expect(result.checks.invalid_operator_session).toBe(true);expect(result.passed).toBe(false);expect(result.full_rth_gate_satisfied).toBe(false);expect(result.requests).toBeLessThanOrEqual(12);expect(JSON.stringify(result)).not.toContain(env.PREVIEW_OPERATOR_COOKIE)
})
