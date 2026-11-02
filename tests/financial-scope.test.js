import{expect,it}from'vitest'
import report from './fixtures/amd-2025-policy2-report.json' with {type:'json'}
import{assertThesisReport}from'../src/lib/thesisContract.js'
import{factScope}from'../src/lib/financialScopePolicy.js'
it('admits original AMD continuing FCF and rejects the legacy mixed numerator',()=>{
 expect(()=>assertThesisReport(report)).not.toThrow();expect(report.metrics.fcf.value).toBe(5519000000)
 const bad=structuredClone(report);bad.metrics.fcf.inputs[0].concept='NetCashProvidedByUsedInOperatingActivities';bad.metrics.fcf.value=6735000000
 expect(()=>assertThesisReport(bad)).toThrow('INVALID_THESIS_RESPONSE')
})
it.each(['filing','unit','scope','value','input','formula'])('rejects incompatible scoped report: %s',kind=>{
 const bad=structuredClone(report)
 if(kind==='filing')bad.metrics.fcf.inputs[1].accession='0000002488-26-000999'
 if(kind==='unit')bad.metrics.fcf.inputs[1].unit='USD/shares'
 if(kind==='scope')bad.periods[0].facts.cfo.concept='NetCashProvidedByUsedInOperatingActivities'
 if(kind==='value')bad.metrics.fcf.value=6735000000
 if(kind==='input')bad.metrics.net_margin.inputs[0].value=4335000000
 if(kind==='formula')bad.metrics.fcf.formula='Total investing cash flow'
 expect(()=>assertThesisReport(bad)).toThrow('INVALID_THESIS_RESPONSE')
})
it('another issuer cannot inherit AMD PPE classification',()=>{
 const changed=structuredClone(report);changed.issuer.cik='0000000002'
 expect(factScope(changed.periods[0].facts.capex,'capex',changed)).toBe('UNKNOWN')
})
it.each(['growth-without-input','margin-without-input','annual-binding','comparative-binding'])('rejects semantic dependency attack: %s',kind=>{
 const bad=structuredClone(report)
 if(kind==='growth-without-input'){bad.metrics.revenue_yoy.value=null;bad.metrics.growth_acceleration.value=99}
 if(kind==='margin-without-input'){bad.metrics.net_margin.value=null;bad.metrics.margin_change.value=99}
 if(kind==='annual-binding'){
  for(const f of [bad.periods[0].facts.cfo,bad.periods[0].facts.net_income])f.start=f.end
  for(const key of ['cfo','net_income','cash_conversion'])for(const f of bad.metrics[key].inputs)f.start=f.end
 }
 if(kind==='comparative-binding')bad.periods[1].facts.revenue.start='2024-01-01'
 expect(()=>assertThesisReport(bad)).toThrow('INVALID_THESIS_RESPONSE')
})
