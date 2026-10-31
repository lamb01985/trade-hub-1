// @vitest-environment jsdom
import React from 'react'
import { render,screen,fireEvent,cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach,it,expect } from 'vitest'
import OptionsIntelligence from '../src/components/intelligence/OptionsIntelligence.jsx'
import { adaptPythonReport,parseReport } from '../src/lib/reportContract.js'
import { pythonReport } from './reportFixture.js'
import { briefFixture } from './analystFixture.js'
function expiration(date,oi,move){return{expiration:date,source_cutoff:'2026-10-23T20:00:00Z',underlying_price:100.5,underlying_timestamp:'2026-10-23T20:00:00Z',summary:[`Saved ${date} positioning only. Concentration is not sentiment.`],strikes:[{strike:100,call_oi:oi,put_oi:null,call_change:null,put_change:null,call_status:'OBSERVED',put_status:'MISSING_OI'},{strike:101,call_oi:0,put_oi:20,call_change:null,put_change:null,call_status:'OBSERVED',put_status:'OBSERVED'}],chart_max_oi:Math.max(oi,20),change_status:'UNAVAILABLE_NO_DATED_COMPARABLE_PRIOR',prior_observed_at:null,unusual_activity:{contracts:[{ticker:'TEST',volume:100,open_interest:oi,baseline_status:'MISSING_BASELINE',baseline_observations:0,volume_baseline_ratio:null,flagged:false}],baseline_adequate:0,baseline_missing_or_inadequate:1,flagged_count:0,minimum_observations:5},trade_flow:date==='2026-10-26'?{status:'AVAILABLE',ticker:'TEST',sampled_trades:10,sampled_quotes:20,trades_pagination_complete:false,quotes_pagination_complete:false,classification_counts:{AMBIGUOUS:10}}:{status:'UNAVAILABLE_FOR_SELECTED_EXPIRATION',reason:'No sample for this expiration.'},expected_move:{expiration:date,atm_strike:100,straddle_midpoint_expected_move:move},mean_iv:null,near_25_delta:{},term_structure:[],liquidity:{contracts_observed:3,passing_count:1,atm_quotes:[],rules:[]},gamma:{},coverage_note:'Every observed strike; outside-window coverage unknown.',pagination_status:'ARCHIVED_WINDOW_ONLY_NO_NEW_PAGINATION_CHECK',observed_strike_min:100,observed_strike_max:101}}
export function workspaceReport(){const r=adaptPythonReport(pythonReport());r.daily_features.SPY={...r.daily_features.QQQ,symbol:'SPY'};r.daily_features.NVDA={...r.daily_features.QQQ,symbol:'NVDA'};r.analyst_briefs=[briefFixture()];r.options_workspace={schema_version:'options-workspace-v1',report_id:r.report_id,report_date:r.report_date,retrieval_mode:'SAVED_REPORT_AND_MATCHED_ARCHIVE_ONLY',symbols:['QQQ','SPY'].map(symbol=>({symbol,archive_status:'MATCHED_SAVED_WINDOW',expiry_groups:{zero_dte:'2026-10-26',next:'2026-10-27',weekly:null,monthly:null,classification:'Report-session date grouping.'},expirations:[expiration('2026-10-26',symbol==='QQQ'?10:50,2.2),expiration('2026-10-27',30,3.3)]}))};return r}
afterEach(cleanup)
it('validates the versioned contract and rejects negative open interest',()=>{const r=workspaceReport();expect(parseReport(r)).toBe(r);r.options_workspace.symbols[0].expirations[0].strikes[0].call_oi=-1;expect(()=>parseReport(r)).toThrow()})
it('shows every supplied strike with explicit missing-versus-zero values and stale timestamps',()=>{
 render(<OptionsIntelligence report={workspaceReport()}/>);
 expect(screen.getByRole('list',{name:'2026-10-26 strike open interest'})).toBeInTheDocument()
 expect(screen.getByRole('listitem',{name:'Strike 100. Calls 10. Puts missing.'})).toBeInTheDocument()
 expect(screen.getByRole('listitem',{name:'Strike 101. Calls 0. Puts 20.'})).toBeInTheDocument()
 expect(screen.getByRole('status')).toHaveTextContent('STALE')
 expect(screen.getByLabelText('Show comparable OI changes')).toBeDisabled()
 expect(screen.getByRole('button',{name:'Weekly',exact:true})).toBeDisabled();expect(screen.getByRole('button',{name:'Monthly',exact:true})).toBeDisabled()
})
it('expiration changes update OI, pricing and flow without reusing another sample',()=>{
 render(<OptionsIntelligence report={workspaceReport()}/>);
 fireEvent.click(screen.getByText('Trade/quote aggressor estimates and sample completeness'))
 expect(screen.getByText(/Trade pagination: INCOMPLETE/)).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Options expiration'),{target:{value:'2026-10-27'}})
 expect(screen.getByRole('listitem',{name:'Strike 100. Calls 30. Puts missing.'})).toBeInTheDocument()
 expect(screen.getAllByText(/3.3/).length).toBeGreaterThan(0)
 expect(screen.getByText('No sample for this expiration.')).toBeInTheDocument()
 expect(screen.queryByText(/Contract TEST. 10 sampled trades/)).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Options symbol'),{target:{value:'SPY'}})
 expect(screen.getByRole('listitem',{name:'Strike 100. Calls 50. Puts missing.'})).toBeInTheDocument()
 expect(screen.getByLabelText('Options expiration')).toHaveValue('2026-10-26')
})
it('missing prices, expected moves, IV and symbol data remain unavailable',()=>{
 const r=workspaceReport();const e=r.options_workspace.symbols[0].expirations[0];e.underlying_price=null;e.source_cutoff=null;e.expected_move=null;e.mean_iv=null
 render(<OptionsIntelligence report={r}/>);expect(screen.getByRole('button',{name:'Jump to underlying'})).toBeDisabled()
 expect(screen.getByRole('status')).toHaveTextContent('UNAVAILABLE')
 fireEvent.change(screen.getByLabelText('Options symbol'),{target:{value:'NVDA'}})
 expect(screen.getByRole('heading',{name:'Options intelligence unavailable for NVDA.'})).toBeInTheDocument()
 expect(screen.getByText('No other symbol, expiration or estimate is substituted.')).toBeInTheDocument()
})
it('missing archive does not pretend aggregate totals are per expiration',()=>{
 const r=workspaceReport();r.options_workspace.symbols[0].expirations=[];r.options_workspace.symbols[0].archive_status='ARCHIVE_MISSING_OR_INCOMPLETE'
 render(<OptionsIntelligence report={r}/>);expect(screen.getByText(/Aggregate totals cannot be safely split/)).toBeInTheDocument();expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
})
