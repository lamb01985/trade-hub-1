// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
vi.mock('../src/lib/massive.js',()=>({getOptionsResearch:vi.fn(),getOptionChain:vi.fn()}))
import {getOptionsResearch} from '../src/lib/massive.js'
import OptionsResearch from '../src/components/OptionsResearch.jsx'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('shows partial evidence, excludes missing quotes, models an exact research contract',async()=>{
 const c={symbol:'O:QQQ261120C00100000',underlying:'QQQ',type:'call',strike:100,expiry:'2026-11-20',exerciseStyle:'american',sharesPerContract:100,iv:.3,underlyingPrice:100,underlyingTime:'2026-10-30T20:00:00Z',openInterest:100,volume:300,bid:null,ask:null}
 getOptionsResearch.mockResolvedValue({symbol:'QQQ',expiry:'2026-11-20',coverageScope:'SELECTED_EXPIRATION',contracts:[c],pages:1,complete:false,provider:'Massive',fetchedAt:'2026-11-01T20:00:00Z'})
 render(<OptionsResearch/>);fireEvent.click(screen.getByRole('button',{name:'Research options'}));await screen.findByText(/PARTIAL_OBSERVED_SAMPLE · 1 pages/)
 expect(screen.getAllByText('No contracts pass current executable-research gates.')).toHaveLength(2)
 fireEvent.change(screen.getByLabelText('Model exact observed contract'),{target:{value:c.symbol}})
 await screen.findByRole('heading',{name:'Scenario lab · '+c.symbol})
 fireEvent.change(screen.getByLabelText('Entry premium / share'),{target:{value:'4'}})
 await waitFor(()=>expect(screen.getByText(/200-step American CRR/)).toBeInTheDocument())
 fireEvent.change(screen.getByLabelText('Research underlying'),{target:{value:'SPY'}})
 expect(screen.queryByText(/Scenario lab/)).not.toBeInTheDocument()
})
it('explains rate limits without inventing market data',async()=>{
 getOptionsResearch.mockRejectedValue(Object.assign(new Error('limited'),{status:429}));render(<OptionsResearch/>);fireEvent.click(screen.getByRole('button',{name:'Research options'}));expect(await screen.findByRole('alert')).toHaveTextContent('request budget limit');expect(screen.queryByText(/Executive overview/)).not.toBeInTheDocument()
})
it('explains fail-closed account-budget dependency',async()=>{
 getOptionsResearch.mockRejectedValue(Object.assign(new Error('market_data_budget_unavailable'),{status:503}));render(<OptionsResearch/>);fireEvent.click(screen.getByRole('button',{name:'Research options'}));expect(await screen.findByRole('alert')).toHaveTextContent('Shared Massive account budget');expect(screen.getByText('Existing contract inspector')).toBeInTheDocument()
})
