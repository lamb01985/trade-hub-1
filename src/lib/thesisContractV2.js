import { assertThesisReport } from './thesisContract.js'
import { exactKeys, validUtc as utc } from './appCapabilitiesContract.js'
const fail=()=>{throw new Error('INVALID_THESIS_RESPONSE')}
export function assertThesisReportV2(value, expected={}) {
  if (!exactKeys(value,['schema_version','report','source_documents','evidence_bindings','identity_context']) || value.schema_version!=='thesis-company-v2') fail()
  const report=assertThesisReport(value.report,{...expected,fixture:false})
  const documents=value.source_documents
  if (!exactKeys(documents,['ticker_index','submissions','companyfacts'])) fail()
  const urls={ticker_index:'https://www.sec.gov/files/company_tickers.json',submissions:`https://data.sec.gov/submissions/CIK${report.issuer.cik}.json`,companyfacts:`https://data.sec.gov/api/xbrl/companyfacts/CIK${report.issuer.cik}.json`}
  for (const [name,doc] of Object.entries(documents)) if (!exactKeys(doc,['url','retrieved_at','body_sha256','hash_representation']) || doc.url!==urls[name] || doc.hash_representation!=='HTTP_DECODED_BODY' || !/^[a-f0-9]{64}$/.test(doc.body_sha256) || !utc(doc.retrieved_at) || Date.parse(doc.retrieved_at)>Date.parse(report.generated_at)+5000 || Date.parse(doc.retrieved_at)>Date.now()+5000) fail()
  const context=value.identity_context
  if (!exactKeys(context,['identity_basis','classification_basis','identity_observed_at','classification_observed_at','historical_identity_verified','as_of_semantics']) || context.identity_basis!=='CURRENT_MAPPING' || context.classification_basis!=='CURRENT_SUBMISSIONS' || context.identity_observed_at!==documents.ticker_index.retrieved_at || context.classification_observed_at!==documents.submissions.retrieved_at || context.historical_identity_verified!==false || context.as_of_semantics!=='FILING_FACT_CUTOFF') fail()
  const pointers=[]
  report.periods.forEach((period,i)=>Object.entries(period.facts).forEach(([key,fact])=>{if(fact!==null)pointers.push(`/report/periods/${i}/facts/${key}`)}))
  Object.entries(report.metrics).forEach(([key,metric])=>{if(metric.inputs.length>8)fail();metric.inputs.forEach((fact,i)=>pointers.push(`/report/metrics/${key}/inputs/${i}`))})
  if (!Array.isArray(value.evidence_bindings) || value.evidence_bindings.length>256 || value.evidence_bindings.length!==pointers.length) fail()
  const seen=new Set()
  for (const binding of value.evidence_bindings) {if (!exactKeys(binding,['fact_ref','source_document_id']) || binding.source_document_id!=='companyfacts' || !pointers.includes(binding.fact_ref) || seen.has(binding.fact_ref)) fail();seen.add(binding.fact_ref)}
  return value
}
