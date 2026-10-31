import {it,expect,vi,beforeEach,afterEach} from 'vitest'
import crypto from 'node:crypto'
import fixture from './fixtures/thesis-company.json' with {type:'json'}
import {assertThesisReport} from '../src/lib/thesisContract.js'
let handler,cookie
const origin='http://127.0.0.1:5181'
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.code=c;return this},json(body){this.body=body;return this}})
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
async function call(query={symbol:'DEMOA',as_of:'2026-10-30'},options={}){const r=res();const action=options.action||'company';await handler({method:'GET',url:`/api/thesis/${action}?${new URLSearchParams(query)}`,query:{action,...query},headers:{cookie},...options},r);return r}
beforeEach(async()=>{
 vi.resetModules()
 const salt='0'.repeat(32),hash=crypto.scryptSync('synthetic-password',salt,64).toString('hex')
 for(const[k,v]of Object.entries({NODE_ENV:'development',TRADEHUB_LOCAL_AUTH:'true',TRADEHUB_APP_ORIGIN:origin,TRADEHUB_OPERATOR_ID:'synthetic',TRADEHUB_OPERATOR_PASSWORD_HASH:`${salt}:${hash}`,THESIS_ENABLED:'true',THESIS_DEV_FIXTURES:'true',MARKET_DATA_SERVICE_URL:'http://127.0.0.1:8782',MARKET_DATA_SERVICE_TOKEN:'s'.repeat(40),MARKET_DATA_DEPLOYMENT_PROFILE:'fixture-test'}))vi.stubEnv(k,v)
 vi.stubEnv('VERCEL','');vi.stubEnv('MASSIVE_API_KEY','');vi.stubEnv('POLYGON_API_KEY','');vi.stubEnv('MASSIVE_ACCOUNT_BUDGET_SCOPE','')
 const access=await import('../api/_lib/access.js');const r=res();await access.login({headers:{origin}},r,'synthetic-password');cookie=r.headers['Set-Cookie'].split(';')[0]
 handler=(await import('../api/_lib/thesisGateway.js')).default;vi.stubGlobal('fetch',vi.fn(async()=>reply(fixture)))
})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})
it('serves authenticated company evidence without Massive configuration or forwarding browser credentials',async()=>{
 const result=await call();expect(result.code).toBe(200);expect(result.body.issuer.symbol).toBe('DEMOA');expect(result.headers['Cache-Control']).toBe('private, no-store')
 const [url,options]=fetch.mock.calls[0];expect(url.origin).toBe('http://127.0.0.1:8782');expect(options.headers['X-TradeHub-Audience']).toBe('thesis-v1');expect(options.headers.Cookie).toBeUndefined();expect(options.headers.Authorization).toBe('Bearer '+'s'.repeat(40));expect(options.redirect).toBe('error')
})
it('requires actual operator authorization before feature/provider access',async()=>{
 expect((await call(undefined,{headers:{}})).code).toBe(401);expect((await call(undefined,{headers:{cookie:'th_operator='+'a'.repeat(64)}})).code).toBe(403);expect(fetch).not.toHaveBeenCalled()
})
it('discovers Thesis independently from Massive and fails closed when disabled',async()=>{
 const result=await call({}, {action:'status'});expect(result.body).toEqual({enabled:true,development_fixture:true});expect(fetch).not.toHaveBeenCalled();vi.stubEnv('THESIS_ENABLED','false');expect((await call()).code).toBe(503);expect(fetch).not.toHaveBeenCalled()
})
it.each([{symbol:'DEMOA',url:'https://evil.test'},{symbol:'../AAPL'},{symbol:'DEMOA',as_of:'2099-01-01'},{symbol:'DEMOA',as_of:'2026-02-30'}])('rejects invalid query before source calls %j',async query=>{expect((await call(query)).code).toBe(400);expect(fetch).not.toHaveBeenCalled()})
it('rejects duplicate keys and hosted fixture mode',async()=>{
 expect((await call(undefined,{url:'/api/thesis/company?symbol=DEMOA&symbol=DEMOB'})).code).toBe(400);vi.stubEnv('NODE_ENV','production');const {thesisFixture}=await import('../api/_lib/thesisGateway.js');expect(()=>thesisFixture()).toThrow()
})
it('distinguishes service authorization failure from operator expiry',async()=>{
 fetch.mockResolvedValue(reply({error:{code:'SERVICE_AUDIENCE_INVALID'}},403));const r=await call();expect(r.code).toBe(502);expect(r.headers['X-TradeHub-Auth-Required']).toBeUndefined()
})
it.each(['issuer','scores','source_type','extra'])('rejects forged upstream %s contracts',async field=>{
 const body=structuredClone(fixture);if(field==='issuer')body.issuer.symbol='DEMOB';if(field==='scores')body.scores.long_coverage=.5;if(field==='source_type')body.source_type='SEC_EDGAR';if(field==='extra')body.apiKey='not-allowed';fetch.mockResolvedValue(reply(body));expect((await call()).code).toBe(502)
})
it('rejects credential echoes and unsafe destinations without leaking details',async()=>{
 const body=structuredClone(fixture);body.issuer.name='s'.repeat(40);fetch.mockResolvedValue(reply(body));const r=await call();expect(r.code).toBe(502);expect(JSON.stringify(r.body)).not.toContain('s'.repeat(40));vi.stubEnv('MARKET_DATA_SERVICE_URL','http://evil.test');fetch.mockClear();expect((await call()).code).toBe(503);expect(fetch).not.toHaveBeenCalled()
})
it('validates synthetic Python evidence without granting valuation or execution readiness',()=>{
 expect(assertThesisReport(fixture,{symbol:'DEMOA',profile:'fixture-test',fixture:true}).readiness).toBe('NOT_EVALUATED')
 const body=structuredClone(fixture);body.assessments.entry.state='GREEN';expect(()=>assertThesisReport(body)).toThrow()
})

it('denies research in the protected market-only profile even when its feature flag is enabled',async()=>{
 vi.stubEnv('TRADEHUB_PREVIEW_ONLY','true');const result=await call({}, {action:'status'});expect(result.code).toBe(403);expect(fetch).not.toHaveBeenCalled()
})
