// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WorkspaceShell from '../src/components/workspace/WorkspaceShell.jsx'
import { ALL_NAV, PRIMARY_NAV } from '../src/components/workspace/navigation.js'
import Overview from '../src/components/workspace/Overview.jsx'
const props={active:PRIMARY_NAV[0],ticker:'QQQ',onNavigate:vi.fn(),onTicker:vi.fn(),session:'after hours',connected:false,freshness:{fresh:false,label:'No verified quote'}}
beforeEach(()=>{vi.stubGlobal('requestAnimationFrame',callback=>callback());vi.spyOn(window,'scrollTo').mockImplementation(()=>{})})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('keeps all legacy destinations accessible and exposes the approved primary navigation',()=>{
  const ids=new Set(ALL_NAV.map(x=>x.id))
  for(const [tab,subtabs] of Object.entries({plan:['intelligence','watchlist','focus','wheel','prep','playbook','calendar','levels','movers','universe','setups','glossary'],trade:['chart','bot','orb','iv','calc','command'],review:['journal','research','outcomes','stats']}))for(const sub of subtabs)expect(ids.has(`${tab}:${sub}`),`${tab}/${sub}`).toBe(true)
  render(<WorkspaceShell {...props}><p>Research tools</p></WorkspaceShell>)
  expect(PRIMARY_NAV.map(x=>x.label)).toEqual(['Overview','Events','Opportunities','Company Intelligence','Trading Desk','Portfolio','Journal & Strategies'])
  fireEvent.click(screen.getByRole('button',{name:'Trading tools',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Options & volatility'}))
  expect(props.onNavigate).toHaveBeenCalledWith(expect.objectContaining({tab:'trade',sub:'iv'}))
})
it('normalizes a ticker and rejects URLs without starting a provider request',()=>{
  const select=vi.fn();render(<WorkspaceShell {...props} onTicker={select}/>)
  fireEvent.change(screen.getByLabelText('Search ticker'),{target:{value:' amd '}});fireEvent.submit(screen.getByRole('search'));expect(select).toHaveBeenCalledWith('AMD')
  fireEvent.change(screen.getByLabelText('Search ticker'),{target:{value:'https://evil.test'}});fireEvent.submit(screen.getByRole('search'));expect(select).toHaveBeenCalledTimes(1);expect(screen.getByRole('alert')).toBeTruthy()
})
it('opens a named mobile drawer, isolates background controls, and restores focus on Escape',async()=>{
  vi.stubGlobal('requestAnimationFrame',callback=>callback());vi.spyOn(window,'scrollTo').mockImplementation(()=>{})
  render(<WorkspaceShell {...props}><button>Place a manual action</button></WorkspaceShell>)
  const open=screen.getByRole('button',{name:'Open navigation'});fireEvent.click(open)
  expect(screen.getByRole('dialog',{name:'Workspace navigation'}).getAttribute('aria-modal')).toBe('true')
  expect(document.querySelector('.eq-main').hasAttribute('inert')).toBe(true)
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(open)
})
it('never displays another ticker’s price, source time or chart during a switch',()=>{
  render(<Overview ticker="SPY" liveData={{dataTicker:'QQQ',price:999.99,priceTimestamp:Date.now(),intradayBars:[{t:Date.now()-60000,c:999},{t:Date.now(),c:1000}]}} trades={[]} setups={[]} onNavigate={()=>{}} onTicker={()=>{}} session="pre-market"/>)
  expect(screen.getByRole('heading',{name:'Personalized Overview'})).toBeTruthy();expect(screen.queryByText('$999.99')).toBeNull();expect(screen.queryByRole('img')).toBeNull();expect(screen.getByText('No verified price series')).toBeTruthy()
  expect(screen.getByText(/Premarket focus/)).toBeTruthy();expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
})
it('does not treat missing portfolio marks as zero or invent ranked opportunities',()=>{
  render(<Overview ticker="QQQ" liveData={{}} trades={[{id:'one',ticker:'AMD',status:'open'}]} setups={[]} onNavigate={()=>{}} onTicker={()=>{}} session="after-hours"/>)
  expect(screen.queryByText('$0.00')).toBeNull();expect(screen.getAllByText('Not ranked')).toHaveLength(3);expect(screen.getByText('Briefing unavailable')).toBeTruthy();expect(screen.getByText('No verified thesis-change feed')).toBeTruthy()
})
