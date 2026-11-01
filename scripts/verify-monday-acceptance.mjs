// Read-only closed-market acceptance. Never prints the key, raw error URLs or secret matches.
import { chromium } from 'playwright'
import {loadEnv} from 'vite'
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync,spawn} from 'node:child_process'
import assert from 'node:assert/strict'
import {deskStructure} from '../src/lib/marketEvidence.js'
const symbols=['QQQ','SPY','IWM','NVDA','AMD','MU','PLTR','TSLA','ORCL','CRWV']
const origin='http://127.0.0.1:4190'
const config=loadEnv('development',process.env.TRADEHUB_SERVER_ENV_DIR||process.cwd(),'')
const secret=process.env.POLYGON_API_KEY||process.env.MASSIVE_API_KEY||config.POLYGON_API_KEY||config.MASSIVE_API_KEY
assert.ok(secret,'An existing configured server key is required')
const variants=[secret,encodeURIComponent(secret)]
const containsSecret=value=>variants.some(s=>String(value).includes(s))
const envHash=()=>createHash('sha256').update(readFileSync('.env.local')).digest('hex')
const before=envHash()
const report={checkedAt:new Date().toISOString(),watchlist:[],charts:[],security:{},reliability:{},notes:[]}
function close(actual,expected,label){assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<1e-8,`${label} mismatch`)}
const ns=value=>Number(BigInt(String(value))/1000000n)
async function provider(path,params={}){
 const url=new URL(path,'https://api.massive.com');for(const[k,v]of Object.entries(params))url.searchParams.set(k,v)
 const r=await fetch(url,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(15000)})
 assert.equal(r.status,200,`Provider status for ${path}`)
 const d=await r.json();assert.ok(!['ERROR','NOT_AUTHORIZED'].includes(d.status),'Provider returned an error')
 return d
}
function ema(closes,period){
 if(closes.length<period)return null
 let value=closes.slice(0,period).reduce((a,b)=>a+b,0)/period
 for(let i=period;i<closes.length;i++)value=(closes[i]-value)*(2/(period+1))+value
 return value
}
function files(directory){return readdirSync(directory).flatMap(name=>{const path=`${directory}/${name}`;return statSync(path).isDirectory()?files(path):[path]})}
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1100}})
const pageErrors=[],consoleLines=[],responses=[],requests=[]
page.on('pageerror',e=>pageErrors.push(e.message))
page.on('console',m=>consoleLines.push(m.text()))
page.on('request',r=>requests.push({url:r.url(),headers:r.headers()}))
page.on('response',r=>{const job=(async()=>{try{const text=await r.text();assert.ok(!containsSecret(text),'Credential detected in browser response')}catch(e){if(e.code==='ERR_ASSERTION')throw e}})();responses.push(job)})
try{
 const first=page.waitForResponse(r=>r.url().includes('action=watchlist')&&r.ok())
 await page.goto(`${origin}/?desk=live`);await page.getByRole('heading',{name:'Trading Desk',level:1}).waitFor()
 const feed=await(await first).json();assert.equal(feed.stocks.error,null);assert.equal(feed.stocks.data.length,10)
 const raw=await provider('/v2/snapshot/locale/us/markets/stocks/tickers',{tickers:symbols.join(',')})
 for(const symbol of symbols){
  const row=feed.stocks.data.find(r=>r.symbol===symbol),r=raw.tickers.find(r=>r.ticker===symbol)
  const reference=(await provider(`/v3/reference/tickers/${symbol}`)).results
  assert.equal(reference.ticker,symbol);assert.equal(reference.type,['QQQ','SPY','IWM'].includes(symbol)?'ETF':'CS')
  assert.equal(row.instrumentType,['QQQ','SPY','IWM'].includes(symbol)?'ETF':'EQUITY')
  assert.equal(row.trade.kind,'TRADE');assert.equal(row.quote.kind,'QUOTE')
  assert.equal(row.trade.timestamp,ns(r.lastTrade.t));assert.equal(row.quote.timestamp,ns(r.lastQuote.t))
  assert.equal(row.trade.price,r.lastTrade.p);assert.equal(row.quote.bid,r.lastQuote.p);assert.equal(row.quote.ask,r.lastQuote.P)
  assert.equal(row.prior.close.value,r.prevDay.c);assert.equal(row.regularClose.value,r.day.c)
  await page.getByTestId(`watch-${symbol}`).getByRole('button',{name:symbol,exact:true}).click()
  await page.waitForFunction(s=>document.querySelector('[data-testid=selected-quote] h2')?.textContent.startsWith(s),symbol)
  assert.ok((await page.getByTestId('selected-quote').innerText()).includes('Market closed'))
  report.watchlist.push({symbol,instrumentType:row.instrumentType,last:row.trade.price,tradeTimestamp:new Date(row.trade.timestamp).toISOString(),bid:row.quote.bid,ask:row.quote.ask,quoteTimestamp:new Date(row.quote.timestamp).toISOString(),observedSession:row.trade.session,previousRegularClose:row.prior.close.value,baselineDate:row.prior.close.date,regularClose:row.regularClose.value,observedDate:row.snapshotDate})
 }
 assert.equal(feed.vix.data,null);assert.ok(feed.vix.error);assert.equal(feed.futures.error,'CONTRACT_AND_ENTITLEMENT_UNVERIFIED')
 report.unavailable={vix:feed.vix.error,futures:feed.futures.error}
 for(const symbol of ['QQQ','SPY','NVDA','AMD']){
  await page.getByTestId(`watch-${symbol}`).getByRole('button',{name:symbol,exact:true}).click()
  const response=await page.request.get(`${origin}/api/desk?action=context&symbol=${symbol}&period=completed`)
  const context=await response.json();assert.equal(response.status(),200)
  assert.equal(context.date,'2026-10-30');assert.equal(context.priorDate,'2026-10-29')
  assert.equal(context.bars.error,null);assert.equal(context.previous.error,null)
  const rawBars=await provider(`/v2/aggs/ticker/${symbol}/range/1/minute/2026-10-30/2026-10-30`,{adjusted:'true',sort:'asc',limit:'50000'})
  const daily=await provider(`/v2/aggs/ticker/${symbol}/range/1/day/2026-10-29/2026-10-29`,{adjusted:'true',sort:'asc',limit:'50'})
  const friday=await provider(`/v2/aggs/ticker/${symbol}/range/1/day/2026-10-30/2026-10-30`,{adjusted:'true',sort:'asc',limit:'50'})
  assert.ok(!rawBars.next_url);assert.equal(context.bars.data.length,rawBars.results.length)
  context.bars.data.forEach((b,i)=>{for(const key of ['t','o','h','l','c','v','vw'])assert.equal(b[key],rawBars.results[i][key],`${symbol} raw candle ${key}`)})
  for(const key of ['t','o','h','l','c'])assert.equal(context.previous.data[0][key],daily.results[0][key])
  const current=await(await page.request.get(`${origin}/api/desk?action=context&symbol=${symbol}&period=current`)).json()
  assert.equal(current.period,'current');assert.equal(current.bars.error,null);assert.equal(current.bars.data.length,0)
  assert.equal(current.priorDate,'2026-10-30');assert.equal(current.previous.data[0].c,friday.results[0].c)
  // Independent UTC boundaries for Friday Oct 30, before Sunday's DST change.
  const rth=rawBars.results.filter(b=>b.t>=Date.parse('2026-10-30T13:30:00Z')&&b.t<Date.parse('2026-10-30T20:00:00Z'))
  const pre=rawBars.results.filter(b=>b.t>=Date.parse('2026-10-30T08:00:00Z')&&b.t<Date.parse('2026-10-30T13:30:00Z'))
  const late=rawBars.results.filter(b=>b.t>=Date.parse('2026-10-30T20:00:00Z')&&b.t<Date.parse('2026-10-31T00:00:00Z'))
  const ind=context.indicators
  const weighted=rth.reduce((sum,b)=>sum+b.vw*b.v,0)/rth.reduce((sum,b)=>sum+b.v,0)
  close(ind.vwap,weighted,`${symbol} VWAP`)
  for(const period of [9,20,50])close(ind[`ema${period}`],ema(rth.map(b=>b.c),period),`${symbol} EMA${period}`)
  assert.equal(ind.barCount,rth.length)
  for(const [session,rows]of [['PREMARKET',pre],['AFTER_HOURS',late]]){
   if(rows.length){assert.equal(ind.sessions[session].high,Math.max(...rows.map(b=>b.h)));assert.equal(ind.sessions[session].low,Math.min(...rows.map(b=>b.l)));assert.equal(ind.sessions[session].last,rows.at(-1).c)}else assert.equal(ind.sessions[session],null)
  }
  const structure=deskStructure(context),pd=daily.results[0]
  const pp=(pd.h+pd.l+pd.c)/3;close(structure.pivots.PP,pp,'PP');close(structure.pivots.R1,2*pp-pd.l,'R1');close(structure.pivots.S1,2*pp-pd.h,'S1')
  assert.equal(structure.scenarios[0].boundary,Math.max(pd.h,pre.length?Math.max(...pre.map(b=>b.h)):pd.h))
  assert.equal(structure.scenarios[1].boundary,Math.min(pd.l,pre.length?Math.min(...pre.map(b=>b.l)):pd.l))
  assert.ok(structure.scenarios.every(s=>s.trigger.includes('completed 5-minute close')&&s.invalidation.includes('back')))
  assert.ok(structure.levelMap.levels.every(l=>Number.isFinite(l.price)&&l.price>0&&l.type!=='round'))
  const historical=page.waitForResponse(r=>r.url().includes(`symbol=${symbol}`)&&r.url().includes('period=completed')&&r.ok())
  await page.getByRole('button',{name:'Last completed session',exact:true}).click();await historical
  await page.getByText(/Historical session review — not a live feed/).waitFor()
  await page.getByText(new RegExp(`${rth.length} RTH bars`)).waitFor()
  await page.waitForFunction(()=>document.querySelectorAll('.desk-chart canvas').length>0)
  await page.screenshot({path:`.local/acceptance-${symbol}-friday.png`,fullPage:true,animations:'disabled'})
  await page.getByRole('button',{name:'Today',exact:true}).click()
  report.charts.push({symbol,date:context.date,priorDate:context.priorDate,minuteBars:context.bars.data.length,rthBars:rth.length,prior:{high:pd.h,low:pd.l,close:pd.c},fridayClose:friday.results[0].c,premarket:ind.sessions.PREMARKET,afterHours:ind.sessions.AFTER_HOURS,vwap:ind.vwap,ema9:ind.ema9,ema20:ind.ema20,ema50:ind.ema50,bullish:structure.scenarios[0],bearish:structure.scenarios[1]})
 }
 writeFileSync('.local/monday-provider-checks.json',JSON.stringify({checkedAt:report.checkedAt,watchlist:report.watchlist,charts:report.charts},null,2))
 // Refresh in the mounted UI: source stamps remain source stamps, receipt time advances.
 const previousReceipt=feed.fetchedAt
 const refreshed=page.waitForResponse(r=>r.url().includes('action=watchlist')&&r.ok())
 const button=page.getByRole('button',{name:'Refresh data',exact:true});await button.waitFor();await button.click()
 const next=await(await refreshed).json();assert.ok(Date.parse(next.fetchedAt)>Date.parse(previousReceipt))
 assert.equal(next.stocks.data.find(r=>r.symbol==='QQQ').trade.timestamp,feed.stocks.data.find(r=>r.symbol==='QQQ').trade.timestamp)
 report.reliability.refreshWithoutReload=true
 await page.getByText('Manual reward / risk check',{exact:true}).click()
 await page.getByLabel('Entry',{exact:true}).fill('100');await page.getByLabel('Invalidation / stop',{exact:true}).fill('99');await page.getByLabel('Target',{exact:true}).fill('102')
 await page.getByText(/2.00:1 before costs/).waitFor()
 await page.getByLabel('Invalidation / stop',{exact:true}).fill('100');await page.getByText('Enter ordered entry, stop and target prices.',{exact:false}).waitFor()
 report.reliability.riskReward='Manual ordered inputs; costs/slippage/gap risk disclosed; invalid equal stop rejected'
 const anon=await browser.newContext();assert.equal((await anon.request.get(`${origin}/api/desk?action=watchlist`)).status(),401);await anon.close()
 for(const path of ['/api/schwab/orders','/api/schwab/quote','/api/ai/brief','/api/notify-email','/api/notify-telegram'])assert.equal((await page.request.get(origin+path)).status(),403)
 report.security.pathChecks=[]
 for(const path of ['/.env.local','/@fs'+process.cwd()+'/.env.local','/.git/config','/.local/workstation-verification.json']){
  const r=await page.request.get(origin+path),text=await r.text()
  const spaFallback=r.status()===200&&text.includes('<html')&&text.includes('/@vite/client')
  assert.ok([403,404].includes(r.status())||spaFallback,`Unexpected sensitive-path response: ${path} (${r.status()})`)
  assert.ok(!containsSecret(text),'Credential detected in path response')
  report.security.pathChecks.push({path,status:r.status(),result:spaFallback?'SPA fallback; no file content':'denied'})
 }
 await Promise.all(responses)
 assert.ok(!containsSecret(JSON.stringify(requests))&&!containsSecret(consoleLines.join('\n')),'Credential found in browser traffic or console')
 const tracked=execFileSync('git',['ls-files','-z']).toString().split('\0').filter(Boolean)
 for(const path of [...tracked,...files('dist')])assert.ok(!containsSecret(readFileSync(path)),'Credential detected in tracked file or build artifact')
 assert.ok(!tracked.includes('.env.local'));assert.equal(execFileSync('git',['check-ignore','.env.local']).toString().trim(),'.env.local')
 // Scan all reachable Git object bytes without putting the key in argv or output.
 const objects=execFileSync('git',['rev-list','--objects','--all']).toString().trim().split('\n').map(line=>line.split(' ')[0])
 let tail='',gitLeak=false
 await new Promise((resolve,reject)=>{const child=spawn('git',['cat-file','--batch'],{stdio:['pipe','pipe','pipe']});child.stdout.on('data',chunk=>{const text=tail+chunk.toString('latin1');if(containsSecret(text))gitLeak=true;tail=text.slice(-Math.max(...variants.map(s=>s.length)))});child.stderr.on('data',()=>{});child.on('error',()=>reject(new Error('Git containment scan failed')));child.on('close',code=>code===0?resolve():reject(new Error('Git containment scan failed')));child.stdin.end(objects.join('\n')+'\n')})
 assert.equal(gitLeak,false,'Credential detected in reachable Git object history')
 assert.deepEqual(pageErrors,[])
 assert.equal(envHash(),before,'Owner environment changed')
 report.security={...report.security,browserTrafficAndConsole:'no credential found',trackedFiles:'no credential found',reachableGitObjects:objects.length,gitCredentialFound:false,dist:'no credential found',protectedPaths:'denied or SPA fallback; no credential contents',brokerAIAndNotifications:'denied',envUnchanged:true,serverLogs:'Reviewed sanitized code paths; existing server stdout/stderr are owner terminal, not retained log artifacts'}
 report.notes=['Closed-market acceptance; current-session latency still requires Monday observation','CT/DST axis and no synthetic ticks covered by chart regression','Monday Today rejects Friday bars in server regression','Provider Retry-After and single-loop counts covered by fake-clock regression']
 writeFileSync('.local/monday-acceptance.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify({checkedAt:report.checkedAt,symbols:report.watchlist.map(r=>({symbol:r.symbol,type:r.instrumentType,last:r.last,tradeTimestamp:r.tradeTimestamp})),charts:report.charts.map(r=>({symbol:r.symbol,rthBars:r.rthBars,vwap:r.vwap,ema9:r.ema9,ema20:r.ema20,ema50:r.ema50})),security:report.security,reliability:report.reliability},null,2))
} finally {await browser.close()}
