import { assertThesisReportV2 } from '../lib/thesisContractV2.js'
export async function fetchCompanyResearch(symbol, asOf, signal, profile) {
  const response=await fetch(`/api/thesis/company?${new URLSearchParams({symbol,as_of:asOf})}`,{cache:'no-store',signal})
  const body=await response.json()
  if(!response.ok){if(response.status===401||response.status===403)window.dispatchEvent(new Event('tradehub-operator-expired'));throw new Error(body.error||'sec_unavailable')}
  const wrapper=assertThesisReportV2(body,{symbol,asOf,profile})
  if(wrapper.report.scores.policy_version!=='thesis-annual-financial-v2')throw Error('INVALID_THESIS_RESPONSE')
  return wrapper
}
