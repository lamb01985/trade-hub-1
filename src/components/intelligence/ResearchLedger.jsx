import { useEffect, useState } from 'react'
import { Card, SLabel, Btn } from '../ui.jsx'
import { loadResearch, recordResearchOutcome, RESEARCH_OUTCOMES } from '../../lib/researchLedger.js'
import './intelligence.css'

export default function ResearchLedger() {
  const [ledger, setLedger] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState('UNRESOLVED')
  const [observedAt, setObservedAt] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    const refresh = () => { try { setLedger(loadResearch()); setError('') } catch (e) { setError(e.message) } }
    refresh(); window.addEventListener('tradehub-research-update', refresh); window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('tradehub-research-update', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  function submit(event) {
    event.preventDefault()
    try { setLedger(recordResearchOutcome(selected, status, observedAt, note)); setError(''); setNote('') }
    catch (e) { setError(e.message) }
  }
  return <section className="intel-root" aria-label="Research outcomes"><h2>Hypothetical setup outcomes</h2><Card><p>Research history is stored on this browser under its own namespace. Actual journal trades, broker data and P&amp;L are untouched. Nothing here places or stages an order.</p><p>Manual outcome observations are unverified. They do not establish historical validation or predictive edge. Corrections append another observation; earlier observations remain in history.</p><p className="intel-muted">This history does not sync between computers. Clearing site storage removes it.</p></Card>
    {error && <p role="alert">{error}</p>}
    {ledger && !ledger.hypotheses.length && <p>No hypotheses saved. Open Plan, Market Intelligence, Analyst Brief, then save a conditional hypothesis.</p>}
    {ledger?.hypotheses.map(h => <Card key={h.id}><SLabel>{h.symbol} · {h.scenario.direction} · NOT VALIDATED</SLabel><h3>{h.scenario.name}</h3><p>Reference trigger: {h.scenario.trigger}. Report: {h.report_date}. Source cutoff: {h.source_cutoff}.</p><p>{h.scenario.confirmation}</p><p>{h.scenario.invalidation}</p>{h.decision_reflection && <div><h4>Decision reasoning at save</h4><p>Hypothesis: {h.decision_reflection.hypothesis}</p><p>Counterargument: {h.decision_reflection.counterargument}</p><p>Invalidation: {h.decision_reflection.invalidation}</p><p>Risk assumptions: {h.decision_reflection.risk_notes}</p><p>Self-rated conviction: {h.decision_reflection.conviction}. {h.decision_reflection.conviction === 'HIGH' ? 'High conviction with blocked readiness is a reason to revisit the evidence, not a performance claim.' : 'Conviction is a self-report, not a probability of success.'}</p><p>Calibration feedback is unavailable until repeated comparable forecasts have independently evaluated outcomes. Manual notes do not establish accuracy.</p></div>}<p>Saved {h.saved_at}. Reference ID: {h.id}.</p>{ledger.outcomes.filter(o => o.hypothesis_id === h.id).map(o => <div className="analyst-outcome" key={o.id}><strong>{o.status} · MANUAL / UNVERIFIED</strong><p>Observed {o.observed_at}; recorded {o.recorded_at}. {o.evidence_note}</p></div>)}{!ledger.outcomes.some(o => o.hypothesis_id === h.id) && <p>Outcome pending. No result is inferred.</p>}</Card>)}
    {!!ledger?.hypotheses.length && <Card><h3>Append a dated research observation</h3><form className="analyst-form" onSubmit={submit}><label>Hypothesis<select required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select a hypothesis</option>{ledger.hypotheses.map(h => <option key={h.id} value={h.id}>{h.symbol}: {h.scenario.name}</option>)}</select></label><label>Observation status<select value={status} onChange={e => setStatus(e.target.value)}>{RESEARCH_OUTCOMES.map(s => <option key={s}>{s}</option>)}</select></label><label>Observation time, this computer's local timezone<input type="datetime-local" required value={observedAt} onChange={e => setObservedAt(e.target.value)}/></label><label>Evidence and uncertainty<textarea required minLength={10} maxLength={2000} value={note} onChange={e => setNote(e.target.value)}/></label><Btn>Append unverified outcome</Btn></form></Card>}
  </section>
}
