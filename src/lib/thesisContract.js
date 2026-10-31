const FACTS=['revenue','net_income','cfo','capex','cash','assets','liabilities','equity','current_assets','current_liabilities','debt_current','debt_noncurrent','eps']
const METRICS=[...FACTS,'fcf','debt','net_margin','cash_conversion','current_ratio','debt_assets','revenue_yoy','prior_revenue_yoy','growth_acceleration','margin_change']
const DIMENSIONS=['quality','profitability','growth','financial_health','valuation','entry']
const fail=()=>{throw new Error('INVALID_THESIS_RESPONSE')}
const object=(value,keys)=>{if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join('|')!==[...keys].sort().join('|'))fail()}
const finite=value=>typeof value==='number' && Number.isFinite(value)
const strings=value=>Array.isArray(value) && value.every(v=>typeof v==='string' && v.length<2000)
const date=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value
export function assertThesisReport(report,{symbol,asOf,profile,fixture}={}) {
  object(report,['schema_version','request_id','profile','generated_at','as_of','source_type','issuer','periods','metrics','assessments','scores','quality','readiness'])
  if(report.schema_version!=='thesis-company-v1' || typeof report.request_id!=='string' || !Number.isFinite(Date.parse(report.generated_at)) || !date(report.as_of) || report.readiness!=='NOT_EVALUATED')fail()
  if(!['SEC_EDGAR','DEVELOPMENT_FIXTURE'].includes(report.source_type) || (fixture!==undefined && (report.source_type==='DEVELOPMENT_FIXTURE')!==fixture))fail()
  object(report.issuer,['symbol','cik','name','sic'])
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(report.issuer.symbol) || !/^\d{10}$/.test(report.issuer.cik) || typeof report.issuer.name!=='string' || report.issuer.name.length>256 || !(report.issuer.sic===null || Number.isInteger(report.issuer.sic)))fail()
  if((symbol && symbol!==report.issuer.symbol) || (asOf && asOf!==report.as_of) || (profile && profile!==report.profile))fail()
  const fact=value=>{
    object(value,['value','unit','concept','start','end','filed','accession','source_url'])
    if(!finite(value.value) || !['USD','USD/shares'].includes(value.unit) || typeof value.concept!=='string' || !date(value.end) || !date(value.filed) || value.filed>report.as_of || value.end>report.as_of || !(value.start===null || date(value.start)) || !/^\d{10}-\d{2}-\d{6}$/.test(value.accession))fail()
    const expected=report.source_type==='DEVELOPMENT_FIXTURE' ? 'fixture://thesis-demo' : `https://www.sec.gov/Archives/edgar/data/${Number(report.issuer.cik)}/${value.accession.replaceAll('-','')}/${value.accession}-index.html`
    if(value.source_url!==expected)fail()
  }
  if(!Array.isArray(report.periods) || report.periods.length>4)fail()
  for(const period of report.periods){object(period,['start','end','facts']);if(!date(period.start)||!date(period.end))fail();object(period.facts,FACTS);for(const value of Object.values(period.facts))if(value!==null)fact(value)}
  object(report.metrics,METRICS)
  for(const value of Object.values(report.metrics)){object(value,['value','unit','formula','inputs']);if(!(value.value===null||finite(value.value)) || typeof value.unit!=='string' || typeof value.formula!=='string' || !Array.isArray(value.inputs))fail();value.inputs.forEach(fact)}
  object(report.assessments,DIMENSIONS)
  for(const value of Object.values(report.assessments)){object(value,['state','reason','assumptions','counterarguments']);if(!['GREEN','YELLOW','RED','UNKNOWN'].includes(value.state) || typeof value.reason!=='string' || !strings(value.assumptions)||!strings(value.counterarguments))fail()}
  if(report.assessments.valuation.state!=='UNKNOWN'||report.assessments.entry.state!=='UNKNOWN')fail()
  object(report.scores,['long_financial','short_deterioration','long_coverage','short_coverage','policy_version'])
  for(const key of ['long_coverage','short_coverage'])if(!finite(report.scores[key])||report.scores[key]<0||report.scores[key]>1)fail()
  for(const [key,coverage] of [['long_financial','long_coverage'],['short_deterioration','short_coverage']])if(report.scores[key]!==null && (!finite(report.scores[key])||report.scores[key]<0||report.scores[key]>100||report.scores[coverage]!==1))fail()
  if(report.scores.policy_version!=='thesis-annual-financial-v1')fail()
  object(report.quality,['freshness','confidence','warnings'])
  if(!['ANNUAL_ONLY','STALE','INSUFFICIENT'].includes(report.quality.freshness)||!['LOW','MEDIUM'].includes(report.quality.confidence)||!strings(report.quality.warnings))fail()
  if(report.quality.freshness!=='ANNUAL_ONLY' && (report.scores.long_financial!==null||report.scores.short_deterioration!==null))fail()
  return report
}
