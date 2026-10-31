import { briefFixture } from './analystFixture.js'
import { it, expect } from 'vitest'
import { loadResearch, saveHypothesis, recordResearchOutcome, RESEARCH_STORAGE_KEY } from '../src/lib/researchLedger.js'
function storage() { const values=new Map([['th-trades','actual-trades-preserved']]);return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)} }

it('freezes hypotheses under a separate key and survives reload without touching trades',()=>{
 const s=storage(),brief=briefFixture();saveHypothesis(brief,brief.scenarios[0],[],s)
 brief.scenarios[0].trigger=999;expect(loadResearch(s).hypotheses[0].scenario.trigger).toBe(102)
 expect(s.getItem('th-trades')).toBe('actual-trades-preserved');expect(s.getItem(RESEARCH_STORAGE_KEY)).toBeTruthy()
 saveHypothesis(brief,brief.scenarios[0],[],s);expect(loadResearch(s).hypotheses).toHaveLength(1)
})
it('appends manual outcomes with evidence and never promotes historical validation',()=>{
 const s=storage(),b=briefFixture();saveHypothesis(b,b.scenarios[0],[],s)
 const now=new Date('2026-10-26T20:00:00Z')
 recordResearchOutcome('bullish','AMBIGUOUS','2026-10-26T15:00:00Z','Target and invalidation order cannot be established.',s,now)
 recordResearchOutcome('bullish','UNRESOLVED','2026-10-26T16:00:00Z','Correction: missing timestamped bar evidence.',s,now)
 const read=loadResearch(s);expect(read.outcomes).toHaveLength(2);expect(read.outcomes.every(o=>o.historical_validation==='NOT_VALIDATED'&&o.evidence_source==='MANUAL_UNVERIFIED')).toBe(true)
 expect(s.getItem('th-trades')).toBe('actual-trades-preserved')
})
it('rejects future, pre-session and insufficiently evidenced outcomes',()=>{
 const s=storage(),b=briefFixture();saveHypothesis(b,b.scenarios[0],[],s);const now=new Date('2026-10-26T20:00:00Z')
 for(const time of ['2026-10-25T15:00:00Z','2026-10-27T15:00:00Z','invalid'])expect(()=>recordResearchOutcome('bullish','AMBIGUOUS',time,'Detailed evidence note.',s,now)).toThrow()
 expect(()=>recordResearchOutcome('bullish','AMBIGUOUS','2026-10-26T15:00:00Z','short',s,now)).toThrow()
 expect(loadResearch(s).outcomes).toHaveLength(0)
})
it('retains corrupt storage and surfaces write failures',()=>{
 const s=storage();s.setItem(RESEARCH_STORAGE_KEY,'broken');expect(()=>loadResearch(s)).toThrow();expect(s.getItem(RESEARCH_STORAGE_KEY)).toBe('broken')
 const b=briefFixture();expect(()=>saveHypothesis(b,b.scenarios[0],[],{getItem:()=>null,setItem:()=>{throw Error('quota')}})).toThrow('could not be saved')
})
