import {it,expect,vi,afterEach} from 'vitest'
import {polygonFetch,validateProviderRequest} from '../api/_lib/polygon.js'
import * as budget from '../api/_lib/marketDataBudget.js'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs()})
function configured(){vi.stubEnv('POLYGON_API_KEY','synthetic-options-v2');vi.spyOn(budget,'admit').mockResolvedValue({granted:true,lease_id:'synthetic'});vi.spyOn(budget,'release').mockResolvedValue(true)}
it.each(['','<html>limited</html>','{broken'])('records429 before parsing unusable body %s',async body=>{
 configured();const cd=vi.spyOn(budget,'accountCooldown').mockResolvedValueOnce({available:true,retryAfter:0}).mockResolvedValueOnce({available:true,retryAfter:120});vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{status:429,headers:{'Retry-After':'120'}})))
 const r=await polygonFetch('/v3/snapshot/options/QQQ',{research:'v1'});expect(r.status).toBe(429);expect(r.retryAfter).toBe('120');expect(cd.mock.calls[1][1]).toBe(120);expect(budget.admit).toHaveBeenCalledWith(undefined,expect.any(String),'new',10000)
})
it('long provider wait establishes persistent manual-review hold, never60second fallback',async()=>{
 configured();const cd=vi.spyOn(budget,'accountCooldown').mockResolvedValueOnce({available:true,retryAfter:0}).mockResolvedValueOnce({available:true,retryAfter:86401});vi.stubGlobal('fetch',vi.fn(async()=>new Response('limited',{status:429,headers:{'Retry-After':'100000'}})))
 const r=await polygonFetch('/v3/snapshot/options/QQQ',{research:'v1'});expect(cd.mock.calls[1][1]).toBe(86401);expect(r.body).toContain('manual_review');expect(r.retryAfter).toBe('86400')
})
it('other session cooldown stops before admission/provider request',async()=>{
 configured();vi.spyOn(budget,'accountCooldown').mockResolvedValue({available:true,retryAfter:90});vi.stubGlobal('fetch',vi.fn());const r=await polygonFetch('/v3/snapshot/options/SPY',{research:'v1'});expect(r.status).toBe(429);expect(r.retryAfter).toBe('90');expect(fetch).not.toHaveBeenCalled();expect(budget.admit).not.toHaveBeenCalled()
})
it('exact flow paths require research marker and bounded dated query',()=>{
 const p='/v3/trades/O:QQQ261120C00100000';expect(()=>validateProviderRequest(p,{timestamp:'2026-11-02',limit:'10'})).toThrow()
 expect(validateProviderRequest(p,{research:'v1',timestamp:'2026-11-02',limit:'1000',sort:'timestamp'}).pathname).toBe(p)
 for(const params of [{research:'v1',timestamp:'bad'},{research:'v1',timestamp:'2026-11-02',limit:'1001'},{research:'v1',timestamp:'2026-11-02',cursor:'unsafe'}])expect(()=>validateProviderRequest(p,params)).toThrow()
})
it('oversized decoded body fails sanitized and releases lease',async()=>{
 configured();vi.spyOn(budget,'accountCooldown').mockResolvedValue({available:true,retryAfter:0});vi.stubGlobal('fetch',vi.fn(async()=>new Response('x'.repeat(4*1024*1024+1))));await expect(polygonFetch('/v3/snapshot/options/QQQ',{research:'v1'})).rejects.toMatchObject({status:502});expect(budget.release).toHaveBeenCalledTimes(1)
})
it('a hanging budget service stops acquisition before provider request',async()=>{
 vi.useFakeTimers();configured();vi.spyOn(budget,'accountCooldown').mockImplementation(()=>new Promise(()=>{}));vi.stubGlobal('fetch',vi.fn())
 try{const request=polygonFetch('/v3/snapshot/options/QQQ',{research:'v1'});const assertion=expect(request).rejects.toMatchObject({status:503,code:'market_data_budget_timeout'});await vi.advanceTimersByTimeAsync(3001);await assertion;expect(fetch).not.toHaveBeenCalled()}finally{vi.useRealTimers()}
})
