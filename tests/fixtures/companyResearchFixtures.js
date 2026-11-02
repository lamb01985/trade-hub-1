import base from './thesis-company.json'
// Synthetic layout fixtures. Symbols exercise selection only; these are NOT issuer financials.
export function companyResearchFixture(symbol='AMD') {
  const report=structuredClone(base)
  report.issuer.symbol=symbol
  report.issuer.name=`Synthetic ${symbol} research fixture`
  report.request_id=`synthetic-layout-${symbol}`
  if(symbol==='PARTIAL') {
    report.periods=[]
    report.quality.freshness='INSUFFICIENT'
    report.quality.confidence='LOW'
    report.quality.warnings.push('Core financial evidence is missing in this synthetic partial-data case.')
    report.scores.long_financial=null;report.scores.short_deterioration=null
    Object.values(report.metrics).forEach(metric=>{metric.value=null;metric.inputs=[]})
    Object.values(report.assessments).forEach(item=>{item.state='UNKNOWN';item.reason='Required financial inputs are unavailable.';item.assumptions=[];item.counterarguments=[]})
  }
  return report
}
