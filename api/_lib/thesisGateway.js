import {randomUUID} from 'node:crypto'
import {AccessError,privateResponse,requireOperator,reserve,sendFailure} from './access.js'
import {assertThesisReport} from '../../src/lib/thesisContract.js'
const errors=new Set(['THESIS_UNCONFIGURED','SEC_CONTACT_UNCONFIGURED','SEC_UNAVAILABLE','SEC_RESPONSE_TOO_LARGE','INVALID_SEC_RESPONSE','COMPANY_NOT_FOUND','COMPANY_IDENTITY_MISMATCH','THESIS_BUSY','SEC_DEADLINE','THESIS_DISABLED','SEC_NOT_ENABLED','FIXTURE_MODE_FORBIDDEN','INVALID_QUERY','INVALID_DATE','INVALID_SYMBOL'])
const fail=(status,code)=>{throw new AccessError(status,code)}
export function thesisFixture(env=process.env){
  if(env.THESIS_DEV_FIXTURES!=='true')return false
  let origin;try{origin=new URL(env.TRADEHUB_APP_ORIGIN)}catch{fail(503,'thesis_unconfigured')}
  if(env.NODE_ENV!=='development'||env.VERCEL||origin.origin!==env.TRADEHUB_APP_ORIGIN||origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))fail(503,'thesis_unconfigured')
  return true
}
export function thesisServiceConfiguration(env=process.env){
  let url;try{url=new URL(env.MARKET_DATA_SERVICE_URL)}catch{fail(503,'thesis_unconfigured')}
  if((url.protocol!=='https:' && !(url.protocol==='http:'&&env.NODE_ENV==='development'&&['127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.search||url.hash||url.pathname!=='/')fail(503,'thesis_unconfigured')
  const token=env.MARKET_DATA_SERVICE_TOKEN,profile=env.MARKET_DATA_DEPLOYMENT_PROFILE
  if(typeof token!=='string'||Buffer.byteLength(token)<32||/[^\x21-\x7e]/.test(token)||!/^[A-Za-z0-9_-]{1,80}$/.test(profile||'')||profile==='UNCONFIGURED')fail(503,'thesis_unconfigured')
  return {url,token,profile,fixture:thesisFixture(env)}
}
export default async function thesisGateway(req,res){
  privateResponse(res)
  try{
    const operator=await requireOperator(req)
    if(process.env.TRADEHUB_PREVIEW_ONLY==='true')fail(403,'feature_not_available_in_preview')
    if(req.method!=='GET')fail(405,'method_not_allowed')
    const action=req.query?.action
    if(!['status','company'].includes(action))fail(404,'unknown_action')
    const incoming=new URL(req.url||'/','http://same-origin.invalid')
    for(const key of incoming.searchParams.keys())if(!['symbol','as_of'].includes(key)||incoming.searchParams.getAll(key).length!==1)fail(400,'invalid_query')
    const query=req.query||{}
    if(Object.keys(query).some(key=>!['action','symbol','as_of'].includes(key)))fail(400,'invalid_query')
    if(action==='status'){
      if(query.symbol!==undefined||query.as_of!==undefined)fail(400,'invalid_query')
      return res.status(200).json({enabled:process.env.THESIS_ENABLED==='true',development_fixture:thesisFixture()})
    }
    if(process.env.THESIS_ENABLED!=='true')fail(503,'thesis_disabled')
    if(typeof query.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,9}$/.test(query.symbol))fail(400,'invalid_symbol')
    const asOf=query.as_of??new Date().toISOString().slice(0,10)
    if(typeof asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf||asOf>new Date().toISOString().slice(0,10))fail(400,'invalid_date')
    const config=thesisServiceConfiguration()
    if(!await reserve(`th:thesis:${operator}:${Math.floor(Date.now()/60000)}`,1,30,120))fail(429,'thesis_rate_limited')
    const target=new URL('/api/v1/thesis/company',config.url);target.searchParams.set('symbol',query.symbol);target.searchParams.set('as_of',asOf)
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
    try{
      const response=await fetch(target,{headers:{Authorization:`Bearer ${config.token}`,'X-TradeHub-Audience':'thesis-v1',Accept:'application/json'},signal:controller.signal,redirect:'error'})
      if(!response.headers.get('content-type')?.startsWith('application/json'))fail(502,'invalid_thesis_response')
      const text=await response.text();if(Buffer.byteLength(text)>2000000)fail(502,'invalid_thesis_response')
      const body=JSON.parse(text)
      if([config.token,encodeURIComponent(config.token)].some(secret=>text.includes(secret)||JSON.stringify(body).includes(secret)))fail(502,'invalid_thesis_response')
      if([401,403].includes(response.status))fail(502,'thesis_service_authentication_failed')
      if(!response.ok){if(![400,404,502,503,504].includes(response.status)||!errors.has(body.error?.code))fail(502,'invalid_thesis_response');return res.status(response.status).json({error:body.error.code.toLowerCase()})}
      assertThesisReport(body,{symbol:query.symbol,asOf,profile:config.profile,fixture:config.fixture})
      return res.status(200).json(body)
    }catch(error){if(error instanceof AccessError)throw error;fail(controller.signal.aborted?504:502,controller.signal.aborted?'thesis_deadline':'invalid_thesis_response')}
    finally{clearTimeout(timer)}
  }catch(error){sendFailure(res,error)}
}
