import { describe,it,expect } from 'vitest'
import { sessionAt,previousSession,evidenceStatus,stockEvidence,validateBars,intradayContext, deskStructure, latestCompletedSession } from '../src/lib/marketEvidence.js'
import { validateOptionIdentity } from '../src/lib/optionSnapshot.js'
const now=Date.parse('2026-11-02T15:30:00Z')
const bar=(t,c=100)=>({t,o:c,h:c+1,l:c-1,c,v:100,vw:c})
describe('Monday desk integrity',()=>{
  it('handles DST, weekends, holidays and early closes',()=>{
    expect(sessionAt(Date.parse('2026-11-01T16:00:00Z'))).toBe('CLOSED')
    expect(sessionAt(Date.parse('2026-11-02T14:29:00Z'))).toBe('PREMARKET')
    expect(sessionAt(Date.parse('2026-11-02T14:30:00Z'))).toBe('REGULAR')
    expect(sessionAt(Date.parse('2026-11-02T21:00:00Z'))).toBe('AFTER_HOURS')
    expect(sessionAt(Date.parse('2026-11-26T15:00:00Z'))).toBe('CLOSED')
    expect(sessionAt(Date.parse('2026-11-27T18:00:00Z'))).toBe('AFTER_HOURS')
    expect(previousSession('2026-11-02')).toBe('2026-10-30')
    expect(previousSession('2026-11-27')).toBe('2026-11-25')
  })
  it('ages source time and never calls last-session data live',()=>{
    expect(evidenceStatus(now-1000,{now})).toBe('RECENT_DELAY_UNVERIFIED')
    expect(evidenceStatus(now-1000,{now,timeframe:'REAL-TIME'})).toBe('RECENT')
    expect(evidenceStatus(now-1000,{now,timeframe:'DELAYED'})).toBe('DELAYED')
    expect(evidenceStatus(now-120000,{now})).toBe('STALE')
    expect(evidenceStatus(Date.parse('2026-10-30T23:59:59Z'),{now})).toBe('PREVIOUS_SESSION')
    expect(evidenceStatus(now+60000,{now})).toBe('TIME_UNVERIFIED')
    expect(evidenceStatus(now,{now:Date.parse('2026-11-01T15:00:00Z')})).toBe('TIME_UNVERIFIED')
    const sunday=Date.parse('2026-11-01T15:00:00Z')
    expect(evidenceStatus(sunday-60000,{now:sunday})).toBe('MARKET_CLOSED')
  })
  it('preserves independent quote/trade times and rejects instrument mismatches',()=>{
    const r=stockEvidence('NVDA',{ticker:'NVDA',lastTrade:{p:205,t:(now-1000)*1e6},lastQuote:{p:204,P:206,t:(now-2000)*1e6}})
    expect(r.trade.price).toBe(205);expect(r.trade.timestamp).toBe(now-1000);expect(r.quote.timestamp).toBe(now-2000)
    expect(()=>stockEvidence('QQQ',{ticker:'SPY'})).toThrow('INSTRUMENT_MISMATCH')
    expect(stockEvidence('QQQ',{ticker:'QQQ',lastQuote:{p:102,P:100}}).quote.bid).toBeNull()
  })
  it('rejects wrong symbol/date, unordered/invalid and partial bars; excludes unfinished minutes',()=>{
    const input={ticker:'QQQ',results:[bar(now-60000),bar(now)]}
    expect(validateBars('QQQ',input,'2026-11-02',{now})).toHaveLength(1)
    for(const d of [{...input,ticker:'SPY'},{...input,next_url:'next'},{...input,results:[bar(now-60000),bar(now-60000)]},{...input,results:[{...bar(now-60000),c:999}]}])expect(()=>validateBars('QQQ',d,'2026-11-02',{now})).toThrow()
    expect(()=>validateBars('QQQ',input,'2026-10-30',{now})).toThrow()
  })
  it('seeds EMAs only with sufficient RTH bars and weights provider minute VWAP',()=>{
    const rows=Array.from({length:50},(_,i)=>({...bar(now-(51-i)*60000,100),session:'REGULAR'}))
    const c=intradayContext(rows);expect(c.ema9).toBe(100);expect(c.ema20).toBe(100);expect(c.ema50).toBe(100);expect(c.vwap).toBe(100)
    expect(intradayContext(rows.slice(0,10)).ema50).toBeNull()
    expect(intradayContext(rows.map(b=>({...b,vw:undefined}))).vwap).toBeNull()
  })
  it('never treats equity after-hours as verified options liquidity',()=>{
    const at=Date.parse('2026-11-02T21:30:00Z')
    expect(evidenceStatus(at-1000,{now:at,kind:'OPTION_QUOTE',timeframe:'REAL-TIME'})).toBe('OPTIONS_SESSION_UNVERIFIED_OR_CLOSED')
  })
  it('validates OCC underlying, strike, expiry, type and selected filters',()=>{
    const raw={details:{ticker:'O:QQQ261102C00690000',strike_price:690,contract_type:'call',expiration_date:'2026-11-02'},underlying_asset:{ticker:'QQQ'}}
    expect(validateOptionIdentity(raw,'QQQ',{expiry:'2026-11-02',strike:690})).toBe(raw)
    for(const [u,f] of [['SPY',{}],['QQQ',{expiry:'2026-11-03'}],['QQQ',{strike:700}],['QQQ',{type:'put'}]])expect(()=>validateOptionIdentity(raw,u,f)).toThrow()
    expect(()=>validateOptionIdentity({...raw,details:{...raw.details,strike_price:691}},'QQQ')).toThrow()
  })
})


describe('workstation calculations',()=>{
  it('dates session changes against the correct prior regular close',()=>{
    const updated=Date.parse('2026-10-30T23:59:59Z')
    const row=stockEvidence('QQQ',{ticker:'QQQ',updated:updated*1e6,lastTrade:{p:692.74,t:updated*1e6},lastQuote:{p:692.63,P:692.69,t:updated*1e6},prevDay:{c:715.34,h:718.07,l:711.62},day:{c:690.49}})
    expect(row.change.date).toBe('2026-10-30');expect(row.change.baselineDate).toBe('2026-10-29')
    expect(row.change.amount).toBeCloseTo(-22.6);expect(row.change.percent).toBeCloseTo(-22.6/715.34*100)
    expect(row.spread).toBeCloseTo(0.06);expect(row.prior.close.value).toBe(715.34)
    expect(row.regularClose.value).toBe(690.49)
    expect(stockEvidence('QQQ',{ticker:'QQQ',updated:now*1e6,lastTrade:{p:692.74,t:updated*1e6},prevDay:{c:690.49}}).change.amount).toBeNull()
  })
  it('never infers a daily reference date from the receipt clock',()=>{
    const row=stockEvidence('QQQ',{ticker:'QQQ',lastTrade:{p:692.74,t:now*1e6},prevDay:{c:690.49}})
    expect(row.prior.close.date).toBeNull();expect(row.change.amount).toBeNull()
  })
  it('finds the completed session after overnight and early-close boundaries',()=>{
    expect(latestCompletedSession(Date.parse('2026-11-01T18:00:00Z'))).toBe('2026-10-30')
    expect(latestCompletedSession(Date.parse('2026-11-02T14:00:00Z'))).toBe('2026-10-30')
    expect(latestCompletedSession(Date.parse('2026-11-02T21:16:00Z'))).toBe('2026-11-02')
    expect(latestCompletedSession(Date.parse('2026-11-03T02:00:00Z'))).toBe('2026-11-02')
    expect(latestCompletedSession(Date.parse('2026-11-27T18:16:00Z'))).toBe('2026-11-27')
  })
  it('reuses floor pivots without injecting round levels, scores or made-up targets',()=>{
    const c={symbol:'QQQ',period:'completed',priorDate:'2026-10-29',previous:{data:[{h:110,l:90,c:100}]},bars:{data:[{c:105,timestamp:now}]},indicators:{ema9:104,ema20:103,ema50:102,vwap:101,sessions:{PREMARKET:{high:112,low:92}}}}
    const s=deskStructure(c)
    expect(s.pivots.PP).toBe(100);expect(s.pivots.R1).toBe(110);expect(s.pivots.S1).toBe(90)
    expect(s.levelMap.levels.some(l=>l.type==='round')).toBe(false);expect(s.levelMap.setupQuality).toBeNull()
    expect(s.scenarios[0].boundary).toBe(112);expect(s.scenarios[1].boundary).toBe(90)
    expect(s.chartData.price).toBe(105);expect(s.chartData.isHistoricalFallback).toBe(true)
    expect(deskStructure(null).scenarios.every(s=>s.boundary==null&&s.target==null)).toBe(true)
  })
})
