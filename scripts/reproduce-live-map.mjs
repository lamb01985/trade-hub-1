import {chromium} from 'playwright'
import {writeFileSync} from 'node:fs'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
try{
 await page.goto('http://127.0.0.1:4180/')
 await page.getByRole('button',{name:'Trading tools',exact:true}).click()
 await page.locator('aside').getByRole('button',{name:'Key levels',exact:true}).click()
 const action=page.getByRole('button',{name:'Open QQQ live map',exact:true})
 await action.waitFor()
 const before={url:page.url(),archive:await page.getByText('Session watchlist: 2026-10-30',{exact:true}).isVisible(),y:await page.evaluate(()=>scrollY)}
 await action.click()
 const after={url:page.url(),archive:await page.getByText('Session watchlist: 2026-10-30',{exact:true}).isVisible(),y:await page.evaluate(()=>scrollY)}
 await page.screenshot({path:'.local/original-level-map-failure.png',fullPage:true})
 writeFileSync('.local/original-button-reproduction.json',JSON.stringify({before,after},null,2));console.log(JSON.stringify({before,after}))
}finally{await browser.close()}
