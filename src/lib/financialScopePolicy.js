import registry from '../../config/financial-scope-policy.json' with {type:'json'}
export const FINANCIAL_POLICY='thesis-annual-financial-v2'
export const FCF_FORMULA='Continuing-operations operating cash flow - continuing-operations cash PPE purchases'
const explicit={cfo:'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',net_income:'IncomeLossFromContinuingOperations'}
export function factScope(fact,key,report){
 if(!fact)return 'UNKNOWN'
 if(explicit[key]&&fact.concept===explicit[key])return 'CONTINUING'
 if(key==='cfo'&&fact.concept==='NetCashProvidedByUsedInOperatingActivities'||key==='net_income'&&fact.concept==='NetIncomeLoss')return 'TOTAL'
 if(report.source_type==='DEVELOPMENT_FIXTURE'&&['0000000001','0000000002'].includes(report.issuer.cik)&&fact.source_url==='fixture://thesis-demo'&&['capex','revenue'].includes(key))return 'CONTINUING'
 return registry.rules.some(r=>r.cik===report.issuer.cik&&r.key===key&&r.scope==='CONTINUING'&&Object.keys(r.fact).every(k=>r.fact[k]===fact[k]))?'CONTINUING':'UNKNOWN'
}
export function scopedPair(a,b,ka,kb,report){return Boolean(a&&b&&['unit','start','end','accession','filed'].every(k=>a[k]===b[k])&&a.unit==='USD'&&a.start!==null&&factScope(a,ka,report)==='CONTINUING'&&factScope(b,kb,report)==='CONTINUING')}
export function assertFinancialPolicy(report){
 const fail=()=>{throw Error('INVALID_THESIS_RESPONSE')},same=(a,b)=>a&&b&&['value','unit','concept','start','end','filed','accession','source_url'].every(k=>a[k]===b[k])
 for(const period of report.periods){
  const days=(Date.parse(period.end)-Date.parse(period.start))/86400000
  if(days<330||days>380)fail()
  for(const key of ['revenue','net_income','cfo','capex','eps']){const f=period.facts[key];if(f&&(f.start!==period.start||f.end!==period.end||f.filed<f.end))fail()}
 }
 const allFacts=report.periods.flatMap(p=>Object.values(p.facts).filter(Boolean))
 for(const metric of Object.values(report.metrics))for(const input of metric.inputs)if(!allFacts.some(f=>same(input,f)))fail()
 const checks=[['fcf','cfo','capex',(a,b)=>a-b],['net_margin','net_income','revenue',(a,b)=>b>0?a/b*100:NaN],['cash_conversion','cfo','net_income',(a,b)=>b>0?a/b:NaN]]
 for(const [metric,left,right,compute]of checks){
  const m=report.metrics[metric];if(m.value===null)continue
  const facts=report.periods[0]?.facts
  if(!facts||!scopedPair(facts[left],facts[right],left,right,report)||m.inputs.length!==2||!same(m.inputs[0],facts[left])||!same(m.inputs[1],facts[right]))fail()
  const expected=compute(facts[left].value,facts[right].value);if(!Number.isFinite(expected)||Math.abs(m.value-expected)>1e-7)fail()
 }
 if(report.metrics.fcf.formula!==FCF_FORMULA)fail()
 for(const [key,index]of [['revenue_yoy',0],['prior_revenue_yoy',1]]){
  const m=report.metrics[key];if(m.value===null)continue
  const current=report.periods[index],prior=report.periods[index+1],a=current?.facts.revenue,b=prior?.facts.revenue
  if(!a||!b||a.unit!=='USD'||b.unit!=='USD'||a.accession!==b.accession||a.filed!==b.filed||factScope(a,'revenue',report)!=='CONTINUING'||factScope(b,'revenue',report)!=='CONTINUING'||Date.parse(current.start)-Date.parse(prior.end)!==86400000||m.inputs.length!==2||!same(m.inputs[0],a)||!same(m.inputs[1],b)||b.value<=0||Math.abs(m.value-(a.value/b.value-1)*100)>1e-7)fail()
 }
 const derived=(key,expected,inputs)=>{const m=report.metrics[key];if(m.value===null)return;if(expected===null||!Number.isFinite(expected)||m.inputs.length!==inputs.length||!m.inputs.every((f,i)=>same(f,inputs[i]))||Math.abs(m.value-expected)>1e-7)fail()}
 const growth=report.metrics.revenue_yoy.value,priorGrowth=report.metrics.prior_revenue_yoy.value
 derived('growth_acceleration',growth!==null&&priorGrowth!==null?growth-priorGrowth:null,report.periods.slice(0,3).map(p=>p.facts.revenue))
 const prior=report.periods[1],current=report.periods[0],margin=report.metrics.net_margin.value
 const priorMargin=prior&&scopedPair(prior.facts.net_income,prior.facts.revenue,'net_income','revenue',report)&&prior.facts.revenue.value>0?prior.facts.net_income.value/prior.facts.revenue.value*100:null
 derived('margin_change',growth!==null&&margin!==null&&priorMargin!==null?margin-priorMargin:null,[current?.facts.net_income,current?.facts.revenue,prior?.facts.net_income,prior?.facts.revenue])

}
