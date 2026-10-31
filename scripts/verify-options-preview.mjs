import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1100}})
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto('http://127.0.0.1:4180/?intelligence=options')
 await page.getByRole('heading',{name:'QQQ positioning',exact:true}).waitFor()
 const root=page.getByRole('region',{name:'Options Intelligence workspace'})
 const response=await context.request.get('http://127.0.0.1:4180/api/intelligence/latest');assert.equal(response.status(),200)
 const report=await response.json()
 await fs.mkdir('.local',{recursive:true})
 for(const symbol of ['QQQ','SPY']){
  await root.getByLabel('Options symbol',{exact:true}).selectOption(symbol)
  const source=report.options_workspace.symbols.find(s=>s.symbol===symbol)
  for(const e of source.expirations){
   await root.getByLabel('Options expiration',{exact:true}).selectOption(e.expiration)
   const list=root.getByRole('list',{name:`${e.expiration} strike open interest`})
   await list.waitFor();assert.equal(await list.getByRole('listitem').count(),e.strikes.length)
   await root.getByRole('button',{name:'Jump to underlying',exact:true}).click()
   assert.equal(await root.getByLabel('Show comparable OI changes').isEnabled(),false)
   assert.equal(await root.getByRole('button',{name:'Monthly',exact:true}).isEnabled(),false)
   assert.equal(await root.getByRole('button',{name:'Weekly',exact:true}).isEnabled(),false)
   await root.getByText('Trade/quote aggressor estimates and sample completeness',{exact:true}).click()
   if(e.trade_flow.status==='AVAILABLE')await root.getByText(/Trade pagination: INCOMPLETE/).waitFor()
   else await root.getByText(/The saved bounded flow sample belongs to another expiration/).waitFor()
   await page.setViewportSize({width:390,height:844})
   assert.equal(await root.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${symbol} ${e.expiration} mobile overflow`)
   await page.setViewportSize({width:1440,height:1100})
  }
 }
 await root.getByLabel('Options symbol',{exact:true}).selectOption('QQQ')
 await root.getByRole('button',{name:'0DTE (report session)',exact:true}).click()
 await page.screenshot({path:'.local/options-intelligence-desktop.png',fullPage:true})
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:'.local/options-intelligence-mobile.png',fullPage:true})
 await root.getByLabel('Options symbol',{exact:true}).selectOption('NVDA')
 await root.getByRole('heading',{name:'Options intelligence unavailable for NVDA.',exact:true}).waitFor()
 assert.equal(await root.getByRole('listitem').count(),0)
 await root.getByLabel('Options symbol',{exact:true}).selectOption('QQQ')
 await page.getByRole('button',{name:'Market Map',exact:true}).click()
 await page.getByRole('heading',{name:'QQQ',exact:true}).waitFor()
 assert.deepEqual(errors,[])
 console.log('PASS: QQQ/SPY per-expiration OI and all observed strikes, explicit stale data, unavailable OI changes/weekly/monthly, expiry-scoped flow, missing symbol, mobile containment and intact Market Map.')
}finally{await context.close();await browser.close()}
