import { afterEach, expect, it, vi } from 'vitest'
import tombstone from '../api/polygon/ws-auth.js'
import proxy from '../api/polygon/proxy.js'
import { isAllowedPath, polygonFetch } from '../api/_lib/polygon.js'
const response=()=>({headers:{},code:200,setHeader(name,value){this.headers[name]=value},status(code){this.code=code;return this},json(body){this.body=body;return this},send(body){this.body=body;return this}})
const synthetic='synthetic-only-provider+credential/for-regression'
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
it.each(['GET','HEAD','POST','PUT','DELETE','OPTIONS'])('never delivers credentials for %s, including apparent same-origin/signed-in callers',async method=>{
 vi.stubEnv('POLYGON_API_KEY',synthetic);vi.stubGlobal('fetch',vi.fn());const res=response()
 await tombstone({method,headers:{origin:'https://trade-hub-1.vercel.app',cookie:'th_operator=untrusted'},query:{apiKey:'override'}},res)
 expect(res.code).toBe(410);expect(JSON.stringify(res.body)).toBe('{"error":"PROVIDER_CREDENTIAL_DELIVERY_RETIRED"}');expect(res.headers['Cache-Control']).toContain('no-store');expect(res.headers['Vercel-CDN-Cache-Control']).toBe('no-store');expect(fetch).not.toHaveBeenCalled()
})
it('fails closed when the provider is unconfigured',async()=>{vi.stubEnv('POLYGON_API_KEY','');const res=response();await tombstone({},res);expect(res.code).toBe(410)})
it('redacts nested upstream URL/key echoes without corrupting market observations',async()=>{
 vi.stubEnv('POLYGON_API_KEY',synthetic);vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ticker:{ticker:'QQQ',lastTrade:{p:100,t:123}},nested:{url:encodeURIComponent(synthetic),apiKey:'unexpected-upstream-key'},[synthetic]:synthetic}),{status:200,headers:{'Content-Type':'application/json'}})))
 const res=response();await proxy({method:'GET',query:{path:'/v2/last/trade/QQQ'}},res)
 expect(res.code).toBe(200);expect(res.body).not.toContain(synthetic);expect(res.body).not.toContain(encodeURIComponent(synthetic));expect(JSON.parse(res.body).ticker.lastTrade.p).toBe(100);expect(JSON.parse(res.body).nested.apiKey).toBe('[REDACTED]');expect(fetch.mock.calls[0][1].redirect).toBe('error')
})
it('does not expose rejected-fetch error messages or non-JSON upstream bodies',async()=>{
 vi.stubEnv('POLYGON_API_KEY',synthetic);vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('Request URL '+synthetic)).mockResolvedValueOnce(new Response('secret '+synthetic)))
 for(let i=0;i<2;i++){const res=response();await proxy({method:'GET',query:{path:'/v2/last/trade/QQQ'}},res);expect(res.code).toBe(502);expect(res.body).toEqual({error:'upstream_failed'})}
})
it.each(['http:','/v2/last/trade/../../secret','/v2/last/trade/%2e%2e/secret','/v2/last/trade/QQQ?apiKey=override','/v2/last/trade/QQQ#fragment','//attacker.test/v2/last/trade/QQQ'])('rejects credential-routing escape %s',async path=>{vi.stubGlobal('fetch',vi.fn());expect(isAllowedPath(path)).toBe(false);const res=response();await proxy({method:'GET',query:{path}},res);expect(res.code).toBe(400);expect(fetch).not.toHaveBeenCalled()})
it('rejects caller credential override before any upstream request',async()=>{vi.stubEnv('POLYGON_API_KEY',synthetic);vi.stubGlobal('fetch',vi.fn());await expect(polygonFetch('/v2/last/trade/QQQ',{apiKey:'override'})).rejects.toMatchObject({code:'invalid_provider_request'});expect(fetch).not.toHaveBeenCalled()})
