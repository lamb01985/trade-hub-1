// @vitest-environment jsdom
import React from 'react'
import {it,expect,vi,afterEach} from 'vitest'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
vi.mock('../src/lib/massive.js',()=>({getOptionsResearch:vi.fn(),getOptionChain:vi.fn(),getOptionEvidence:vi.fn()}))
import {getOptionEvidence} from '../src/lib/massive.js'
import OptionsResearch from '../src/components/OptionsResearch.jsx'
import PositioningDashboard from '../src/components/PositioningDashboard.jsx'
import {optionsV2Fixture} from '../src/lib/optionsV2Fixture.js'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('explicit demo labels every context and disables live inspector/evidence mixing',async()=>{
 render(<OptionsResearch/>);fireEvent.click(screen.getByRole('button',{name:'Load synthetic positioning demo'}));expect(await screen.findByRole('heading',{name:'Market positioning overview · QQQ'})).toBeInTheDocument();expect(screen.getByRole('note')).toHaveTextContent('NOT MARKET DATA');expect(screen.queryByText('Existing contract inspector')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Volume',exact:true}));expect(screen.getByRole('heading',{name:'Strike positioning · volume'})).toBeInTheDocument();expect(screen.getAllByText(/SYNTHETIC_DEMO_NO_REAL_TECHNICAL_MIXING/).length).toBeGreaterThan(0)
 fireEvent.change(screen.getByLabelText('Evidence contract'),{target:{value:'O:QQQ261120C00095000'}});fireEvent.click(screen.getByRole('button',{name:'Inspect entitled evidence'}));expect(await screen.findByRole('alert')).toHaveTextContent('does not request real');expect(getOptionEvidence).not.toHaveBeenCalled()
})
it('acquired daily adapter envelope reaches dashboard and source dates remain visible',async()=>{
 const {snapshot,clock}=optionsV2Fixture(),c=snapshot.contracts[0],chain={...snapshot,mode:undefined}
 const daily={kind:'daily',contract:c.symbol,provider:'Massive',source:`https://api.massive.com/v2/aggs/ticker/${c.symbol}/range/1/day/2026-10-01/2026-10-30`,requestedDate:'2026-11-02',range:{start:'2026-10-01',end:'2026-10-30'},fetchedAt:snapshot.fetchedAt,complete:false,results:['26','27','28','29','30'].map(day=>({t:Date.parse(`2026-10-${day}T14:00:00Z`),v:100}))}
 getOptionEvidence.mockResolvedValue({trades:{error:'NOT_ENTITLED'},quotes:{error:'NOT_ENTITLED'},daily})
 render(<PositioningDashboard chain={chain} expiry={chain.expiry} now={clock}/>);fireEvent.change(screen.getByLabelText('Evidence contract'),{target:{value:c.symbol}});fireEvent.click(screen.getByRole('button',{name:'Inspect entitled evidence'}))
 await waitFor(()=>expect(screen.getByText(/historical relative volume 2 /)).toBeInTheDocument());expect(screen.getByText(/numerator 2026-11-02, requested 2026-11-02/)).toBeInTheDocument();expect(screen.getByText(/trades: NOT_ENTITLED/)).toBeInTheDocument()
})
