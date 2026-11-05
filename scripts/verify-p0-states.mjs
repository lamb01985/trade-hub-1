// Synthetic acceptance only. No provider calls; never evidence of live entitlement.
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage()
const base=Date.parse('2026-11-04T15:30:00Z'),counts={watchlist:0,context:0}
let mode='normal'
await page.clock.install({time:new Date(base)})
await page.addInitScript(()=>localStorage.setItem('th-settings',JSON.stringify({alertsEnabled:true})))
await page.route('**/api/desk?*',async route=>{
  const q=new URL(route.request().url()).searchParams,action=q.get('action'),symbol=q.get('symbol')||'QQQ'
  if(action==='session')return route.fulfill({json:{authenticated:true}})
  counts[action]=(counts[action]||0)+1
  if(mode==='cooldown')return route.fulfill({status:429,headers:{'Retry-After':'120'},json:{error:'SYNTHETIC_RATE_LIMIT'}})
  if(action==='watchlist')return route.fulfill({json:{fetchedAt:new Date(base).toISOString(),stocks:{data:['QQQ','SPY','NVDA','AMD'].map(symbol=>({symbol,trade:{symbol,kind:'TRADE',session:'REGULAR',price:105,timestamp:base-1000,timeframe:'UNVERIFIED'},quote:null})),error:null}}})
  return route.fulfill({json:{symbol,period:'current',date:mode==='wrongdate'?'2026-11-03':'2026-11-04',priorDate:'2026-11-03',fetchedAt:new Date(base).toISOString(),previous:{data:[{h:110,l:90,c:100}]},bars:{data:[{symbol,timestamp:base-60000,t:base-60000,session:'REGULAR',timeframe:'UNVERIFIED',c:104}]},indicators:{ema9:104,vwap:103,lastTimestamp:base-60000,sessions:{REGULAR:{high:108,low:95,timestamp:base-60000}}}}})
})
try{
 await page.goto('http://127.0.0.1:4218/',{waitUntil:'domcontentloaded'})
 await page.getByText('Long · $108.0000',{exact:true}).waitFor()
 assert.ok((await page.locator('#current-level-map').innerText()).includes('Next reference target: Prev Day High $110.0000'))
 assert.ok((await page.locator('#current-level-map').innerText()).includes('Unverified feed delay never qualifies'))
 const initial={...counts}
 await page.clock.fastForward(61000)
 await page.waitForFunction(()=>document.querySelector('#current-level-map')?.textContent.includes('Long · Paused'))
 assert.ok(counts.watchlist>initial.watchlist);assert.ok(counts.context>initial.context)
 mode='wrongdate'
 await page.getByRole('button',{name:'Refresh current observations',exact:true}).click()
 await page.getByText('No validated map supplied.',{exact:true}).waitFor()
 assert.ok(!(await page.locator('#current-level-map').innerText()).includes('Current session high'))
 mode='cooldown'
 await page.getByRole('button',{name:'Refresh current observations',exact:true}).click()
 await page.getByText(/Provider cooldown until/).waitFor()
 const limited={...counts}
 await page.clock.fastForward(60000)
 assert.deepEqual(counts,limited)
 assert.equal(await page.getByRole('button',{name:'Refresh current observations',exact:true}).isDisabled(),true)
 await page.clock.fastForward(61000)
 await page.waitForTimeout(100)
 assert.ok(counts.watchlist>limited.watchlist)
 const result={syntheticOnly:true,checks:['Recent matching-session bars enable conditional boundaries and distinct targets','Unverified feed cannot arm alerts','Automatic observation and context refresh executes','Aging source timestamps pauses scenarios even after successful refresh','Wrong-date context clears calculations instead of relabeling them','429 cooldown prevents automatic and manual early retry'],counts}
 writeFileSync('.local/incident/synthetic-state-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{await browser.close()}
