// Presentation adapter only. No new financial calculations or investment ratings.
export const RESEARCH_DIMENSIONS = [
  ['quality', 'Business quality'], ['growth', 'Growth trajectory'],
  ['profitability', 'Profitability'], ['financial_health', 'Financial health'],
  ['valuation', 'Valuation'], ['entry', 'Entry attractiveness'],
]
export const scopedMetric = (report, key) => ['fcf','net_margin','cash_conversion'].includes(key) && report?.scores.policy_version !== 'thesis-annual-financial-v2' ? null : report?.metrics[key]
export function researchStatus(report) {
  if (!report || report.quality.freshness === 'INSUFFICIENT' || !report.periods.length || ['revenue','cfo','net_income'].some(key => report.metrics[key]?.value == null)) return {tone:'neutral',label:'Insufficient evidence',description:'Core financial evidence is incomplete. An investment conclusion is not supported.'}
  const dimensions = ['quality','growth','profitability','financial_health'].map(key => researchAssessment(report,key).state)
  if (dimensions.includes('RED')) return {tone:'negative',label:'Red · Financial risks flagged',description:'Reported financial screening flags require investigation. This is not a sell recommendation.'}
  if (report.quality.freshness === 'STALE' || report.quality.warnings.length || dimensions.includes('UNKNOWN') || dimensions.includes('YELLOW') || report.scores.policy_version !== 'thesis-annual-financial-v2') return {tone:'caution',label:'Yellow · Further research needed',description:'Annual evidence has limitations. Forward outlook, valuation and entry remain unassessed.'}
  return {tone:'positive',label:'Green · Annual screening supportive',description:'Financial dimensions are supportive within annual screening only. This is not an investment recommendation.'}
}
export function trendView(report, frequency='annual') {
  if (!['annual','quarterly','ttm'].includes(frequency)) throw Error('Unsupported period frequency')
  if (frequency !== 'annual') return {available:false, reason:frequency==='quarterly'?'Quarterly periods are not supplied by the current research contract.':'Verified trailing-twelve-month periods are not supplied. Annual figures are not relabeled as TTM.',periods:[]}
  return {available:!!report?.periods.length,reason:'Load a company report to review annual evidence.',periods:report?.periods||[]}
}
export function unavailableReason(report, key) {
  if (['fcf','net_margin','cash_conversion'].includes(key) && report?.scores.policy_version !== 'thesis-annual-financial-v2') return 'Continuing-operations scope has not been verified under the current financial policy.'
  return 'Required filing inputs or accounting scope are missing or unsupported. No substitute is estimated.'
}

export function researchAssessment(report, key) {
  if (!report) return null
  if (['quality','profitability'].includes(key) && report.scores.policy_version !== 'thesis-annual-financial-v2') return {state:'UNKNOWN',reason:'Continuing-operations earnings and cash-conversion scope require current-policy verification before this dimension can be interpreted.',assumptions:[],counterarguments:[]}
  return report.assessments[key]
}
