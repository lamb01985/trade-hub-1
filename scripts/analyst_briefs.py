"""Deterministic analyst interpretation of existing Phase 2 results, not a signal engine."""
from datetime import date, datetime, time, timezone
from hashlib import sha256
from zoneinfo import ZoneInfo

VERSION = 'analyst-brief-v1'

def n(value):
    return 'unavailable' if value is None else f'{value:,.2f}'

def pct(value):
    return 'unavailable' if value is None else f'{value * 100:.2f}%'

def scenario(report, symbol, side, feature):
    completed = feature.get('completed_session', {})
    trigger = completed.get('high' if side == 'bullish' else 'low')
    levels = sorted(set(feature.get('support_resistance', [])), reverse=side == 'bearish')
    targets = [v for v in levels if trigger is not None and (v > trigger if side == 'bullish' else v < trigger)][:2]
    name = 'Bullish break and hold' if side == 'bullish' else 'Bearish break and hold'
    direction = 'above' if side == 'bullish' else 'below'
    opposite = 'below' if side == 'bullish' else 'above'
    identity = f'{VERSION}|{report["report_id"]}|{symbol}|{side}|{trigger}'
    return {'id': sha256(identity.encode()).hexdigest()[:24], 'name': name, 'direction': side,
            'validation': 'RESEARCH_HYPOTHESIS_NOT_VALIDATED', 'trigger': trigger, 'reference_targets': targets,
            'level_source': 'Completed-session high/low from the archived October 23 adjusted daily bar.',
            'confirmation': f'If fresh current-session observations show a completed 5-minute break {direction} {n(trigger)}, require a successful retest, price on the same side of current-session VWAP, and aligned volume and relative strength. None is confirmed by this Friday snapshot.' if trigger is not None else 'A dated reference level is unavailable. No numeric hypothesis can be specified.',
            'invalidation': f'A completed 5-minute close back {opposite} {n(trigger)} or a failed retest invalidates the hypothesis. Stand aside if current quotes, VWAP, volume or relative strength are missing or conflict.' if trigger is not None else 'Do not evaluate until a timestamped reference level is supplied.',
            'interpretation': 'New conditional analyst hypothesis using supplied reference levels, not a directional signal produced or validated by the Phase 2 engine.'}

def build_briefs(report):
    result = []
    for symbol, f in report['daily_features'].items():
        o = next((x for x in report['options_flow_intelligence'] if x['symbol'] == symbol), None)
        intraday = next((x for x in report['intraday_playbook'] if x['symbol'] == symbol), None)
        swing = next((x for x in report['swing_playbook'] if x['symbol'] == symbol), None)
        completed = f.get('completed_session', {})
        equity_time = f['source_timestamp']
        sections = [
            {'id': 'facts', 'title': 'Observed facts and timestamps', 'paragraphs': [
                f'{symbol} closed at {n(f.get("close"))} in the completed {f.get("session_date", "source")} session. Archived high / low: {n(completed.get("high"))} / {n(completed.get("low"))}. Daily trend: {f.get("daily_trend")}; weekly trend: {f.get("weekly_trend")}; market regime: {report["market_regime"]["label"]}.',
                f'Equity daily window starts at {equity_time}; completed-session close is {f.get("session_close", "unavailable")}. Report generated {report["generated_at"]}; cutoff {report["observation_cutoff"]}. These are Friday-close observations for Monday preparation.']},
        ]
        if o:
            position = o['positioning']
            rows = sorted(position['by_strike'], key=lambda r: r['open_interest'], reverse=True)[:3]
            concentrations = '; '.join(f'{r["type"]} strike {n(r["strike"])}: {n(r["open_interest"])} OI' for r in rows)
            history = o['data_quality'].get('snapshot_history_status', 'UNAVAILABLE')
            sections.append({'id': 'positioning', 'title': 'Positioning concentrations and changes', 'paragraphs': [
                f'The largest observed strike/type OI rows, aggregated across the {len(o["expirations"])} included expirations, are {concentrations}. This identifies concentrations, not directional sentiment or guaranteed support/resistance.',
                f'Options source cutoff: {o["source_cutoff"]}. {o["contracts_observed"]} contracts were observed. Snapshot history is {history}. ' + ('OI changes are unavailable because there is no comparable prior stored snapshot.' if history == 'FIRST_SNAPSHOT' else 'Contract-level changes are not supplied in this sanitized fixture; no change is inferred.'),
                'Put/call OI does not identify institutions, trade intent or which side owns an exposure. Dealer gamma signs remain hypothetical assumptions.']})
            unusual = o['unusual_activity']['contracts']
            baseline = [r for r in unusual if r.get('baseline_status') == 'SUFFICIENT']
            flagged = [r for r in unusual if r.get('flagged')]
            flow = o['trade_flow']
            sections.append({'id': 'unusual', 'title': 'Unusual activity, baseline and sample completeness', 'paragraphs': [
                f'{len(flagged)} backend flags among {len(baseline)} contracts with sufficient daily-volume baselines; {len(unusual)-len(baseline)} contracts lack sufficient baselines. The minimum is {o["unusual_activity"]["minimum_baseline_observations"]} observations. Baseline coverage is selected and limited, so this is not an exhaustive unusual-activity screen.',
                '; '.join(f'{r["ticker"]}: {n(r["volume_baseline_ratio"])}x historical mean from {r["baseline_observations"]} observations' for r in flagged[:3]) or 'No backend flags with adequate baselines are supplied. That is not evidence of normal activity for unmeasured contracts.',
                f'Flow sample: {flow.get("sampled_trades", "unavailable")} trades and {flow.get("sampled_quotes", "unavailable")} quotes for {flow.get("ticker", "an unavailable contract")}. Trade pagination complete: {flow.get("trades_pagination_complete", False)}; quote pagination complete: {flow.get("quotes_pagination_complete", False)}. It is a bounded historical sample, not real-time options flow or total market activity. Aggressor-side classification is an estimate, not opening/closing intent.']})
            vol = o['volatility']
            moves = '; '.join(f'{r["expiration"]}: ATM {n(r.get("atm_strike"))}, straddle midpoint move {n(r.get("straddle_midpoint_expected_move"))} price units' for r in vol.get('expected_moves', []))
            sections.append({'id': 'volatility', 'title': 'Volatility and option-pricing context', 'paragraphs': [
                moves or 'Expected moves are unavailable.',
                f'Chain mean IV: {pct(vol.get("current_chain_mean_iv"))}; 20-day annualized realized volatility: {pct(vol.get("realized_volatility_20d_annualized"))}. These measure different horizons; no cheap/expensive-option conclusion follows automatically.',
                f'IV history: {vol.get("history_status", "UNAVAILABLE")}, {vol.get("iv_history_observations", 0)} observations. IV rank: {n(vol.get("iv_rank"))}; percentile: {n(vol.get("iv_percentile"))}. Expected moves are quote-derived estimates, not probability bounds or price targets.']})
        else:
            for key, title in [('positioning', 'Positioning concentrations and changes'), ('unusual', 'Unusual activity, baseline and sample completeness'), ('volatility', 'Volatility and option-pricing context')]:
                sections.append({'id': key, 'title': title, 'paragraphs': ['Options evidence is not supplied for this symbol. No positioning, flow or pricing conclusion is inferred.']})
        sections.append({'id': 'confirmation', 'title': 'Underlying price, volume and relative strength', 'paragraphs': [
            f'Completed-session close {n(f.get("close"))}; RSI 14 {n(f.get("rsi14"))}; daily volume / prior 20-day mean {n(f.get("volume_ratio_20d"))}; 20-day relative return versus SPY {n(f.get("relative_strength_20d_vs_spy_pct"))} percentage points. These are backward-looking context, not current confirmation.',
            f'Phase 2 intraday context: {intraday["direction"] if intraday else "unavailable"}; trigger {n(intraday.get("trigger")) if intraday else "unavailable"}; invalidation {n(intraday.get("invalidation")) if intraday else "unavailable"}. Swing context: {swing["direction"] if swing else "unavailable"}. A neutral row is not a trade setup.',
            'Current-session opening range, VWAP, live relative volume, execution quotes and relative strength have not been confirmed by this snapshot. Options observations cannot override price invalidation.']})
        limits = ['Observation confidence is limited to the timestamped values as recorded. Source timestamps are visible, but provider facts have not been independently audited. This is not a statistical confidence interval or a probability of profit.',
                  'Historical validation: NOT VALIDATED. There is no out-of-sample evidence or realized performance claim for the analyst scenarios.',
                  'Friday data cannot establish Monday trade readiness. Stale quotes, first-snapshot OI, limited baselines and bounded flow reduce the scope of conclusions.']
        limits += [w for w in report.get('data_quality', {}).get('warnings', []) if w.startswith(symbol + ':')]
        limits += [f'{e.get("component", "Source")} unavailable for {symbol}.' for e in report.get('data_errors', []) if e.get('symbol') == symbol]
        if not o:
            limits.append('Options data is missing for this symbol.')
        sections.append({'id': 'limitations', 'title': 'Limitations and observation confidence', 'paragraphs': limits})
        opening = datetime.combine(date.fromisoformat(report['report_date']), time(9, 30), ZoneInfo('America/New_York')).astimezone(timezone.utc).isoformat()
        result.append({'schema_version': VERSION, 'symbol': symbol, 'report_id': report['report_id'],
            'report_date': report['report_date'], 'session_open': opening, 'source_cutoff': report['observation_cutoff'],
            'headline': f'{symbol}: {f.get("daily_trend", "unknown").lower()} daily / {f.get("weekly_trend", "unknown").lower()} weekly context. Wait for fresh price confirmation.',
            'observation_confidence': 'LIMITED_HISTORICAL_COVERAGE', 'historical_validation': 'NOT_VALIDATED',
            'sections': sections, 'scenarios': [scenario(report, symbol, side, f) for side in ('bullish', 'bearish')]})
    return result
