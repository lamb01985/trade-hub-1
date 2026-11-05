import {chromium} from 'playwright'
import {loadEnv} from 'vite'
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {eastern,sessionAt,stockEvidence,currentLevelStructure,levelMapSessionDate} from '../src/lib/marketEvidence.js'
const out='.local/incident';mkdirSync(out,{recursive:true})
const envDir=new URL('../../tradehub-monday-readiness/',import.meta.url).pathname
const env=loadEnv('development',envDir,''),key=env.POLYGON_API_KEY||env.MASSIVE_API_KEY
assert.ok(key)
const hash=()=>createHash('sha256').update(readFileSync(envDir+'.env.local')).digest('hex')
const beforeEnv=hash(),origin='http://127.0.0.1:4218'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}})
const errors=[],requests=[],bodyChecks=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{assert.ok(!r.url().includes(key));const u=new URL(r.url());if(u.pathname.startsWith('/api/'))requests.push({path:u.pathname,action:u.searchParams.get('action')})})
page.on('response',r=>bodyChecks.push((async()=>{try {const text=await r.text();assert.ok(!text.includes(key),'Provider key leaked in response')}catch(e){if(e.code==='ERR_ASSERTION')throw e}})()))
const report={checkedAt:new Date().toISOString(),session:sessionAt(),symbols:[],checks:[],errors}
const provider=async path=>{const r=await fetch('https://api.massive.com'+path,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json()}
const desk=async params=>{const r=await page.request.get(origin+'/api/desk?'+new URLSearchParams(params));assert.equal(r.status(),200);return r.json()}
try{
 await page.goto(origin,{waitUntil:'domcontentloaded'})
 await page.getByText('QQQ · Current Level Map',{exact:true}).waitFor()
 const date=levelMapSessionDate()
 for(const symbol of ['QQQ','SPY','NVDA','AMD']){
  if(symbol!=='QQQ')await page.getByLabel('Level Map symbol').selectOption(symbol)
  await page.waitForResponse(r=>r.url().includes('action=context')&&r.url().includes('symbol='+symbol))
  const c=await desk({action:'context',symbol,period:'current'}),feed=await desk({action:'watchlist'})
  assert.equal(c.date,date);assert.equal(c.period,'current');assert.equal(c.bars.error,null);assert.equal(c.previous.error,null)
  const row=feed.stocks.data.find(r=>r.symbol===symbol)
  const raw=await provider(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbol}`)
  const direct=stockEvidence(symbol,raw.tickers.find(r=>r.ticker===symbol))
  assert.deepEqual(row.trade,direct.trade);assert.deepEqual(row.quote,direct.quote)
  const prior=await provider(`/v2/aggs/ticker/${symbol}/range/1/day/${c.priorDate}/${c.priorDate}?adjusted=true&sort=asc&limit=50`)
  for(const field of ['t','h','l','c'])assert.equal(c.previous.data[0][field],prior.results[0][field])
  if(c.sessionDaily){const dailyRaw=await provider(`/v2/aggs/ticker/${symbol}/range/1/day/${date}/${date}?adjusted=true&sort=asc&limit=50`);assert.equal(c.sessionDaily.error,null);for(const field of ['t','h','l','c'])assert.equal(c.sessionDaily.data[0][field],dailyRaw.results[0][field])}
  const bars=await provider(`/v2/aggs/ticker/${symbol}/range/1/minute/${date}/${date}?adjusted=true&sort=asc&limit=50000`)
  const completedRaw=bars.results.filter(b=>b.t+60000<=Date.now())
  assert.deepEqual(c.bars.data.map(b=>[b.t,b.o,b.h,b.l,b.c,b.v,b.vw]),completedRaw.map(b=>[b.t,b.o,b.h,b.l,b.c,b.v,b.vw]))
  const regular=completedRaw.filter(b=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(b.t));const m=Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value);return m>=570&&m<(['2026-11-27','2026-12-24'].includes(date)?780:960)})
  const independentEMA=period=>{if(regular.length<period)return null;let v=regular.slice(0,period).reduce((sum,b)=>sum+b.c,0)/period;for(const b of regular.slice(period))v=b.c*(2/(period+1))+v*(1-2/(period+1));return v}
  const volume=regular.reduce((sum,b)=>sum+b.v,0)
  assert.ok(Math.abs(c.indicators.vwap-regular.reduce((sum,b)=>sum+b.vw*b.v,0)/volume)<1e-9)
  for(const period of [9,20,50])assert.ok(Math.abs(c.indicators['ema'+period]-independentEMA(period))<1e-9)
  assert.equal(c.indicators.sessions.REGULAR.high,Math.max(...regular.map(b=>b.h)))
  assert.equal(c.indicators.sessions.REGULAR.low,Math.min(...regular.map(b=>b.l)))
  const structure=currentLevelStructure(c,row.trade.price,Date.now())
  const below=structure.levelMap.levels.filter(l=>l.price<row.trade.price).map(l=>l.price).sort((a,b)=>b-a)
  const above=structure.levelMap.levels.filter(l=>l.price>row.trade.price).map(l=>l.price).sort((a,b)=>a-b)
  assert.deepEqual(structure.support.map(l=>l.price),below.slice(0,5));assert.deepEqual(structure.resistance.map(l=>l.price),above.slice(0,5))
  for(const zone of structure.zones)assert.ok(zone.high-zone.low<=prior.results[0].c*0.0005+1e-9)
  for(const [i,scenario] of structure.referenceScenarios.entries()){const refs=i===0?above:below;assert.equal(scenario.boundary,refs[0]??null);assert.equal(scenario.target?.price??null,refs.find(v=>i===0?v>refs[0]:v<refs[0])??null)}
  const map=page.locator('#current-level-map:visible')
  await page.waitForFunction(({price})=>document.querySelector('[data-testid="current-map-price"]')?.textContent===`$${price.toFixed(4)}`,{price:row.trade.price})
  const text=await map.innerText();assert.ok(!text.includes('715.34'));assert.ok(!text.includes('Historical session watchlist'))
  assert.ok(text.includes('Confirmation:'));assert.ok(text.includes('Invalidation:'));assert.ok(text.includes('Next reference target:'))
  await page.screenshot({path:`${out}/${symbol}-current-map.png`,fullPage:true,animations:'disabled'})
  await page.screenshot({path:`${out}/${symbol}-current-map-viewport.png`,animations:'disabled'})
  report.symbols.push({symbol,date,priorDate:c.priorDate,price:row.trade.price,tradeTimestamp:new Date(row.trade.timestamp).toISOString(),quoteTimestamp:row.quote.timestamp?new Date(row.quote.timestamp).toISOString():null,timeframe:row.trade.timeframe,previous:c.previous.data[0],latestCompletedDaily:c.sessionDaily?.data?.[0],indicators:c.indicators,lastBar:c.bars.data.at(-1),fetchedAt:feed.fetchedAt})
 }
 report.checks.push('QQQ/SPY/NVDA/AMD browser values, timestamps, prior daily bars, every current minute and derived indicators matched independent Massive responses')
 await page.getByRole('button',{name:'Open AMD live map',exact:true}).click()
 assert.match(page.url(),/workspace=trade&view=map&symbol=AMD/)
 await page.getByText('AMD · Current Level Map',{exact:true}).waitFor()
 await page.getByLabel('Level Map symbol').selectOption('QQQ')
 await page.getByText('QQQ · Current Level Map',{exact:true}).waitFor()
 await page.reload();await page.getByText('QQQ · Current Level Map',{exact:true}).waitFor()
 await page.goBack();await page.getByText('AMD · Current Level Map',{exact:true}).waitFor()
 report.checks.push('Open Live Map, ticker selection, reload and Back preserve route and symbol')
 const refresh=page.getByRole('button',{name:'Refresh current observations',exact:true})
 await refresh.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Refresh current observations'&&!b.disabled))
 const before=requests.filter(r=>r.action==='watchlist').length
 await refresh.click();await page.waitForResponse(r=>r.url().includes('action=watchlist'))
 assert.ok(requests.filter(r=>r.action==='watchlist').length>before)
 report.checks.push('Manual refresh requests new observations and context without browser cache')
 await page.getByRole('button',{name:/^Review/}).first().click()
 await page.getByRole('button',{name:'Historical Level Maps',exact:true}).click()
 await page.getByText('Expand historical Level Maps · archived reports only',{exact:true}).click()
 await page.getByText('Historical session watchlist: 2026-10-30',{exact:true}).waitFor()
 assert.equal(await page.locator('#current-level-map').count(),0)
 await page.getByRole('button',{name:'Open QQQ live map',exact:true}).click()
 await page.getByText('QQQ · Current Level Map',{exact:true}).waitFor()
 assert.equal(await page.getByText('Historical session watchlist: 2026-10-30',{exact:true}).count(),0)
 report.checks.push('Archive exists only in Review and cannot replace or overwrite current map')
 // Force a real request failure, then ensure previously loaded data clears.
 await page.route('**/api/desk?*',route=>new URL(route.request().url()).searchParams.get('action')==='session'?route.continue():route.fulfill({status:503,contentType:'application/json',body:'{"error":"ACCEPTANCE_PROVIDER_UNAVAILABLE"}'}))
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Refresh current observations'&&!b.disabled))
 await page.getByRole('button',{name:'Refresh current observations',exact:true}).click()
 await page.getByText('No validated map supplied.',{exact:true}).filter({visible:true}).first().waitFor()
 assert.equal(await page.getByTestId('current-map-price').innerText(),'Unavailable')
 assert.ok((await page.locator('#current-level-map').innerText()).includes('No archived map is substituted'))
 await page.screenshot({path:`${out}/unavailable-state.png`,fullPage:true})
 report.checks.push('Provider error clears price, calculations and triggers; no archived fallback')
 await Promise.all(bodyChecks);assert.deepEqual(errors,[]);assert.equal(hash(),beforeEnv)
 assert.ok(!requests.some(r=>/schwab|notify|\/ai\//.test(r.path)&&r.action==='execute'))
 report.checks.push('No browser errors; no provider key in requests or response bodies; existing env file unchanged')
 writeFileSync(`${out}/provider-browser-acceptance.json`,JSON.stringify(report,null,2))
 console.log(JSON.stringify({checkedAt:report.checkedAt,session:report.session,symbols:report.symbols.map(r=>({symbol:r.symbol,price:r.price,date:r.date,priorDate:r.priorDate,tradeTimestamp:r.tradeTimestamp,lastBar:new Date(r.lastBar.timestamp).toISOString(),timeframe:r.timeframe})),checks:report.checks,errors},null,2))
}finally{await browser.close()}
