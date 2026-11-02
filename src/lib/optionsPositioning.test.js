import {it,expect} from 'vitest'
import {optionsV2Fixture} from './optionsV2Fixture.js'
import {positioning,compareSnapshots,gammaResearch,technicalLevels,levelScenarios} from './optionsPositioning.js'
import {flowResearch} from './optionsFlow.js'
const fixture=()=>optionsV2Fixture('QQQ'),now=Date.parse('2026-11-02T15:00:00Z')
it('strike/expiry totals preserve observed zero, missing, partial and stale',()=>{
 const {snapshot}=fixture();snapshot.contracts[0].openInterest=0;snapshot.contracts[1].volume=null
 const r=positioning(snapshot,{expiry:snapshot.expiry,now});expect(r.metrics.callOI.value).toBe(1700);expect(r.metrics.putVolume.status).toBe('MISSING_FIELDS');expect(r.volumeRatio.value).toBeNull();expect(r.metrics.callOI.status).toBe('PARTIAL');expect(r.metrics.callOI.known).toBe(4)
 expect(positioning({...snapshot,complete:true},{expiry:snapshot.expiry,now:now+600000}).metrics.callOI.status).toBe('STALE')
 const one=positioning({...snapshot,contracts:[snapshot.contracts[0]]},{now});expect(one.strikes[0].putOI.value).toBeNull();expect(one.oiRatio.value).toBeNull()
})
it('concentration discloses partial fields, identity/duplicates/future capture fail',()=>{
 const {snapshot}=fixture();snapshot.contracts[0].openInterest=null;const r=positioning(snapshot,{now});expect(r.concentrations.find(c=>c.level===95).missingSides).toBe(true)
 expect(()=>positioning({...snapshot,contracts:[...snapshot.contracts,snapshot.contracts[0]]},{now})).toThrow()
 expect(()=>positioning({...snapshot,symbol:'SPY'},{now})).toThrow();expect(()=>positioning({...snapshot,fetchedAt:'2099-01-01T00:00:00Z'},{now})).toThrow()
})
it('dated OI and IV comparisons require compatible sessions/delays and window',()=>{
 const {snapshot,prior}=fixture();const changes=compareSnapshots(snapshot,prior,{now});expect(changes[0].oiChange).toBe(50);expect(changes[0].ivChange).toBeNull()
 prior.fetchedAt='2026-11-02T14:50:00Z';prior.contracts=prior.contracts.map(c=>({...c,iv:.25,quoteTime:'2026-11-02T14:49:00Z'}));expect(compareSnapshots(snapshot,prior,{now})[0].ivChange).toBeCloseTo(.05);expect(compareSnapshots(snapshot,prior,{now})[0].oiChange).toBeNull()
 snapshot.contracts[0].quoteTimeframe='UNSPECIFIED';prior.contracts[0].quoteTimeframe='UNSPECIFIED';expect(compareSnapshots(snapshot,prior,{now})[0].ivChange).toBeNull()
 expect(()=>compareSnapshots(snapshot,{...prior,expiry:'2026-11-27'},{now})).toThrow()
})
it('gamma units, signed assumptions, sensitivity and expiry exclusions',()=>{
 const {snapshot}=fixture();snapshot.contracts=[{...snapshot.contracts[0],openInterest:10,gamma:.02,underlyingPrice:100}];const report=positioning(snapshot,{now}),gamma=gammaResearch(report,{now});expect(gamma.gross).toBe(2000);expect(gamma.signed).toBeNull();expect(gamma.sensitivity.spotPlus1PctHoldingGammaFixed).toBeCloseTo(2040.2)
 expect(gammaResearch(report,{now,callSign:-1,putSign:1}).signed).toBe(-2000);expect(gammaResearch(report,{now:Date.parse('2026-11-21T15:00:00Z')}).status).toBe('INSUFFICIENT_EVIDENCE')
 snapshot.contracts[0].sharesPerContract=10;expect(gammaResearch(positioning(snapshot,{now}),{now}).status).toBe('INSUFFICIENT_EVIDENCE')
})
function evidence(kind,results,extra={}){const c=fixture().snapshot.contracts[0];return {kind,contract:c.symbol,provider:'Massive',source:kind==='daily'?`https://api.massive.com/v2/aggs/ticker/${c.symbol}/range/1/day/2026-10-01/2026-10-30`:`https://api.massive.com/v3/${kind}/${c.symbol}?timestamp=2026-11-02`,requestedDate:'2026-11-02',range:kind==='daily'?{start:'2026-10-01',end:'2026-10-30'}:null,fetchedAt:'2026-11-02T15:00:00Z',complete:false,results,...extra}}
const trade=(change={})=>({sip_timestamp:Date.parse('2026-11-02T14:59:59Z'),price:4.1,size:120,id:'one',conditions:[],...change})
const quote=(change={})=>({sip_timestamp:Date.parse('2026-11-02T14:59:58.500Z'),bid_price:4,ask_price:4.1,bid_size:10,ask_size:10,...change})
it('exact prior quote estimate is qualified, captures clusters, not institutional intent',()=>{
 const c=fixture().snapshot.contracts[0],r=flowResearch(c,{trades:evidence('trades',[trade()]),quotes:evidence('quotes',[quote()]),now});expect(r.counts.AT_ASK).toBe(120);expect(r.interpretation).toBe('BULLISH_HYPOTHESIS');expect(r.large).toHaveLength(1);expect(r.coverage.tradesComplete).toBe(false);expect(r.clusters[0].contracts).toBe(120)
 for(const q of [quote({sip_timestamp:Date.parse('2026-11-02T14:59:57Z')}),quote({bid_size:0}),quote({bid_price:5})])expect(flowResearch(c,{trades:evidence('trades',[trade()]),quotes:evidence('quotes',[q]),now}).counts.AT_ASK).toBe(0)
 for(const conditions of [undefined,[1]])expect(flowResearch(c,{trades:evidence('trades',[trade({conditions})]),quotes:evidence('quotes',[quote()]),now}).counts.AT_ASK).toBe(0)
})
it('opening print cannot use premarket quote; conflicting quotes and duplicates are conservative',()=>{
 const c=fixture().snapshot.contracts[0];expect(flowResearch(c,{trades:evidence('trades',[trade({sip_timestamp:Date.parse('2026-11-02T14:30:00Z')})]),quotes:evidence('quotes',[quote({sip_timestamp:Date.parse('2026-11-02T14:29:59.500Z')})]),now}).counts.AT_ASK).toBe(0)
 expect(flowResearch(c,{trades:evidence('trades',[trade(),trade()]),quotes:evidence('quotes',[quote({sip_timestamp:Date.parse('2026-11-02T14:59:58Z')}),quote(),quote({ask_price:4.2})]),now}).counts.AT_ASK).toBe(0)
 expect(flowResearch(c,{trades:evidence('trades',[trade(),trade()]),quotes:evidence('quotes',[quote()]),now}).observations).toHaveLength(1)
})
it('adapter daily key reaches relative-volume engine; mismatched dates/duplicate/future days withheld',()=>{
 const c=fixture().snapshot.contracts[0],bars=['26','27','28','29','30'].map(day=>({t:Date.parse(`2026-10-${day}T14:00:00Z`),v:100})),daily=evidence('daily',bars)
 const r=flowResearch(c,{daily,now});expect(r.relativeVolume).toBe(2);expect(r.baseline.observations).toBe(5);expect(r.baseline.status).toContain('PARTIAL')
 expect(flowResearch(c,{daily:{...daily,requestedDate:'2026-10-30'},now}).relativeVolume).toBeNull()
 expect(flowResearch(c,{daily:{...daily,results:[...bars,bars[0]]},now}).relativeVolume).toBeNull()
 expect(flowResearch(c,{daily:{...daily,source:'https://evil.invalid'},now}).relativeVolume).toBeNull()
})
it('scenarios remain conditional hypotheses with partial-source limitations',()=>{
 const {snapshot}=fixture(),report=positioning(snapshot,{now}),scenarios=levelScenarios(report,{status:'STALE_OR_UNAVAILABLE',levels:[{label:'VWAP',value:105,time:'2026-11-02T14:59:00Z'}]});expect(scenarios[0].classification).toBe('HYPOTHESIS');expect(scenarios[0].interpretation).toBe('INCONCLUSIVE');expect(scenarios[0].bullish).toContain('105');expect(scenarios[0].limitations).toContain('STALE');expect(technicalLevels(null,'QQQ',now).status).toBe('UNAVAILABLE')
})
it('unsafe totals and nonfinite gamma are unavailable rather than rounded/infinite research',()=>{
 const {snapshot}=fixture();snapshot.contracts=snapshot.contracts.map(c=>({...c,openInterest:Number.MAX_SAFE_INTEGER}));const r=positioning(snapshot,{now});expect(r.metrics.callOI.value).toBeNull();expect(r.metrics.callOI.status).toBe('INVALID_TOTAL')
 snapshot.contracts[0].gamma=Number.MAX_VALUE;expect(gammaResearch(positioning(snapshot,{now}),{now}).status).toBe('INSUFFICIENT_EVIDENCE')
})
