import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import pythonSchema from '../../contracts/python-market-intelligence-v1.schema.json'
import optionsWorkspaceSchema from '../../contracts/options-workspace-v1.schema.json'
import deskSchema from '../../contracts/analyst-desk-v1.schema.json'
import analystSchema from '../../contracts/analyst-brief-v1.schema.json'
import reportSchema from '../../contracts/tradehub-intelligence-v1.schema.json'

const ajv = new Ajv({ strict: true, allErrors: false, ownProperties: true })
addFormats(ajv)
const validatePython = ajv.compile(pythonSchema)
ajv.addSchema(optionsWorkspaceSchema)
ajv.addSchema(deskSchema)
ajv.addSchema(analystSchema)
const validateReport = ajv.compile(reportSchema)
export const REPORT_STALE_HOURS = 24
export function freshness(timestamp, now = new Date()) {
  const age = now.getTime() - Date.parse(timestamp)
  if (!Number.isFinite(age)) return 'UNAVAILABLE'
  return age < 0 ? 'FUTURE_TIMESTAMP' : age > REPORT_STALE_HOURS * 3600000 ? 'STALE' : 'RECENT'
}
export function parseReport(value) {
  if (!validateReport(value)) throw new Error('Report schema is unavailable or incompatible.')
  return value
}
export function adaptPythonReport(raw, now = new Date()) {
  if (!validatePython(raw)) throw new Error('Python report schema is unavailable or incompatible.')
  // Select provider-derived results only. No analytics are recalculated here.
  return parseReport({
    contract_version: 'tradehub-intelligence-v1', source_schema: raw.schema_version,
    report_id: raw.report_id, report_date: raw.report_date, generated_at: raw.generated_at,
    observation_cutoff: raw.observation_cutoff, retrieved_at: now.toISOString(),
    ...(raw.options_workspace ? { options_workspace: raw.options_workspace } : {}),
    ...(raw.analyst_briefs ? { analyst_briefs: raw.analyst_briefs } : {}),
    sample: true, sample_label: 'Monday October 26 preparation using Friday October 23 close, not live data',
    freshness: freshness(raw.observation_cutoff, now), market_regime: raw.market_regime,
    daily_features: raw.daily_features, intraday_features: raw.intraday_features,
    intraday_playbook: raw.intraday_playbook, swing_playbook: raw.swing_playbook,
    options: raw.options_flow_intelligence.map(o => ({
      symbol: o.symbol, source_cutoff: o.source_cutoff, expirations: o.expirations, contracts_observed: o.contracts_observed,
      unusual_activity: o.unusual_activity, volatility: o.volatility, gamma: o.gamma, data_quality: o.data_quality, signal_policy: o.signal_policy,
      trade_flow: Object.fromEntries(Object.entries(o.trade_flow).filter(([k]) => k !== 'evidence')),
      positioning: Object.fromEntries(Object.entries(o.positioning).filter(([k]) => k !== 'contract_changes')),
    })), warnings: raw.data_quality.warnings, data_errors: raw.data_errors,
  })
}
