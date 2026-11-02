import {validateOptionIdentity} from './optionSnapshot.js'
// Cox-Ross-Rubinstein American exercise lattice, constant volatility/rate and
// continuous dividend yield. A numerical estimate, never an executable quote.
export function expiryInstant(expiry) {
 const candidate=Date.parse(`${expiry}T16:00:00Z`)
 if(!Number.isFinite(candidate)||new Date(candidate).toISOString().slice(0,10)!==expiry)throw Error('Invalid expiration')
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(candidate)))
 return candidate+(16-hour)*3600000
}
export function americanPrice({spot,strike,years,iv,rate=0,yieldRate=0,type,steps=200}) {
 if(![spot,strike,years,iv,rate,yieldRate].every(Number.isFinite)||spot<0||strike<=0||years<0||years>5||iv<=0||iv>5||Math.abs(rate)>.5||yieldRate<0||yieldRate>.5||!['call','put'].includes(type)||!Number.isInteger(steps)||steps<20||steps>500)throw Error('Unsupported model inputs')
 const payoff=s=>Math.max(0,type==='call'?s-strike:strike-s)
 if(years===0)return payoff(spot)
 if(spot===0)return type==='call'?0:Math.max(strike,strike*Math.exp(-rate*years))
 const dt=years/steps,u=Math.exp(iv*Math.sqrt(dt)),d=1/u,p=(Math.exp((rate-yieldRate)*dt)-d)/(u-d),discount=Math.exp(-rate*dt)
 if(p<0||p>1)throw Error('Lattice probability outside bounds; revise assumptions')
 const values=Array.from({length:steps+1},(_,j)=>payoff(spot*u**j*d**(steps-j)))
 for(let i=steps-1;i>=0;i--)for(let j=0;j<=i;j++)values[j]=Math.max(payoff(spot*u**j*d**(i-j)),discount*(p*values[j+1]+(1-p)*values[j]))
 if(!Number.isFinite(values[0]))throw Error('Nonfinite model estimate')
 return values[0]
}
export function optionScenario(c,{side='long',contracts=1,entry,target,elapsedDays=0,ivChange=0,fees=0,rate=0,yieldRate=0,now=Date.now()}) {
 validateOptionIdentity({details:{ticker:c.symbol,strike_price:c.strike,expiration_date:c.expiry,contract_type:c.type}},c.underlying)
 if(c.exerciseStyle!=='american'||c.sharesPerContract!==100)throw Error('Model supports verified standard 100-share American contracts only')
 if(!['long','short'].includes(side)||!Number.isInteger(contracts)||contracts<1||contracts>10000||![entry,target,elapsedDays,ivChange,fees,rate,yieldRate].every(Number.isFinite)||entry<=0||target<0||fees<0||elapsedDays<0)throw Error('Invalid position or scenario inputs')
 const remaining=(expiryInstant(c.expiry)-now)/86400000
 if(remaining<=0||elapsedDays>remaining)throw Error('Scenario time exceeds remaining contract life')
 const model={spot:target,strike:c.strike,type:c.type,years:(remaining-elapsedDays)/365,iv:c.iv+ivChange,rate,yieldRate}
 const value=americanPrice(model),size=100*contracts,sign=side==='long'?1:-1,pnl=sign*(value-entry)*size-fees
 const maxLoss=side==='long'?entry*size+fees:c.type==='call'?null:(c.strike-entry)*size+fees
 const maxProfit=side==='short'?entry*size-fees:c.type==='call'?null:(c.strike-entry)*size-fees
 return {value,pnl,returnPct:side==='long'?pnl/(entry*size)*100:null,returnBasis:side==='long'?'Premium paid':'Unavailable: short-option collateral/margin not supplied',breakeven:c.strike+(c.type==='call'?1:-1)*(entry+sign*fees/size),maxLoss,maxProfit,
 thetaDay:sign*(americanPrice({...model,years:Math.max(0,model.years-1/365)})-value)*size,
 ivPoint:model.iv+.01<=5?sign*(americanPrice({...model,iv:model.iv+.01})-value)*size:null,
 assumptions:`200-step American CRR; constant IV, rate ${(rate*100).toFixed(2)}%, continuous yield ${(yieldRate*100).toFixed(2)}%; 16:00 New York expiry assumption. Discrete dividends, settlement nuances, slippage and commissions beyond entered fees are not modeled. Early exercise approximated on lattice; short positions carry early assignment risk. P&L estimates are not quotes; no dealer or trade-direction assumption.`}
}
