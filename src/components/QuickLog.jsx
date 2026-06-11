import { useState, useEffect, useMemo } from 'react'
import { LIME, RED, YELLOW, MONO, BORDER, PANEL, uid, f2, todayStr, localDateStr, JOURNAL_SETUP_OPTIONS } from '../constants.js'

const SETUP_OPTIONS = JOURNAL_SETUP_OPTIONS

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
  const [tradeDate, setTradeDate] = useState(localDateStr())
  const [entryTime, setEntryTime] = useState('')
  const [exitTime, setExitTime] = useState('')
  const [setupType, setSetupType] = useState(SETUP_OPTIONS[0])
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
      setTradeDate(editing.tradeDate || (editing.date ? localDateStr(new Date(editing.date)) : localDateStr()))
      // Show the stored entry/exit times verbatim. No fallback to date.toTimeString
      // (which is "when the record was created" for Calculator-logged trades, not
      // the actual entry moment) and no fallback to nowHHMM (which corrupted
      // trades by stamping save-time as entry-time).
      setEntryTime(editing.entryTime || '')
      setExitTime(editing.exitTime || '')
      setSetupType(editing.setupType || SETUP_OPTIONS[0])
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
      setTradeDate(localDateStr())
      setEntryTime('')
      setExitTime('')
      setSetupType(SETUP_OPTIONS[0])
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
    // Build a Date for the entry. Combine the user-entered tradeDate with
    // entryTime using the local-time constructor so date.slice(0, 10) always
    // matches tradeDate (the UTC parse path produces midnight UTC which can
    // roll back a day in CT). If entryTime is empty, fall back to midnight of
    // the trade date rather than current time, so an unfilled time field never
    // silently records the moment of save as the entry moment.
    const entryDateStr = tradeDate || localDateStr()
    const [hh, mm] = entryTime ? entryTime.split(':').map(Number) : [0, 0]
    const [yy, mo, dd] = entryDateStr.split('-').map(Number)
    const entryDate = new Date(yy, (mo || 1) - 1, dd || 1, hh || 0, mm || 0, 0, 0)

    // Stamp closedAt on the moment a trade transitions out of 'open'. Preserve
    // an existing closedAt when editing a closed trade so the holding period
    // doesn't reset on every edit.
    const wasOpen = !editing || editing.status === 'open'
    const isClosed = status !== 'open'
    const closedAt = isClosed
      ? (wasOpen ? new Date().toISOString() : editing?.closedAt || new Date().toISOString())
      : null

    const data = {
      id: editing?.id || uid(),
      ticker: ticker.trim().toUpperCase(),
      closedAt,
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
      exitTime,
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
      tradeDate: entryDateStr,
      date: entryDate.toISOString(),
    }
    onSubmit(data)
  }

  if (!open) return null

  const showExitFields = status === 'win' || status === 'loss'
  // If both times are filled and exit is not after entry, flag it. We treat the
  // single tradeDate as covering both legs of the trade, so a lower-or-equal
  // exit time is a data error (likely save-time auto-fill rather than a real
  // overnight hold, which this model can't express anyway).
  const timeWarning = entryTime && exitTime && exitTime <= entryTime
    ? 'Exit time must be after entry time.'
    : null
  const valid = !!ticker.trim() && !!entry && !isNaN(parseFloat(entry)) && !!tradeDate && tradeDate <= localDateStr() && !timeWarning

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: PANEL, width: '100%', maxWidth: 560, maxHeight: '94vh', overflow: 'auto', borderRadius: '12px 12px 0 0', padding: '20px 22px 26px', border: `1px solid ${BORDER}`, borderBottom: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 900, color: LIME, letterSpacing: '0.1em' }}>{editing ? 'EDIT TRADE' : 'LOG TRADE'}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#666', fontFamily: MONO, fontSize: 12, cursor: 'pointer', letterSpacing: '0.1em' }}>CLOSE ✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Ticker"><input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} style={inputStyle} placeholder="QQQ" /></Field>
            <Field label="Trade Date"><input type="date" value={tradeDate} max={localDateStr()} onChange={e => setTradeDate(e.target.value)} style={inputStyle} required /></Field>
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
              <Field label="Exit Time (CT)"><input type="time" title="Times are in Central Time (CT)" value={exitTime} onChange={e => setExitTime(e.target.value)} style={inputStyle} /></Field>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Entry Time (CT)"><input type="time" title="Times are in Central Time (CT)" value={entryTime} onChange={e => setEntryTime(e.target.value)} style={inputStyle} /></Field>
            <Field label="Setup">
              <select value={setupType} onChange={e => setSetupType(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                {/* Editing an older trade with a legacy setupType: prepend it as
                    an option so the dropdown reflects what was originally logged
                    without forcing a rewrite. */}
                {!SETUP_OPTIONS.includes(setupType) && setupType && (
                  <option value={setupType} style={{ background: '#0a0a0a' }}>{setupType} (legacy)</option>
                )}
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

          {timeWarning && (
            <div style={{ fontSize: 11, fontFamily: MONO, color: RED, padding: '6px 12px', background: '#1a0505', border: `1px solid ${RED}33`, borderRadius: 4 }}>
              {timeWarning}
            </div>
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
