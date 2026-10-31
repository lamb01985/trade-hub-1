// @vitest-environment jsdom
import React from 'react'
import { render,screen,fireEvent,cleanup,waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach,beforeEach,it,expect,vi } from 'vitest'
import Levels from '../src/components/Levels.jsx'
import Calendar from '../src/components/Calendar.jsx'
import { calcPivots } from '../src/lib/levels.js'
vi.mock('../src/lib/calendar.js',async()=>{const actual=await vi.importActual('../src/lib/calendar.js');return{...actual,fetchNasdaqEarnings:vi.fn()}})
vi.mock('../src/lib/sectors.js',async()=>{const actual=await vi.importActual('../src/lib/sectors.js');return{...actual,getRotationSnapshot:vi.fn().mockResolvedValue({rows:[],fetchedAt:Date.now()}),writeSectorCache:vi.fn(),readSectorCache:vi.fn(()=>null)}})
import { fetchNasdaqEarnings } from '../src/lib/calendar.js'
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('VITE_LOCAL_SERVICE_PREVIEW','true');fetchNasdaqEarnings.mockResolvedValue({rows:[],error:null})})
afterEach(()=>{cleanup();vi.unstubAllEnvs()})
it('Levels displays a readable service limitation and retains manual level entry',()=>{
 render(<Levels liveData={{price:null,contextError:'unavailable'}} settings={{alertsEnabled:false}} onSettingsChange={()=>{}}/>)
 expect(screen.getByText('Live levels unavailable')).toBeInTheDocument();expect(screen.getByText(/Live market services are disabled/)).toBeInTheDocument()
 expect(screen.queryByText(/Add your key in the Command tab/)).not.toBeInTheDocument()
 fireEvent.input(screen.getByPlaceholderText('Key resistance'),{target:{value:'Manual research level'}});fireEvent.input(screen.getByPlaceholderText('715.00'),{target:{value:'101'}});fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}))
 expect(screen.getByText('Manual research level $101.00')).toBeInTheDocument()
})
it('Levels renders existing calculated levels when the actual hook supplies data',()=>{
 vi.stubEnv('VITE_LOCAL_SERVICE_PREVIEW','false')
 render(<Levels liveData={{price:100,prevDay:{high:102,low:98,close:100},weeklyData:{high:104,low:96},pivots:calcPivots(102,98,100),sdZones:[],isHistoricalFallback:true}} settings={{alertsEnabled:false}}/>)
 expect(screen.queryByText('Live levels unavailable')).not.toBeInTheDocument()
 expect(screen.getByText(/Historical minute-bar fallback is in use/)).toBeInTheDocument()
 expect(screen.getAllByText(/Prev Day High|PDH/).length).toBeGreaterThan(0)
 expect(screen.getAllByText(/102.00/).length).toBeGreaterThan(0)
})
it('Calendar keeps ordinary events available while failed earnings remain unknown',async()=>{
 fetchNasdaqEarnings.mockResolvedValue({rows:[],error:'proxy unavailable'})
 render(<Calendar apiKey="server-managed"/>);fireEvent.click(screen.getByRole('button',{name:'Earnings',exact:true}))
 await screen.findByText(/Earnings unavailable. An empty display does not mean/)
 expect(screen.queryByText('No earnings in the next 14 days.')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Combined feed',exact:true}));expect(screen.getByRole('button',{name:'Month',exact:true})).toBeInTheDocument()
 expect(screen.getByText(/sector rotation needs server-side Massive access/i)).toBeInTheDocument()
})
it('Calendar renders supplied Nasdaq rows and distinguishes partial coverage',async()=>{
 let first=true
 fetchNasdaqEarnings.mockImplementation(async date=>{if(first){first=false;return{rows:[],error:'one failed day'}}return{rows:[{date,time:'15:30',type:'earnings',impact:'high',name:'AAPL Earnings',ticker:'AAPL',bmo:'AMC'}],error:null}})
 render(<Calendar apiKey="server-managed"/>);fireEvent.click(screen.getByRole('button',{name:'Earnings',exact:true}))
 await waitFor(()=>expect(screen.getAllByText('AAPL Earnings').length).toBeGreaterThan(0))
 expect(screen.getByText(/Earnings coverage incomplete:/)).toBeInTheDocument()
 expect(screen.queryByText(/No tracked earnings in the next 14 days/)).not.toBeInTheDocument()
})
it('Calendar says empty only after every requested earnings date succeeded',async()=>{
 render(<Calendar apiKey="server-managed"/>);fireEvent.click(screen.getByRole('button',{name:'Earnings',exact:true}))
 await screen.findByText('No tracked earnings returned for the covered dates.')
 expect(fetchNasdaqEarnings).toHaveBeenCalled()
})
