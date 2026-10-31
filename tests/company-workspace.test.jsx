// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import CompanyIntelligence from '../src/components/workspace/CompanyIntelligence.jsx'
import fixture from './fixtures/thesis-company.json' with {type:'json'}
const response=body=>({ok:true,json:async()=>body})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('renders unavailable assessments without synthetic companies, prices or targets',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({enabled:false,development_fixture:false})))
  render(<CompanyIntelligence/>);await screen.findByText(/Research is not activated/)
  expect(screen.getAllByText('Insufficient data')).toHaveLength(6);expect(screen.queryByText('$0.00')).toBeNull();expect(screen.getByRole('button',{name:'Research company'})).toBeTruthy()
})
it('discards a late report after the company selection changes',async()=>{
  let resolve;vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response({enabled:true,development_fixture:true})).mockImplementationOnce(()=>new Promise(r=>{resolve=r})))
  render(<CompanyIntelligence/>);await screen.findByText(/Authenticated research service available/)
  fireEvent.change(screen.getByLabelText('Company ticker'),{target:{value:'DEMOA'}});fireEvent.change(screen.getByLabelText('Research as of'),{target:{value:fixture.as_of}})
  fireEvent.click(screen.getByRole('button',{name:'Research company'}));await waitFor(()=>expect(resolve).toBeTypeOf('function'))
  fireEvent.click(screen.getByRole('button',{name:'NVDA',exact:true}));await act(async()=>resolve(response(fixture)))
  expect(screen.queryByText(fixture.issuer.name)).toBeNull();expect(screen.getByLabelText('Company ticker').value).toBe('NVDA');expect(screen.getAllByText('Insufficient data')).toHaveLength(6)
})
it('rejects a wrong-company financial response and renders no prior report',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response({enabled:true,development_fixture:true})).mockResolvedValueOnce(response(fixture)))
  render(<CompanyIntelligence/>);await screen.findByText(/Authenticated research service available/);fireEvent.change(screen.getByLabelText('Research as of'),{target:{value:fixture.as_of}});fireEvent.click(screen.getByRole('button',{name:'Research company'}))
  await screen.findByRole('alert');expect(screen.queryByText(fixture.issuer.name)).toBeNull();expect(screen.getByRole('alert').textContent).toMatch(/could not be verified/)
})
it('requires two to five distinct comparison tickers before requesting reports',async()=>{
  const fetch=vi.fn().mockResolvedValue(response({enabled:true,development_fixture:false}));vi.stubGlobal('fetch',fetch)
  render(<CompanyIntelligence view="compare"/>);await screen.findByText(/Authenticated research service available/)
  fireEvent.change(screen.getByLabelText('Comparison tickers'),{target:{value:'AMD, AMD'}});fireEvent.click(screen.getByRole('button',{name:'Compare companies'}));expect(screen.getByRole('alert').textContent).toMatch(/two to five/);expect(fetch).toHaveBeenCalledTimes(1)
})
