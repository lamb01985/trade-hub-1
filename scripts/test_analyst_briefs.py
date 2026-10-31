import unittest
from analyst_briefs import build_briefs


def source():
    return {'report_id':'synthetic', 'report_date':'2026-10-26', 'generated_at':'2026-10-25T12:00:00+00:00', 'observation_cutoff':'2026-10-23T20:00:00+00:00', 'market_regime':{'label':'MIXED'},
        'daily_features':{'QQQ':{'source_timestamp':'2026-10-23T04:00:00+00:00','session_date':'2026-10-23','close':100,'daily_trend':'MIXED','weekly_trend':'BEARISH','completed_session':{'high':102,'low':98},'support_resistance':[95,98,100,102,105]}},
        'intraday_playbook':[], 'swing_playbook':[], 'options_flow_intelligence':[], 'data_quality':{'warnings':[]}, 'data_errors':[]}


class AnalystTests(unittest.TestCase):
    def test_seven_sections_include_competing_cases_and_missing_options(self):
        brief=build_briefs(source())[0]
        self.assertEqual(brief['historical_validation'],'NOT_VALIDATED')
        self.assertEqual(len(brief['sections'])+1,7)
        self.assertEqual(brief['session_open'],'2026-10-26T13:30:00+00:00')
        self.assertIn('not supplied',brief['sections'][1]['paragraphs'][0])
        bull,bear=brief['scenarios']
        self.assertEqual((bull['trigger'],bear['trigger']),(102,98))
        self.assertEqual((bull['reference_targets'],bear['reference_targets']),([105],[95]))
        self.assertIn('back below 102.00',bull['invalidation'])
        self.assertIn('back above 98.00',bear['invalidation'])
        self.assertNotEqual(bull['id'],bear['id'])
        self.assertEqual(brief,build_briefs(source())[0])

    def test_no_numeric_case_is_invented_without_source_levels(self):
        r=source();r['daily_features']['QQQ'].pop('completed_session')
        brief=build_briefs(r)[0]
        self.assertTrue(all(s['trigger'] is None and not s['reference_targets'] for s in brief['scenarios']))

    def test_first_snapshot_limited_baselines_and_flow_are_explicit(self):
        r=source();r['options_flow_intelligence']=[{'symbol':'QQQ','source_cutoff':r['observation_cutoff'],'contracts_observed':2,'expirations':['2026-10-26'],'positioning':{'by_strike':[{'type':'put','strike':98,'open_interest':400}]},'data_quality':{'snapshot_history_status':'FIRST_SNAPSHOT'},'unusual_activity':{'minimum_baseline_observations':5,'contracts':[{'baseline_status':'MISSING_BASELINE','flagged':False},{'baseline_status':'SUFFICIENT','flagged':True,'ticker':'TEST','volume_baseline_ratio':2,'baseline_observations':5}]},'trade_flow':{'ticker':'TEST','sampled_trades':1,'sampled_quotes':2,'trades_pagination_complete':False,'quotes_pagination_complete':False},'volatility':{}}]
        brief=build_briefs(r)[0];text=' '.join(p for s in brief['sections'] for p in s['paragraphs'])
        self.assertIn('OI changes are unavailable',text)
        self.assertIn('1 contracts lack sufficient baselines',text)
        self.assertIn('not real-time options flow',text)
        self.assertIn('not directional sentiment',text)
        self.assertIn('not a statistical confidence interval',text)

if __name__=='__main__':unittest.main()
