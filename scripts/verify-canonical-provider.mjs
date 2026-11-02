import {loadEnv} from 'vite'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {stockEvidence,DESK_SYMBOLS} from '../src/lib/marketEvidence.js'
const origin='http://127.0.0.1:4214',env=loadEnv('development','../tradehub-monday-readiness','')
const key=env.MASSIVE_API_KEY||env.POLYGON_API_KEY
assert.ok(key)
const session=await fetch(origin),cookie=session.headers.get('set-cookie').split(';')[0]
const local=async p=>{const r=await fetch(origin+p,{headers:{cookie},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json()}
const provider=async p=>{const r=await fetch('https://api.massive.com'+p,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return r.json()}
const report={checkedAt:new Date().toISOString(),symbols:[],options:null}
const data=await local('/api/desk?action=watchlist')
const raw=await provider('/v2/snapshot/locale/us/markets/stocks/tickers?tickers='+DESK_SYMBOLS.filter(s=>s!=='VIX').join(','))
assert.equal(data.stocks.error,null)
for(const row of data.stocks.data){
 const source=raw.tickers.find(r=>r.ticker===row.symbol);assert.ok(source)
 const expected=stockEvidence(row.symbol,source)
 assert.deepEqual(row,expected)
 assert.equal(row.trade.kind,'TRADE')
 report.symbols.push(row)
}
const amd=await local('/api/desk?action=context&symbol=AMD&period=plan')
const daily=await provider('/v2/aggs/ticker/AMD/range/1/day/2026-10-30/2026-10-30?adjusted=true&sort=asc&limit=50')
for(const field of ['t','o','h','l','c','v'])assert.equal(amd.previous.data[0][field],daily.results[0][field]);assert.equal(amd.bars.data.length,0)
report.amd={previous:amd.previous.data[0],priorDate:amd.priorDate,currentBars:amd.bars.data.length}
const path='/v3/snapshot/options/QQQ'
const chain=await local('/api/polygon/proxy?'+new URLSearchParams({path,limit:'5',sort:'expiration_date',order:'asc','expiration_date.gte':'2026-11-02'}))
assert.ok(chain.results.length)
report.options={returned:chain.results.length,contracts:chain.results.map(r=>({symbol:r.details?.ticker,expiry:r.details?.expiration_date,quote:r.last_quote,trade:r.last_trade,openInterest:r.open_interest,greeks:r.greeks,iv:r.implied_volatility}))}
report.vix=data.vix;report.futures=data.futures
writeFileSync('.local/canonical-provider.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({checkedAt:report.checkedAt,symbols:report.symbols.map(r=>({symbol:r.symbol,trade:r.trade,quote:r.quote})),amd:report.amd,options:report.options,vix:report.vix,futures:report.futures},null,2))
