import {readFileSync} from 'node:fs'
import {it,expect} from 'vitest'
import {assertMarketDataEnvelope,validateMarketDataEnvelope} from '../src/lib/marketDataContract.js'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/market-data-python.json',import.meta.url),'utf8'))
it('accepts all synthetic Python wire fixtures through the browser/gateway validator',()=>{
 expect(fixtures).toHaveLength(4)
 for(const fixture of fixtures) expect(()=>assertMarketDataEnvelope(fixture)).not.toThrow()
})
it('keeps fresh quote pairs CURRENT when the optional last trade is absent',()=>{
 const e=structuredClone(fixtures[0]);e.generated_at='2026-10-23T15:00:00Z';e.data.last_trade=null
 for(const side of ['bid','ask']) {e.data[side].feed_timeframe='REAL_TIME';e.data[side].field_quality={valid:true,freshness:'CURRENT',reasons:[]}}
 e.quality={...e.quality,freshness:'CURRENT',coverage:'PARTIAL',source_age_seconds:0,missing_fields:['last_trade'],reasons:[]}
 expect(validateMarketDataEnvelope(e)).toBe(true)
 e.quality.missing_fields=['bid'];expect(validateMarketDataEnvelope(e)).toBe(false)
})
it('rejects a forged snapshot aggregate age even with fresh sides',()=>{
 const e=structuredClone(fixtures[0]);e.generated_at='2026-10-23T15:00:01Z'
 for(const side of ['bid','ask']) {e.data[side].feed_timeframe='REAL_TIME';e.data[side].field_quality={valid:true,freshness:'CURRENT',reasons:[]}}
 e.quality={...e.quality,freshness:'CURRENT',source_age_seconds:1,reasons:[]}
 expect(validateMarketDataEnvelope(e)).toBe(true)
 for(const age of [0,31]) {e.quality.source_age_seconds=age;expect(validateMarketDataEnvelope(e)).toBe(false)}
})
it('rejects current bars with forged age, unfinished bars, gaps or incomplete pagination',()=>{
 const e=structuredClone(fixtures[1]);e.generated_at='2026-10-23T15:01:01Z'
 e.data.bars=[{instrument_id:'ETF:US:QQQ',start:'2026-10-23T15:00:00Z',end:'2026-10-23T15:01:00Z',completed:true,open:100,high:102,low:99,close:101,volume:0,source_time:'2026-10-23T15:00:00Z',raw_time:'1792767600000',timestamp_unit:'MS'}]
 e.quality={...e.quality,freshness:'CURRENT',coverage:'COMPLETE',source_age_seconds:1,reasons:[]}
 e.coverage_details={...e.coverage_details,minimum_required:1,missing_intervals:[]}
 expect(validateMarketDataEnvelope(e)).toBe(true)
 for(const change of [x=>x.quality.source_age_seconds=91,x=>x.quality.source_age_seconds=0,x=>x.data.bars[0].completed=false,x=>x.coverage_details.missing_intervals=['2026-10-23T15:00:00Z'],x=>x.coverage_details.pagination_complete=false]) {const invalid=structuredClone(e);change(invalid);expect(validateMarketDataEnvelope(invalid)).toBe(false)}
})
