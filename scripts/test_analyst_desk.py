import math
import unittest
from analyst_desk import historical_pnl, build_desk, quant_context
from analyst_briefs import build_briefs
from test_analyst_briefs import source


def leg(**updates):
    value=dict(ticker='TEST',bid=1,ask=1.2,midpoint=1.1,iv=.3,greeks=dict(delta=.5,gamma=.1,theta=-.04,vega=.1),quote_stale=False,liquidity_pass=True,strike=100,type='call',expiration='2026-10-26',quote_timestamp='2026-10-23T20:00:00Z',side=1)
    value.update(updates);return value


class DeskTests(unittest.TestCase):
    def test_five_simple_sections_and_source_grounded_lessons(self):
        report=source();brief=build_briefs(report)[0];desk=build_desk(report,brief)
        self.assertEqual([x['title'] for x in desk['simple_sections']],['The Big Picture','What Matters Today','What the Options Market Is Telling Us','What Would Change the Outlook','What To Do'])
        self.assertIn('Rates, currencies and credit data are not supplied',desk['simple_sections'][1]['text'])
        self.assertIn('Catalysts are not verified',desk['simple_sections'][1]['text'])
        self.assertEqual(len(desk['training']),4)
        self.assertEqual(desk['validation']['validated_samples'],0)
        self.assertIsNone(desk['validation']['confidence_interval'])
        self.assertEqual(desk['quant']['status'],'UNAVAILABLE')

    def test_unchanged_market_loses_spread_and_round_trip_fees(self):
        self.assertAlmostEqual(historical_pnl([leg()],0,0,0),-21.3)
        self.assertAlmostEqual(historical_pnl([leg(side=-1)],0,0,0),-21.3)

    def test_greeks_time_volatility_and_fees_have_explicit_effects(self):
        self.assertAlmostEqual(historical_pnl([leg()],1,1,.25),42.7)
        self.assertAlmostEqual(historical_pnl([leg()],0,0,.25),-22.3)
        self.assertAlmostEqual(historical_pnl([leg()],0,0,0,fee=1),-22)

    def test_model_rejects_missing_crossed_stale_and_out_of_domain_inputs(self):
        for bad in [leg(greeks={}),leg(ask=.5),leg(quote_stale=True),leg(iv=None),leg(liquidity_pass=False)]:
            with self.assertRaises(ValueError): historical_pnl([bad],0,0,0)
        for change in [(0,2,0),(0,0,1),(math.inf,0,0)]:
            with self.assertRaises(ValueError):historical_pnl([leg()],*change)

    def test_real_quote_structure_comparison_is_educational_and_spread_bound_includes_fees(self):
        result=quant_context({'underlying_price':100,'contracts':[leg(),leg(ticker='TEST2',strike=101,bid=.4,ask=.5,midpoint=.45)]})
        self.assertEqual(result['status'],'HISTORICAL_EDUCATIONAL_ESTIMATE')
        self.assertEqual(len(result['comparisons']),2)
        spread=result['comparisons'][1]
        self.assertAlmostEqual(spread['maximum_loss_usd'],82.6)
        self.assertAlmostEqual(spread['maximum_gain_usd'],17.4)
        self.assertIn('not a guarantee',spread['risk_limit_note'])

if __name__=='__main__':unittest.main()
