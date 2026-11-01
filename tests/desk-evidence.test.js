import { describe,it,expect } from 'vitest'
import { sessionAt,previousSession,evidenceStatus,stockEvidence,validateBars,intradayContext } from '../src/lib/marketEvidence.js'
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
