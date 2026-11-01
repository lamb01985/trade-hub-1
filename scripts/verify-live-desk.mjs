// Test only. Provider replay is isolated by Playwright routes; never loaded by the desk server.
import { chromium } from 'playwright'
import { readFileSync,writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const origin='http://127.0.0.1:4190'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage()
const errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
  await page.goto(`${origin}/?desk=live`)
  await page.getByRole('heading',{name:'TradeHub · Market data desk'}).waitFor()
  const anon=await browser.newContext();const denied=await anon.request.get(`${origin}/api/desk?action=watchlist`);assert.equal(denied.status(),401);await anon.close()
  for(const path of ['/api/schwab/orders','/api/ai/brief','/api/notify-email'])assert.equal((await page.request.get(origin+path)).status(),403)
  const real=await page.request.get(`${origin}/api/desk?action=watchlist`)
  const data=await real.json()
  assert.equal(real.status(),200)
  assert.ok(data.stocks.error || data.stocks.data)
  const realEvidence={checkedAt:new Date().toISOString(),stocksError:data.stocks.error,vixError:data.vix.error,returnedStockCount:data.stocks.data?.length??0}
  writeFileSync('.local/desk-runtime-smoke.json',JSON.stringify(realEvidence,null,2))
  console.log('Actual server provider path:',JSON.stringify(realEvidence))
  if(process.argv.includes('--provider-replay')){
    const fixture=JSON.parse(readFileSync('.local/provider-replay.json','utf8'))
    await page.route('**/api/desk?*',async route=>{
      const u=new URL(route.request().url());const symbol=u.searchParams.get('symbol')||'QQQ'
      const normalizer=await import('../src/lib/marketEvidence.js')
      let body
      if(u.searchParams.get('action')==='watchlist')body={provider:'Massive',fetchedAt:fixture.checkedAt,stocks:{data:fixture.stocks.map(raw=>normalizer.stockEvidence(raw.ticker,raw)),error:null},vix:{data:null,error:'NOT_ENTITLED'}}
      else if(symbol!=='QQQ')body={symbol,date:'2026-10-30',priorDate:'2026-10-29',bars:{data:null,error:'TEST_REPLAY_NO_CAPTURE_FOR_SYMBOL'},previous:{data:null,error:'TEST_REPLAY_NO_CAPTURE_FOR_SYMBOL'},indicators:null}
      else {const bars=normalizer.validateBars('QQQ',{ticker:'QQQ',results:fixture.bars},'2026-10-30');body={symbol,date:'2026-10-30',priorDate:'2026-10-30',bars:{data:bars,error:null},previous:{data:normalizer.validateBars('QQQ',{ticker:'QQQ',results:fixture.daily},'2026-10-30',{daily:true}),error:null},indicators:normalizer.intradayContext(bars)}}
      await route.fulfill({json:body})
    })
    await page.route('**/api/polygon/proxy?*',route=>route.fulfill({json:{status:'OK',results:[fixture.option]}}))
    await page.reload();await page.getByRole('heading',{name:'TradeHub · Market data desk'}).waitFor()
    const qqq=page.locator('tr').filter({has:page.getByRole('button',{name:'QQQ',exact:true})})
    const nvda=page.locator('tr').filter({has:page.getByRole('button',{name:'NVDA',exact:true})})
    await qqq.getByText('692.74',{exact:true}).waitFor();await nvda.getByText('205.2499',{exact:true}).waitFor()
    assert.match(await qqq.innerText(),/MARKET_CLOSED/)
    assert.match(await qqq.innerText(),/10\/30\/2026/)
    assert.match(await nvda.innerText(),/205.23 \/ 205.25/)
    await page.getByRole('button',{name:'NVDA',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('input[type=text]')?.value==='NVDA');assert.equal(await page.locator('input[type=text]').first().inputValue(),'NVDA')
    await page.getByRole('button',{name:'Load options data →'}).click()
    await page.getByText('O:NVDA261102C00205000',{exact:false}).first().waitFor()
    const contract=page.locator('tr').filter({hasText:'O:NVDA261102C00205000'})
    assert.match(await contract.innerText(),/2.2/);assert.match(await contract.innerText(),/2.24/);assert.match(await contract.innerText(),/OPTIONS_SESSION_UNVERIFIED_OR_CLOSED/)
    await page.screenshot({path:'.local/live-desk-provider-replay.png',fullPage:true})
    console.log('Provider-backed TEST REPLAY: QQQ/NVDA prices, quote times, contract identity, bid/ask and closed-market labels match connected-app responses.')
  }
  assert.deepEqual(errors,[])
  console.log('Desk browser smoke passed; anonymous, broker and AI routes denied.')
}finally{await browser.close()}
