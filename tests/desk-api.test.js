import { afterEach,it,expect,vi } from 'vitest'
import crypto from 'node:crypto'
import desk from '../api/desk.js'
import {stateSet} from '../api/_lib/access.js'
import {validateProviderRequest} from '../api/_lib/polygon.js'
function res(){return {code:200,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(v){this.body=v;return this}}}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
async function req(query){
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('TRADEHUB_LOCAL_AUTH','true');vi.stubEnv('TRADEHUB_APP_ORIGIN','http://127.0.0.1:5173');vi.stubEnv('TRADEHUB_OPERATOR_ID','desk-test');vi.stubEnv('POLYGON_API_KEY','synthetic-test');vi.stubEnv('MARKET_DATA_UNIFIED_ENABLED','false');vi.stubEnv('MASSIVE_BUDGET_ENFORCED','false')
  const id=crypto.randomBytes(32).toString('hex');await stateSet('th:operator:session:'+crypto.createHash('sha256').update(id).digest('hex'),{operator:'desk-test'},60)
  return {method:'GET',query,headers:{cookie:`th_operator=${id}`}}
}
it('keeps authentication failure ahead of provider access',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const r=res();await desk({method:'GET',query:{action:'watchlist'},headers:{}},r);expect(r.code).toBe(401);expect(fetcher).not.toHaveBeenCalled()
})
it('preserves actual provider errors instead of substituting a price',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({status:'ERROR',error:'Unknown API Key'}),{status:401})))
  const r=res();await desk(await req({action:'watchlist'}),r)
  expect(r.body.stocks).toEqual({data:null,error:'PROVIDER_KEY_REJECTED'});expect(r.body.vix.data).toBeNull();expect(r.body.futures.error).toBe('CONTRACT_AND_ENTITLEMENT_UNVERIFIED')
})
it('keeps endpoint failures separate from empty bars and does not calculate indicators',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({status:'NOT_AUTHORIZED'}),{status:403})))
  const r=res();await desk(await req({action:'context',symbol:'QQQ'}),r)
  expect(r.body.bars.error).toBe('NOT_ENTITLED');expect(r.body.previous.error).toBe('NOT_ENTITLED');expect(r.body.indicators).toBeNull()
})
it('requires bounded watchlist and explicit index identities on newly allowed paths',()=>{
  for(const p of ['/v2/snapshot/locale/us/markets/stocks/tickers','/v3/snapshot'])expect(()=>validateProviderRequest(p)).toThrow()
  expect(()=>validateProviderRequest('/v3/snapshot',{ticker:'I:VIX'})).not.toThrow()
  expect(()=>validateProviderRequest('/v3/snapshot',{ticker:'SPY'})).toThrow()
  expect(()=>validateProviderRequest('/v2/snapshot/locale/us/markets/stocks/tickers',{tickers:'QQQ,NVDA'})).not.toThrow()
})
it('preserves a provider Retry-After delay in the affected field state',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({status:'ERROR'}),{status:429,headers:{'Retry-After':'120'}})))
  const r=res();await desk(await req({action:'watchlist'}),r)
  expect(r.body.stocks).toEqual({data:null,error:'RATE_LIMITED',retryAfter:120})
})
it('requests Monday bars and rejects Friday data rather than silently relabeling it',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T14:35:00Z'))
  const friday=Date.parse('2026-10-30T13:30:00Z')
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({ticker:'QQQ',results:[{t:friday,o:100,h:101,l:99,c:100,v:10}]}),{status:200}))
  vi.stubGlobal('fetch',fetcher)
  try {
    const r=res();await desk(await req({action:'context',symbol:'QQQ',period:'current'}),r)
    expect(new URL(fetcher.mock.calls[0][0]).pathname).toContain('/minute/2026-11-02/2026-11-02')
    expect(r.body.date).toBe('2026-11-02');expect(r.body.priorDate).toBe('2026-10-30')
    expect(r.body.bars).toEqual({data:null,error:'INVALID_BAR'});expect(r.body.indicators).toBeNull()
  } finally {vi.useRealTimers()}
})
