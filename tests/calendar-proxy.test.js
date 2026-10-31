import { it,expect,vi,afterEach } from 'vitest'
import handler from '../api/calendar-earnings.js'
import { fetchNasdaqEarnings } from '../src/lib/calendar.js'
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
const response=()=>({code:200,headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this}})
it('public earnings proxy needs no credential and forwards real-shaped results',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{rows:[{symbol:'AAPL'}]}})});vi.stubGlobal('fetch',fetch)
 const res=response();await handler({method:'GET',query:{date:'2026-10-26'}},res)
 expect(res.code).toBe(200);expect(res.body.data.rows[0].symbol).toBe('AAPL');expect(fetch.mock.calls[0][0]).not.toMatch(/apiKey|token|secret/)
})
it('rejects invalid methods/dates and preserves upstream failure as unavailable, not empty',async()=>{
 let res=response();await handler({method:'POST',query:{}},res);expect(res.code).toBe(405)
 res=response();await handler({method:'GET',query:{date:'2026-02-30'}},res);expect(res.code).toBe(400)
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403}));res=response();await handler({method:'GET',query:{date:'2026-10-26'}},res);expect(res.code).toBe(502);expect(res.body.upstreamStatus).toBe(403)
})
it('does not interpret a Vite SPA fallback or malformed provider payload as empty earnings',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({unexpected:true})}));expect((await fetchNasdaqEarnings('2026-10-26')).error).toContain('Invalid earnings response')
 const res=response();await handler({method:'GET',query:{date:'2026-10-26'}},res);expect(res.code).toBe(502)
})
it('the public proxy has a bounded timeout',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn((url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))))))
 const res=response();const pending=handler({method:'GET',query:{date:'2026-10-26'}},res);await vi.advanceTimersByTimeAsync(8000);await pending
 expect(res.code).toBe(502);expect(res.body.error).toBe('nasdaq_timeout')
})
