// ─────────────────────────────────────────────────────────────────────────────
// BotPatternsPanel.jsx — three small cards that surface long-running patterns
// across today and the last 20 archived sessions.
//
//   Setup performance  per-setup taken / won / lost / skip-saves
//   Skip quality       did skipping save money or cost money
//   Discipline streak  consecutive sessions without a lockout
// ─────────────────────────────────────────────────────────────────────────────

import { LIME, RED, YELLOW, BLUE, PANEL, BORDER, MONO, SANS, fmtD } from '../constants.js'
import { PLAYBOOK_BY_ID } from '../lib/playbook.js'

const FG = '#e8e8e8'
const DIM = '#888'
const MUTED = '#666'

function Card({ title, children, accent = DIM }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 16, fontFamily: SANS }}>
      <div style={{ fontSize: 10, color: accent, fontFamily: MONO, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function StatRow({ label, value, color = FG, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '5px 0', borderTop: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 14, color, fontFamily: MONO, fontWeight: 800 }}>{value}{hint && <span style={{ fontSize: 9, color: MUTED, fontWeight: 400, marginLeft: 6, letterSpacing: '0.1em' }}>{hint}</span>}</span>
    </div>
  )
}

// ─── Setup performance card ────────────────────────────────────────────────
function SetupPerformance({ bySetup }) {
  const rows = Object.entries(bySetup || {})
    .map(([setupId, v]) => ({
      setupId,
      name: PLAYBOOK_BY_ID?.[setupId]?.name || setupId,
      ...v,
      winRate: v.taken > 0 ? v.won / v.taken : null,
    }))
    .filter(r => r.taken + r.skipped + r.expired > 0)
    .sort((a, b) => (b.taken + b.skipped + b.expired) - (a.taken + a.skipped + a.expired))

  return (
    <Card title="Setup performance" accent={LIME}>
      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
          No history yet. Counts populate once setups surface across sessions.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px 40px 70px', gap: 8, padding: '4px 0', fontSize: 9, color: MUTED, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            <span>Setup</span>
            <span style={{ textAlign: 'right' }}>Won</span>
            <span style={{ textAlign: 'right' }}>Lost</span>
            <span style={{ textAlign: 'right' }}>Skip</span>
            <span style={{ textAlign: 'right' }}>Win %</span>
          </div>
          {rows.map(r => (
            <div key={r.setupId} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px 40px 70px', gap: 8, padding: '6px 0', borderTop: `1px solid ${BORDER}`, fontSize: 11, alignItems: 'center' }}>
              <span style={{ color: FG, fontFamily: SANS, fontWeight: 600 }}>{r.name}</span>
              <span style={{ textAlign: 'right', color: LIME, fontFamily: MONO }}>{r.won}</span>
              <span style={{ textAlign: 'right', color: RED, fontFamily: MONO }}>{r.lost}</span>
              <span style={{ textAlign: 'right', color: YELLOW, fontFamily: MONO }}>{r.skipped + r.expired}</span>
              <span style={{ textAlign: 'right', color: r.winRate == null ? MUTED : r.winRate >= 0.5 ? LIME : RED, fontFamily: MONO, fontWeight: 700 }}>
                {r.winRate == null ? '—' : `${Math.round(r.winRate * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Skip quality card ─────────────────────────────────────────────────────
function SkipQuality({ skip }) {
  const total = skip?.skipped || 0
  const saved = skip?.wouldHaveLost || 0
  const cost  = skip?.wouldHaveWon || 0
  const unresolved = Math.max(0, total - saved - cost)
  const verdict = total === 0 ? null : saved > cost ? 'Skipping is helping' : saved === cost ? 'Skipping is a wash' : 'Skipping is costing wins'
  const verdictColor = total === 0 ? MUTED : saved > cost ? LIME : saved === cost ? YELLOW : RED

  return (
    <Card title="Skip quality" accent={YELLOW}>
      {total === 0 ? (
        <div style={{ fontSize: 11, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
          No skipped or expired setups yet. The grade kicks in once you start passing on setups.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: verdictColor, fontFamily: SANS, fontWeight: 700, marginBottom: 10 }}>
            {verdict}
          </div>
          <StatRow label="Total skipped or expired" value={total} />
          <StatRow label="Saved a loss" value={saved} color={LIME} />
          <StatRow label="Cost a win" value={cost} color={RED} />
          {unresolved > 0 && <StatRow label="Still tracking" value={unresolved} color={MUTED} />}
        </>
      )}
    </Card>
  )
}

// ─── Discipline streak card ────────────────────────────────────────────────
function DisciplineStreak({ streak, today }) {
  const lockedToday = today?.realizedPL != null && today.realizedPL <= -200    // best-effort; the actual flag lives in state
  return (
    <Card title="Discipline streak" accent={BLUE}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 34, color: streak > 0 ? LIME : MUTED, fontFamily: MONO, fontWeight: 800, letterSpacing: '-0.02em' }}>{streak}</span>
        <span style={{ fontSize: 11, color: DIM, fontFamily: MONO, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {streak === 1 ? 'session' : 'sessions'} clean
        </span>
      </div>
      <div style={{ fontSize: 11, color: MUTED, fontFamily: SANS, lineHeight: 1.6 }}>
        Streak counts consecutive past sessions where the bot did not hit lockout. {lockedToday ? 'Today\'s session is below the loss limit.' : 'A lockout breaks the streak.'}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
        <StatRow label="Today realized" value={fmtD(today?.realizedPL || 0)} color={(today?.realizedPL || 0) >= 0 ? LIME : RED} />
        <StatRow label="Today taken" value={today?.taken || 0} />
        <StatRow label="Today skipped" value={(today?.skipped || 0) + (today?.expired || 0)} />
      </div>
    </Card>
  )
}

export default function BotPatternsPanel({ patterns }) {
  if (!patterns) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
      <SetupPerformance bySetup={patterns.bySetup} />
      <SkipQuality skip={patterns.skip} />
      <DisciplineStreak streak={patterns.disciplineStreak} today={patterns.today} />
    </div>
  )
}
