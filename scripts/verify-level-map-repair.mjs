// Real provider workflow acceptance, followed by isolated synthetic Monday refresh/error cases.
import {chromium} from 'playwright'
import {writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {loadEnv} from 'vite'
import assert from 'node:assert/strict'
const origin='http://127.0.0.1:4210'
const envDir=process.env.TRADEHUB_SERVER_ENV_DIR||'/Users/sarahlambertson/Desktop/tradehub-monday-readiness'
const env=loadEnv('development',envDir,'')
const secret=process.env.POLYGON_API_KEY||process.env.MASSIVE_API_KEY||env.POLYGON_API_KEY||env.MASSIVE_API_KEY
assert.ok(secret,'Existing approved server configuration required')
const envHash=()=>createHash('sha256').update(readFileSync(`${envDir}/.env.local`)).digest('hex')
const beforeEnv=envHash()
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}})
const errors=[],requests=[],bodyChecks=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{assert.ok(!r.url().includes(secret));if(r.url().includes('/api/'))requests.push(r.url())})
page.on('response',r=>bodyChecks.push((async()=>{try{assert.ok(!(await r.text()).includes(secret),'Credential in browser response')}catch(e){if(e.code==='ERR_ASSERTION')throw e}})()))
async function provider(path){const r=await fetch('https://api.massive.com'+path,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);return r.json()}
const report={checkedAt:new Date().toISOString(),symbols:[],workflow:[],simulations:[]}
try{
 const first=page.waitForResponse(r=>r.url().includes('action=context')&&r.url().includes('period=plan')&&r.ok())
 await page.goto(origin+'/')
 await first
 const tools=page.getByRole('navigation',{name:'Workflow tools'})
 await tools.getByRole('button',{name:'Levels',exact:true}).click()
 const map=page.getByTestId('verified-level-map')
 await map.getByText('2026-10-30',{exact:true}).waitFor()
 assert.ok((await map.innerText()).includes('Trading plan: 2026-11-02'))
 assert.ok(!(await map.innerText()).includes('Archived session watchlist'))
 const count=requests.filter(u=>u.includes('action=watchlist')).length
 await page.getByRole('button',{name:'Open QQQ live map',exact:true}).click()
 await page.getByRole('heading',{name:'QQQ Live Level Map',exact:true}).waitFor()
 assert.match(page.url(),/workspace=trade/);assert.match(page.url(),/symbol=QQQ/);assert.match(page.url(),/#live-level-map/)
 assert.equal(await page.locator('#live-level-map').evaluate(e=>e===document.activeElement),true)
 assert.equal(requests.filter(u=>u.includes('action=watchlist')).length,count,'Opening selected map must not start another feed')
 report.workflow.push('Plan → Levels → Open QQQ live map changes destination and focuses it')
 for(const symbol of ['QQQ','SPY','NVDA']){
   if(symbol!=='QQQ')await page.getByRole('button',{name:new RegExp(`#\\d+ ${symbol}$`)}).click()
   await page.getByRole('heading',{name:`${symbol} Live Level Map`,exact:true}).waitFor()
   assert.match(page.url(),new RegExp(`symbol=${symbol}`))
   const context=await(await page.request.get(`${origin}/api/desk?action=context&symbol=${symbol}&period=plan`)).json()
   assert.equal(context.date,'2026-11-02');assert.equal(context.priorDate,'2026-10-30');assert.equal(context.previous.error,null)
   const raw=await provider(`/v2/aggs/ticker/${symbol}/range/1/day/2026-10-30/2026-10-30?adjusted=true&sort=asc&limit=50`)
   const minute=await provider(`/v2/aggs/ticker/${symbol}/range/1/minute/2026-10-30/2026-10-30?adjusted=true&sort=asc&limit=50000`)
   const pd=context.previous.data[0],source=raw.results[0]
   for(const k of ['t','h','l','c'])assert.equal(pd[k],source[k])
   assert.deepEqual(context.completed.data.map(b=>[b.t,b.h,b.l,b.c,b.v]),minute.results.map(b=>[b.t,b.h,b.l,b.c,b.v]))
   await page.waitForFunction(close=>[...document.querySelectorAll('.verified-level-stats strong')].some(e=>e.textContent===`$${close.toFixed(4)}`),pd.c)
   const text=await map.innerText();assert.ok(text.includes(`$${pd.h.toFixed(4)}`));assert.ok(text.includes(`$${pd.l.toFixed(4)}`))
   assert.ok(text.includes('Long boundary:'));assert.ok(text.includes('Short boundary:'));assert.ok(text.includes('Entry confirmation:'));assert.ok(text.includes('Invalidation:'));assert.ok(text.includes('Reference target:'));assert.ok(/alerts interface/i.test(text))
   assert.equal(context.indicators.vwap,null);assert.equal(context.bars.data.length,0)
   assert.equal(await map.getByText('Enable Alerts + Sound',{exact:true}).isVisible(),true)
   report.symbols.push({symbol,planDate:context.date,previousDate:context.priorDate,high:pd.h,low:pd.l,close:pd.c,priorIndicators:context.completedIndicators,currentBars:context.bars.data.length})
   await page.screenshot({path:`.local/repaired-${symbol}-map.png`,fullPage:true,animations:'disabled'})
 }
 await page.reload();await page.getByRole('heading',{name:'NVDA Live Level Map',exact:true}).waitFor()
 await page.goBack();await page.getByRole('heading',{name:'SPY Live Level Map',exact:true}).waitFor()
 report.workflow.push('Symbol URL, reload and Back stay synchronized')
 // Source changes never relabel manually saved SPY fields under QQQ.
 await page.evaluate(()=>localStorage.setItem('th-prep',JSON.stringify({ticker:'SPY',orbHigh:'9999',orbLow:'9998',sessionClose:'9997',keyLevel:'9996',plannedContract:{underlying:'SPY'},gamePlan:'SPY manual plan'})))
 await page.goto(origin+'/?workspace=plan&view=prep&symbol=QQQ')
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Primary Ticker"]')?.value==='QQQ')
 assert.equal(await page.getByLabel('Prior Day High',{exact:true}).inputValue(),'')
 assert.equal(await page.getByLabel('Prior Day Low',{exact:true}).inputValue(),'')
 const beforeLoad=requests.filter(u=>u.includes('/api/polygon/')).length
 // Wait for canonical context rather than reading a saved manual field.
 await page.getByText(/previous regular session 2026-10-30/).waitFor()
 await page.getByRole('button',{name:'Load Market Data',exact:false}).click()
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Prior Day High"]')?.value==='698.63')
 assert.equal(await page.getByLabel('Prior Day Low',{exact:true}).inputValue(),'683.45')
 assert.equal(await page.getByLabel('Session Open',{exact:true}).inputValue(),'')
 assert.equal(requests.filter(u=>u.includes('/api/polygon/')).length,beforeLoad,'Prep must use the canonical context, not another provider request')
 assert.ok((await page.locator('.eq-content-body').innerText()).includes('Monday, November 2'))
 await page.getByRole('navigation',{name:'Plan Trade Review'}).getByRole('button',{name:'Trade',exact:true}).click()
 await page.getByRole('heading',{name:'QQQ Live Level Map',exact:true}).waitFor()
 assert.ok(!(await map.innerText()).includes('9999'))
 report.workflow.push('Tomorrow’s Prep loads Friday levels without a second adapter or stale symbol fields')
 await page.getByRole('navigation',{name:'Plan Trade Review'}).getByRole('button',{name:'Review',exact:true}).click()
 await page.getByRole('heading',{name:'Archived reports · historical only',exact:true}).waitFor()
 await page.getByText('Archived session watchlist: 2026-10-30',{exact:true}).waitFor()
 assert.equal(await page.getByTestId('verified-level-map').count(),0)
 await page.getByRole('button',{name:'Open QQQ live map',exact:true}).click()
 await page.getByRole('heading',{name:'QQQ Live Level Map',exact:true}).waitFor()
 assert.ok(!(await map.innerText()).includes('Archived session watchlist'))
 report.workflow.push('Archived reports stay in Review and hand off to the current map')
 // Isolated, explicitly simulated Monday premarket refresh; not a claim of Sunday live data.
 const simulated=await browser.newPage()
 const monday=Date.parse('2026-11-02T10:01:00Z');await simulated.clock.install({time:monday})
 let contextCalls=0,watchCalls=0
 await simulated.route('**/api/desk?*',route=>{
   const q=new URL(route.request().url()).searchParams
   if(q.get('action')==='watchlist'){watchCalls++;return route.fulfill({json:{stocks:{data:[{symbol:'QQQ',trade:{price:100,timestamp:monday,kind:'TRADE',timeframe:'REAL-TIME'},quote:null}]}}})}
   contextCalls++
   const high=contextCalls===1?101:102
   return route.fulfill({json:{symbol:'QQQ',period:'plan',date:'2026-11-02',priorDate:'2026-10-30',bars:{data:[],error:null},previous:{data:[{h:110,l:90,c:100}],error:null},completed:{data:[],error:null},indicators:{vwap:null,ema9:null,ema20:null,ema50:null,sessions:{PREMARKET:{high,low:99,last:100,timestamp:monday-60000},AFTER_HOURS:null}},completedIndicators:null}})
 })
 await simulated.goto(origin+'/?workspace=plan&view=levels&symbol=QQQ')
 await simulated.getByText('$101.0000',{exact:true}).waitFor()
 await simulated.clock.runFor(60001)
 await simulated.getByText('$102.0000',{exact:true}).waitFor()
 assert.equal(contextCalls,2);assert.ok(watchCalls<=3)
 await simulated.unroute('**/api/desk?*')
 await simulated.route('**/api/desk?*',route=>route.fulfill({status:502,json:{error:'PROVIDER_UNAVAILABLE_TEST'}}))
 await simulated.clock.runFor(60001)
 await simulated.getByText(/PROVIDER_UNAVAILABLE_TEST/).waitFor()
 assert.equal(await simulated.getByText('$102.0000',{exact:true}).count(),0)
 await simulated.close()
 report.simulations.push('Monday premarket high updates without reload; one selected-context poll per minute','Provider failure clears prior/current map values explicitly')
 assert.ok(requests.every(u=>u.includes('/api/desk?')||u.endsWith('/api/intelligence/session')),'Unexpected legacy/broker/AI polling')
 const anon=await browser.newContext();assert.equal((await anon.request.get(origin+'/api/desk?action=watchlist')).status(),401);await anon.close()
 for(const path of ['/api/schwab/orders','/api/ai/brief','/api/notify-email'])assert.equal((await page.request.get(origin+path)).status(),403)
 assert.ok((await page.context().cookies()).some(c=>c.name==='th_level_repair_operator'))
 assert.ok(!(await page.context().cookies()).some(c=>c.name==='th_desk_operator'))
 await Promise.all(bodyChecks);assert.deepEqual(errors,[]);assert.equal(envHash(),beforeEnv)
 report.apiRequests=requests;report.errors=errors;report.configurationUnchanged=true;report.authenticationIsolated=true
 writeFileSync('.local/level-map-repair-acceptance.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify({checkedAt:report.checkedAt,symbols:report.symbols.map(s=>({symbol:s.symbol,date:s.previousDate,high:s.high,low:s.low,close:s.close})),workflow:report.workflow,simulations:report.simulations,errors},null,2))
}finally{await browser.close()}
