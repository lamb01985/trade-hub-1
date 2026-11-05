import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
const backend=vi.hoisted(()=>({values:new Map(),get:vi.fn(),set:vi.fn(),del:vi.fn(),eval:vi.fn()}))
vi.mock('@upstash/redis',()=>({Redis:{fromEnv:()=>backend}}))
const origin='https://synthetic-preview.example.test',password='synthetic-test-password'
function response(){return {code:200,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this}}}
async function call(action,{cookie,requestOrigin=origin,body,method=['session','watchlist'].includes(action)?'GET':'POST'}={}) {
  const {default:handler}=await import('../api/desk.js');const res=response()
  await handler({method,query:{action},headers:{cookie,origin:requestOrigin,'content-type':'application/json'},body:body??{password}},res)
  return res
}
beforeEach(()=>{
  vi.resetModules();backend.values.clear()
  backend.get.mockReset().mockImplementation(async k=>backend.values.get(k))
  backend.set.mockReset().mockImplementation(async(k,v)=>backend.values.set(k,v))
  backend.del.mockReset().mockImplementation(async k=>backend.values.delete(k))
  backend.eval.mockReset().mockImplementation(async(script,keys,args)=>{
    if(keys[0]!=='th:massive:desk:cooldown')return 1
    const current=backend.values.get(keys[0])||0
    const until=args[1]?Math.max(current,Number(args[0])+Number(args[1])*1000):current
    backend.values.set(keys[0],until)
    return Math.max(0,Math.ceil((until-Number(args[0]))/1000))
  })
  const salt='1'.repeat(32)
  for(const [k,v] of Object.entries({NODE_ENV:'production',TRADEHUB_LOCAL_AUTH:'false',TRADEHUB_LOCAL_PREVIEW:'false',TRADEHUB_APP_ORIGIN:origin,TRADEHUB_OPERATOR_ID:'test-owner',TRADEHUB_OPERATOR_PASSWORD_HASH:`${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`,KV_REST_API_URL:'https://synthetic-redis.example.test',KV_REST_API_TOKEN:'synthetic-token',POLYGON_API_KEY:'synthetic-provider-key'}))vi.stubEnv(k,v)
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"tickers":[],"results":[]}',{status:200})))
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('cold-starts the deployed native ESM desk and denies anonymous observations',()=>{
  const code=`import handler from './api/desk.js';const r={setHeader(){},status(n){this.code=n;return this},json(body){console.log(JSON.stringify({code:this.code,body}))}};await handler({method:'GET',query:{action:'watchlist'},headers:{}},r)`
  const output=execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production'}})
  expect(JSON.parse(output)).toEqual({code:401,body:{error:'operator_login_required'}})
})
it('checks authorization before any provider call and rejects wrong passwords',async()=>{
  expect((await call('session')).body).toEqual({authenticated:false})
  expect((await call('watchlist')).code).toBe(401)
  const r=await call('login',{body:{password:'wrong'}})
  expect(r.code).toBe(401);expect(r.headers['Set-Cookie']).toBeUndefined();expect(fetch).not.toHaveBeenCalled()
})
it('persists hosted sessions across cold modules and invalidates them on logout',async()=>{
  const r=await call('login');expect(r.code).toBe(200)
  const cookie=r.headers['Set-Cookie'].split(';')[0]
  expect(r.headers['Set-Cookie']).toMatch(/HttpOnly; Secure; SameSite=Strict; Path=\//)
  expect(r.headers['Cache-Control']).toBe('private, no-store')
  expect(JSON.stringify([...backend.values])).not.toContain(password)
  expect([...backend.values.keys()][0]).not.toContain(cookie.split('=')[1])
  vi.resetModules()
  expect((await call('session',{cookie})).body.authenticated).toBe(true)
  expect((await call('watchlist',{cookie})).code).toBe(200)
  expect((await call('logout',{cookie})).code).toBe(200)
  expect((await call('watchlist',{cookie})).code).toBe(403)
})
it('rejects cross-origin mutations and fails closed without operator configuration',async()=>{
  expect((await call('login',{requestOrigin:'https://other.example.test'})).code).toBe(403)
  vi.stubEnv('TRADEHUB_OPERATOR_PASSWORD_HASH','')
  const r=await call('login');expect(r.code).toBe(503);expect(r.body.error).toBe('operator_login_unconfigured')
})
it('preserves provider cooldown without immediate retry or secret exposure',async()=>{
  const signed=await call('login'),cookie=signed.headers['Set-Cookie'].split(';')[0]
  fetch.mockImplementation(async()=>new Response('{"status":"ERROR","message":"synthetic-provider-key"}',{status:429,headers:{'Retry-After':'120'}}))
  const r=await call('watchlist',{cookie})
  expect(r.body.stocks).toEqual({data:null,error:'RATE_LIMITED',retryAfter:120})
  expect(fetch).toHaveBeenCalledTimes(1) // one bounded snapshot; production adapter does not admit index snapshots
  expect(JSON.stringify(r.body)).not.toContain('synthetic-provider-key')
  vi.resetModules()
  await call('watchlist',{cookie})
  expect(fetch).toHaveBeenCalledTimes(1)
  const {polygonFetch}=await import('../api/_lib/polygon.js')
  expect((await polygonFetch('/v2/last/trade/QQQ')).status).toBe(429)
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('stops remaining context calls after a non-JSON provider throttle',async()=>{
  const signed=await call('login'),cookie=signed.headers['Set-Cookie'].split(';')[0]
  fetch.mockImplementation(async()=>new Response('upstream unavailable',{status:429,headers:{'Retry-After':'120'}}))
  const {default:handler}=await import('../api/desk.js'),res=response()
  await handler({method:'GET',query:{action:'context',symbol:'QQQ',period:'current'},headers:{cookie}},res)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(res.body.bars.error).toBe('RATE_LIMITED')
  expect(res.body.previous.retryAfter).toBeGreaterThanOrEqual(119)
  expect(res.body.completed.retryAfter).toBeGreaterThanOrEqual(119)
})
