import {it,expect,vi,afterEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {previewPreflight} from '../scripts/preview-preflight.mjs'
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('fails closed without real protected-preview configuration and never exposes values',()=>{
 const result=previewPreflight({MARKET_DATA_SERVICE_TOKEN:'synthetic-secret',VITE_PROVIDER_KEY:'synthetic-leak'})
 expect(previewPreflight({KV_REST_API_URL:'https://same.example/',MASSIVE_BUDGET_REDIS_REST_URL:'https://same.example',MASSIVE_BUDGET_REDIS_REST_TOKEN:'synthetic'}).checks.explicit_shared_budget_store).toBe(false)
 expect(result.ready_for_approved_preview).toBe(false);expect(result.checks.no_browser_secret_variables).toBe(false);expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|synthetic-leak/)
})
it('requires independent admission even after Unified rollback',async()=>{
 vi.stubEnv('MARKET_DATA_UNIFIED_ENABLED','false');vi.stubEnv('MASSIVE_BUDGET_ENFORCED','true');vi.stubEnv('POLYGON_API_KEY','synthetic-key')
 const budget=await import('../api/_lib/marketDataBudget.js');vi.spyOn(budget,'admit').mockResolvedValue({granted:false,reason:'BUDGET_UNAVAILABLE'});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 const {polygonFetch}=await import('../api/_lib/polygon.js');await expect(polygonFetch('/v2/last/trade/QQQ')).rejects.toMatchObject({status:503});expect(fetcher).not.toHaveBeenCalled()
})
it('preview route inventory blocks unknown APIs and source paths while retaining authenticated polling/tombstone',()=>{
 const config=JSON.parse(readFileSync(new URL('../config/vercel.preview.json',import.meta.url)))
 const destination=path=>config.routes.find(r=>r.src && new RegExp(`^${r.src}$`).test(path))?.dest
 expect(destination('/api/polygon/proxy')).toBe('/api/polygon/$1');expect(destination('/api/polygon/ws-auth')).toBe('/api/polygon/$1')
 for(const path of ['/api/polygon/ws-auth.js','/api/_lib/polygon.js','/api/ai/analyze','/api/schwab/orders','/api/intelligence/latest','/api/unknown'])expect(destination(path)).toBe('/api/preview-denied')
 expect(destination('/api/market/snapshot')).toContain('/api/market/[resource]')
 expect(config.functions['api/**/*.js'].includeFiles).toContain('marketDataAdmission.lua')
})
