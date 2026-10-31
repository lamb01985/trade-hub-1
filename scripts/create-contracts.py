"""Build the explicit JSON contracts. Does not read or publish market data."""
import json
from pathlib import Path

def obj(props, required=None, extra=True):
    return dict(type='object',properties=props,required=list(props) if required is None else required,additionalProperties=extra)
num={'type':['number','null']}
string={'type':'string'}
stamp={'type':'string','format':'date-time'}
arr=lambda x:dict(type='array',items=x)
record={'type':'object'}
scenario=obj(dict(symbol=string,source_timestamp=stamp,direction={'enum':['LONG','SHORT','NEUTRAL']},trigger=num,invalidation=num,targets=arr({'type':'number'}),confirmation=string,no_trade_if=arr(string)))
feature=obj(dict(symbol=string,source_timestamp=stamp,close=num,daily_trend=string,weekly_trend=string,previous_day=record,previous_week=record,support_resistance=arr({'type':'number'})))
strike=obj(dict(strike={'type':'number'},type={'enum':['call','put']},open_interest={'type':'number','minimum':0}))
expiry=obj(dict(expiration={'type':'string','format':'date'},type={'enum':['call','put']},open_interest={'type':'number','minimum':0}))
unusual=obj(dict(ticker=string,volume=num,open_interest=num,baseline_status=string,baseline_observations={'type':'integer','minimum':0},volume_baseline_ratio=num,flagged={'type':'boolean'}))
options=obj(dict(symbol=string,source_cutoff=stamp,expirations=arr({'type':'string','format':'date'}),contracts_observed={'type':'integer','minimum':0},positioning=obj(dict(by_strike=arr(strike),by_expiration=arr(expiry),interpretation_limit=string,contracts_missing_open_interest={'type':'integer','minimum':0})),unusual_activity=obj(dict(contracts=arr(unusual),minimum_baseline_observations={'type':'integer','minimum':1})),trade_flow=obj(dict(status=string),['status']),volatility=record,gamma=record,data_quality=record,signal_policy=record))
python=obj(dict(schema_version={'const':'market-intelligence-v1'},report_id=string,report_date={'type':'string','format':'date'},generated_at=stamp,observation_cutoff=stamp,market_regime=obj(dict(label=string)),daily_features={'type':'object','additionalProperties':feature},intraday_features=record,intraday_playbook=arr(scenario),swing_playbook=arr(scenario),options_intelligence=arr(record),options_flow_intelligence=arr(options),data_quality=obj(dict(warnings=arr(string))),data_errors=arr(record)))
transport=obj(dict(contract_version={'const':'tradehub-intelligence-v1'},source_schema={'const':'market-intelligence-v1'},report_id=string,report_date={'type':'string','format':'date'},generated_at=stamp,observation_cutoff=stamp,retrieved_at=stamp,sample={'const':True},sample_label=string,freshness={'enum':['RECENT','STALE','FUTURE_TIMESTAMP']},market_regime=python['properties']['market_regime'],daily_features=python['properties']['daily_features'],intraday_features=record,intraday_playbook=arr(scenario),swing_playbook=arr(scenario),options=arr(options),warnings=arr(string),data_errors=arr(record)),extra=False)
transport['properties']['options_workspace'] = {'$ref': 'options-workspace-v1'}
transport['properties']['analyst_briefs'] = {'type': 'array', 'items': {'$ref': 'analyst-brief-v1'}}
for name,schema in [('python-market-intelligence-v1',python),('tradehub-intelligence-v1',transport)]:
    schema['$schema']='http://json-schema.org/draft-07/schema#'
    schema['$id']=name
    Path('contracts/'+name+'.schema.json').write_text(json.dumps(schema,indent=2)+'\n')
