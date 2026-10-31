// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, it, expect, vi } from 'vitest'
import MarketIntelligence from '../src/components/intelligence/MarketIntelligence.jsx'
import { adaptPythonReport } from '../src/lib/reportContract.js'
import { INTELLIGENCE_VIEWS, intelligenceFromSearch } from '../src/lib/intelligenceNavigation.js'
import { pythonReport } from './reportFixture.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })
function report() { return adaptPythonReport(pythonReport(), new Date('2026-10-26T12:00:00Z')) }
it('navigates all four views without a page reload and labels Friday context', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>report()}))
  render(<MarketIntelligence/>)
  expect(await screen.findByText('FRIDAY-CLOSE SNAPSHOT · LOCAL SAMPLE · NOT LIVE')).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Market Intelligence'})).toBeInTheDocument()
  expect(screen.getAllByText(/No observations available for this symbol/)).toHaveLength(3)
  fireEvent.click(screen.getByRole('button',{name:'Options Positioning'}))
  expect(screen.getByText('Options intelligence unavailable for QQQ.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Intraday Playbook'}))
  expect(screen.getByText(/Monday opening range, VWAP and confirmations are unavailable/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Swing Playbook'}))
  expect(screen.getByText(/unvalidated swing hypotheses/)).toBeInTheDocument()
  expect(window.location.search).toBe('?intelligence=swing')
})
it('keeps a loaded snapshot visible after refresh failure',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>report()}).mockRejectedValue(new Error('Network unavailable'))
  vi.stubGlobal('fetch',fetch);render(<MarketIntelligence/>);await screen.findByText(/LOCAL SAMPLE/)
  fireEvent.click(screen.getByRole('button',{name:'Refresh report'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Showing the previously loaded sample'))
})
it('shows missing report and authorization states without fabricating data',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:503}));const first=render(<MarketIntelligence/>);expect(await screen.findByRole('alert')).toHaveTextContent('Report unavailable');first.unmount()
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401}));render(<MarketIntelligence/>);expect(await screen.findByLabelText('Operator password')).toBeInTheDocument();expect(screen.queryByText(/LOCAL SAMPLE/)).not.toBeInTheDocument()
})
it('supports scoped deep links without changing ordinary workspace defaults',()=>{
 expect(INTELLIGENCE_VIEWS.map(x=>x.label)).toEqual(['Sector Rotation','Analyst Brief','Training Mode','Market Map','Options Positioning','Intraday Playbook','Swing Playbook'])
 expect(intelligenceFromSearch('?intelligence=map')).toBe('map')
 expect(intelligenceFromSearch('?intelligence=unknown')).toBe(null)
 expect(intelligenceFromSearch('')).toBe(null)
})

it('keeps saved Friday sample provenance separate from Sector Rotation',async()=>{
 vi.stubEnv('VITE_LOCAL_SERVICE_PREVIEW','true');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>report()}));render(<MarketIntelligence/>);await screen.findByText('FRIDAY-CLOSE SNAPSHOT · LOCAL SAMPLE · NOT LIVE');fireEvent.click(screen.getByRole('button',{name:'Sector Rotation'}));expect(screen.getByText(/Sector rotation unavailable:/)).toBeInTheDocument();expect(screen.queryByText('FRIDAY-CLOSE SNAPSHOT · LOCAL SAMPLE · NOT LIVE')).toBeNull()
})
