import {afterEach,it,expect,vi} from 'vitest'
import {getOptionChain} from './massive.js'
afterEach(()=>vi.unstubAllGlobals())
it('does not automatically retry a manual options snapshot during provider cooldown',async()=>{
 vi.stubGlobal('window',{location:{origin:'http://tradehub.test'}})
 const request=vi.fn(async()=>({ok:false,status:429,headers:new Headers({'Retry-After':'120'}),text:async()=> 'RATE_LIMITED'}))
 vi.stubGlobal('fetch',request)
 await expect(getOptionChain('QQQ')).rejects.toMatchObject({status:429,retryAfter:120})
 expect(request).toHaveBeenCalledTimes(1)
 expect(request.mock.calls[0][1]).not.toHaveProperty('noRateRetry')
})
