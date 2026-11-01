// @vitest-environment jsdom
import React from 'react'
import { afterEach,beforeEach,it,expect,vi } from 'vitest'
import { render,screen,cleanup,fireEvent } from '@testing-library/react'
const state=vi.hoisted(()=>({data:null}))
vi.mock('../src/hooks/useDeskMarketData.js',()=>({useDeskMarketData:()=>state.data}))
vi.mock('../src/components/Chart.jsx',()=>({default:props=><div data-testid="chart-adapter">{JSON.stringify({symbol:props.ticker,price:props.liveData.price,bars:props.liveData.intradayBars.length,researchOnly:props.researchOnly})}</div>}))
import ReadinessDesk from '../src/components/ReadinessDesk.jsx'
import { stockEvidence } from '../src/lib/marketEvidence.js'
beforeEach(()=>{vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{callback(0);return 0})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
const source=Date.parse('2026-10-30T23:59:59Z')
function data(overrides={}){
 const row=stockEvidence('QQQ',{ticker:'QQQ',updated:source*1e6,lastTrade:{p:692.74,t:source*1e6},lastQuote:{p:692.63,P:692.69,t:source*1e6},prevDay:{c:715.34,h:718.07,l:711.62}})
 return {now:Date.parse('2026-11-01T18:00:00Z'),feed:{data:{stocks:{data:[row]},vix:{error:'NOT_ENTITLED'}},loading:false,error:null},context:{data:null,error:null,loading:false},...overrides}
}
it('renders dated recorded prices in the existing shell and keeps raw evidence secondary',()=>{
 state.data=data();render(<ReadinessDesk/>);
 expect(screen.getByRole('heading',{name:'Trading Desk',level:1})).toBeTruthy()
 expect(screen.getByTestId('selected-price').textContent).toContain('692.74')
 expect(screen.getByText(/not executable live prices/)).toBeTruthy()
 expect(screen.getByTestId('chart-adapter').textContent).toContain('"bars":0')
 expect(screen.queryByText('Watchlist observations')).toBeNull()
 fireEvent.click(screen.getAllByRole('button',{name:'Data Health',exact:true})[0])
 expect(screen.getByText('Watchlist observations')).toBeTruthy()
})
it('never shows a failed feed as a price and does not render another symbol context',()=>{
 state.data=data({feed:{data:null,error:'Provider unavailable',loading:false},context:{data:{symbol:'AMD',period:'current',bars:{data:[{c:999}]},previous:{data:[{h:999,l:990,c:995}]}},error:null}})
 render(<ReadinessDesk/>);
 expect(screen.getByTestId('selected-price').textContent).toContain('—')
 expect(screen.getByTestId('chart-adapter').textContent).toContain('"bars":0')
 expect(screen.queryByText('999.00')).toBeNull()
})
it('never reuses historical bars after switching back to Today',()=>{
 state.data=data({context:{data:{symbol:'QQQ',period:'completed',date:'2026-10-30',bars:{data:[{c:123,timestamp:source}]},previous:{data:[]}},error:null}})
 render(<ReadinessDesk/>);
 expect(screen.getByTestId('chart-adapter').textContent).toContain('"bars":0')
 fireEvent.click(screen.getByRole('button',{name:'Last completed session'}))
 expect(screen.getByTestId('chart-adapter').textContent).toContain('"bars":1')
 fireEvent.click(screen.getByRole('button',{name:'Today',exact:true}))
 expect(screen.getByTestId('chart-adapter').textContent).toContain('"bars":0')
})
it('disables manual refresh during provider cooldown and keeps unavailable prices explicit',()=>{
 const now=Date.parse('2026-11-01T18:00:00Z')
 state.data=data({feed:{data:{stocks:{data:null,error:'RATE_LIMITED'}},error:null,loading:false,retryAt:now+120000}})
 render(<ReadinessDesk/>);
 expect(screen.getByRole('button',{name:'Retry in 120s',exact:true}).disabled).toBe(true)
 expect(screen.getByTestId('selected-price').textContent).toContain('—')
 expect(screen.getByRole('alert').textContent).toContain('RATE_LIMITED')
})
