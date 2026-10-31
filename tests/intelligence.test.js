import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { adaptPythonReport, freshness, parseReport } from '../src/lib/reportContract.js'
import { briefFixture } from './analystFixture.js'
import { pythonReport } from './reportFixture.js'

const dirs=[]
beforeEach(()=>{
 vi.resetModules()
 vi.stubEnv('NODE_ENV','development'); vi.stubEnv('TRADEHUB_LOCAL_PREVIEW','true')
 vi.stubEnv('TRADEHUB_APP_ORIGIN','http://127.0.0.1:4180');vi.stubEnv('TRADEHUB_OPERATOR_ID','test-operator')
 const salt='a'.repeat(32);vi.stubEnv('TRADEHUB_OPERATOR_PASSWORD_HASH',`${salt}:${crypto.scryptSync('test-password',salt,64).toString('hex')}`)
 vi.stubEnv('ANTHROPIC_API_KEY','test-provider-value');vi.stubEnv('AI_ENABLE_BILLING','true');vi.stubEnv('AI_DAILY_BUDGET_USD','1')
 const dir=mkdtempSync(path.join(os.tmpdir(),'th-test-')); dirs.push(dir)
 const file=path.join(dir,'report.json');writeFileSync(file,JSON.stringify(pythonReport()));vi.stubEnv('TRADEHUB_REPORT_FILE',file)
})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true})})
function response(){return {code:200,headers:{},status(code){this.code=code;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this}}}
async function request(action,method='GET',body, cookie,origin='http://127.0.0.1:4180'){
 const {default:handler}=await import('../api/intelligence/[action].js');const res=response();await handler({method,query:{action},body,headers:{origin,'content-type':'application/json',cookie}},res);return res
}
async function signedIn(){const res=await request('login','POST',{password:'test-password'});expect(res.code).toBe(200);return res.headers['Set-Cookie'].split(';')[0]}
it('adapts Python results without recalculating levels and labels stale data',()=>{
 const raw=pythonReport();const result=adaptPythonReport(raw,new Date('2026-10-26T12:00:00Z'))
 expect(result.daily_features.QQQ.support_resistance).toEqual(raw.daily_features.QQQ.support_resistance)
 expect(result.sample).toBe(true);expect(result.freshness).toBe('STALE');expect(parseReport(result)).toBe(result)
 expect(freshness('2026-10-27T12:00:00Z',new Date('2026-10-26T12:00:00Z'))).toBe('FUTURE_TIMESTAMP')
})
it.each(['schema_version','observation_cutoff','daily_features'])('rejects invalid Python %s',key=>{const r=pythonReport();r[key]='invalid';expect(()=>adaptPythonReport(r)).toThrow()})
it('denies anonymous licensed reads and never returns data in the failure',async()=>{const r=await request('latest');expect(r.code).toBe(401);expect(r.body).toEqual({error:'operator_login_required'});expect(r.headers['Cache-Control']).toContain('no-store')})
it('requires valid password and same origin, protects session and revokes logout',async()=>{
 expect((await request('login','POST',{password:'wrong'})).code).toBe(401)
 expect((await request('login','POST',{password:'test-password'},null,'https://other.test')).code).toBe(403)
 const cookie=await signedIn();const r=await request('latest','GET',null,cookie);expect(r.code).toBe(200);expect(r.body.contract_version).toBe('tradehub-intelligence-v1')
 expect((await request('latest','POST',{},cookie)).code).toBe(405)
 expect((await request('logout','POST',{},cookie)).code).toBe(200)
 expect((await request('latest','GET',null,cookie)).code).toBe(403)
})
it('forbids a session belonging to a different configured operator',async()=>{const cookie=await signedIn();vi.stubEnv('TRADEHUB_OPERATOR_ID','someone-else');expect((await request('latest','GET',null,cookie)).code).toBe(403)})
it('fails closed when reports or production shared access store are missing',async()=>{
 const cookie=await signedIn();vi.stubEnv('TRADEHUB_REPORT_FILE','/nonexistent');expect((await request('latest','GET',null,cookie)).code).toBe(503)
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('KV_REST_API_URL','');expect((await request('latest','GET',null,cookie)).code).toBe(503)
})
it('limits login attempts',async()=>{for(let i=0;i<10;i++)expect((await request('login','POST',{password:''})).code).toBe(400);expect((await request('login','POST',{password:''})).code).toBe(429)})
async function ai(action,body,cookie){const {default:handler}=await import('../api/ai/[action].js');const res=response();await handler({method:action==='status'?'GET':'POST',query:{action},body,headers:{origin:'http://127.0.0.1:4180','content-type':'application/json',cookie}},res);return res}
it('verifies server configuration without revealing keys and blocks unauthenticated AI',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect((await ai('brief',{prompt:'x'})).code).toBe(401)
 const cookie=await signedIn();const r=await ai('status',null,cookie);expect(r.body).toEqual({configured:true,enabled:true,model:'claude-sonnet-4-6'});expect(JSON.stringify(r.body)).not.toContain('test-provider-value');expect(fetch).not.toHaveBeenCalled()
})
it('rejects oversized and invalid input before contacting Anthropic',async()=>{
 const cookie=await signedIn();const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 for(const body of [{prompt:''},{prompt:'x'.repeat(32001)},{prompt:'x',maxTokens:4001},{prompt:'x',maxTokens:1.5}])expect((await ai('brief',body,cookie)).code).toBe(400)
 expect(fetch).not.toHaveBeenCalled()
})
it('reserves budget before upstream, prevents overspending and sanitizes errors',async()=>{
 const cookie=await signedIn();vi.stubEnv('AI_DAILY_BUDGET_USD','0.01');const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 expect((await ai('brief',{prompt:'x',maxTokens:4000},cookie)).body.error).toBe('ai_daily_budget_exhausted');expect(fetch).not.toHaveBeenCalled()
 vi.stubEnv('AI_DAILY_BUDGET_USD','1');fetch.mockResolvedValue({ok:false,status:500,json:async()=>({error:{message:'test-provider-value'}})})
 const r=await ai('brief',{prompt:'x'},cookie);expect(r.code).toBe(502);expect(JSON.stringify(r.body)).not.toContain('test-provider-value')
})
it('enforces rate limits across all AI actions and atomic budget reservations',async()=>{
 const cookie=await signedIn();const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({content:[{type:'text',text:'ok'}]})});vi.stubGlobal('fetch',fetch)
 for(const action of ['brief','wheel-ai','eod-coach'])expect((await ai(action,{prompt:'x'},cookie)).code).toBe(200)
 expect((await ai('short-thesis',{prompt:'x'},cookie)).code).toBe(429);expect(fetch).toHaveBeenCalledTimes(3)
 const {reserve}=await import('../api/_lib/access.js');const results=await Promise.all([reserve('concurrent',6,10,60),reserve('concurrent',6,10,60)]);expect(results.filter(Boolean)).toHaveLength(1)
})

it('validates the analyst contract and rejects claims of historical validation',()=>{const raw=pythonReport();raw.analyst_briefs=[briefFixture()];expect(adaptPythonReport(raw).analyst_briefs[0].schema_version).toBe('analyst-brief-v1');raw.analyst_briefs[0].historical_validation='VALIDATED';expect(()=>adaptPythonReport(raw)).toThrow()})
