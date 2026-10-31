import { it, expect, vi, beforeEach, afterEach } from 'vitest'
let module, clients
const stamp = '1792767600123456789'
const snapshot = symbol => ({ ticker: { ticker: symbol, lastTrade: { p: 10, t: stamp, s: 0 }, lastQuote: { p: 9, P: 11, t: stamp, s: 0, S: 4 } } })
const reply = (body, status=200, headers={}) => ({ ok: status===200, status, headers: new Headers(headers), json: async()=>body })
beforeEach(async()=>{vi.useFakeTimers();vi.resetModules();clients=[];vi.stubGlobal('WebSocket',vi.fn());vi.stubGlobal('fetch',vi.fn(async url=>reply(snapshot(new URL(url,'http://local').searchParams.get('path').split('/').pop()))));module=await import('./massive.js')})
afterEach(()=>{for(const client of clients)client.disconnect();vi.useRealTimers();vi.unstubAllGlobals()})
const client = handlers => { const value=new module.MassiveStreamClient(handlers);clients.push(value);return value }
const tick = ms => vi.advanceTimersByTimeAsync(ms)
it('shares one distinct-ticker poll and filters trade/quote/status events without browser credentials',async()=>{
 const a={onTrade:vi.fn(),onQuote:vi.fn(),onStatus:vi.fn()},b={onTrade:vi.fn()}
 const ca=client(a),cb=client(b);ca.connect();cb.connect();ca.subscribe('QQQ');cb.subscribe('QQQ');cb.subscribe('NVDA');await tick(1)
 expect(fetch).toHaveBeenCalledTimes(2);expect(a.onTrade).toHaveBeenCalledTimes(1);expect(b.onTrade).toHaveBeenCalledTimes(2)
 expect(a.onTrade.mock.calls[0][0]).toMatchObject({ticker:'QQQ',timestamp:1792767600123,size:0,transport:'REST_POLL'})
 expect(a.onQuote.mock.calls[0][0]).toMatchObject({bid:9,ask:11,bidSize:0})
 expect(WebSocket).not.toHaveBeenCalled();for(const [url] of fetch.mock.calls){expect(url.startsWith('/api/polygon/proxy?')).toBe(true);expect(url).not.toMatch(/ws-auth|apiKey/)}
})
it('retains a ticker until its final subscriber leaves, and stops after final disconnect',async()=>{
 const a=client({}),b=client({});a.connect();b.connect();a.subscribe('QQQ');b.subscribe('QQQ');await tick(1);a.disconnect();await tick(10000);expect(fetch).toHaveBeenCalledTimes(2);b.disconnect();await tick(60000);expect(fetch).toHaveBeenCalledTimes(2)
})
it('readiness allows hooks to subscribe and late clients join without starting another worker',async()=>{
 let a;const first=vi.fn(()=>a.subscribe('QQQ'));a=client({onConnected:first});a.connect();await tick(1);const ready=vi.fn();client({onConnected:ready}).connect();await tick(1);expect(first).toHaveBeenCalledTimes(1);expect(ready).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1)
})
it('ignores delayed bodies after unsubscribe and resubscribe of the same ticker',async()=>{
 let resolve;fetch.mockResolvedValueOnce({...reply({}),json:()=>new Promise(r=>resolve=r)})
 const events={onTrade:vi.fn()};const a=client(events);a.connect();a.subscribe('QQQ');await tick(1);a.unsubscribe('QQQ');a.subscribe('QQQ');resolve(snapshot('QQQ'));await tick(1);expect(events.onTrade).not.toHaveBeenCalled();await tick(10000);expect(events.onTrade).toHaveBeenCalledTimes(1)
})
it('clears missing/invalid fields and rejects a different ticker instead of reusing prior data',async()=>{
 fetch.mockResolvedValueOnce(reply({ticker:{ticker:'QQQ',lastTrade:{p:10,t:stamp},lastQuote:{p:12,P:11,t:stamp}}})).mockResolvedValueOnce(reply(snapshot('SPY')))
 const handlers={onStatus:vi.fn(),onTrade:vi.fn(),onQuote:vi.fn()};const a=client(handlers);a.connect();a.subscribe('QQQ');await tick(1);expect(handlers.onStatus.mock.calls.at(-1)[0]).toMatchObject({trade_available:true,quote_available:false,reason:'PARTIAL'});expect(handlers.onQuote).not.toHaveBeenCalled();await tick(10000);expect(handlers.onStatus.mock.calls.at(-1)[0]).toMatchObject({trade_available:false,quote_available:false,reason:'INVALID_DATA'});expect(handlers.onTrade).toHaveBeenCalledTimes(1)
})
it('uses one last-trade-only fallback for provider snapshot denial, preserving original source time',async()=>{
 fetch.mockResolvedValueOnce(reply({},403)).mockResolvedValueOnce(reply({results:{T:'QQQ',p:10,t:stamp}}))
 const handlers={onStatus:vi.fn(),onTrade:vi.fn(),onQuote:vi.fn()};const a=client(handlers);a.connect();a.subscribe('QQQ');await tick(1);expect(fetch).toHaveBeenCalledTimes(2);expect(handlers.onTrade).toHaveBeenCalledTimes(1);expect(handlers.onQuote).not.toHaveBeenCalled();expect(handlers.onStatus.mock.calls.at(-1)[0]).toMatchObject({quote_available:false,reason:'PARTIAL'})
})
it('honors shared Retry-After and never overlaps an outstanding response body',async()=>{
 fetch.mockResolvedValueOnce(reply({},429,{'Retry-After':'60'}));const a=client({});a.connect();a.subscribe('QQQ');await tick(1);await tick(59000);expect(fetch).toHaveBeenCalledTimes(1);await tick(1000);expect(fetch).toHaveBeenCalledTimes(2)
})
it('bounds body consumption and stops on an invalid or excessive Retry-After hint',async()=>{
 fetch.mockResolvedValueOnce({...reply({}),json:()=>new Promise(()=>{})});const handlers={onStatus:vi.fn()};const a=client(handlers);a.connect();a.subscribe('QQQ');await tick(14999);expect(fetch).toHaveBeenCalledTimes(1);await tick(2);expect(handlers.onStatus.mock.calls.at(-1)[0]).toMatchObject({trade_available:false,quote_available:false,reason:'UPSTREAM_UNAVAILABLE'});fetch.mockResolvedValue(reply({},429,{'Retry-After':'86401'}));await tick(10000);const count=fetch.mock.calls.length;await tick(100000);expect(fetch).toHaveBeenCalledTimes(count)
})
it('disconnect invalidates late response bodies and never schedules more work',async()=>{
 let resolve;fetch.mockResolvedValueOnce({...reply({}),json:()=>new Promise(r=>resolve=r)});const handlers={onTrade:vi.fn()};const a=client(handlers);a.connect();a.subscribe('QQQ');await tick(1);a.disconnect();resolve(snapshot('QQQ'));await tick(60000);expect(handlers.onTrade).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(1)
})
it('unsubscribe immediately releases a hung body so other tickers can progress',async()=>{
 fetch.mockResolvedValueOnce({...reply({}),json:()=>new Promise(()=>{})})
 const events={onTrade:vi.fn()};const a=client(events);a.connect();a.subscribe('QQQ');a.subscribe('SPY');await tick(1);a.unsubscribe('QQQ');await tick(1);expect(fetch).toHaveBeenCalledTimes(2);expect(events.onTrade.mock.calls[0][0].ticker).toBe('SPY')
})
it('does not spend quota retrying a snapshot family already denied in the session',async()=>{
 fetch.mockImplementation(async url=>new URL(url,'http://local').searchParams.get('path').includes('/snapshot/') ? reply({},403) : reply({results:{T:'QQQ',p:10,t:stamp}}))
 const a=client({});a.connect();a.subscribe('QQQ');await tick(1);await tick(10000);expect(fetch.mock.calls.filter(([url])=>url.includes('snapshot'))).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(3)
})

it('rejects a last-trade fallback whose authoritative results.T is the wrong instrument',async()=>{
 fetch.mockResolvedValueOnce(reply({},403)).mockResolvedValueOnce(reply({symbol:'QQQ',results:{T:'SPY',p:10,t:stamp}}));const handlers={onTrade:vi.fn(),onStatus:vi.fn()};const a=client(handlers);a.connect();a.subscribe('QQQ');await tick(1);expect(handlers.onTrade).not.toHaveBeenCalled();expect(handlers.onStatus.mock.calls.at(-1)[0].reason).toBe('INVALID_DATA')
})
