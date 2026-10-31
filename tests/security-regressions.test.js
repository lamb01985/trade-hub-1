import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
const origin = 'http://127.0.0.1:4180'
function response() { return { code: 200, headers: {}, status(code) { this.code = code; return this }, setHeader(k,v) { this.headers[k] = v }, json(body) { this.body = body; return this }, send(body) { this.body = JSON.parse(body); return this } } }
async function call(route, cookie, options = {}) {
 const loaders = { 'polygon/proxy': () => import('../api/polygon/proxy.js'), 'polygon/ws-auth': () => import('../api/polygon/ws-auth.js'), 'notify-email': () => import('../api/notify-email.js'), 'notify-telegram': () => import('../api/notify-telegram.js') }
 const { default: handler } = await loaders[route]()
 const res = response()
 await handler({ method: route.startsWith('notify') ? 'POST' : 'GET', query: {path:'/v2/last/trade/AAPL'}, body: route === 'notify-email' ? {subject:'Synthetic',html:'<p>test</p>'} : {message:'Synthetic'}, headers:{cookie,origin,'content-type':'application/json'}, ...options },res)
 return res
}
async function login() { const {login} = await import('../api/_lib/access.js'); const res=response(); await login({headers:{origin}},res,'synthetic-password');return res.headers['Set-Cookie'].split(';')[0] }
beforeEach(() => {
 vi.resetModules()
 for (const [key,value] of Object.entries({NODE_ENV:'development',TRADEHUB_LOCAL_PREVIEW:'true',TRADEHUB_APP_ORIGIN:origin,TRADEHUB_OPERATOR_ID:'synthetic-operator',POLYGON_API_KEY:'synthetic/key+secret',RESEND_API_KEY:'synthetic-resend',NOTIFICATION_EMAIL:'synthetic@example.test',TELEGRAM_BOT_TOKEN:'synthetic-telegram',TELEGRAM_CHAT_ID:'synthetic-chat'})) vi.stubEnv(key,value)
 const salt='a'.repeat(32);vi.stubEnv('TRADEHUB_OPERATOR_PASSWORD_HASH',`${salt}:${crypto.scryptSync('synthetic-password',salt,64).toString('hex')}`)
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"ok":true,"id":"synthetic-id"}')))
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals()})
const routes=['polygon/proxy','polygon/ws-auth','notify-email','notify-telegram']
it.each(routes)('denies anonymous and malformed sessions on %s without network',async route=>{
 for(const cookie of [undefined,'th_operator=malformed']) {const r=await call(route,cookie);expect(r.code).toBe(401);expect(r.headers['Cache-Control']).toBe('private, no-store');expect(r.headers.Vary).toBe('Cookie')}
 expect(fetch).not.toHaveBeenCalled()
})
it.each(routes)('denies expired/wrong sessions and fails closed on store failure on %s',async route=>{
 const cookie=await login();vi.stubEnv('TRADEHUB_OPERATOR_ID','different');expect((await call(route,cookie)).code).toBe(403)
 vi.stubEnv('TRADEHUB_OPERATOR_ID','synthetic-operator');vi.useFakeTimers();vi.setSystemTime(Date.now()+9*3600000);expect((await call(route,cookie)).code).toBe(403);vi.useRealTimers()
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('KV_REST_API_URL','');expect((await call(route,cookie)).code).toBe(503);expect(fetch).not.toHaveBeenCalled()
})
it('keeps method rejection private and ahead of authentication',async()=>{for(const route of routes){const r=await call(route,null,{method:'DELETE'});expect(r.code).toBe(405);expect(r.headers.Vary).toBe('Cookie')}})
it('supports authenticated REST and retires key delivery while redacting recursive credential echoes',async()=>{
 const cookie=await login();const key='synthetic/key+secret';fetch.mockResolvedValue(new Response(JSON.stringify({[key]:[key,encodeURIComponent(key)]}),{status:403}))
 const r=await call('polygon/proxy',cookie);expect(r.code).toBe(403);expect(JSON.stringify(r.body)).not.toContain(key);expect(JSON.stringify(r.body)).not.toContain(encodeURIComponent(key));expect(r.body['[REDACTED]']).toEqual(['[REDACTED]','[REDACTED]'])
 expect(fetch.mock.calls[0][1].redirect).toBe('error');expect(new URL(fetch.mock.calls[0][0]).origin).toBe('https://api.polygon.io');expect((await call('polygon/ws-auth',cookie)).body).toEqual({error:'STREAMING_CREDENTIAL_DELIVERY_RETIRED',transport:'REST_POLL'})
})
it('rejects original prefix/traversal/parameter bypasses in handler and direct helper',async()=>{
 const cookie=await login();const {polygonFetch}=await import('../api/_lib/polygon.js')
 for(const path of ['/v2/aggs/ticker/../../options/x','/v2/reference/news-extra','/v2/aggs/ticker/%2e%2e/x','/v2/aggs/ticker/%252e%252e/x','/v2/last/trade/AAPL?apiKey=x','/v2/last/trade/AAPL#x','/v2/last/trade//AAPL','/v2/last/trade/AAPL\\x']){
 expect((await call('polygon/proxy',cookie,{query:{path}})).code).toBe(400);await expect(polygonFetch(path)).rejects.toMatchObject({status:400})
 }
 for(const params of [{apiKey:'evil'},{APIKEY:'evil'},{url:'evil'},{limit:'1'},{method:'POST'},{path:[]}] ) expect((await call('polygon/proxy',cookie,{query:{path:'/v2/last/trade/AAPL',...params}})).code).toBe(400)
 expect(fetch).not.toHaveBeenCalled()
})
it('validates every allowed route and strict typed query boundary',async()=>{
 const {validateProviderRequest:v}=await import('../api/_lib/polygon.js')
 for(const path of ['/v2/last/trade/AAPL','/v2/aggs/ticker/AAPL/prev','/v2/aggs/ticker/BRK.B/range/1000/day/2024-02-29/2024-03-01','/v2/snapshot/locale/us/markets/stocks/tickers/AAPL','/v2/snapshot/locale/us/markets/stocks/gainers','/v2/snapshot/locale/us/markets/stocks/losers','/v2/reference/news','/v3/reference/tickers/AAPL','/v3/reference/short-interest','/vX/reference/financials'])expect(()=>v(path)).not.toThrow()
 for(const limit of ['',null,undefined,1,true,[],{},'0','01','1e2','50001'])expect(()=>v('/v2/reference/news',{limit})).toThrow()
 for(const path of ['/v2/aggs/ticker/AAPL/range/1001/day/2024-01-01/2024-02-01','/v2/aggs/ticker/AAPL/range/1/day/2023-02-29/2024-02-01','/v2/aggs/ticker/AAPL/range/1/day/2024-02-02/2024-02-01'])expect(()=>v(path)).toThrow()
 expect(()=>v('/v2/reference/news',{ticker:'AAPL',sort:'published_utc',limit:'50000',order:'desc'})).not.toThrow()
})
it('sanitizes non-JSON, empty, redirect and exception failures and missing configuration',async()=>{
 const cookie=await login()
 for(const upstream of [new Response('synthetic/key+secret',{status:500}),new Response(null,{status:204}),new Response('{}',{status:302})]){fetch.mockResolvedValue(upstream);const r=await call('polygon/proxy',cookie);expect(r.code).toBe(502);expect(r.body).toEqual({error:'upstream_unavailable'})}
 fetch.mockRejectedValue(new Error('synthetic/key+secret'));expect((await call('polygon/proxy',cookie)).body).toEqual({error:'upstream_unavailable'})
 vi.stubEnv('POLYGON_API_KEY','');expect((await call('polygon/proxy',cookie)).code).toBe(503);expect((await call('polygon/ws-auth',cookie)).code).toBe(410)
})
it('never delivers a key and still bounds REST reservations',async()=>{
 const cookie=await login();const {reserve}=await import('../api/_lib/access.js');const bucket=Math.floor(Date.now()/60000)
 for(let i=0;i<12;i++){const ws=await call('polygon/ws-auth',cookie);expect(ws.code).toBe(410);expect(JSON.stringify(ws.body)).not.toContain('synthetic/key+secret')}
 await reserve(`th:provider:rest:synthetic-operator:${bucket}`,1200,1200,120);expect((await call('polygon/proxy',cookie)).code).toBe(429);expect(fetch).not.toHaveBeenCalled()
})
it.each(['notify-email','notify-telegram'])('validates origin/body/config before sends for %s',async route=>{
 const cookie=await login()
 for(const body of [null,[],{},'invalid',{to:'attacker',subject:'x',html:'x'},{message:' '},{subject:' ',html:'x'},{message:'x',parseMode:'unsafe'}])expect((await call(route,cookie,{body})).code).toBe(400)
 expect((await call(route,cookie,{headers:{cookie,origin:'https://evil.test','content-type':'application/json'}})).code).toBe(403)
 expect((await call(route,cookie,{headers:{cookie,origin,'content-type':'text/plain'}})).code).toBe(415)
 expect((await call(route,cookie,{body:JSON.stringify({message:'x'.repeat(33000)})})).code).toBe(413)
 vi.stubEnv(route==='notify-email'?'RESEND_API_KEY':'TELEGRAM_BOT_TOKEN','');expect((await call(route,cookie)).code).toBe(503);expect(fetch).not.toHaveBeenCalled()
})
it.each(['notify-email','notify-telegram'])('sends once to configured recipient and deduplicates %s',async route=>{
 const cookie=await login();expect((await call(route,cookie)).body).toEqual({ok:true});expect((await call(route,cookie)).body).toEqual({ok:true,deduplicated:true});expect(fetch).toHaveBeenCalledTimes(1)
 const options=fetch.mock.calls[0][1];expect(options.redirect).toBe('error');const body=JSON.parse(options.body);expect(route==='notify-email'?body.to:body.chat_id).toBe(route==='notify-email'?'synthetic@example.test':'synthetic-chat')
 for(let i=0;i<8;i++)await call(route,cookie);const r=await call(route,cookie);expect(r.code).toBe(429);expect(r.headers['Retry-After']).toBe('60')
})
it('enforces daily budget before dedup and treats malformed success as safe failure',async()=>{
 const cookie=await login();const {reserve}=await import('../api/_lib/access.js');await reserve(`th:notification:email:synthetic-operator:day:${new Date().toISOString().slice(0,10)}`,200,200,172800)
 expect((await call('notify-email',cookie)).code).toBe(429);expect(fetch).not.toHaveBeenCalled()
 for(const [i,data] of [null,[],{ok:false},'synthetic-telegram'].entries()){fetch.mockResolvedValue(new Response(JSON.stringify(data)));const r=await call('notify-telegram',cookie,{body:{message:`case-${i}`}});expect(r.code).toBe(502);expect(r.body).toEqual({error:'upstream_unavailable'})}
})
it('uses shared atomic hosted reservations and fails closed on quota-store outage',async()=>{
 const {Redis}=await import('@upstash/redis');const values=new Map();const evalMock=vi.fn(async(_script,[key],[amount,ceiling])=>{const current=values.get(key)||0;if(current+amount>ceiling)return 0;values.set(key,current+amount);return 1})
 const spy=vi.spyOn(Redis,'fromEnv').mockReturnValue({get:vi.fn(async key=>values.get(key)),set:vi.fn(async(key,value)=>values.set(key,value)),eval:evalMock})
 try {
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('TRADEHUB_APP_ORIGIN','https://synthetic.example.test');vi.stubEnv('KV_REST_API_URL','https://synthetic-store.example.test');vi.stubEnv('KV_REST_API_TOKEN','synthetic-store-token')
  const {login:hostedLogin}=await import('../api/_lib/access.js');const res=response();await hostedLogin({headers:{origin:'https://synthetic.example.test'}},res,'synthetic-password');const cookie=res.headers['Set-Cookie'].split(';')[0]
  expect((await call('polygon/ws-auth',cookie)).code).toBe(410);await (await import('../api/_lib/access.js')).reserve('synthetic-quota',1,10,120);expect(evalMock.mock.calls.at(-1)[2]).toEqual([1,10,120]);evalMock.mockRejectedValue(new Error('synthetic-store-token'))
  const r=await call('polygon/proxy',cookie);expect(r.code).toBe(503);expect(r.body).toEqual({error:'service_unavailable'});expect(fetch).not.toHaveBeenCalled()
 } finally {spy.mockRestore()}
})
it('keeps attempt timeouts active while consuming REST and notification response bodies',async()=>{
 const cookie=await login();vi.useFakeTimers()
 fetch.mockImplementation(async(_url,options)=>({status:200,ok:true,text:()=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('synthetic-token'))))}))
 for(const route of ['polygon/proxy','notify-email']){const pending=call(route,cookie);await vi.advanceTimersByTimeAsync(10001);const result=await pending;expect(result.code).toBe(502);expect(result.body).toEqual({error:'upstream_unavailable'})}
})
it('retries REST once on 429 and never retries notification delivery',async()=>{
 const cookie=await login();vi.useFakeTimers();fetch.mockResolvedValueOnce(new Response('{"error":"busy"}',{status:429})).mockResolvedValueOnce(new Response('{"results":[]}'))
 const pending=call('polygon/proxy',cookie);await vi.advanceTimersByTimeAsync(501);expect((await pending).code).toBe(200);expect(fetch).toHaveBeenCalledTimes(2)
 fetch.mockReset().mockResolvedValue(new Response('{"error":"synthetic-resend"}',{status:429}));expect((await call('notify-email',cookie)).code).toBe(502);expect(fetch).toHaveBeenCalledTimes(1)
})

it.each(['60','invalid','86402'])('propagates safe provider Retry-After %s without an early retry',async hint=>{
 const cookie=await login();fetch.mockResolvedValue(new Response('{}',{status:429,headers:{'Retry-After':hint}}));const r=await call('polygon/proxy',cookie);expect(r.code).toBe(429);expect(r.headers['Retry-After']).toBe(hint==='60'?'60':'86401');expect(fetch).toHaveBeenCalledTimes(1)
})
