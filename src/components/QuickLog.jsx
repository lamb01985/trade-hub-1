import { useState, useEffect, useMemo } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, uid, f2, todayStr } from '../constants.js'

const SETUP_OPTIONS = ['ORB Breakout', 'VWAP Bounce', 'Level Touch', 'Pivot Break', 'Golden Pocket', 'Other']

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 9, letterSpacing: '0.14em', color: '#666', textTransform: 'uppercase', fontFamily: MONO }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4,
  color: '#e8e8e8', fontFamily: MONO, fontSize: 13, padding: '10px 12px',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4, padding: 3 }}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)} style={{
            flex: 1, padding: '10px 6px',
            background: active ? (opt.activeBg || LIME) : 'transparent',
            color: active ? (opt.activeText || '#000') : (opt.idleText || '#888'),
            border: 'none', cursor: 'pointer', borderRadius: 3,
            fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            transition: 'all 0.12s',
          }}>{opt.label}</button>
        )
      })}
    </div>
  )
}

export default function QuickLog({ open, onClose, onSubmit, prep, editing }) {
  const [ticker, setTicker] = useState('')
  const [optType, setOptType] = useState('call')
  const [strike, setStrike] = useState('')
  const [expiry, setExpiry] = useState(todayStr())
  const [contracts, setContracts] = useState('1')
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [status, setStatus] = useState('open')
  const [exitPrice, setExitPrice] = useState('')
  const [entryTime, setEntryTime] = useState(nowHHMM())
  const [exitTime, setExitTime] = useState('')
  const [setupType, setSetupType] = useState('ORB Breakout')
  const [notes, setNotes] = useState('')
  const [whatWell, setWhatWell] = useState('')
  const [whatImprove, setWhatImprove] = useState('')

  // Pre-fill on open
  useEffect(() => {
    if (!open) return
    if (editing) {
      setTicker(editing.ticker || '')
      setOptType(editing.optType || 'call')
      setStrike(editing.strike != null ? String(editing.strike) : '')
      setExpiry(editing.expiry || (editing.date ? editing.date.slice(0, 10) : todayStr()))
      setContracts(String(editing.contracts || 1))
      setEntry(editing.entry != null ? String(editing.entry) : '')
      setStop(editing.stop != null ? String(editing.stop) : '')
      setTarget(editing.target != null ? String(editing.target) : '')
      setStatus(editing.status || 'open')
      setExitPrice(editing.exitPrice != null ? String(editing.exitPrice) : '')
      setEntryTime(editing.entryTime || (editing.date ? new Date(editing.date).toTimeString().slice(0, 5) : nowHHMM()))
      setExitTime(editing.exitTime || '')
      setSetupType(editing.setupType || 'ORB Breakout')
      setNotes(editing.notes || '')
      setWhatWell(editing.whatWell || '')
      setWhatImprove(editing.whatImprove || '')
    } else {
      setTicker(prep?.ticker || '')
      setOptType('call')
      setStrike(prep?.plannedStrike ? String(prep.plannedStrike) : '')
      setExpiry(todayStr())
      setContracts('1')
      setEntry('')
      setStop('')
      setTarget('')
      setStatus('open')
      setExitPrice('')
      setEntryTime(nowHHMM())
      setExitTime('')
      setSetupType('ORB Breakout')
      setNotes('')
      setWhatWell('')
      setWhatImprove('')
    }
  }, [open, editing, prep])

  const calc = useMemo(() => {
    const e = parseFloat(entry), s = parseFloat(stop), t = parseFloat(target), n = parseInt(contracts) || 1
    if (isNaN(e) || isNaN(s) || isNaN(t) || e <= 0) return null
    const risk = e - s, reward = t - e
    if (risk <= 0 || reward <= 0) return null
    return { rr: reward / risk, risk, reward, dollarRisk: risk * n * 100, dollarReward: reward * n * 100, totalCost: e * n * 100 }
  }, [entry, stop, target, contracts])

  function submit() {
    if (!ticker.trim() || !entry) return
    const n = parseInt(contracts) || 1
    const e = parseFloat(entry)
    const ex = exitPrice ? parseFloat(exitPrice) : null
    const pnl = (status === 'win' || status === 'loss') && ex != null && !isNaN(ex) ? (ex - e) * n * 100 : (status === 'scratch' ? 0 : null)
    // Build a Date for the entry. Use today's date + entryTime so the time field shows up in the trade list.
    const entryDateStr = editing?.date ? editing.date.slice(0, 10) : todayStr()
    const [hh, mm] = (entryTime || nowHHMM()).split(':').map(Number)
    const entryDate = new Date(entryDateStr)
    entryDate.setHours(hh || 0, mm || 0, 0, 0)

    const data = {
      id: editing?.id || uid(),
      ticker: ticker.trim().toUpperCase(),
      instrument: 'options',
      optType,
      strike: parseFloat(strike) || null,
      expiry,
      contracts: n,
      setupType,
      entry: e,
      stop: parseFloat(stop) || null,
      target: parseFloat(target) || null,
      exitPrice: ex,
      entryTime,
      exitTime: exitTime || (status !== 'open' ? nowHHMM() : ''),
      status,
      pnl,
      rr: calc?.rr || editing?.rr || null,
      dollarRisk: calc?.dollarRisk ?? editing?.dollarRisk ?? null,
      dollarReward: calc?.dollarReward ?? editing?.dollarReward ?? null,
      totalCost: calc?.totalCost ?? editing?.totalCost ?? null,
      currentPrice: editing?.currentPrice ?? null,
      notes,
      whatWell,
      whatImprove,
      date: entryDate.toISOString(),
    }
    onSubmit(data)
  }

  if (!open) return null

  const showExitFields = status === 'win' || status === 'loss'
  const valid = !!ticker.trim() && !!entry && !isNaN(parseFloat(entry))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PANEL, width: '100%', maxWidth: 560, maxHeight: '94vh', overflow: 'auto', borderRadius: '12px 12px 0 0', padding: '20px 22px 26px', border: `1px solid ${BORDER}`, borderBottom: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 900, color: LIME, letterSpacing: '0.1em' }}>{editing ? 'EDIT TRADE' : 'LOG TRADE'}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#666', fontFamily: MONO, fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em' }}>CLOSE ✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Ticker"><input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} style={inputStyle} placeholder="QQQ" /></Field>
            <Field label="Type">
              <ToggleGroup options={[
                { value: 'call', label: 'CALL', activeBg: LIME, activeText: '#000' },
                { value: 'put', label: 'PUT', activeBg: RED, activeText: '#000' },
              ]} value={optType} onChange={setOptType} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Strike"><input type="number" step="0.5" value={strike} onChange={e => setStrike(e.target.value)} style={inputStyle} placeholder="475" /></Field>
            <Field label="Expiry"><input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={inputStyle} /></Field>
            <Field label="Contracts"><input type="number" step="1" value={contracts} onChange={e => setContracts(e.target.value)} style={inputStyle} /></Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Entry $"><input type="number" step="0.01" value={entry} onChange={e => setEntry(e.target.value)} style={inputStyle} placeholder="2.40" /></Field>
            <Field label="Stop $"><input type="number" step="0.01" value={stop} onChange={e => setStop(e.target.value)} style={inputStyle} placeholder="1.20" /></Field>
            <Field label="Target $"><input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} style={inputStyle} placeholder="4.80" /></Field>
          </div>

          {calc && (
            <div style={{ fontSize: 11, fontFamily: MONO, color: calc.rr >= 2 ? LIME : YELLOW, padding: '6px 12px', background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 4 }}>
              R:R 1:{f2(calc.rr)} · Risk -${f2(calc.dollarRisk)} · Reward +${f2(calc.dollarReward)} · Cost ${f2(calc.totalCost)}
            </div>
          )}

          <Field label="Status">
            <ToggleGroup options={[
              { value: 'open', label: 'OPEN', activeBg: '#888', activeText: '#000' },
              { value: 'win', label: 'WIN', activeBg: LIME, activeText: '#000' },
              { value: 'loss', label: 'LOSS', activeBg: RED, activeText: '#000' },
              { value: 'scratch', label: 'SCRATCH', activeBg: YELLOW, activeText: '#000' },
            ]} value={status} onChange={setStatus} />
          </Field>

          {showExitFields && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Exit $"><input type="number" step="0.01" value={exitPrice} onChange={e => setExitPrice(e.target.value)} style={inputStyle} placeholder="4.80" /></Field>
              <Field label="Exit Time (CT)"><input type="time" value={exitTime} onChange={e => setExitTime(e.target.value)} style={inputStyle} /></Field>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Entry Time (CT)"><input type="time" value={entryTime} onChange={e => setEntryTime(e.target.value)} style={inputStyle} /></Field>
            <Field label="Setup">
              <select value={setupType} onChange={e => setSetupType(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                {SETUP_OPTIONS.map(s => <option key={s} value={s} style={{ background: '#0a0a0a' }}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Notes (optional)"><input type="text" value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} placeholder="IV elevated, broke ORH on volume..." /></Field>

          {(status === 'win' || status === 'loss') && (
            <>
              <Field label="What went well"><input type="text" value={whatWell} onChange={e => setWhatWell(e.target.value)} style={inputStyle} placeholder="Waited for the candle close" /></Field>
              <Field label="What to improve"><input type="text" value={whatImprove} onChange={e => setWhatImprove(e.target.value)} style={inputStyle} placeholder="Could have sized smaller" /></Field>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{
              flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, color: '#888',
              fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              padding: '12px', borderRadius: 4, cursor: 'pointer',
            }}>CANCEL</button>
            <button onClick={submit} disabled={!valid} style={{
              flex: 2, background: valid ? LIME : '#1a1a1a', color: valid ? '#000' : '#444',
              border: 'none', fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em',
              padding: '12px', borderRadius: 4, cursor: valid ? 'pointer' : 'not-allowed',
            }}>{editing ? 'SAVE TRADE →' : 'LOG TRADE →'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
