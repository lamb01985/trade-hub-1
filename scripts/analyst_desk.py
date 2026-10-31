"""Educational desk presentations and bounded historical pricing scenarios in Python."""
import math
from datetime import datetime

FEE_PER_CONTRACT_PER_SIDE = 0.65
MULTIPLIER = 100

def fmt(value):
    return 'unavailable' if value is None else f'{value:,.2f}'

def historical_pnl(legs, stock_change, iv_change_points, elapsed_days, fee=FEE_PER_CONTRACT_PER_SIDE):
    """Local Greek Taylor approximation with observed spread/fee assumptions, never a fill."""
    if not legs or not all(math.isfinite(x) for x in (stock_change, iv_change_points, elapsed_days, fee)) or elapsed_days < 0 or elapsed_days > .25 or abs(iv_change_points) > 1 or fee < 0:
        raise ValueError('Scenario is outside the bounded educational model')
    total = 0.0
    for leg in legs:
        if leg['side'] not in (-1, 1):
            raise ValueError('Leg side must be long or short')
        values = [leg.get('bid'), leg.get('ask'), leg.get('midpoint'), leg.get('iv'), *[leg.get('greeks', {}).get(k) for k in ('delta', 'gamma', 'theta', 'vega')]]
        if any(not isinstance(x, (int, float)) or not math.isfinite(x) for x in values) or leg['bid'] < 0 or leg['ask'] < leg['bid'] or leg['iv'] <= 0 or leg.get('quote_stale', True) or not leg.get('liquidity_pass'):
            raise ValueError('Usable observed quote, liquidity and all Greeks are required')
        g = leg['greeks']
        mark = leg['midpoint'] + g['delta'] * stock_change + .5 * g['gamma'] * stock_change ** 2 + g['vega'] * iv_change_points + g['theta'] * elapsed_days
        if mark < 0:
            raise ValueError('Taylor estimate left the nonnegative option-price domain')
        half_spread = (leg['ask'] - leg['bid']) / 2
        exit_price = max(0, mark - half_spread) if leg['side'] == 1 else mark + half_spread
        entry = leg['ask'] if leg['side'] == 1 else leg['bid']
        total += leg['side'] * (exit_price - entry) * MULTIPLIER - 2 * fee
    return round(total, 2)

def quant_context(source):
    result = {'status': 'UNAVAILABLE', 'summary': 'A model needs consistent dated quotes, complete price sensitivities and liquidity evidence. No executable price is available in this historical preview.', 'assumptions': [
        'Historical quotes only. No current bid, ask or executable combination price is claimed.',
        'Price estimate = midpoint + delta × stock change + 0.5 × gamma × stock change squared + vega × volatility-point change + theta × elapsed days.',
        'Unit assumptions: delta/gamma per dollar stock move, theta per calendar day and vega per one percentage point of implied volatility. Provider unit conventions must be independently verified before operational use.',
        'One contract per leg, 100-share multiplier, entry at observed ask for a long and bid for a short; modeled exit uses the original half-spread. No midpoint fills assumed.',
        f'Fees assumed ${FEE_PER_CONTRACT_PER_SIDE:.2f} per contract per side. Real commissions, slippage and market impact can differ.',
        'Small shocks only: stock ±0.1%, volatility ±1 percentage point, time 0.25 calendar day. Greeks are frozen; skew, rates, dividends, jumps, American exercise and changing spreads are not modeled.',
        'Do not extrapolate these local estimates to large moves or expiry. Early assignment and legging risk remain relevant for spreads.'], 'comparisons': []}
    if not source:
        return result
    spot = source.get('underlying_price')
    if not isinstance(spot, (int,float)) or not math.isfinite(spot) or spot <= 0:
        return result
    candidates = [c for c in source.get('contracts', []) if c.get('type') == 'call' and c.get('liquidity_pass') and not c.get('quote_stale') and all(isinstance(c.get('greeks', {}).get(k),(int,float)) and math.isfinite(c['greeks'][k]) for k in ('delta','gamma','theta','vega')) and c.get('iv') is not None and c.get('quote_timestamp')]
    candidates.sort(key=lambda c:abs(c['strike']-spot))
    if not candidates:
        return result
    long = candidates[0]
    short = next((c for c in sorted(candidates,key=lambda c:c['strike']) if c['strike']>long['strike'] and c['expiration']==long['expiration']),None)
    structures=[('Outright long call',[dict(long,side=1)])]
    if short:
        debit=long['ask']-short['bid'];width=short['strike']-long['strike']
        if 0 < debit < width:
            structures.append(('Defined-risk call debit spread',[dict(long,side=1),dict(short,side=-1)]))
    for label,legs in structures:
        debit=sum(leg['side']*(leg['ask'] if leg['side']==1 else leg['bid']) for leg in legs)
        fees=2*FEE_PER_CONTRACT_PER_SIDE*len(legs)
        scenarios=[]
        for label_case, ds, div in [('Stock up, volatility down',spot*.001,-1),('Stock unchanged, time passes',0,0),('Stock down, volatility up',-spot*.001,1)]:
            try: pnl=historical_pnl(legs,ds,div,.25)
            except ValueError: pnl=None
            scenarios.append({'label':label_case,'stock_change':round(ds,4),'iv_change_points':div,'elapsed_days':.25,'estimated_pnl_usd':pnl})
        result['comparisons'].append({'label':label,'legs':[{'ticker':l['ticker'],'side':'long' if l['side']==1 else 'short','strike':l['strike'],'expiration':l['expiration'],'bid':l['bid'],'ask':l['ask'],'iv':l['iv'],'greeks':l['greeks'],'source_timestamp':l['quote_timestamp']} for l in legs],
            'entry_debit_usd':round(debit*MULTIPLIER,2),'round_trip_fees_usd':round(fees,2),'maximum_loss_usd':round(debit*MULTIPLIER+fees,2),'maximum_gain_usd':round((short['strike']-long['strike']-debit)*MULTIPLIER-fees,2) if len(legs)==2 else None,
            'risk_limit_note':'Expiry intrinsic-value bound with assumed round-trip fees, not a guarantee of realized loss in an unmanaged short-leg assignment.', 'scenarios':scenarios})
    result['status']='HISTORICAL_EDUCATIONAL_ESTIMATE'
    result['summary']='Compare a historical long call with an available same-expiry defined-risk spread. Estimates are conditional on frozen Greeks and assumed execution costs; no structure is recommended.'
    return result

def build_desk(report, brief, quote_source=None):
    symbol=brief['symbol'];f=report['daily_features'][symbol]
    o=next((x for x in report['options_flow_intelligence'] if x['symbol']==symbol),None)
    high=f.get('completed_session',{}).get('high');low=f.get('completed_session',{}).get('low')
    peers='; '.join(f'{s}: {report["daily_features"][s].get("daily_trend", "unavailable").lower()}' for s in ('QQQ','SPY','IWM','SMH') if s in report['daily_features'])
    move=o['volatility'].get('expected_moves',[]) if o else []
    first=move[0] if move else {}
    baseline=o['unusual_activity']['contracts'] if o else []
    adequate=sum(r.get('baseline_status')=='SUFFICIENT' for r in baseline)
    concentration=sorted(o['positioning']['by_strike'],key=lambda r:r['open_interest'],reverse=True)[:1] if o else []
    top=concentration[0] if concentration else None
    importance=f'Friday high {fmt(high)} and low {fmt(low)} are reference boundaries for testing a fresh break and retest, not automatic entry prices.'
    if top:importance+=f' The largest observed row is {top["type"]} strike {fmt(top["strike"])} with {fmt(top["open_interest"])} outstanding contracts across the included expirations; it identifies a concentration, not investor direction.'
    options=f'The nearest supplied expiration, {first.get("expiration", "unavailable")}, has an at-the-money call-plus-put midpoint of {fmt(first.get("straddle_midpoint_expected_move"))} price units. This is the engine\'s expected-move estimate, not a forecast or probability range.' if o else 'Options observations are missing for this symbol; no options-market interpretation is available.'
    if o:options+=f' Only {adequate} of {len(baseline)} contracts have adequate historical-volume comparisons. The bounded flow sample does not establish broad buying or selling pressure.'
    simple=[
        {'id':'big_picture','title':'The Big Picture','text':f'{symbol} finished Friday at {fmt(f.get("close"))}. Its daily trend is {f.get("daily_trend", "unknown").lower()}, while its weekly trend is {f.get("weekly_trend", "unknown").lower()}. The market regime is {report["market_regime"]["label"].lower()}, so fresh price confirmation matters more than a one-sided story.','teach':'A daily trend and a weekly trend can disagree. That disagreement is uncertainty to manage, not proof of a reversal.'},
        {'id':'matters','title':'What Matters Today','text':importance+' Catalysts are not verified in this saved report. Equity-fund checks are '+peers+'. Rates, currencies and credit data are not supplied, so broad cross-asset confirmation is unavailable.','teach':'A strike is an option contract\'s exercise price. Open interest counts outstanding contracts; every contract has both a long and a short holder.'},
        {'id':'options_message','title':'What the Options Market Is Telling Us','text':options,'teach':'At-the-money means the strike nearest the underlying price. Implied volatility is the movement assumption embedded in option prices. A midpoint is between bid and ask; it is not a guaranteed fill.'},
        {'id':'change','title':'What Would Change the Outlook','text':f'Bullish research needs a fresh break above {fmt(high)} and a successful retest; bearish research needs a break below {fmt(low)} and a successful retest. A close back through the broken boundary invalidates that case. Require current price, trading volume and relative strength to agree; Friday\'s snapshot cannot confirm Monday.','teach':'Invalidation is evidence that makes your hypothesis fail. Write it before observing the outcome, and consider the opposite explanation.'},
        {'id':'plan','title':'What To Do','text':'Treat this as a preparation map. Choose a conditional hypothesis, write its counterargument and invalidation, and wait for fresh evidence. If quotes or confirmation are missing, stand aside. Compare spread, fees, liquidity and maximum loss before any later trade decision. No strategy here has demonstrated a validated edge.','teach':'A defined-risk spread limits theoretical expiry payoff under stated assumptions, but execution costs and short-leg assignment can still matter. A plausible story is not an out-of-sample result.'},
    ]
    questions=[
        ('structure','Reading a mixed market',f'In this saved report, {symbol} has {f.get("daily_trend", "unknown").lower()} daily and {f.get("weekly_trend", "unknown").lower()} weekly structure. What is supported?', ['The disagreement requires fresh confirmation.','The next session must reverse.','The weekly trend guarantees the intraday result.'],0,'Different horizons can disagree. Neither provides certainty about the next session.'),
        ('positioning','What outstanding contracts do and do not tell you',f'The saved {symbol} report '+(f'contains a concentration at strike {fmt(top["strike"])}.' if top else 'has no supplied option concentrations.'),['The holder is a large institution.','The concentration alone proves directional sentiment.','Concentration is observed; owner, intent and direction are not established.'],2,'An outstanding option has a buyer and a seller. Open interest alone does not identify ownership or sentiment.'),
        ('pricing','A quoted range is not a guaranteed move',f'The nearest supplied {symbol} expected-move estimate is {fmt(first.get("straddle_midpoint_expected_move"))} price units, observed on Friday.', ['That is a guaranteed trading range.','It is a quote-derived estimate; spreads, time and volatility still matter.','It is the exact profit of an option trade.'],1,'The call-plus-put midpoint is an option-pricing observation, not a validated probability interval or executable P&L.'),
        ('risk','Separate a good explanation from a tested edge',f'This {symbol} analyst case is marked NOT_VALIDATED. Its unusual-activity baseline covers {adequate} of {len(baseline)} supplied contracts.', ['Save the reasoning, challenge it and evaluate future outcomes with costs.','Count the missing baselines as normal activity.','Treat a correct quiz answer as proof the strategy works.'],0,'A research hypothesis needs future evaluation, realistic costs and held-out evidence. Missing data is uncertainty, not evidence of absence.'),
    ]
    lessons=[{'id':id,'title':title,'context':context,'choices':choices,'correct_index':correct,'explanation':explanation,'source_cutoff':brief['source_cutoff'],'report_id':brief['report_id']} for id,title,context,choices,correct,explanation in questions]
    return {'schema_version':'analyst-desk-v1','simple_sections':simple,'quant':quant_context(quote_source),
        'flow_detail':{'summary':'Existing Phase 2 flow estimates and option volatility observations are available in the evidence sections. They do not establish institutional identity or verified dealer inventory.', 'skew_note':'Skew compares implied volatility across strikes. Supplied delta/skew observations are descriptive and not a matched, constant-delta surface fit.', 'term_note':'Term structure compares expirations. The supplied chain-average volatility is not a constant-maturity or at-the-money volatility curve.', 'vanna_charm_status':'UNAVAILABLE: vanna (delta sensitivity to volatility) and charm (delta sensitivity to time) are not supplied by this engine. Computing exposures requires a stated pricing model, units, carry inputs and assumed inventory signs. No values are invented.', 'gamma_note':'Existing gamma concentrations are inventory-sign scenarios, not verified dealer positioning.'},
        'validation':{'status':'NOT_VALIDATED','validated_samples':0,'confidence_interval':None,'out_of_sample_result':None,'multiple_testing_status':'NOT_RUN','reason':'No independently evaluated analyst-scenario dataset was supplied. Browser manual notes are not validation evidence.', 'requirements':['Freeze signal, input checksum, calculation version and timestamp before the outcome.','Use later timestamped bars; retain ambiguous trigger/stop/target order and non-triggered cases.','Model bid/ask, fees, slippage, liquidity, expiry and assignment constraints.','Pre-register hypotheses and hold out later time periods; avoid overlapping-label leakage.','Segment by pre-specified regimes; report sample sizes and uncertainty.','Track all tested variants and use a pre-specified multiple-testing correction. No strategy is proven by this prototype.']},
        'training':lessons,'provenance':{'report_id':brief['report_id'],'source_cutoff':brief['source_cutoff'],'calculation_version':'analyst-desk-v1','mode':'HISTORICAL_LOCAL_RESEARCH','catalysts':'NOT_VERIFIED','cross_asset':'EQUITY_ETFS_ONLY'}}
