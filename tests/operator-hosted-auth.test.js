import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {execFileSync} from 'node:child_process'
import crypto from 'node:crypto'
const backend=vi.hoisted(()=>({values:new Map(),get:vi.fn(),set:vi.fn(),del:vi.fn(),eval:vi.fn()}))
vi.mock('@upstash/redis',()=>({Redis:{fromEnv:()=>backend}}))
const origin='https://synthetic-preview.example.test'
const password='synthetic-test-only-password'
function response(){return {code:200,headers:{},status(code){this.code=code;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this},send(body){this.body=JSON.parse(body);return this}}}
async function call(action,{cookie,requestOrigin=origin,body,method=action==='session'?'GET':'POST'}={}){
 const {default:handler}=await import('../api/intelligence/[action].js');const res=response()
 await handler({method,query:{action},headers:{cookie,origin:requestOrigin,'content-type':'application/json'},body:body??{password}},res);return res
}
beforeEach(()=>{
 vi.resetModules();backend.values.clear()
 backend.get.mockReset().mockImplementation(async k=>backend.values.get(k))
 backend.set.mockReset().mockImplementation(async(k,v)=>backend.values.set(k,v))
 backend.del.mockReset().mockImplementation(async k=>backend.values.delete(k))
 backend.eval.mockReset().mockResolvedValue(1)
 for(const [k,v] of Object.entries({NODE_ENV:'production',TRADEHUB_LOCAL_PREVIEW:'false',TRADEHUB_LOCAL_AUTH:'false',TRADEHUB_APP_ORIGIN:origin,TRADEHUB_OPERATOR_ID:'synthetic-preview-operator',KV_REST_API_URL:'https://synthetic-redis.example.test',KV_REST_API_TOKEN:'synthetic-redis-token',POLYGON_API_KEY:'synthetic-provider-key'}))vi.stubEnv(k,v)
 const salt='1'.repeat(32);vi.stubEnv('TRADEHUB_OPERATOR_PASSWORD_HASH',`${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`)
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"status":"OK","results":{"p":100}}',{status:200})))
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('cold-starts the native ESM session route without loading JSON report schemas',()=>{
 const code=`import handler from './api/intelligence/[action].js';const res={setHeader(){},status(code){this.code=code;return this},json(body){console.log(JSON.stringify({status:this.code,body}))}};await handler({method:'GET',query:{action:'session'},headers:{}},res)`
 const output=execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),encoding:'utf8',env:{PATH:process.env.PATH,NODE_ENV:'production'}})
 expect(JSON.parse(output)).toEqual({status:200,body:{authenticated:false}})
})
it('rejects anonymous Massive access and incorrect passwords without setting cookies',async()=>{
 expect((await call('session')).body).toEqual({authenticated:false})
 const {default:proxy}=await import('../api/polygon/proxy.js');const res=response()
 await proxy({method:'GET',query:{path:'/v2/last/trade/QQQ'},headers:{}},res)
 expect(res.code).toBe(401);expect(fetch).not.toHaveBeenCalled()
 const rejected=await call('login',{body:{password:'synthetic-wrong'}})
 expect(rejected.code).toBe(401);expect(rejected.headers['Set-Cookie']).toBeUndefined()
})
it('persists a synthetic hosted login across cold modules and admits only authenticated provider access',async()=>{
 const signed=await call('login');expect(signed.code).toBe(200)
 const cookie=signed.headers['Set-Cookie'].split(';')[0]
 expect(signed.headers['Set-Cookie']).toMatch(/HttpOnly; Secure; SameSite=Strict; Path=\//)
 expect(signed.headers['Set-Cookie']).not.toContain('Domain=')
 expect(signed.headers['Cache-Control']).toBe('private, no-store')
 expect(signed.body).toEqual({authenticated:true})
 const stored=[...backend.values.entries()][0]
 expect(stored[0]).not.toContain(cookie.split('=')[1]);expect(JSON.stringify(stored)).not.toContain(password)
 vi.resetModules()
 for(let i=0;i<2;i++)expect((await call('session',{cookie})).body).toEqual({authenticated:true})
 const {default:proxy}=await import('../api/polygon/proxy.js');const res=response()
 await proxy({method:'GET',query:{path:'/v2/last/trade/QQQ'},headers:{cookie}},res)
 expect(res.code).toBe(200);expect(fetch).toHaveBeenCalledTimes(1)
 expect(JSON.stringify(res.body)).not.toContain('synthetic-provider-key')
})
it('enforces exact CSRF origin for login/logout and invalidates the persisted session on logout',async()=>{
 for(const requestOrigin of [null,'','https://foreign.example.test']){
  const denied=await call('login',{requestOrigin});expect(denied.code).toBe(403)
 }
 const signed=await call('login'),cookie=signed.headers['Set-Cookie'].split(';')[0]
 expect((await call('logout',{cookie,requestOrigin:'https://foreign.example.test'})).code).toBe(403)
 expect((await call('session',{cookie})).body.authenticated).toBe(true)
 const out=await call('logout',{cookie});expect(out.code).toBe(200)
 expect(out.headers['Set-Cookie']).toContain('Max-Age=0')
 expect((await call('session',{cookie})).body.authenticated).toBe(false)
})
it('fails closed on missing owner configuration and Redis failures',async()=>{
 vi.stubEnv('TRADEHUB_OPERATOR_PASSWORD_HASH','')
 expect((await call('login')).body.error).toBe('operator_login_unconfigured')
 vi.stubEnv('KV_REST_API_URL','');expect((await call('login')).body.error).toBe('access_store_unconfigured')
 expect(fetch).not.toHaveBeenCalled()
})

it('returns a private unavailable response when persisted session storage fails',async()=>{
 const signed=await call('login'),cookie=signed.headers['Set-Cookie'].split(';')[0]
 backend.get.mockRejectedValue(new Error('synthetic store outage'))
 const session=await call('session',{cookie})
 expect(session.code).toBe(503);expect(session.body).toEqual({error:'service_unavailable'})
 expect(session.headers['Cache-Control']).toBe('private, no-store')
})
