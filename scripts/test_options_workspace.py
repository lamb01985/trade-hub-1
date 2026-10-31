import copy
import json
import tempfile
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch
import options_workspace as workspace

STAMP='2026-10-23T20:00:00+00:00'
NOW_NS=1792785600000000000

def contract(ticker,side,strike,oi,expiry='2026-10-26'):
    return {'details':{'ticker':ticker,'contract_type':side,'strike_price':strike,'expiration_date':expiry,'shares_per_contract':100},'open_interest':oi,'last_quote':{'bid':1,'ask':1.2,'last_updated':NOW_NS},'day':{'volume':100},'greeks':{'delta':.25 if side=='call' else -.25,'gamma':.01,'theta':-.1,'vega':.1},'implied_volatility':.3,'underlying_asset':{'price':100}}

def fixture():
    chain=[contract('CALL','call',100,10),contract('PUT','put',100,20),contract('NEXT','call',101,30,'2026-10-27')]
    base={'symbol':'QQQ','source_cutoff':STAMP,'expirations':['2026-10-26','2026-10-27'],'contracts_observed':3,'positioning':workspace.positioning(chain),'unusual_activity':{'minimum_baseline_observations':5,'contracts':[{'ticker':c['details']['ticker'],'volume':100,'open_interest':c['open_interest'],'baseline_status':'MISSING_BASELINE','baseline_observations':0,'volume_baseline_ratio':None,'flagged':False} for c in chain]},'trade_flow':{'status':'AVAILABLE','ticker':'CALL','sampled_trades':10,'sampled_quotes':20,'trades_pagination_complete':False,'quotes_pagination_complete':False},'volatility':{'expected_moves':[{'expiration':'2026-10-26','atm_strike':100,'straddle_midpoint_expected_move':2.2},{'expiration':'2026-10-27','atm_strike':101,'straddle_midpoint_expected_move':3.3}],'iv_term_structure':[{'expiration':'2026-10-26','median_like_mean_iv':.3,'contracts_with_iv':2},{'expiration':'2026-10-27','median_like_mean_iv':.4,'contracts_with_iv':1}],'delta_skew_observations':[]},'data_quality':{'snapshot_history_status':'FIRST_SNAPSHOT'}}
    report={'report_id':'synthetic','report_date':'2026-10-26','daily_features':{'QQQ':{'close':100,'session_close':STAMP}},'options_flow_intelligence':[base],'options_intelligence':[]}
    return report,base,chain


class WorkspaceTests(unittest.TestCase):
    def test_expiry_selection_does_not_relabel_aggregate_oi_or_flow(self):
        r,b,c=fixture()
        with patch.object(workspace,'positioning',wraps=workspace.positioning) as engine:
            monday=workspace.build_expiration(b,c[:2],'2026-10-26',r,{})
            self.assertTrue(engine.called)
        tuesday=workspace.build_expiration(b,c[2:],'2026-10-27',r,{})
        self.assertEqual(monday['strikes'][0]['call_oi'],10)
        self.assertEqual(tuesday['strikes'][0]['call_oi'],30)
        self.assertEqual(monday['expected_move']['straddle_midpoint_expected_move'],2.2)
        self.assertEqual(tuesday['expected_move']['straddle_midpoint_expected_move'],3.3)
        self.assertFalse(monday['trade_flow']['trades_pagination_complete'])
        self.assertEqual(tuesday['trade_flow']['status'],'UNAVAILABLE_FOR_SELECTED_EXPIRATION')
        self.assertEqual(tuesday['unusual_activity']['baseline_missing_or_inadequate'],1)
        self.assertIn('Outside-window coverage is unknown',monday['coverage_note'])

    def test_missing_oi_is_not_zero_and_all_observed_strikes_remain(self):
        r,b,c=fixture();c[0]['open_interest']=0;c[1]['open_interest']=None
        e=workspace.build_expiration(b,c[:2],'2026-10-26',r,{})
        self.assertEqual(e['strikes'][0]['call_oi'],0)
        self.assertIsNone(e['strikes'][0]['put_oi'])
        self.assertEqual(e['strikes'][0]['put_status'],'MISSING_OI')
        self.assertIsNone(e['strikes'][0]['call_change'])

    def test_changes_require_dated_comparable_contracts_and_do_not_use_same_day_retrievals(self):
        r,b,c=fixture();old=copy.deepcopy(c[:2]);old[0]['open_interest']=8
        prior={'observed_at':'2026-10-22T20:00:00+00:00','contracts':old}
        e=workspace.build_expiration(b,c[:2],'2026-10-26',r,{},prior)
        self.assertEqual(e['strikes'][0]['call_change'],2)
        self.assertEqual(e['strikes'][0]['put_change'],0)
        prior['observed_at']='2026-10-23T19:00:00+00:00'
        e=workspace.build_expiration(b,c[:2],'2026-10-26',r,{},prior)
        self.assertIsNone(e['strikes'][0]['call_change'])
        prior['observed_at']='2026-10-22T20:00:00+00:00';prior['contracts'][0]['details']['shares_per_contract']=10
        e=workspace.build_expiration(b,c[:2],'2026-10-26',r,{},prior)
        self.assertIsNone(e['strikes'][0]['call_change'])

    def test_missing_archives_do_not_fabricate_expiration_splits(self):
        r,_,_=fixture()
        result=workspace.build_workspace(r,None)['symbols'][0]
        self.assertEqual(result['archive_status'],'ARCHIVE_MISSING_OR_INCOMPLETE')
        self.assertEqual(result['expirations'],[])

    def test_mismatched_archive_totals_do_not_publish_reconstructed_data(self):
        r,b,c=fixture()
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'archive.sqlite3'
            with sqlite3.connect(path) as db:
                db.execute('CREATE TABLE option_contract_snapshots (symbol TEXT,snapshot_date TEXT,observed_at TEXT,payload_json TEXT)')
                for item in c: db.execute('INSERT INTO option_contract_snapshots VALUES (?,?,?,?)',('QQQ',r['report_date'],STAMP,json.dumps(item)))
            result=workspace.build_workspace(r,path)['symbols'][0]
            self.assertEqual(len(result['expirations']),2)
            c[0]['open_interest']=999
            with sqlite3.connect(path) as db:
                db.execute('UPDATE option_contract_snapshots SET payload_json=? WHERE rowid=1',(json.dumps(c[0]),))
            result=workspace.build_workspace(r,path)['symbols'][0]
            self.assertEqual(result['archive_status'],'ARCHIVE_MISSING_OR_INCOMPLETE')
            self.assertEqual(result['expirations'],[])

    def test_groups_are_based_on_available_dates_and_report_session(self):
        result=workspace.expiry_groups(['2026-10-26','2026-10-27','2026-10-30','2026-11-20'],'2026-10-26')
        self.assertEqual((result['zero_dte'],result['next'],result['weekly'],result['monthly']),('2026-10-26','2026-10-27','2026-10-30','2026-11-20'))
        self.assertIsNone(workspace.expiry_groups(['2026-10-26'],'2026-10-26')['monthly'])

if __name__=='__main__':unittest.main()
