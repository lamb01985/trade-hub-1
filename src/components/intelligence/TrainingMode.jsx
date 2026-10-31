import { useState } from 'react'
import { Card, Btn, SLabel } from '../ui.jsx'
import { saveLearning } from '../../lib/learningJournal.js'
export default function TrainingMode({ report }) {
  const [symbol, setSymbol] = useState('QQQ')
  const [index, setIndex] = useState(0)
  const [choice, setChoice] = useState(null)
  const [checked, setChecked] = useState(false)
  const [reflection, setReflection] = useState({ hypothesis: '', counterargument: '', invalidation: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const lessons = report.analyst_briefs?.find(b => b.symbol === symbol)?.desk?.training || []
  const lesson = lessons[index]
  function reset() { setChoice(null); setChecked(false); setMessage(''); setError(''); setReflection({ hypothesis: '', counterargument: '', invalidation: '' }) }
  function complete(event) {
    event.preventDefault()
    try { saveLearning(lesson, choice, reflection); setMessage('Lesson reflection saved locally. Quiz understanding is not proof of a trading edge.'); setError('') }
    catch (e) { setMessage(''); setError(e.message) }
  }
  return <><Card><SLabel>Training Mode</SLabel><p>Learn from the actual saved observations. First interpret the evidence, then challenge your explanation. No AI grade or invented win probability is supplied.</p></Card><div className="intel-actions">{Object.keys(report.daily_features).map(s => <button key={s} aria-pressed={symbol === s} onClick={() => { setSymbol(s); setIndex(0); reset() }}>{s}</button>)}</div><nav className="intel-subnav" aria-label="Lessons">{lessons.map((l,i) => <button key={l.id} aria-pressed={index === i} onClick={() => { setIndex(i); reset() }}>{i + 1}. {l.title}</button>)}</nav>
    {!lesson ? <Card><p>Historical lesson evidence is unavailable for this symbol.</p></Card> : <Card><h3>{lesson.title}</h3><p>{lesson.context}</p><p className="intel-time">Source cutoff: {lesson.source_cutoff}. Saved report: {report.report_date}.</p><fieldset className="training-choices"><legend>Which explanation follows from the evidence?</legend>{lesson.choices.map((text,i) => <label key={text}><input type="radio" name="lesson-choice" checked={choice === i} onChange={() => { setChoice(i); setChecked(false) }}/>{text}</label>)}</fieldset><Btn small disabled={choice == null} onClick={() => setChecked(true)}>Check understanding</Btn>{checked && <p role="status"><strong>{choice === lesson.correct_index ? 'Supported by the evidence.' : 'Reconsider this interpretation.'}</strong> {lesson.explanation}</p>}
      {checked && choice === lesson.correct_index && <form className="analyst-form" onSubmit={complete}><p>Now explain the competing case. Your writing is saved, not automatically assessed as correct.</p>{[['hypothesis','Your hypothesis'],['counterargument','The strongest counterargument'],['invalidation','What would invalidate your hypothesis']].map(([key,label]) => <label key={key}>{label}<textarea minLength={20} maxLength={2000} required value={reflection[key]} onChange={e => setReflection(r => ({...r,[key]:e.target.value}))}/></label>)}<Btn>Save lesson reflection</Btn></form>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    </Card>}
  </>
}
