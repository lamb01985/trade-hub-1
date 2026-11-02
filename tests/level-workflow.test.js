import {it,expect} from 'vitest'
import {planningSessionDate,chicagoDate,planningStructure} from '../src/lib/marketEvidence.js'
import {prepForSymbol} from '../src/lib/workflowNavigation.js'
it('targets Monday using Chicago wall date while choosing Friday as its previous session',()=>{
 const sunday=Date.parse('2026-11-02T01:30:00Z')
 expect(chicagoDate(sunday)).toBe('2026-11-01')
 expect(planningSessionDate(sunday)).toBe('2026-11-02')
 expect(planningSessionDate(Date.parse('2026-10-30T20:16:00Z'))).toBe('2026-11-02')
 expect(planningSessionDate(Date.parse('2026-11-02T14:00:00Z'))).toBe('2026-11-02')
})
it('never replaces current indicators with historical values or loses prior-reference dates',()=>{
 const c={symbol:'QQQ',date:'2026-11-02',priorDate:'2026-10-30',previous:{data:[{h:698.63,l:683.45,c:690.49}]},bars:{data:[]},indicators:{sessions:{PREMARKET:null}},completedIndicators:{vwap:693.04,ema9:690.27,ema20:689.63,ema50:688.36,sessions:{AFTER_HOURS:{high:692.74,low:690.34,last:692.74}}}}
 const s=planningStructure(c)
 expect(s.previous.close).toBe(690.49);expect(s.chartData.intradayBars).toEqual([]);expect(s.chartData.vwapData).toBeNull()
 expect(s.levelMap.levels.find(l=>l.label==='Prior RTH VWAP (2026-10-30)')).toMatchObject({sourceDate:'2026-10-30',price:693.04})
 expect(s.scenarios[0].boundary).toBe(698.63);expect(s.scenarios[1].boundary).toBe(683.45)
 expect(s.levelMap.levels.some(l=>l.type==='round')).toBe(false)
})
it('resets symbol-specific saved fields for direct links and history navigation',()=>{
 const before={ticker:'SPY',orbHigh:'123',orbLow:'120',sessionClose:'121',keyLevel:'122',plannedContract:{underlying:'SPY'},gamePlan:'SPY thesis',marketSourceDate:'2026-10-29'}
 const next=prepForSymbol(before,'QQQ')
 expect(next).toMatchObject({ticker:'QQQ',orbHigh:'',orbLow:'',sessionClose:'',keyLevel:'',plannedContract:null,gamePlan:'',marketSourceDate:null})
 expect(prepForSymbol(before,'SPY')).toBe(before)
})
