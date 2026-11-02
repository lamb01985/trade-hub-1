// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import CompanyIntelligence from '../src/components/workspace/CompanyIntelligence.jsx'
import {companyResearchFixture} from './fixtures/companyResearchFixtures.js'
import {assertThesisReport} from '../src/lib/thesisContract.js'
import {researchStatus,trendView} from '../src/lib/companyResearchView.js'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function setup(symbol='AMD') {
  const report=companyResearchFixture(symbol)
  assertThesisReport(report,{symbol,fixture:true})
  const fetch=vi.fn(async url=>({ok:true,json:async()=>url==='/api/thesis/status'?{enabled:true,development_fixture:true}:report}))
  vi.stubGlobal('fetch',fetch)
  render(<CompanyIntelligence ticker={symbol}/>)
  return {report,fetch}
}
async function load(symbol='AMD') {
  const result=setup(symbol)
  await screen.findByText(/Authenticated research service available/)
  fireEvent.change(screen.getByLabelText('Research as of'),{target:{value:result.report.as_of}})
  fireEvent.click(screen.getByRole('button',{name:'Research company'}))
  await screen.findByRole('heading',{name:`Synthetic ${symbol} research fixture`})
  return result
}
it.each(['AMD','NVDA'])('renders %s as a clearly identified fixture with annual evidence and honest research gaps',async symbol=>{
  await load(symbol)
  expect(screen.getByText(/Synthetic demonstration/)).toBeTruthy()
  expect(screen.getByText(/Not actual company financial data/)).toBeTruthy()
  for(const name of ['The evidence brief','Performance across periods','Forward outlook','Valuation & entry'])expect(screen.getByRole('heading',{name,exact:true})).toBeTruthy()
  const audit=document.querySelector('#research-audit')
  expect(audit.open).toBe(false)
  expect(screen.getByText(/Yellow · Further research needed/)).toBeTruthy()
  expect(screen.getByText(/No sourced management guidance/)).toBeTruthy()
  expect(screen.getByText(/No approved scenario assumptions/)).toBeTruthy()
  const periods=document.querySelector('.eq-financial-periods')
  expect(within(periods).getAllByText(/Continuing-operations scope has not been verified/)).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Period view'),{target:{value:'ttm'}})
  expect(screen.getByText(/Annual figures are not relabeled as TTM/)).toBeTruthy()
  expect(document.querySelector('.eq-financial-periods')).toBeNull()
  fireEvent.change(screen.getByLabelText('Period view'),{target:{value:'quarterly'}})
  expect(screen.getByText(/Quarterly periods are not supplied/)).toBeTruthy()
})
it('shows insufficient evidence distinctly for a partial-data issuer without scoring a recommendation',async()=>{
  await load('PARTIAL')
  expect(screen.getAllByText('Insufficient evidence')).toHaveLength(7)
  expect(screen.queryByText(/Green ·/)).toBeNull()
  expect(document.querySelector('.eq-financial-periods')).toBeNull()
})
it('rejects an invalid ticker before acquisition and leaves no stale issuer',async()=>{
  const {fetch}=await load()
  fireEvent.change(screen.getByLabelText('Company ticker'),{target:{value:'../AMD'}})
  fireEvent.click(screen.getByRole('button',{name:'Research company'}))
  expect(screen.getByRole('alert').textContent).toMatch(/valid ticker/)
  expect(screen.queryByRole('heading',{name:'Synthetic AMD research fixture'})).toBeNull()
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('research status never uses incomplete screen scores as an investment rating',()=>{
  const report=companyResearchFixture()
  report.scores.long_financial=100
  expect(researchStatus(report).tone).toBe('caution')
  report.quality.freshness='INSUFFICIENT'
  expect(researchStatus(report).label).toBe('Insufficient evidence')
  expect(trendView(report,'ttm').available).toBe(false)
  expect(()=>trendView(report,'monthly')).toThrow()
})
it('distinguishes red financial risk and green annual screening without buy/sell conclusions',()=>{
  const report=companyResearchFixture()
  report.quality.warnings=[];report.scores.policy_version='thesis-annual-financial-v2'
  for(const key of ['quality','growth','profitability','financial_health'])report.assessments[key].state='GREEN'
  expect(researchStatus(report).label).toMatch(/^Green · Annual screening/)
  expect(researchStatus(report).description).toMatch(/not an investment recommendation/)
  report.assessments.growth.state='RED'
  expect(researchStatus(report).label).toMatch(/^Red ·/)
})
it('keeps material warnings visible for every compared company',async()=>{
  vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url==='/api/thesis/status'?{enabled:true,development_fixture:true}:companyResearchFixture(new URL(url,'http://localhost').searchParams.get('symbol'))})))
  render(<CompanyIntelligence view="compare"/>)
  await screen.findByText(/Authenticated research service available/)
  fireEvent.change(screen.getByLabelText('Research as of'),{target:{value:companyResearchFixture().as_of}})
  fireEvent.click(screen.getByRole('button',{name:'Compare companies'}))
  await screen.findByText(/NVDA · Yellow/)
  expect(screen.getAllByText(/Synthetic development fixture. Not actual company financial data/)).toHaveLength(2)
  expect(screen.getAllByText(/Evidence: ANNUAL ONLY/)).toHaveLength(2)
})
it('reports a supported server not-found error without displaying any old facts',async()=>{
  vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/thesis/status'?{ok:true,json:async()=>({enabled:true,development_fixture:false})}:{ok:false,json:async()=>({error:'company_not_found'})}))
  render(<CompanyIntelligence ticker="UNKNOWN"/>)
  await screen.findByText(/Authenticated research service available/)
  fireEvent.click(screen.getByRole('button',{name:'Research company'}))
  expect((await screen.findByRole('alert')).textContent).toMatch(/No supported company filing/)
  expect(document.querySelector('.eq-financial-periods')).toBeNull()
})
it('suppresses legacy scope-derived profitability and quality interpretations as well as numeric metrics',async()=>{
  const {report}=await load()
  const brief=document.querySelector('#research-brief')
  expect(within(brief).queryByText(report.assessments.profitability.reason)).toBeNull()
  expect(within(brief).queryByText(report.assessments.quality.reason)).toBeNull()
  expect(within(brief).getAllByText(/Continuing-operations earnings and cash-conversion scope require/)).toHaveLength(2)
})
it('does not promote an unverified legacy profitability risk into the aggregate status',()=>{
  const report=companyResearchFixture()
  report.assessments.quality.state='RED'
  report.assessments.profitability.state='RED'
  expect(researchStatus(report).tone).toBe('caution')
  report.assessments.growth.state='RED'
  expect(researchStatus(report).tone).toBe('negative')
})
