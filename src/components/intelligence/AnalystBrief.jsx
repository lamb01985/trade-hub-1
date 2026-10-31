import { useState } from 'react'
import { Card, SLabel, Btn } from '../ui.jsx'
import DeskDetail from './DeskDetail.jsx'
import { saveHypothesis } from '../../lib/researchLedger.js'

export default function AnalystBrief({ report }) {
  const [symbol, setSymbol] = useState('QQQ')
  const [riskReviewed, setRiskReviewed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [teach, setTeach] = useState(false)
  const [journalCase, setJournalCase] = useState(null)
  const [reflection, setReflection] = useState({ hypothesis: '', counterargument: '', invalidation: '', risk_notes: '', conviction: 'LOW' })
  const brief = report.analyst_briefs?.find(b => b.symbol === symbol)
  const checklist = [
    { id: 'fresh', label: 'Current-session underlying and options evidence', passed: false, reason: 'Blocked: Friday-close sample, not current-session evidence.' },
    { id: 'baseline', label: 'Selected contract baseline and quote quality verified', passed: false, reason: 'Blocked: no current execution contract selected or verified.' },
    { id: 'confirmation', label: 'Price, VWAP, volume and relative strength align', passed: false, reason: 'Blocked: fresh confirmation has not been observed.' },
    { id: 'conditions', label: 'Conditional confirmation and invalidation documented', passed: Boolean(brief?.scenarios.every(s => s.trigger != null)), reason: 'Research conditions only; not an entry signal.' },
    { id: 'risk', label: 'I reviewed risk and the stand-aside conditions', passed: riskReviewed, reason: 'Manual review does not establish data freshness or readiness.' },
  ]
  function save(scenario) {
    try { saveHypothesis(brief, scenario, checklist, window.localStorage, new Date(), reflection); setError(''); setMessage('Research hypothesis saved separately from actual trades. Outcome is pending and unvalidated.') }
    catch (e) { setMessage(''); setError(e.message) }
  }
  function competing() {
    return <Card><h3>6. Competing bullish and bearish hypotheses</h3><p>Both are conditional research cases. Neither is confirmed, ranked as more likely, or historically validated.</p><div className="intel-grid">{brief.scenarios.map(s => <article className="analyst-scenario" key={s.id}><SLabel>{s.direction} · research only</SLabel><h4>{s.name}</h4><p>Reference threshold: {s.trigger ?? 'Unavailable'}. Supplied structural reference targets: {s.reference_targets.join(', ') || 'Unavailable'}.</p><p><strong>Confirm:</strong> {s.confirmation}</p><p><strong>Invalidate:</strong> {s.invalidation}</p><p className="intel-muted">{s.interpretation}</p><Btn small variant="ghost" disabled={s.trigger == null} onClick={() => { setJournalCase(s); setMessage(''); setError('') }}>Save {s.direction} hypothesis</Btn></article>)}</div></Card>
  }
  return <><div className="intel-actions">{[...new Set(['QQQ', 'SPY', ...Object.keys(report.daily_features)])].map(s => <button key={s} aria-pressed={symbol === s} onClick={() => { setSymbol(s); setRiskReviewed(false); setMessage(''); setError(''); setJournalCase(null); setReflection({ hypothesis: '', counterargument: '', invalidation: '', risk_notes: '', conviction: 'LOW' }) }}>{s}</button>)}</div>
    {!brief ? <Card><p>Analyst brief unavailable for {symbol}. Regenerate the local fixture with the Python analyst interpreter.</p></Card> : <>
      <div className="desk-provenance"><SLabel>Chief Strategist · historical research · no live trade signal</SLabel><p className="intel-time">{symbol} · report {brief.report_date} · source cutoff {brief.source_cutoff}. Observation confidence: limited historical coverage. Signal status: NOT VALIDATED.</p><label><input type="checkbox" checked={teach} onChange={e => setTeach(e.target.checked)}/> Teach Me: explain the reasoning</label></div>
      {brief.desk?.simple_sections ? brief.desk.simple_sections.map((section,i) => <Card key={section.id}><h3>{i + 1}. {section.title}</h3><p>{section.text}</p>{teach && <aside className="teach-note"><strong>Why it matters:</strong> {section.teach}</aside>}</Card>) : <Card><p>The simplified desk summary is unavailable. Regenerate the local sample to include its Python interpretation.</p></Card>}
      <details className="desk-detail"><summary>Evidence, assumptions and research scenarios</summary><Card><h3>{brief.headline}</h3><p>Observation confidence: limited historical coverage. Historical validation: NOT VALIDATED.</p></Card>{brief.sections.map((section, i) => <div key={section.id}>{section.id === 'limitations' && competing()}<Card><h3>{section.id === 'limitations' ? 7 : i + 1}. {section.title}</h3>{section.paragraphs.map((p, j) => <p key={j}>{p}</p>)}</Card></div>)}</details>
      <DeskDetail desk={brief.desk}/>
      {journalCase && <Card><h3>Decision Journal: {journalCase.name}</h3><p>Write the case and its strongest objection before saving. This remains a hypothetical plan, separate from actual trades.</p><form className="analyst-form" onSubmit={event => { event.preventDefault(); save(journalCase) }}>{[['hypothesis','Your hypothesis'],['counterargument','Strongest counterargument'],['invalidation','What would invalidate the case'],['risk_notes','Risk assumptions, costs and maximum loss']].map(([key,label]) => <label key={key}>{label}<textarea required minLength={20} maxLength={2000} value={reflection[key]} onChange={e => setReflection(r => ({...r,[key]:e.target.value}))}/></label>)}<label>Self-rated conviction, not a probability<select value={reflection.conviction} onChange={e => setReflection(r => ({...r,conviction:e.target.value}))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>{reflection.conviction === 'HIGH' && <p role="status">High conviction conflicts with missing current evidence. Gather evidence or reconsider the strength of the claim. This is process feedback, not measured calibration.</p>}<Btn>Save research plan</Btn></form></Card>}
      <Card><h3>Trade Readiness</h3><p role="status"><strong>NOT READY: historical sample and missing current confirmation.</strong></p><ul className="analyst-checklist">{checklist.map(item => <li key={item.id}>{item.id === 'risk' ? <label><input type="checkbox" checked={riskReviewed} onChange={e => setRiskReviewed(e.target.checked)}/> {item.label}</label> : <strong>{item.passed ? 'Documented' : 'Blocked'}: {item.label}</strong>}<span>{item.reason}</span></li>)}</ul><p>No broker action or automatic trade recommendation follows from this checklist.</p><Btn small variant="ghost" onClick={() => window.dispatchEvent(new Event('tradehub-open-research'))}>Review hypothetical outcomes</Btn></Card>
      {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    </>}
  </>
}
