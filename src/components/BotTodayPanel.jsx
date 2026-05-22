// ─────────────────────────────────────────────────────────────────────────────
// BotTodayPanel.jsx — chronological strip of every setup the coach surfaced
// today. Each row shows time, setup name, direction, status, and (for skipped
// or expired) the would-have-won grade once it resolves.
// ─────────────────────────────────────────────────────────────────────────────

import { LIME, RED, YELLOW, BLUE, ORANGE, PANEL, BORDER, MONO, SANS, fmtD } from '../constants.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

const STATUS_COLOR = {
  pending: '#888',
  taken:   BLUE,
  win:     LIME,
  loss:    RED,
  skipped: YELLOW,
  expired: ORANGE,
}

const STATUS_LABEL = {
  pending: 'Pending',
  taken:   'Taken',
  win:     'Win',
  loss:    'Loss',
  skipped: 'Skipped',
  expired: 'Expired',
}

function fmtETMin(mins) {
  if (mins == null) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function BotTodayPanel({ setups = [] }) {
  const sorted = [...setups].sort((a, b) => (b.surfaceTs || 0) - (a.surfaceTs || 0))

  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontSize: 11, color: DIM, fontFamily: MONO, letterSpacing: '0.16em', textTransform: 'uppercase', margin: 0, fontWeight: 700 }}>
          Today
        </h3>
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO, letterSpacing: '0.1em' }}>
          {sorted.length} setup{sorted.length === 1 ? '' : 's'} surfaced
        </span>
      </div>

      {sorted.length === 0 ? (
        <div style={{ padding: '14px 6px', fontSize: 12, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
          Nothing surfaced yet. The coach only logs a setup when it crosses the confluence threshold or you skip / expire one. Quiet morning is fine.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(r => <Row key={r.id} record={r} />)}
        </div>
      )}
    </div>
  )
}

function Row({ record }) {
  const color = STATUS_COLOR[record.status] || MUTED
  const label = STATUS_LABEL[record.status] || record.status
  const dir = (record.direction || '').toUpperCase()
  const dirColor = dir === 'LONG' ? LIME : RED
  const pl = record.closeData?.realizedPL
  const isSkipKind = record.status === 'skipped' || record.status === 'expired'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '70px 80px 1fr 80px 110px 100px',
      gap: 10,
      alignItems: 'center',
      padding: '8px 10px',
      background: '#0a0a0a',
      border: `1px solid ${BORDER}`,
      borderLeft: `2px solid ${color}`,
      borderRadius: 3,
      fontSize: 11,
    }}>
      <span style={{ fontFamily: MONO, color: MUTED, letterSpacing: '0.06em' }}>{fmtETMin(record.surfaceAt)}</span>
      <span style={{ fontFamily: MONO, color: dirColor, fontWeight: 800, letterSpacing: '0.12em', fontSize: 10 }}>{dir}</span>
      <span style={{ fontFamily: SANS, color: FG, fontWeight: 600 }}>{record.setupName}</span>
      <span style={{ fontFamily: MONO, color: MUTED, fontSize: 10, letterSpacing: '0.06em' }}>
        {record.level?.name ? `${record.level.name} $${Number(record.level.price).toFixed(2)}` : ''}
      </span>
      <span style={{ fontFamily: MONO, color, fontSize: 10, letterSpacing: '0.12em', fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ textAlign: 'right' }}>
        {pl != null && (
          <span style={{ fontFamily: MONO, color: pl >= 0 ? LIME : RED, fontWeight: 700, fontSize: 11 }}>
            {fmtD(pl)}
          </span>
        )}
        {isSkipKind && record.wouldHaveWon === true && (
          <span title="The setup would have hit its target" style={{ fontFamily: MONO, color: RED, fontSize: 9, letterSpacing: '0.1em', fontWeight: 700 }}>
            Cost a win
          </span>
        )}
        {isSkipKind && record.wouldHaveWon === false && (
          <span title="The setup would have stopped out" style={{ fontFamily: MONO, color: LIME, fontSize: 9, letterSpacing: '0.1em', fontWeight: 700 }}>
            Saved a loss
          </span>
        )}
      </span>
    </div>
  )
}
