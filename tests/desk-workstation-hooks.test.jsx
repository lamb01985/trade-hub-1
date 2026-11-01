// @vitest-environment jsdom
import { afterEach,it,expect,vi } from 'vitest'
import { renderHook,act,cleanup } from '@testing-library/react'
import { useDeskMarketData } from '../src/hooks/useDeskMarketData.js'
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers()})
const response=data=>({ok:true,headers:new Headers(),json:async()=>data})
it('discards late QQQ context after selecting AMD',async()=>{
 let finishQQQ
 vi.stubGlobal('fetch',vi.fn(async url=>{
   const q=new URL(url,'http://localhost').searchParams
   if(q.get('action')==='watchlist')return response({stocks:{data:[]}})
   if(q.get('symbol')==='QQQ')return new Promise(resolve=>{finishQQQ=()=>resolve(response({symbol:'QQQ',period:'current',bars:{data:[{c:999}]}}))})
   return response({symbol:'AMD',period:'current',bars:{data:[{c:508}]}})
 }))
 const hook=renderHook(({symbol})=>useDeskMarketData(symbol,'current'),{initialProps:{symbol:'QQQ'}})
 await act(async()=>{})
 hook.rerender({symbol:'AMD'})
 await act(async()=>{})
 expect(hook.result.current.context.data.symbol).toBe('AMD')
 await act(async()=>{finishQQQ()})
 expect(hook.result.current.context.data.symbol).toBe('AMD')
 expect(hook.result.current.context.data.bars.data[0].c).toBe(508)
})
it('clears previous price data when a refresh fails',async()=>{
 vi.useFakeTimers();let snapshots=0
 vi.stubGlobal('fetch',vi.fn(async url=>{
   const q=new URL(url,'http://localhost').searchParams
   if(q.get('action')==='context')return response({symbol:'QQQ'})
   if(++snapshots===1)return response({stocks:{data:[{symbol:'QQQ',trade:{price:100}}]}})
   throw new Error('provider connection failed')
 }))
 const hook=renderHook(()=>useDeskMarketData('QQQ','current'))
 await act(async()=>{})
 expect(hook.result.current.feed.data.stocks.data[0].trade.price).toBe(100)
 await act(async()=>vi.advanceTimersByTimeAsync(30001))
 expect(hook.result.current.feed.data).toBeNull()
 expect(hook.result.current.feed.error).toBe('provider connection failed')
})
