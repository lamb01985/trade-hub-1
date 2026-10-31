export const RESEARCH_STORAGE_KEY = 'th-analyst-research-v1'
export const RESEARCH_OUTCOMES = ['NOT_TRIGGERED', 'INVALIDATED', 'REFERENCE_TARGET_OBSERVED', 'AMBIGUOUS', 'UNRESOLVED']
const VERSION = 'analyst-research-ledger-v1'
function empty() { return { schema_version: VERSION, hypotheses: [], outcomes: [] } }
export function loadResearch(storage = window.localStorage) {
  const raw = storage.getItem(RESEARCH_STORAGE_KEY)
  if (!raw) return empty()
  let result
  try { result = JSON.parse(raw) } catch { throw new Error('Research history is unreadable. Existing storage was retained.') }
  if (result?.schema_version !== VERSION || !Array.isArray(result.hypotheses) || !Array.isArray(result.outcomes) || result.hypotheses.some(h => typeof h.id !== 'string' || typeof h.symbol !== 'string' || !h.scenario?.name || !h.scenario?.confirmation || !Number.isFinite(Date.parse(h.session_open))) || result.outcomes.some(o => !RESEARCH_OUTCOMES.includes(o.status) || typeof o.hypothesis_id !== 'string' || !Number.isFinite(Date.parse(o.observed_at)))) throw new Error('Research history has an unsupported schema. Existing storage was retained.')
  return result
}
function persist(ledger, storage) {
  try { storage.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(ledger)) }
  catch { throw new Error('Research history could not be saved. Browser storage may be full or disabled.') }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tradehub-research-update'))
  return ledger
}
export function saveHypothesis(brief, scenario, readiness, storage = window.localStorage, now = new Date(), reflection = null) {
  if (reflection) {
    for (const key of ['hypothesis', 'counterargument', 'invalidation', 'risk_notes']) if (typeof reflection[key] !== 'string' || reflection[key].trim().length < 20 || reflection[key].length > 2000) throw new Error('Explain the hypothesis, counterargument, invalidation and risk assumptions in at least 20 characters each.')
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(reflection.conviction)) throw new Error('Choose a qualitative conviction level, not a predictive probability.')
  }
  if (!brief.scenarios.some(s => s.id === scenario.id) || scenario.trigger == null) throw new Error('A timestamped numeric hypothesis is required.')
  const ledger = loadResearch(storage)
  if (ledger.hypotheses.some(h => h.id === scenario.id)) return ledger
  const frozen = JSON.parse(JSON.stringify({ id: scenario.id, symbol: brief.symbol, report_id: brief.report_id, report_date: brief.report_date, source_cutoff: brief.source_cutoff, session_open: brief.session_open, saved_at: now.toISOString(), analyst_version: brief.schema_version, historical_validation: 'NOT_VALIDATED', scenario, readiness_at_save: readiness, observation_sections: brief.sections, decision_reflection: reflection }))
  return persist({ ...ledger, hypotheses: [...ledger.hypotheses, frozen] }, storage)
}
export function recordResearchOutcome(hypothesisId, status, observedAt, note, storage = window.localStorage, now = new Date()) {
  const ledger = loadResearch(storage)
  const hypothesis = ledger.hypotheses.find(h => h.id === hypothesisId)
  if (!hypothesis || !RESEARCH_OUTCOMES.includes(status)) throw new Error('Choose a saved research hypothesis and a valid observation status.')
  const timestamp = Date.parse(observedAt)
  if (!Number.isFinite(timestamp) || timestamp < Date.parse(hypothesis.session_open) || timestamp > now.getTime()) throw new Error('Outcome observations must be after the target session opens and cannot be in the future.')
  if (typeof note !== 'string' || note.trim().length < 10 || note.length > 2000) throw new Error('Add 10 to 2000 characters describing the dated evidence and any uncertainty.')
  if (status === 'REFERENCE_TARGET_OBSERVED' && !hypothesis.scenario.reference_targets.length) throw new Error('This hypothesis has no supplied reference target.')
  const outcome = { id: crypto.randomUUID(), hypothesis_id: hypothesisId, status, observed_at: new Date(timestamp).toISOString(), recorded_at: now.toISOString(), evidence_note: note.trim(), evidence_source: 'MANUAL_UNVERIFIED', historical_validation: 'NOT_VALIDATED' }
  return persist({ ...ledger, outcomes: [...ledger.outcomes, outcome] }, storage)
}
