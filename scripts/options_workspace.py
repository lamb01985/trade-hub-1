"""Per-expiration presentation adapter using the existing Python Phase 2 analytics."""
import argparse
import json
import math
import sqlite3
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ENGINE_ROOT = Path(__file__).resolve().parents[2] / 'trade-decision-engine'
sys.path.insert(0, str(ENGINE_ROOT))
from app.options_flow_engine import positioning, gamma_scenarios
from app.market_intelligence import options_report, _provider_timestamp

ET = ZoneInfo('America/New_York')

def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def expiry_groups(expirations, report_date):
    days = sorted(set(expirations))
    fridays = [d for d in days if date.fromisoformat(d).weekday() == 4]
    monthly = [d for d in fridays if 15 <= date.fromisoformat(d).day <= 21]
    return {'zero_dte': report_date if report_date in days else None,
            'next': next((d for d in days if d > report_date), None),
            'weekly': next((d for d in fridays if d not in monthly), None),
            'monthly': monthly[0] if monthly else None,
            'classification': 'Calendar grouping only. 0DTE is relative to the report trading session, not the source observation date or the current clock.'}

def compatible_prior(prior, current_cutoff):
    if not prior:
        return None
    try:
        observed = datetime.fromisoformat(prior['observed_at'])
        current = datetime.fromisoformat(current_cutoff)
        if observed.tzinfo is None or current.tzinfo is None or observed.astimezone(ET).date() >= current.astimezone(ET).date():
            return None
        return prior
    except (ValueError, KeyError, TypeError):
        return None

def contract_identity(item):
    d = item.get('details') or {}
    return tuple(d.get(k) for k in ('ticker', 'strike_price', 'contract_type', 'expiration_date', 'shares_per_contract', 'exercise_style', 'currency'))

def build_expiration(base, chain, expiry, report, phase1, prior=None):
    prior = compatible_prior(prior, base['source_cutoff'])
    previous = {}
    if prior:
        for item in prior['contracts']:
            d=item.get('details') or {}
            if d.get('expiration_date') == expiry and finite(item.get('open_interest')):
                previous[contract_identity(item)] = item['open_interest']
    previous_by_ticker = {d['details']['ticker']: previous[contract_identity(d)] for d in chain if contract_identity(d) in previous}
    pos = positioning(chain, previous_by_ticker)
    delta_by_ticker = {x['ticker']:x['open_interest_change'] for x in pos['contract_changes']}
    groups = defaultdict(list)
    for item in chain:
        d = item['details']
        if finite(d.get('strike_price')) and d.get('contract_type') in ('call','put'):
            groups[(d['strike_price'],d['contract_type'])].append(item)
    pos_values = {(r['strike'],r['type']):r['open_interest'] for r in pos['by_strike']}
    strikes=[]
    for strike in sorted({key[0] for key in groups}):
        row={'strike':strike}
        for side in ('call','put'):
            items=groups.get((strike,side),[])
            known=bool(items) and all(finite(x.get('open_interest')) and x['open_interest']>=0 for x in items)
            changes=[delta_by_ticker.get(x['details']['ticker']) for x in items]
            row[side+'_oi'] = pos_values.get((strike,side)) if known else None
            row[side+'_change'] = sum(changes) if known and changes and all(finite(x) for x in changes) else None
            row[side+'_status'] = 'OBSERVED' if known else 'MISSING_OI' if items else 'NOT_OBSERVED'
        strikes.append(row)
    daily = report['daily_features'][base['symbol']]
    underlying = phase1.get('underlying_price') if phase1 else None
    underlying_time = phase1.get('underlying_market_timestamp') if phase1 else None
    if not finite(underlying):
        underlying=daily.get('close');underlying_time=daily.get('session_close')
    snapshot = {'lastTrade': {'p':underlying}}
    if underlying_time:
        snapshot['lastTrade']['t'] = int(datetime.fromisoformat(underlying_time).timestamp()*1_000_000_000)
    liquidity = options_report(base['symbol'], snapshot, expiry, chain)
    contract_lookup = {x['details']['ticker']:x['details'] for x in chain}
    activity = [x for x in base['unusual_activity']['contracts'] if x.get('ticker') in contract_lookup]
    sufficient = [x for x in activity if x.get('baseline_status')=='SUFFICIENT']
    flags = [x for x in activity if x.get('flagged')]
    sample_ticker = base['trade_flow'].get('ticker')
    sample_here = sample_ticker in contract_lookup
    flow = {k:v for k,v in base['trade_flow'].items() if k!='evidence'} if sample_here else {'status':'UNAVAILABLE_FOR_SELECTED_EXPIRATION','reason':'The saved bounded flow sample belongs to another expiration, or no contract-level sample is supplied.'}
    quotes = [x['quote_timestamp'] for x in liquidity['contracts'] if x.get('quote_timestamp')]
    latest_quote = max(quotes, key=lambda x:datetime.fromisoformat(x)) if quotes else None
    vol = base['volatility']
    expected = next((x for x in vol.get('expected_moves',[]) if x['expiration']==expiry),None)
    term = next((x for x in vol.get('iv_term_structure',[]) if x['expiration']==expiry),None)
    skew = [x for x in vol.get('delta_skew_observations',[]) if x['expiration']==expiry]
    near = {side:min([x for x in skew if x['type']==side],key=lambda x:abs(abs(x['delta'])-.25),default=None) for side in ('call','put')}
    atm_strike = expected.get('atm_strike') if expected else None
    atm_quotes = [{k:v for k,v in row.items() if k in ('ticker','type','strike','bid','ask','midpoint','spread_pct','quote_timestamp','quote_stale','liquidity_pass','liquidity_failures','open_interest','volume')} for row in liquidity['contracts'] if row['strike']==atm_strike]
    concentrations=sorted(pos['by_strike'],key=lambda x:x['open_interest'],reverse=True)[:3]
    largest='; '.join(f'{x["type"]} {x["strike"]:g}: {x["open_interest"]:,.0f} outstanding contracts' for x in concentrations)
    change_available = any(row['call_change'] is not None or row['put_change'] is not None for row in strikes)
    return {'expiration':expiry, 'source_cutoff':latest_quote,
        'underlying_price':underlying if finite(underlying) else None,'underlying_timestamp':underlying_time,
        'summary':[f'For {expiry}, the largest observed strike/type rows are {largest}.' if concentrations else f'Open-interest concentrations are unavailable for {expiry}.',
                   'A concentration identifies outstanding contracts, not who owns them, directional sentiment or a guaranteed price barrier.',
                   f'{len(flags)} unusual-volume flags have sufficient baselines among {len(sufficient)} measured contracts; {len(activity)-len(sufficient)} contracts have inadequate or missing baselines. This is selected coverage, not an exhaustive activity screen.',
                   'Changes refer to the dated prior snapshot shown below; newly listed or unmeasured contracts have no inferred delta.' if change_available else 'Daily open-interest changes are unavailable: a dated, comparable prior observation is not supplied for these contracts.'],
        'strikes':strikes,'chart_max_oi':max([r[side+'_oi'] for r in strikes for side in ('call','put') if r[side+'_oi'] is not None],default=0),
        'concentrations':concentrations,'open_interest_totals':pos['by_expiration'],
        'change_status':'COMPARABLE_PRIOR_OBSERVATION' if change_available else 'UNAVAILABLE_NO_DATED_COMPARABLE_PRIOR', 'prior_observed_at':prior['observed_at'] if change_available else None,
        'unusual_activity':{'contracts':activity,'baseline_adequate':len(sufficient),'baseline_missing_or_inadequate':len(activity)-len(sufficient),'flagged_count':len(flags),'minimum_observations':base['unusual_activity']['minimum_baseline_observations']},
        'trade_flow':flow,'expected_move':expected,'mean_iv':term.get('median_like_mean_iv') if term else None,'iv_contract_count':term.get('contracts_with_iv') if term else None,
        'skew_observations':skew,'near_25_delta':near,'term_structure':vol.get('iv_term_structure',[]),
        'iv_history_status':vol.get('history_status','UNAVAILABLE'),'iv_rank':None,'iv_percentile':None,
        'iv_rank_limitation':'No comparable per-expiration IV history is supplied. Overall-chain ranks are not substituted for an expiration-specific rank.',
        'realized_volatility':vol.get('realized_volatility_20d_annualized'),
        'liquidity':{'contracts_observed':liquidity['contracts_observed'],'passing_count':liquidity['liquid_contracts'],'quality':liquidity['data_quality'],'atm_quotes':atm_quotes,'rules':liquidity['observations']},
        'gamma':gamma_scenarios(chain,daily['close']) if finite(daily.get('close')) else {'status':'UNAVAILABLE'},
        'gamma_underlying_reference':daily.get('close'),'gamma_reference_timestamp':daily.get('session_close'),
        'observed_strike_min':strikes[0]['strike'] if strikes else None,'observed_strike_max':strikes[-1]['strike'] if strikes else None,
        'coverage_note':'Every saved observed strike for this expiration is shown. The original request was bounded to ±15% of the snapshot underlying price and the three nearest expirations. Outside-window coverage is unknown, not zero. Reconstructed archive completeness is not a new provider entitlement or pagination check.',
        'pagination_status':'ARCHIVED_WINDOW_ONLY_NO_NEW_PAGINATION_CHECK'}

def load_chain(db, symbol, session, cutoff):
    rows=db.execute('SELECT payload_json FROM option_contract_snapshots WHERE symbol=? AND snapshot_date=? AND observed_at=?',(symbol,session,cutoff)).fetchall()
    return [json.loads(r[0]) for r in rows]

def build_workspace(report, archive):
    result={'schema_version':'options-workspace-v1','report_id':report['report_id'],'report_date':report['report_date'],'retrieval_mode':'SAVED_REPORT_AND_MATCHED_ARCHIVE_ONLY','symbols':[]}
    db=sqlite3.connect(Path(archive).resolve().as_uri()+'?mode=ro',uri=True) if archive and Path(archive).is_file() else None
    try:
        for base in report['options_flow_intelligence']:
            symbol=base['symbol']; chain=load_chain(db,symbol,report['report_date'],base['source_cutoff']) if db else []
            expected_tickers={c['ticker'] for c in base['unusual_activity']['contracts'] if c.get('ticker')}
            found_tickers={c.get('details',{}).get('ticker') for c in chain}
            archived_totals = positioning(chain)['by_expiration'] if chain else []
            quote_times = [_provider_timestamp((c.get('last_quote') or {}).get('last_updated')) for c in chain]
            no_future_quotes = all(t is None or t <= datetime.fromisoformat(base['source_cutoff']) for t in quote_times)
            complete=no_future_quotes and len(chain)==base['contracts_observed'] and len(found_tickers)==len(chain) and found_tickers==expected_tickers and archived_totals==base['positioning']['by_expiration']
            entry={'symbol':symbol,'archive_status':'MATCHED_SAVED_WINDOW' if complete else 'ARCHIVE_MISSING_OR_INCOMPLETE','expiry_groups':expiry_groups(base['expirations'],report['report_date']),'expirations':[]}
            if complete:
                phase1=next((x for x in report['options_intelligence'] if x['symbol']==symbol),{})
                prior=None
                if base['data_quality'].get('snapshot_history_status')=='COMPARABLE' and db:
                    dates=db.execute('SELECT DISTINCT observed_at,snapshot_date FROM option_contract_snapshots WHERE symbol=? AND snapshot_date<? AND observed_at<? ORDER BY observed_at DESC',(symbol,report['report_date'],base['source_cutoff'])).fetchall()
                    for cutoff,session in dates:
                        candidate={'observed_at':cutoff,'contracts':load_chain(db,symbol,session,cutoff)}
                        if compatible_prior(candidate,base['source_cutoff']):prior=candidate;break
                for expiry in base['expirations']:
                    filtered=[c for c in chain if c.get('details',{}).get('expiration_date')==expiry]
                    entry['expirations'].append(build_expiration(base,filtered,expiry,report,phase1,prior))
            result['symbols'].append(entry)
    finally:
        if db:db.close()
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True,type=Path);parser.add_argument('--archive',required=True,type=Path);parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    args.output.write_text(json.dumps(build_workspace(json.loads(args.source.read_text()),args.archive),indent=2)+'\n')
    args.output.chmod(0o600)
