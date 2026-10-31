import { chromium } from 'playwright'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const page=await context.newPage()
const errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto('http://127.0.0.1:4180/?intelligence=map')
 await page.getByText('FRIDAY-CLOSE SNAPSHOT · LOCAL SAMPLE · NOT LIVE',{exact:true}).waitFor()
 for(const path of ['/api/calendar-earnings?date=2026-10-26','/api/polygon/proxy?path=/v3/reference/tickers/QQQ']){
  const r=await context.request.get('http://127.0.0.1:4180'+path);console.log(JSON.stringify({path:path.split('?')[0],status:r.status()}))
 }
 await page.getByRole('button',{name:'Levels',exact:true}).click()
 console.log('Levels before fix:',await page.getByText('Levels load automatically once your Massive API key is connected.').count()?'misleading key-connection empty state':'different state')
 await page.getByRole('button',{name:'Calendar',exact:true}).click()
 await page.getByRole('button',{name:'EARNINGS',exact:true}).click()
 console.log('Calendar before fix:',{falseEmpty:await page.getByText('No earnings in the next 14 days.',{exact:true}).count(),feedUnavailable:await page.getByText(/Earnings feed unavailable:/).count(),browserErrors:errors})
}finally{await context.close();await browser.close()}
