// ─────────────────────────────────────────────────────────────────────────────
// BotSettingsDrawer.jsx — collapsible settings panel for the coach.
//
// All settings live in engine state.settings; the parent passes the current
// values plus a single onUpdateSettings(patch) callback. Reset session is
// surfaced here too. liveMode toggle includes friction (typed confirmation).
//
// Settings:
//   dailyLossLimit       dollars, default 200, capped at 200 per spec
//   confluenceThreshold  1 to 10
//   requireChecklist     boolean
//   liveMode             boolean (friction to enable)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { LIME, RED, YELLOW, PANEL, BORDER, MONO, SANS } from '../constants.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const MAX_LOSS_LIMIT = 200    // hard cap per spec

export default function BotSettingsDrawer({ settings, onUpdateSettings, onResetSession }) {
  const [open, setOpen] = useState(false)
  const [resetTyped, setResetTyped] = useState('')
  const [liveTyped, setLiveTyped] = useState('')

  if (!settings) return null

  function patch(key, value) {
    onUpdateSettings({ [key]: value })
  }

  function handleLossLimit(raw) {
    let v = parseInt(raw)
    if (isNaN(v) || v < 0) v = 0
    if (v > MAX_LOSS_LIMIT) v = MAX_LOSS_LIMIT
    patch('dailyLossLimit', v)
  }

  function handleConfluence(raw) {
    let v = parseInt(raw)
    if (isNaN(v)) v = 6
    if (v < 1) v = 1
    if (v > 10) v = 10
    patch('confluenceThreshold', v)
  }

  function tryEnableLive() {
    if (liveTyped.trim().toUpperCase() === 'LIVE') {
      patch('liveMode', true)
      setLiveTyped('')
    }
  }

  function tryResetSession() {
    if (resetTyped.trim().toUpperCase() === 'RESET') {
      onResetSession()
      setResetTyped('')
    }
  }

  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, fontFamily: SANS, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
          fontFamily: MONO, fontSize: 11, color: DIM, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
        }}
      >
        <span>Settings</span>
        <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 16, borderTop: `1px solid ${BORDER}` }}>

          <Row label="Daily loss limit" hint={`Hard capped at $${MAX_LOSS_LIMIT}.`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: MONO, color: DIM, fontSize: 13 }}>$</span>
              <input
                type="number"
                min={0}
                max={MAX_LOSS_LIMIT}
                step={10}
                value={settings.dailyLossLimit}
                onChange={e => handleLossLimit(e.target.value)}
                style={input}
              />
            </div>
          </Row>

          <Row label="Confluence threshold" hint="1 to 10. Higher means the bot will only surface stronger setups.">
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={settings.confluenceThreshold}
              onChange={e => handleConfluence(e.target.value)}
              style={input}
            />
          </Row>

          <Row label="Require checklist" hint="Bot stays in WAIT until today's Check verdict reads TRADE.">
            <Toggle checked={!!settings.requireChecklist} onChange={v => patch('requireChecklist', v)} />
          </Row>

          <Row label="Live mode" hint="Off means paper P/L only. Live mode is a label, the bot never places orders.">
            {settings.liveMode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: MONO, color: RED, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em' }}>LIVE</span>
                <button onClick={() => patch('liveMode', false)} style={{ ...ghostBtn, color: DIM, borderColor: BORDER }}>Switch to paper</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={liveTyped}
                  onChange={e => setLiveTyped(e.target.value)}
                  placeholder="Type LIVE"
                  style={{ ...input, width: 120 }}
                />
                <button
                  onClick={tryEnableLive}
                  disabled={liveTyped.trim().toUpperCase() !== 'LIVE'}
                  style={liveTyped.trim().toUpperCase() === 'LIVE' ? { ...primaryBtn, background: RED, color: '#0a0a0a' } : { ...primaryBtn, background: '#1a1a1a', color: '#555', cursor: 'not-allowed' }}
                >Enable live</button>
              </div>
            )}
          </Row>

          <div style={{ paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
              Reset today
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={resetTyped}
                onChange={e => setResetTyped(e.target.value)}
                placeholder="Type RESET"
                style={{ ...input, flex: 1 }}
              />
              <button
                onClick={tryResetSession}
                disabled={resetTyped.trim().toUpperCase() !== 'RESET'}
                style={resetTyped.trim().toUpperCase() === 'RESET' ? { ...primaryBtn, background: YELLOW, color: '#0a0a0a' } : { ...primaryBtn, background: '#1a1a1a', color: '#555', cursor: 'not-allowed' }}
              >Reset session</button>
            </div>
            <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO, marginTop: 6, letterSpacing: '0.04em', lineHeight: 1.5 }}>
              Rolls today into history and clears the active session. Past sessions are kept.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 12, color: FG, fontFamily: SANS, fontWeight: 700 }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: MUTED, fontFamily: SANS, marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, background: checked ? LIME : '#2a2a2a', border: `1px solid ${checked ? LIME : BORDER}`,
        position: 'relative', cursor: 'pointer', transition: 'background 0.15s',
      }}
    >
      <span style={{ position: 'absolute', top: 2, left: checked ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: checked ? '#0a0a0a' : DIM, transition: 'left 0.15s' }} />
    </button>
  )
}

const input = {
  background: '#0a0a0a',
  color: FG,
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: '7px 10px',
  fontFamily: MONO,
  fontSize: 12,
  width: 80,
}

const primaryBtn = {
  background: LIME,
  color: '#0a0a0a',
  border: 'none',
  borderRadius: 3,
  padding: '7px 14px',
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const ghostBtn = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: '5px 10px',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
