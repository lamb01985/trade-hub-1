// @vitest-environment jsdom
import React from 'react'
import {renderHook,act,waitFor,cleanup} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {useMarketData} from './useMarketData.js'
function fixture() { return {schema_version:'market-data-envelope-v1',request_id:'test',deployment_profile:'offline',generated_at:'2026-10-23T15:00:00Z',instrument:{canonical_id:'ETF:US:QQQ',provider_symbol:'QQQ',asset_class:'ETF',currency:'USD'},source:{provider:'Massive',transport:'REST',endpoint_family:'snapshot'},availability:'AVAILABLE',data:{last_trade:null,bid:null,ask:null,bid_size:null,ask_size:null},quality:{freshness:'UNKNOWN',coverage:'PARTIAL',policy_version:'v1',source_age_seconds:null,missing_fields:[],invalid_fields:[],reasons:[]},coverage_details:{requested_window:null,returned_window:null,pages_read:1,pagination_complete:true,observations:0,minimum_required:null,missing_intervals:[]},error:null} }
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function response(symbol='QQQ',code=null) { const e=fixture();e.instrument={...e.instrument,canonical_id:`ETF:US:${symbol}`,provider_symbol:symbol};if(code) {e.data=null;e.error={code,retryable:false,retry_after_seconds:null}}return {json:async()=>e,headers:new Headers()} }
describe('market-data request ownership',()=>{
 it('discards an obsolete callback and clears previous selection immediately',async()=>{
 let first;vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(resolve=>first=resolve)).mockResolvedValue(response('SPY')))
 const {result,rerender}=renderHook(({symbol})=>useMarketData('snapshot',symbol),{initialProps:{symbol:'QQQ'}})
 rerender({symbol:'SPY'});expect(result.current.envelope).toBeNull()
 await waitFor(()=>expect(result.current.envelope?.instrument.provider_symbol).toBe('SPY'))
 await act(async()=>first(response('QQQ')))
 expect(result.current.envelope.instrument.provider_symbol).toBe('SPY')
 })
 it('keeps provider 403 separate from operator login and never retries unsupported tickers',async()=>{
 const fetcher=vi.fn().mockResolvedValue(response('QQQ','PROVIDER_NOT_ENTITLED'));vi.stubGlobal('fetch',fetcher)
 const {result,rerender}=renderHook(({symbol})=>useMarketData('snapshot',symbol),{initialProps:{symbol:'QQQ'}})
 await waitFor(()=>expect(result.current.error).toBe('PROVIDER_NOT_ENTITLED'))
 rerender({symbol:'NQ'});await waitFor(()=>expect(result.current.error).toBe('UNSUPPORTED_INSTRUMENT'));expect(result.current.envelope).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1)
 })
})
it('invalidates operator auth before reading JSON and ignores obsolete auth failures',async()=>{
 const expired=vi.fn();window.addEventListener('tradehub-operator-expired',expired)
 let first;const json=vi.fn();vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(resolve=>first=resolve)).mockResolvedValue(response('SPY')))
 const {result,rerender,unmount}=renderHook(({symbol})=>useMarketData('snapshot',symbol),{initialProps:{symbol:'QQQ'}})
 rerender({symbol:'SPY'});await waitFor(()=>expect(result.current.envelope?.instrument.provider_symbol).toBe('SPY'))
 await act(async()=>first({headers:new Headers({'X-TradeHub-Auth-Required':'true'}),json}))
 expect(expired).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();unmount()
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({headers:new Headers({'X-TradeHub-Auth-Required':'true'}),json}))
 renderHook(()=>useMarketData('snapshot','QQQ'));await waitFor(()=>expect(expired).toHaveBeenCalledTimes(1));expect(json).not.toHaveBeenCalled()
 window.removeEventListener('tradehub-operator-expired',expired)
})
it('aborts a stalled attempt after 35 seconds before scheduling another',async()=>{
 vi.useFakeTimers()
 try {
  const fetcher=vi.fn(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetcher)
  const {result}=renderHook(()=>useMarketData('snapshot','QQQ'))
  await act(async()=>vi.advanceTimersByTimeAsync(35000))
  expect(result.current.error).toBe('REFRESH_TIMEOUT');expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async()=>vi.advanceTimersByTimeAsync(9999));expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async()=>vi.advanceTimersByTimeAsync(1));expect(fetcher).toHaveBeenCalledTimes(2)
 } finally {vi.useRealTimers()}
})
