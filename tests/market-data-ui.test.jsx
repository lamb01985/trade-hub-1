// @vitest-environment jsdom
import React from 'react'
import {render,screen,cleanup,act} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
const hookState = vi.hoisted(()=>({value:null}))
vi.mock('../src/hooks/useMarketData.js',()=>({useMarketData:()=>hookState.value || ({envelope:null,error:'DEPENDENCY_UNAVAILABLE',loading:false})}))
import UnifiedMarketContext from '../src/components/UnifiedMarketContext.jsx'
import {evaluateCondition} from '../src/lib/conditionEvaluators.js'
import {evaluateSetup,evaluateSetupForTicker} from '../src/lib/setupEngine.js'
afterEach(()=>{cleanup();hookState.value=null;vi.restoreAllMocks();vi.useRealTimers()})
it('shows bounded read-only scope and blocked migration state when source is unavailable',()=>{
 render(<UnifiedMarketContext ready={false} onLegacy={()=>{}}/> )
 expect(screen.getByText(/Migration pending: current action evaluation unavailable/)).toBeTruthy()
 expect(screen.getByText(/Trade readiness: NOT_EVALUATED/)).toBeTruthy()
 expect(screen.getAllByRole('option').map(e=>e.textContent)).toEqual(['QQQ','SPY','IWM'])
 expect(screen.getAllByText('DEPENDENCY_UNAVAILABLE')).toHaveLength(2)
})
it('never turns Unified data into a setup or condition transition',()=>{
 const snapshot={mode:'unified',price:100,schema_version:'market-data-envelope-v1'}
 expect(evaluateCondition({type:'price_above',params:{price:1}},snapshot).met).toBe(false)
 expect(evaluateSetupForTicker({conditions:[{}]},'QQQ',snapshot).allMet).toBe(false)
 expect(evaluateSetup({conditions:[{}]},{QQQ:snapshot},{mode:'unified'}).triggered).toEqual([])
})

it('expires CURRENT evidence locally while the network is stalled',async()=>{
 vi.useFakeTimers()
 let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now)
 hookState.value={receivedAt:0,envelope:{availability:'AVAILABLE',deployment_profile:'offline',generated_at:'2026-10-23T15:00:00Z',data:{bid:null,ask:null,last_trade:null},quality:{freshness:'CURRENT',coverage:'COMPLETE',source_age_seconds:29,reasons:[]}}}
 render(<UnifiedMarketContext ready onLegacy={()=>{}}/>)
 expect(screen.getAllByText(/AVAILABLE · CURRENT · COMPLETE/)).toHaveLength(2)
 now=2000;await act(async()=>vi.advanceTimersByTimeAsync(1000))
 expect(screen.getAllByText(/AVAILABLE · STALE · COMPLETE/)).toHaveLength(2)
})
