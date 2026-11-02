import {describe,it,expect,vi,afterEach} from 'vitest'
import {americanPrice,optionScenario,expiryInstant} from './optionsScenario.js'
import {exclusions,summarize} from './optionsIntelligence.js'
import {optionCursor} from './optionPagination.js'
import {getOptionsResearch} from './massive.js'
const now=Date.parse('2026-11-02T15:00:00Z')
function contract(change={}){return {symbol:'O:QQQ261120C00100000',underlying:'QQQ',type:'call',strike:100,expiry:'2026-11-20',sharesPerContract:100,exerciseStyle:'american',bid:4,ask:4.2,spread:.2,spreadPct:.2/4.1*100,quoteTime:new Date(now-1000).toISOString(),quoteTimeframe:'REAL-TIME',iv:.3,delta:.5,gamma:.03,theta:-.05,vega:.2,volume:200,openInterest:100,underlyingPrice:100,underlyingTime:new Date(now-1000).toISOString(),underlyingTimeframe:'REAL-TIME',...change}}
it('American CRR converges to known nondividend European call; intrinsic expiry and early exercise',()=>{
 expect(americanPrice({spot:100,strike:100,years:1,iv:.2,rate:.05,type:'call',steps:500})).toBeCloseTo(10.45058357,2)
 expect(americanPrice({spot:80,strike:100,years:0,iv:.2,type:'put'})).toBe(20)
 expect(americanPrice({spot:40,strike:100,years:1,iv:.1,rate:.1,type:'put'})).toBeGreaterThanOrEqual(60)
 expect(expiryInstant('2026-07-17')).toBe(Date.parse('2026-07-17T20:00:00Z'))
 expect(expiryInstant('2026-11-20')).toBe(Date.parse('2026-11-20T21:00:00Z'))
})
it('scenario P&L/fees/breakeven/contractual risk are exact at expiration',()=>{
 const c=contract(),days=(expiryInstant(c.expiry)-now)/86400000
 const r=optionScenario(c,{entry:4,target:110,elapsedDays:days,contracts:2,fees:2,now})
 expect(r.value).toBe(10);expect(r.pnl).toBe(1198);expect(r.returnPct).toBe(149.75);expect(r.maxLoss).toBe(802);expect(r.maxProfit).toBeNull();expect(r.breakeven).toBe(104.01)
 const short=optionScenario(c,{side:'short',entry:4,target:110,elapsedDays:days,fees:2,now});expect(short.pnl).toBe(-602);expect(short.maxLoss).toBeNull();expect(short.returnPct).toBeNull();expect(short.maxProfit).toBe(398)
 expect(()=>optionScenario({...c,sharesPerContract:10},{entry:4,target:100,now})).toThrow()
 expect(()=>optionScenario(c,{entry:4,target:100,elapsedDays:100,now})).toThrow()
})
it.each([
 ['stale',{quoteTime:new Date(now-120000).toISOString()}],['missing Greeks',{gamma:null}],['zero OI',{openInterest:0}],['missing OI',{openInterest:null}],['wide spread',{spreadPct:80}],['invalid contract',{symbol:'O:SPY261120C00100000'}],['expired',{expiry:'2026-10-23'}],['delayed',{quoteTimeframe:'DELAYED'}],['missing quote',{bid:null}],['future',{quoteTime:new Date(now+60000).toISOString()}],['unknown underlying delay',{underlyingTimeframe:'UNSPECIFIED'}]
])('excludes %s rather than ranking as executable',(_,change)=>{expect(exclusions(contract(change),{},now).length).toBeGreaterThan(0)})
it('closed market and invalid filters fail eligibility',()=>{
 expect(exclusions(contract(),{},now)).toEqual([])
 expect(exclusions(contract(),{},Date.parse('2026-11-01T15:00:00Z')).length).toBeGreaterThan(0)
 expect(exclusions(contract(),{minOI:NaN},now)).toEqual(['Invalid filter bounds'])
})
it('partial ratios retain coverage; zero and absent denominators do not become infinity/zero',()=>{
 const call=contract(),put=contract({symbol:'O:QQQ261120P00100000',type:'put',delta:-.5,volume:100,openInterest:50})
 let s=summarize({contracts:[call,put],complete:false},{expiry:call.expiry,now});expect(s.coverage).toContain('PARTIAL');expect(s.volumeRatio).toBe(.5);expect(s.oiRatio).toBe(.5);expect(s.iv).toBe(.3);expect(s.bullish).toHaveLength(1);expect(s.bearish).toHaveLength(1)
 s=summarize({contracts:[{...call,openInterest:0},put],complete:true},{expiry:call.expiry,now});expect(s.oiRatio).toBeNull();expect(s.activity.some(r=>r.ratio===Infinity)).toBe(false)
 s=summarize({contracts:[{...call,volume:null},put],complete:true},{expiry:call.expiry,now});expect(s.volumeRatio).toBeNull()
})
it('pagination accepts only known origin/path and bounded opaque cursor',()=>{
 expect(optionCursor('https://api.massive.com/v3/snapshot/options/QQQ?cursor=abc%3D','QQQ')).toBe('abc=')
 for(const url of ['https://evil.invalid/v3/snapshot/options/QQQ?cursor=x','https://api.massive.com/v3/snapshot/options/SPY?cursor=x','https://api.massive.com/v3/snapshot/options/QQQ?cursor=a&cursor=b'])expect(()=>optionCursor(url,'QQQ')).toThrow()
})
afterEach(()=>vi.unstubAllGlobals())
it('bounded adapter follows pages without provider URL/key in proxy parameters',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost'}})
 const raw=(strike)=>({details:{ticker:`O:QQQ261120C${String(strike*1000).padStart(8,'0')}`,expiration_date:'2026-11-20',strike_price:strike,contract_type:'call',shares_per_contract:100}})
 const fetcher=vi.fn(async()=>({ok:true,status:200,json:async()=>({status:'OK',results:[raw(100+fetcher.mock.calls.length)],next_url:'https://api.massive.com/v3/snapshot/options/QQQ?cursor='+fetcher.mock.calls.length})}));vi.stubGlobal('fetch',fetcher)
 const r=await getOptionsResearch('QQQ',{maxPages:2});expect(fetcher).toHaveBeenCalledTimes(2);expect(r.complete).toBe(false);expect(r.contracts).toHaveLength(2)
 const params=new URL(fetcher.mock.calls[1][0]).searchParams;expect(params.get('cursor')).toBe('1');expect(params.get('research')).toBe('v1');expect(params.has('apiKey')).toBe(false)
})
it('rate limit terminates new acquisition without retry',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost'}});const f=vi.fn(async()=>({ok:false,status:429,text:async()=>'{"error":"rate_limited"}'}));vi.stubGlobal('fetch',f)
 await expect(getOptionsResearch('QQQ')).rejects.toMatchObject({status:429});expect(f).toHaveBeenCalledTimes(1)
})
it('unobserved sides stay unavailable and never report zero ratios',()=>{
 const c=contract(),s=summarize({contracts:[c],complete:false},{expiry:c.expiry,now});expect(s.volumeRatio).toBeNull();expect(s.oiRatio).toBeNull();expect(s.strikes[0].putOI).toBeNull();expect(s.strikes[0].putVolume).toBeNull()
})
it('zero-spot negative-rate American put retains optimal continuation and bounded IV sensitivity',()=>{
 expect(americanPrice({spot:0,strike:100,years:1,iv:.2,rate:-.1,type:'put'})).toBeCloseTo(100*Math.exp(.1),7)
 const r=optionScenario(contract({iv:5}),{entry:4,target:100,now});expect(r.value).toBeGreaterThan(0);expect(r.ivPoint).toBeNull()
})
it('caller cancellation reaches in-flight transport and stops retries',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost'}})
 vi.stubGlobal('fetch',vi.fn((_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))})))
 const controller=new AbortController(),pending=getOptionsResearch('QQQ',{signal:controller.signal});await new Promise(r=>setTimeout(r,10));controller.abort();await expect(pending).rejects.toMatchObject({cancelled:true});expect(fetch).toHaveBeenCalledTimes(1)
})
it('session expiry on a later page rejects the entire acquisition',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost'},dispatchEvent:vi.fn()})
 const raw={details:{ticker:'O:QQQ261120C00100000',expiration_date:'2026-11-20',strike_price:100,contract_type:'call',shares_per_contract:100}}
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({status:'OK',results:[raw],next_url:'https://api.massive.com/v3/snapshot/options/QQQ?cursor=next'})}).mockResolvedValueOnce({ok:false,status:401,headers:{get:key=>key==='X-TradeHub-Auth-Required'?'true':null}}))
 await expect(getOptionsResearch('QQQ')).rejects.toMatchObject({authRequired:true});expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
})
it('complete pagination means exhausted request window, never assumed from a capped page',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost'}})
 const raw=strike=>({details:{ticker:`O:QQQ261120C${String(strike*1000).padStart(8,'0')}`,expiration_date:'2026-11-20',strike_price:strike,contract_type:'call'}})
 const f=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({status:'OK',results:[raw(100)],next_url:'https://api.massive.com/v3/snapshot/options/QQQ?cursor=second'})}).mockResolvedValueOnce({ok:true,status:200,json:async()=>({status:'OK',results:[raw(105)]})});vi.stubGlobal('fetch',f)
 const r=await getOptionsResearch('QQQ',{expiry:'2026-11-20',maxPages:4});expect(r.complete).toBe(true);expect(r.coverageScope).toBe('SELECTED_EXPIRATION');expect(r.pages).toBe(2);expect(r.contracts).toHaveLength(2)
})
it('repeated pagination cursor cannot establish completeness',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost'}})
 let i=0;vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,status:200,json:async()=>({status:'OK',results:[{details:{ticker:`O:QQQ261120C${String((100+i++)*1000).padStart(8,'0')}`,expiration_date:'2026-11-20',strike_price:99+i,contract_type:'call'}}],next_url:'https://api.massive.com/v3/snapshot/options/QQQ?cursor=same'})})))
 const r=await getOptionsResearch('QQQ',{maxPages:4});expect(r.complete).toBe(false);expect(r.error).toContain('Repeated');expect(fetch).toHaveBeenCalledTimes(2)
})
