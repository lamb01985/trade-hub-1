import {it,expect,vi,afterEach} from 'vitest'
import {validateProviderRequest,polygonFetch} from '../api/_lib/polygon.js'
import * as budget from '../api/_lib/marketDataBudget.js'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs()})
it('research-tagged options fail closed before provider fetch when shared budget is missing',async()=>{
 vi.stubEnv('POLYGON_API_KEY','synthetic-test-key');vi.stubEnv('MASSIVE_BUDGET_ENFORCED','false');vi.stubEnv('MARKET_DATA_UNIFIED_ENABLED','false');vi.spyOn(budget,'admit').mockResolvedValue({granted:false,reason:'BUDGET_UNAVAILABLE'});const f=vi.fn();vi.stubGlobal('fetch',f)
 await expect(polygonFetch('/v3/snapshot/options/QQQ',{research:'v1',limit:'250'})).rejects.toMatchObject({status:503});expect(f).not.toHaveBeenCalled()
})
it('research cursor is validated, internal marker stripped, one provider attempt on429',async()=>{
 const path='/v3/snapshot/options/QQQ';for(const params of [{cursor:'abc='},{cursor:'x&apiKey=evil'},{research:'false'},{cursor:'a'.repeat(2049)}])expect(()=>validateProviderRequest(path,params)).toThrow()
 vi.stubEnv('POLYGON_API_KEY','synthetic-test-key');vi.spyOn(budget,'accountCooldown').mockResolvedValue({available:true,retryAfter:0});vi.spyOn(budget,'admit').mockResolvedValue({granted:true,lease_id:'synthetic'});vi.spyOn(budget,'release').mockResolvedValue(true);const f=vi.fn(async()=>new Response('{}',{status:429}));vi.stubGlobal('fetch',f)
 expect((await polygonFetch(path,{cursor:'abc=',research:'v1'})).status).toBe(429);expect(f).toHaveBeenCalledTimes(1);expect(new URL(f.mock.calls[0][0]).searchParams.has('research')).toBe(false);expect(budget.release).toHaveBeenCalledTimes(1)
})
