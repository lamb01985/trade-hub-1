// Explicit user-selected demonstration data. Never used as a live-data fallback.
export function optionsV2Fixture(symbol='QQQ') {
 const at='2026-11-02T15:00:00Z',before='2026-10-30T15:00:00Z',expiry='2026-11-20'
 const contracts=[95,100,105,110].flatMap(strike=>['call','put'].map(type=>({symbol:`O:${symbol}261120${type==='call'?'C':'P'}${String(strike*1000).padStart(8,'0')}`,underlying:symbol,type,strike,expiry,sharesPerContract:100,exerciseStyle:'american',bid:4,ask:4.1,spread:.1,spreadPct:.1/4.05*100,quoteTime:at,quoteTimeframe:'REAL-TIME',dayTime:at,iv:.3,delta:type==='call'?.5:-.5,gamma:.02,theta:-.05,vega:.2,volume:strike===105?1200:200,openInterest:strike===105?1500:100,underlyingPrice:102,underlyingTime:at,underlyingTimeframe:'REAL-TIME',quoteSource:'SYNTHETIC_TEST_ONLY'})))
 const snapshot={symbol,expiry,contracts,pages:1,complete:false,hasMore:true,fetchedAt:at,mode:'SYNTHETIC_FIXTURE',coverageScope:'SELECTED_EXPIRATION',requests:[],provider:'SYNTHETIC_NOT_MARKET_DATA'}
 const prior={...snapshot,fetchedAt:before,contracts:contracts.map(c=>({...c,openInterest:Math.max(0,c.openInterest-50),quoteTime:before,underlyingTime:before,dayTime:before}))}
 return {snapshot,prior,clock:Date.parse(at)}
}
