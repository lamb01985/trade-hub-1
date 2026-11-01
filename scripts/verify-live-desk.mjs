// Real provider/browser parity first; simulated failure cases are isolated to test pages.
import { chromium } from 'playwright'
import { loadEnv } from 'vite'
import { readFileSync,writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { normalizeTradeTimestamp } from '../src/lib/quoteQuality.js'
// Formatting expectations are independent of the React component.
const deskNumber=(v,digits=4)=>v==null?'—':v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:digits})
const origin='http://127.0.0.1:4190'
const env=loadEnv('development',process.env.TRADEHUB_SERVER_ENV_DIR||process.cwd(),'')
const key=process.env.POLYGON_API_KEY||process.env.MASSIVE_API_KEY||env.POLYGON_API_KEY||env.MASSIVE_API_KEY
const credentialHash=()=>createHash('sha256').update(readFileSync('.env.local')).digest('hex')
const before=credentialHash()
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1100}})
const errors=[];page.on('pageerror',e=>errors.push(e.message))
if (process.argv.includes('--layout-only')) {
  await page.goto(`${origin}/?desk=live`)
  await page.getByRole('heading',{name:'Trading Desk',level:1}).waitFor()
  await page.setViewportSize({width:390,height:844})
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.eq-main')).marginLeft==='0px'&&document.documentElement.scrollWidth<=innerWidth+1)
  await page.screenshot({path:'.local/trading-workstation-mobile.png',fullPage:true,animations:'disabled'})
  console.log(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className?.toString(),x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.x>=0&&e.right>innerWidth+1).slice(0,30)})))
  await browser.close();process.exit(0)
}
const evidence={checkedAt:new Date().toISOString(),mode:'ACTUAL_SERVER_AND_PROVIDER',symbols:[],options:null}
try{
  const firstFeed=page.waitForResponse(r=>r.url().includes('/api/desk?')&&r.url().includes('action=watchlist')&&r.ok())
  await page.goto(`${origin}/?desk=live`)
  await page.getByRole('heading',{name:'Trading Desk',level:1}).waitFor()
  const normalized=await (await firstFeed).json()
  assert.equal(normalized.stocks.error,null)
  assert.equal(normalized.stocks.data.length,10)
  assert.ok(key,'Existing approved server key is required; no credential is printed')
  const rawResponse=await fetch('https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?tickers=QQQ,SPY,NVDA,AMD',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)})
  assert.equal(rawResponse.status,200)
  const raw=await rawResponse.json()
  for(const symbol of ['QQQ','SPY','NVDA','AMD']){
    const source=raw.tickers.find(r=>r.ticker===symbol)
    const row=normalized.stocks.data.find(r=>r.symbol===symbol)
    assert.ok(source&&row)
    // A closed-market run must match exactly, rather than comparing different observations.
    assert.equal(row.trade.timestamp,normalizeTradeTimestamp(source.lastTrade.t))
    assert.equal(row.trade.price,source.lastTrade.p)
    assert.equal(row.quote.timestamp,normalizeTradeTimestamp(source.lastQuote.t))
    assert.equal(row.quote.bid,source.lastQuote.p);assert.equal(row.quote.ask,source.lastQuote.P)
    assert.equal(row.prior.close.value,source.prevDay.c)
    assert.ok(Math.abs(row.change.amount-(source.lastTrade.p-source.prevDay.c))<1e-8)
    await page.getByTestId(`watch-${symbol}`).getByRole('button',{name:symbol,exact:true}).click()
    await page.waitForFunction(s=>document.querySelector('[data-testid=selected-quote] h2')?.textContent.startsWith(s),symbol)
    assert.ok((await page.getByTestId('selected-price').innerText()).includes(deskNumber(source.lastTrade.p)))
    const quoteText=await page.locator('.desk-quote-metrics').innerText()
    assert.ok(quoteText.includes(`${deskNumber(source.lastQuote.p)} / ${deskNumber(source.lastQuote.P)}`))
    assert.ok((await page.getByTestId('selected-quote').innerText()).includes('Market closed'))
    evidence.symbols.push({symbol,last:row.trade.price,tradeTimestamp:row.trade.timestamp,bid:row.quote.bid,ask:row.quote.ask,quoteTimestamp:row.quote.timestamp,change:row.change})
  }
  assert.ok((await page.locator('.desk-session-note').first().innerText()).includes('not executable live prices'))
  const anon=await browser.newContext()
  assert.equal((await anon.request.get(`${origin}/api/desk?action=watchlist`)).status(),401);await anon.close()
  for(const path of ['/api/schwab/orders','/api/ai/brief','/api/notify-email'])assert.equal((await page.request.get(origin+path)).status(),403)
  // Today never silently falls back to Friday. Review is an explicit separate selection.
  await page.getByTestId('watch-QQQ').getByRole('button',{name:'QQQ',exact:true}).click()
  const historyResponse=page.waitForResponse(r=>r.url().includes('action=context')&&r.url().includes('period=completed')&&r.ok())
  await page.getByRole('button',{name:'Last completed session',exact:true}).click()
  const history=await (await historyResponse).json()
  assert.equal(history.symbol,'QQQ');assert.equal(history.period,'completed');assert.equal(history.bars.error,null)
  assert.ok(history.bars.data.length>50);assert.ok(history.indicators.ema50>0)
  await page.getByText(/Historical session review — not a live feed/).waitFor()
  await page.waitForFunction(()=>document.querySelectorAll('.desk-chart canvas').length>0)
  await page.screenshot({path:'.local/trading-workstation-desktop.png',fullPage:true,animations:'disabled'})
  evidence.completedReview={date:history.date,priorDate:history.priorDate,barCount:history.indicators.barCount,ema9:history.indicators.ema9,ema20:history.indicators.ema20,ema50:history.indicators.ema50,vwap:history.indicators.vwap}
  const todayResponse=page.waitForResponse(r=>r.url().includes('action=context')&&r.url().includes('period=current')&&r.url().includes('symbol=QQQ')&&r.ok())
  await page.getByRole('button',{name:'Today',exact:true}).click()
  const today=await(await todayResponse).json();assert.equal(today.bars.data.length,0)
  // Reuse the real options path and compare rendered contract fields to that exact response.
  await page.getByRole('button',{name:'Options Intelligence',exact:true}).click()
  await page.locator('.desk-quick-options').getByRole('button',{name:'NVDA',exact:true}).click()
  await page.getByLabel('Expiration (optional)').fill('2026-11-02')
  await page.getByLabel('Exact strike (optional)').fill('205')
  assert.equal(await page.getByLabel('Underlying',{exact:true}).inputValue(),'NVDA')
  const optionsResponse=page.waitForResponse(r=>r.url().includes('/api/polygon/proxy?'))
  await page.getByRole('button',{name:'Load options data →'}).click()
  const options=await optionsResponse
  if(options.ok()){
    const chain=await options.json()
    assert.ok(chain.results.length>0)
    const contract=chain.results.find(r=>r.last_quote?.bid!=null)||chain.results[0]
    const row=page.locator('tbody tr').filter({hasText:contract.details.ticker})
    await row.waitFor()
    if(contract.last_quote){assert.ok((await row.innerText()).includes(contract.last_quote.bid.toLocaleString('en-US',{maximumFractionDigits:2})));assert.ok((await row.innerText()).includes('Options closed / session unverified'))}
    evidence.options={status:options.status(),symbol:contract.details.ticker,expiry:contract.details.expiration_date,strike:contract.details.strike_price,quote:contract.last_quote||null,greeks:contract.greeks||null,iv:contract.implied_volatility??null,volume:contract.day?.volume??null,openInterest:contract.open_interest??null}
    await page.screenshot({path:'.local/trading-workstation-options.png',fullPage:true,animations:'disabled'})
  }else{evidence.options={status:options.status(),state:'UNAVAILABLE_OR_NOT_ENTITLED'};await page.getByRole('alert').waitFor()}
  evidence.optionCoverage=[]
  for (const underlying of ['QQQ','SPY','NVDA','AMD','PLTR']) {
    const r=await fetch(`https://api.massive.com/v3/snapshot/options/${underlying}?expiration_date.gte=2026-11-02&limit=1`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)})
    const d=await r.json(),first=d.results?.[0]
    evidence.optionCoverage.push({underlying,httpStatus:r.status,contract:first?.details?.ticker??null,quoteSupplied:!!first?.last_quote,greeksSupplied:!!first?.greeks,ivSupplied:first?.implied_volatility!=null})
    assert.equal(r.status,200);assert.ok(first?.details?.ticker?.startsWith(`O:${underlying}`))
  }
  await page.getByRole('button',{name:'Data Health',exact:true}).first().click()
  await page.getByText('Watchlist observations',{exact:true}).waitFor()
  // Separate browser context for synthetic Monday stale-feed and provider-error regressions.
  const test=await browser.newPage({viewport:{width:1440,height:1000}})
  const monday=Date.parse('2026-11-02T15:00:00Z')
  await test.clock.setFixedTime(monday)
  const stale=structuredClone(normalized)
  for(const row of stale.stocks.data){row.trade.timestamp=monday-120000;row.trade.timeframe='REAL-TIME';row.trade.session='REGULAR';row.quote.timestamp=monday-120000;row.quote.timeframe='REAL-TIME'}
  await test.route('**/api/desk?*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.get('action')==='watchlist'?stale:{symbol:'QQQ',period:'current',bars:{data:[],error:null},previous:{data:[],error:null},indicators:null}}))
  await test.goto(`${origin}/?desk=live`);await test.getByTestId('selected-quote').getByText('Stale',{exact:true}).waitFor()
  await test.unroute('**/api/desk?*')
  await test.route('**/api/desk?*',route=>route.fulfill({status:502,json:{error:'PROVIDER_UNAVAILABLE_TEST'}}))
  await test.reload();await test.getByRole('alert').filter({hasText:'PROVIDER_UNAVAILABLE_TEST'}).waitFor()
  assert.ok((await test.getByTestId('selected-price').innerText()).includes('—'))
  await test.close()
  await page.getByRole('button',{name:'Trading Desk',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.eq-main')).marginLeft==='0px'&&document.documentElement.scrollWidth<=innerWidth+1)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page must fit a mobile viewport')
  await page.screenshot({path:'.local/trading-workstation-mobile.png',fullPage:true,animations:'disabled'})
  assert.deepEqual(errors,[])
  assert.equal(credentialHash(),before,'Owner configuration must remain unchanged')
  evidence.passed=['authenticated provider','QQQ/SPY/NVDA/AMD raw-provider and browser parity','Sunday labels','explicit historical review','options identity and available fields','Monday stale feed','provider error','anonymous denial','broker/AI denial','mobile containment','env preserved']
  writeFileSync('.local/workstation-verification.json',JSON.stringify(evidence,null,2))
  console.log(JSON.stringify({checkedAt:evidence.checkedAt,symbols:evidence.symbols,options:evidence.options?.symbol||evidence.options?.state,passed:evidence.passed},null,2))
}finally{await browser.close()}
