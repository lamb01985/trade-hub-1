"""Make an allowlisted local fixture from the real Phase 2 report. No network calls."""
import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT.parent / 'trade-decision-engine/data/market_intelligence_reports/market_map_2026-10-26.json'

def pick(value, keys):
    return {key: value[key] for key in keys if key in value}

def sanitize(raw):
    result = pick(raw, ('schema_version', 'report_id', 'report_date', 'generated_at', 'observation_cutoff', 'market_regime', 'intraday_playbook', 'swing_playbook'))
    if result.get('report_date') != '2026-10-26' or result.get('schema_version') != 'market-intelligence-v1':
        raise ValueError('Expected the actual October 26 Phase 2 report')
    result['daily_features'] = {symbol: pick(f, ('symbol', 'source_timestamp', 'session_date', 'session_close', 'close', 'daily_trend', 'weekly_trend', 'previous_day', 'previous_week', 'support_resistance', 'atr14', 'rsi14', 'relative_strength_20d_vs_spy_pct', 'volume_ratio_20d', 'return_20d_pct')) for symbol, f in raw['daily_features'].items()}
    result['intraday_features'] = {symbol: pick(f, ('available', 'source_timestamp', 'vwap', 'opening_range_high', 'opening_range_low', 'frames', 'relative_volume')) for symbol, f in raw['intraday_features'].items()}
    result['options_intelligence'] = []
    result['options_flow_intelligence'] = []
    for o in raw['options_flow_intelligence']:
        safe = pick(o, ('symbol', 'source_cutoff', 'expirations', 'contracts_observed', 'volatility', 'gamma', 'data_quality', 'signal_policy'))
        safe['positioning'] = pick(o['positioning'], ('by_strike', 'by_expiration', 'contracts_missing_open_interest', 'interpretation_limit'))
        safe['unusual_activity'] = o['unusual_activity']
        safe['trade_flow'] = pick(o['trade_flow'], ('status', 'ticker', 'sampled_trades', 'sampled_quotes', 'classification_counts', 'trades_pagination_complete', 'quotes_pagination_complete', 'limitations'))
        result['options_flow_intelligence'].append(safe)
    result['data_quality'] = {'warnings': raw['data_quality'].get('warnings', [])}
    result['data_errors'] = [pick(e, ('symbol', 'component')) for e in raw.get('data_errors', [])]
    result['local_sample_provenance'] = {'source_sha256': hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest(), 'policy': 'Local derived analytics fixture only. Raw quotes, trades, broker data and secrets are excluded.'}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    raw = json.loads(args.source.read_text())
    safe = sanitize(raw)
    source_db = ROOT.parent / 'trade-decision-engine/data/market_intelligence.sqlite3'
    if source_db.is_file():
        with sqlite3.connect(source_db.resolve().as_uri() + '?mode=ro', uri=True) as db:
            for symbol, f in safe['daily_features'].items():
                rows = db.execute('SELECT payload_json FROM source_batches WHERE symbol=? AND adjusted=1 ORDER BY last_timestamp DESC', (symbol,)).fetchall()
                for (content,) in rows:
                    match = next((bar for bar in json.loads(content) if bar['timestamp'].startswith('2026-10-23T')), None)
                    if match:
                        f['completed_session'] = pick(match, ('timestamp', 'open', 'high', 'low', 'close'))
                        break
    from analyst_briefs import build_briefs
    safe['analyst_briefs'] = build_briefs(safe)
    from analyst_desk import build_desk
    for brief in safe['analyst_briefs']:
        quote_source = next((o for o in raw.get('options_intelligence', []) if o['symbol'] == brief['symbol']), None)
        brief['desk'] = build_desk(safe, brief, quote_source)
    workspace_path = ROOT / 'private-reports/options-workspace.json'
    workspace_path.parent.mkdir(mode=0o700, exist_ok=True)
    interpreter = ROOT.parent / 'trade-decision-engine/.venv/bin/python'
    if interpreter.is_file():
        subprocess.run([str(interpreter), str(ROOT / 'scripts/options_workspace.py'), '--source', str(args.source), '--archive', str(source_db), '--output', str(workspace_path)], check=True)
        safe['options_workspace'] = json.loads(workspace_path.read_text())
    text = json.dumps(safe, indent=2)
    if re.search(r'sk-ant-[A-Za-z0-9]|apiKey["\s]*:|access_token|refresh_token|account_number|account_hash', text):
        raise ValueError('Credential or broker field detected; fixture was not written')
    path = ROOT / 'private-reports/october-26.json'
    path.parent.mkdir(mode=0o700, exist_ok=True)
    path.write_text(text + '\n')
    path.chmod(0o600)
    print(f'Sanitized local-only sample: {path} ({path.stat().st_size} bytes). Never deploy this fixture publicly.')


if __name__ == '__main__':
    main()
