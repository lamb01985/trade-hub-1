import {it,expect} from 'vitest'
import {currentLevelStructure,verifiedAlertInputs} from '../src/lib/marketEvidence.js'

const now=Date.parse('2026-11-04T15:30:00Z')
function context() {
  return {symbol:'QQQ',period:'current',date:'2026-11-04',priorDate:'2026-11-03',
    previous:{data:[{h:110,l:90,c:100}]},
    bars:{data:[{symbol:'QQQ',timestamp:now-60000,session:'REGULAR',timeframe:'REAL-TIME',c:104}]},
    indicators:{vwap:103,ema9:104,sessions:{REGULAR:{high:108,low:95}}}}
}
function row() {
  return {symbol:'QQQ',trade:{symbol:'QQQ',kind:'TRADE',price:105,timestamp:now-1000,session:'REGULAR',timeframe:'REAL-TIME'}}
}
it('orders nearby references around the trade and uses a distinct next target',()=>{
  const s=currentLevelStructure(context(),105,now)
  expect(s.currentBarsAvailable).toBe(true)
  expect(s.resistance[0]).toMatchObject({label:'Current session high',price:108,sourceDate:'2026-11-04'})
  expect(s.support[0].price).toBe(104)
  expect(s.scenarios[0]).toMatchObject({boundary:108,target:{price:110}})
  expect(s.scenarios[1]).toMatchObject({boundary:104,target:{price:103}})
})
it('pauses scenarios for stale, wrong-symbol and wrong-session bars',()=>{
  for(const patch of [{timestamp:now-600000},{symbol:'SPY'},{session:'PREMARKET'}]) {
    const c=context();Object.assign(c.bars.data[0],patch)
    const s=currentLevelStructure(c,105,now)
    expect(s.currentBarsAvailable).toBe(false)
    expect(s.scenarios.every(s=>s.boundary===null&&s.target===null)).toBe(true)
  }
})
it('clears a map from another date and omits invalid session extrema',()=>{
  const c=context();c.date='2026-11-03'
  expect(currentLevelStructure(c,105,now).levelMap.levels).toEqual([])
  c.date='2026-11-04';c.indicators.sessions.REGULAR={high:NaN,low:-1}
  expect(currentLevelStructure(c,105,now).levelMap.levels.some(l=>l.type==='current-range')).toBe(false)
})
it('keeps next-session preparation boundaries independent of current-session mapping',()=>{
  const c=context();c.period='plan';c.date='2026-11-05'
  expect(currentLevelStructure(c,105,now).scenarios.map(s=>s.boundary)).toEqual([110,90])
})
it('arms alerts only for matching real-time trades and regular-session bars',()=>{
  expect(verifiedAlertInputs(row(),context(),now)).toBe(true)
  for(const patch of [{symbol:'SPY'},{price:null},{price:NaN},{timeframe:'UNVERIFIED'},{timeframe:'DELAYED'},{timestamp:now-120000}]) {
    const r=row();Object.assign(r.trade,patch)
    expect(verifiedAlertInputs(r,context(),now)).toBe(false)
  }
  const c=context();c.bars.data[0].timeframe='UNVERIFIED'
  expect(verifiedAlertInputs(row(),c,now)).toBe(false)
})
