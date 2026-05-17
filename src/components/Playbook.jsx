import { useMemo, useEffect, useState } from 'react'
import { useLocalStorage } from '../hooks/useStore.js'
import { LIME, RED, YELLOW, MONO, SANS, BORDER, todayStr, getSession, SESSION_LABELS, SESSION_TIPS, fmtD, fmtU } from '../constants.js'

const SUBTABS = [
  { id: 'process',  label: 'PROCESS' },
  { id: 'rules',    label: 'RULES' },
  { id: 'decision', label: 'DECISION' },
]

const NON_NEGOTIABLES = [
  { n: 1, text: 'Three losses = stop. Close the platform.', tier: 'hard' },
  { n: 2, text: 'Hit daily loss limit = stop. The app locks you out.', tier: 'hard' },
  { n: 3, text: '10:30–1:30 CT = no new trades. Ever.', tier: 'hard' },
  { n: 4, text: '2:45 CT = exit all 0DTE. Right now.', tier: 'hard' },
  { n: 5, text: 'Feeling emotional = stop. Come back tomorrow.', tier: 'hard' },
  { n: 6, text: 'R:R below 2:1 = no trade. The math must work first.', tier: 'filter' },
  { n: 7, text: 'Checklist incomplete = no trade. Every box green.', tier: 'filter' },
  { n: 8, text: 'Alignment score below 55 = no trade. Wait.', tier: 'filter' },
  { n: 9, text: 'No candle CLOSE confirmation = no trade. Wicks don\'t count.', tier: 'filter' },
  { n: 10, text: '"I want to trade" is not a reason. The system decides.', tier: 'filter' },
]

const PROCESS_BLOCKS = [
  { time: 'NIGHT BEFORE', morning: true, steps: [
    'Prep tab → Load Market Data',
    'Generate AI Brief → read it → save it',
    'Write your 3 key levels on paper',
    'Check Calendar tab for tomorrow\'s events',
    'Set daily loss limit and max trades',
    'Close the laptop',
  ]},
  { time: '7:30 CT', morning: true, steps: [
    'Coffee before screens',
    'Read your brief again',
    'Check for high-impact events today',
    'If CPI/FOMC before 9am ET → NO TRADING TODAY',
  ]},
  { time: '8:00–8:30 CT — PRE-MARKET', morning: true, steps: [
    'Open Pre-Market panel in Command tab',
    'Note gap size and direction',
    'Is price above or below VWAP?',
    'Is pre-market trending or chopping?',
    'Open TradingView — mark your levels',
    'HANDS OFF — do not trade pre-market',
  ]},
  { time: '8:30 CT — MARKET OPENS', steps: [
    'Watch only. Do not touch anything.',
    'First 15 minutes = noise. You are not smarter than the noise.',
  ]},
  { time: '8:30–8:45 CT — OR FORMING', steps: [
    'Watch OR build on TradingView',
    'Note OR high and OR low developing',
  ]},
  { time: '8:45 CT — OR CLOSES', steps: [
    'Enter ORH and ORL into ORB tab',
    'These are now your primary trigger levels',
    'Is a breakout or retest developing?',
  ]},
  { time: '8:45–10:30 CT — YOUR WINDOW', steps: [
    'Wait for price to TOUCH a key level',
    'Wait for 5-min candle to CLOSE above/below it',
    'Check alignment score (must be 70+)',
    'Check setup quality (ON LEVEL or APPROACHING)',
    'Run the checklist (all green)',
    'Run the calculator (2:1 R:R minimum)',
    'If all pass → go to broker → execute → set stop immediately',
  ]},
  { time: '10:30 CT — CHOP ZONE STARTS', steps: [
    'No new positions. Close the platform if needed.',
    'If in a trade: trail stop to breakeven or close',
    'Do not hold through chop hoping for more',
  ]},
  { time: '1:30 CT — POWER HOUR', steps: [
    'One more window if morning missed',
    'Same rules. Half size. Tighter stops.',
  ]},
  { time: '2:45 CT — HARD EXIT', steps: [
    'Close ALL 0DTE positions. Right now.',
    'No exceptions.',
  ]},
  { time: 'END OF DAY', steps: [
    'Journal tab → log every trade',
    'Prep tab → EOD Reset → 3 sentences',
    'Hit EOD Coach button → read it',
    'Close the laptop',
  ]},
]

const DECISIONS = [
  { q: 'Is it 8:45–10:30 CT or 1:30–2:45 CT?', cont: 'YES', stop: 'DO NOT TRADE. Wait for your window.' },
  { q: 'High-impact economic event right now?', cont: 'NO', stop: 'DO NOT TRADE. Stand aside.' },
  { q: 'Did a 5-min candle CLOSE above/below a level?', cont: 'YES', stop: 'Wait. Watch. Do nothing.' },
  { q: 'Is alignment score 70 or above?', cont: 'YES', stop: 'Stand aside or wait for alignment.' },
  { q: 'Setup quality ON LEVEL or APPROACHING?', cont: 'YES', stop: 'Between levels = no edge = no trade.' },
  { q: 'Is the checklist 100% complete?', cont: 'YES', stop: 'Complete it honestly or no trade.' },
  { q: 'Calculator shows 2:1 R:R or better?', cont: 'YES', stop: "The math doesn't work. No trade." },
]

const QUOTES_BY_DAY = {
  Monday:    'The system is the boss. Not you. Not your gut. Not your P&L.',
  Tuesday:   'A disciplined loss is a win. An undisciplined win is a loss.',
  Wednesday: 'Doing nothing IS the trade during chop zone.',
  Thursday:  'You don\'t need to trade every day. You need to trade well on the days you trade.',
  Friday:    'The best traders are bored most of the time. Boredom means the system is working.',
  Saturday:  'A disciplined loss is a win. An undisciplined win is a loss.',
  Sunday:    'The system is the boss. Not you. Not your gut. Not your P&L.',
}

const QUICK_REF = {
  'LEVEL TYPES': [
    ['VWAP', 'purple'],
    ['PDH / PDL', 'white'],
    ['Pivots', 'orange / blue'],
    ['OR High / Low', 'lime'],
    ['Golden Pocket', 'lime glow'],
    ['POC', 'white, thicker'],
  ],
  'SETUP QUALITY': [
    ['ON LEVEL', 'trade'],
    ['APPROACHING', 'get ready'],
    ['TIGHT RANGE', 'watch for breakout'],
    ['BETWEEN', 'wait'],
  ],
  'SESSION TIMES': [
    ['Pre-market', '4:00–8:30 CT'],
    ['Open', '8:30 CT'],
    ['OR closes', '8:45 CT'],
    ['Chop zone', '10:30–1:30 CT'],
    ['Power hour', '1:30 CT'],
    ['Hard exit', '2:45 CT'],
    ['Close', '3:00 CT'],
  ],
}

// ── Decision tree SVG ────────────────────────────────────────────────────────

function DecisionTreeSVG() {
  const DW = 380, DH = 70, SW = 260, SH = 54, VGAP = 40, RX = 460
  const totalH = DECISIONS.length * (DH + VGAP) + 100
  const finalY = DECISIONS.length * (DH + VGAP)

  return (
    <svg viewBox={`0 0 ${RX + SW} ${totalH}`} width="100%" style={{ maxWidth: 760, fontFamily: MONO, display: 'block', margin: '0 auto' }}>
      <defs>
        <marker id="arrLime" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={LIME} />
        </marker>
        <marker id="arrRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={RED} />
        </marker>
      </defs>

      {DECISIONS.map((d, i) => {
        const y = i * (DH + VGAP)
        const nextY = (i + 1) * (DH + VGAP)
        const stopY = y + (DH - SH) / 2
        return (
          <g key={i}>
            {/* Decision box */}
            <rect x="0" y={y} width={DW} height={DH} rx="6" fill="#0c1212" stroke="#2a3a32" strokeWidth="1.5" />
            <text x={DW / 2} y={y + DH / 2 + 5} textAnchor="middle" fill="#e8e8e8" fontSize="13" fontWeight="600">{d.q}</text>

            {/* Stop box on the right */}
            <rect x={RX} y={stopY} width={SW} height={SH} rx="4" fill="#150505" stroke={`${RED}66`} strokeWidth="1.2" />
            <text x={RX + SW / 2} y={stopY + 20} textAnchor="middle" fill={RED} fontSize="10" fontWeight="700" letterSpacing="0.08em">{d.cont === 'YES' ? 'NO →' : 'YES →'}</text>
            <foreignObject x={RX + 8} y={stopY + 24} width={SW - 16} height={SH - 26}>
              <div style={{ fontSize: 11, fontFamily: MONO, color: '#cc7a7a', lineHeight: 1.4, textAlign: 'center' }}>{d.stop}</div>
            </foreignObject>

            {/* Horizontal arrow from decision → stop */}
            <line x1={DW} y1={y + DH / 2} x2={RX - 2} y2={y + DH / 2} stroke={RED} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrRed)" />

            {/* Vertical arrow down to next decision (or to execute) */}
            {i < DECISIONS.length - 1 ? (
              <line x1={DW / 2} y1={y + DH} x2={DW / 2} y2={nextY - 2} stroke={LIME} strokeWidth="1.8" markerEnd="url(#arrLime)" />
            ) : (
              <line x1={DW / 2} y1={y + DH} x2={DW / 2} y2={finalY - 2} stroke={LIME} strokeWidth="1.8" markerEnd="url(#arrLime)" />
            )}

            {/* YES/NO labels */}
            <text x={DW / 2 + 12} y={y + DH + 18} fill={LIME} fontSize="10" fontWeight="700">{d.cont} ↓</text>
          </g>
        )
      })}

      {/* Final EXECUTE box */}
      <rect x="0" y={finalY} width={DW} height="80" rx="6" fill="#0a1208" stroke={LIME} strokeWidth="2" />
      <text x={DW / 2} y={finalY + 30} textAnchor="middle" fill={LIME} fontSize="16" fontWeight="900" letterSpacing="0.14em">▼ EXECUTE</text>
      <text x={DW / 2} y={finalY + 55} textAnchor="middle" fill="#88aa70" fontSize="11">Go to broker. Buy at ask. Set stop immediately.</text>
    </svg>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Playbook({ trades, settings, lockedOut }) {
  const [pbState, setPbState] = useLocalStorage('th-playbook', { date: '', steps: {} })
  const [subTab, setSubTab] = useState('process')
  const today = todayStr()

  // Reset checks at midnight CT (we use ymd which is local; close enough for personal use)
  useEffect(() => {
    if (pbState.date !== today) setPbState({ date: today, steps: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const checks = pbState.date === today ? pbState.steps : {}
  function toggle(key) {
    setPbState(prev => ({ date: today, steps: { ...((prev.date === today ? prev.steps : {})), [key]: !((prev.date === today ? prev.steps : {})[key]) } }))
  }

  // ── Status data ─────────────────────────────────────────────────────────────
  const session = getSession()
  const sessionLabel = SESSION_LABELS[session]
  const tt = trades.filter(t => t.date?.slice(0, 10) === today)
  const todayPnl = tt.reduce((a, t) => a + (t.pnl || 0), 0)
  const lossUsed = Math.abs(Math.min(todayPnl, 0))
  const lossRemaining = Math.max(0, (settings.dailyLossLimit || 0) - lossUsed)
  const maxTrades = settings.maxTradesPerDay || 0
  const tradesLeft = maxTrades > 0 ? Math.max(0, maxTrades - tt.length) : null

  const rightNow = SESSION_TIPS[session]

  // ── Morning routine progress (first 3 blocks: NIGHT BEFORE + 7:30 + 8:00-8:30) ──
  const morningTotal = useMemo(() => PROCESS_BLOCKS.filter(b => b.morning).reduce((s, b) => s + b.steps.length, 0), [])
  const morningDone = useMemo(() => {
    let n = 0
    PROCESS_BLOCKS.forEach((b, bi) => {
      if (!b.morning) return
      b.steps.forEach((_, si) => { if (checks[`${bi}_${si}`]) n++ })
    })
    return n
  }, [checks])

  // ── Quote of the day ────────────────────────────────────────────────────────
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' })
  const quote = QUOTES_BY_DAY[day] || QUOTES_BY_DAY.Monday

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="pb-root" style={{ fontFamily: SANS, color: '#d0d0d0', maxWidth: 820, margin: '0 auto', paddingBottom: 80 }}>
      <style>{`
        .pb-h1 { font-family: ${MONO}; font-weight: 900; font-size: 28px; letter-spacing: -0.02em; color: #e8e8e8; margin: 0; }
        .pb-h2 { font-family: ${MONO}; font-weight: 800; font-size: 18px; letter-spacing: 0.18em; color: #aaa; text-transform: uppercase; margin: 0 0 6px; }
        .pb-sub { font-family: ${MONO}; font-size: 12px; color: #555; letter-spacing: 0.06em; margin: 0 0 28px; }
        .pb-section { margin: 64px 0; }
        .pb-rule { display: flex; gap: 16px; align-items: baseline; padding: 14px 18px; border-left: 3px solid transparent; transition: background 0.2s; }
        .pb-rule:hover { background: #0a0a0a; }
        .pb-rule.hard { border-color: #FF4D4D55; }
        .pb-rule.filter { border-color: #FFD16655; }
        .pb-rule-n { font-family: ${MONO}; font-weight: 900; color: #444; min-width: 28px; font-size: 14px; }
        .pb-rule-t { font-family: ${MONO}; color: #cfcfcf; font-size: 14px; line-height: 1.6; }
        .pb-block { padding: 18px 0 22px 24px; border-left: 1px solid #1e1e1e; position: relative; }
        .pb-block::before { content: ''; position: absolute; left: -5px; top: 24px; width: 9px; height: 9px; border-radius: 50%; background: #2a2a2a; border: 2px solid #0a0a0a; }
        .pb-time { font-family: ${MONO}; font-weight: 800; font-size: 11px; color: #888; letter-spacing: 0.14em; margin-bottom: 10px; }
        .pb-step { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; cursor: pointer; }
        .pb-step:hover .pb-step-t { color: #e8e8e8; }
        .pb-cb { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #444; flex-shrink: 0; margin-top: 3px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .pb-cb.on { background: ${LIME}; border-color: ${LIME}; }
        .pb-cb.on::after { content: '✓'; color: #000; font-size: 10px; font-weight: 900; }
        .pb-step-t { font-family: ${MONO}; font-size: 13px; color: #888; line-height: 1.6; transition: color 0.15s; }
        .pb-step.done .pb-step-t { color: #444; text-decoration: line-through; }
        .pb-quote { font-family: ${SANS}; font-style: italic; font-size: 20px; line-height: 1.65; color: #c8c8c8; text-align: center; padding: 30px 28px; border: 1px solid ${LIME}33; border-radius: 6px; background: linear-gradient(180deg, #0a0e08 0%, #0a0a0a 100%); }
        .pb-question { font-family: ${SANS}; font-size: 22px; line-height: 1.6; color: #e8e8e8; text-align: center; padding: 44px 32px; border: 1px solid ${LIME}55; border-radius: 8px; background: #0a0f08; box-shadow: 0 0 32px ${LIME}11; }
        .pb-question em { color: ${LIME}; font-style: normal; font-weight: 700; }
        .pb-ref-col { padding: 14px 0; }
        .pb-ref-col h4 { font-family: ${MONO}; font-size: 10px; letter-spacing: 0.18em; color: #666; font-weight: 700; margin: 0 0 14px; text-transform: uppercase; }
        .pb-ref-row { display: flex; justify-content: space-between; padding: 5px 0; font-family: ${MONO}; font-size: 12px; }
        .pb-ref-l { color: #cfcfcf; }
        .pb-ref-r { color: #666; }
        .pb-emergency { display: grid; gap: 6px; padding: 22px 24px; border-top: 1px solid #2a0a0a; background: #0a0606; border-radius: 6px; margin-top: 64px; }
        .pb-emer-line { font-family: ${MONO}; font-size: 12px; color: #aa5555; letter-spacing: 0.04em; }
        .pb-emer-line strong { color: ${RED}; font-weight: 700; }
        @media (max-width: 720px) {
          .pb-ref-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
          .pb-decision-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      {/* ── Sub-tab switcher ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 36, borderBottom: '1px solid #161616' }}>
        {SUBTABS.map(t => {
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? `2px solid ${LIME}` : '2px solid transparent',
                color: active ? LIME : '#555',
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.18em',
                padding: '10px 18px',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── PROCESS sub-tab: status + process timeline + quick reference ───── */}
      {subTab === 'process' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: '14px 18px', background: '#0c0c0c', border: `1px solid ${BORDER}`, borderRadius: 5, marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#888', letterSpacing: '0.04em' }}>{dateLabel}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: LIME, letterSpacing: '0.14em', border: `1px solid ${LIME}33`, borderRadius: 3, padding: '2px 8px' }}>{sessionLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', fontFamily: MONO, fontSize: 11 }}>
              <span style={{ color: '#666' }}>Trades: <strong style={{ color: maxTrades && tt.length >= maxTrades ? RED : '#e8e8e8' }}>{tt.length}{maxTrades ? `/${maxTrades}` : ''}</strong></span>
              <span style={{ color: '#666' }}>P&L: <strong style={{ color: todayPnl >= 0 ? LIME : RED }}>{fmtD(todayPnl)}</strong></span>
              <span style={{ color: '#666' }}>Loss remaining: <strong style={{ color: lossRemaining === 0 && settings.dailyLossLimit > 0 ? RED : '#e8e8e8' }}>{settings.dailyLossLimit > 0 ? fmtU(lossRemaining) : '—'}</strong></span>
              {lockedOut && <span style={{ color: RED, fontWeight: 700, letterSpacing: '0.1em' }}>LOCKED</span>}
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: '#666', marginBottom: 56, padding: '0 4px', lineHeight: 1.6, fontStyle: 'italic' }}>
            Right now: {rightNow}
          </div>

          <section className="pb-section" style={{ marginTop: 0 }}>
            <h2 className="pb-h2">The Process</h2>
            <p className="pb-sub">Follow this in order. Every day.</p>

            <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#888' }}>Morning routine: <strong style={{ color: morningDone === morningTotal && morningTotal > 0 ? LIME : '#e8e8e8' }}>{morningDone}/{morningTotal}</strong> complete</span>
              <div style={{ width: 200, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${morningTotal > 0 ? (morningDone / morningTotal) * 100 : 0}%`, background: morningDone === morningTotal && morningTotal > 0 ? LIME : YELLOW, transition: 'width 0.3s' }} />
              </div>
            </div>

            <div>
              {PROCESS_BLOCKS.map((block, bi) => (
                <div key={bi} className="pb-block">
                  <div className="pb-time" style={{ color: block.morning ? LIME : '#888' }}>{block.time}</div>
                  {block.steps.map((step, si) => {
                    const key = `${bi}_${si}`
                    const done = !!checks[key]
                    return (
                      <div key={si} className={`pb-step ${done ? 'done' : ''}`} onClick={() => toggle(key)}>
                        <span className={`pb-cb ${done ? 'on' : ''}`} />
                        <span className="pb-step-t">{step}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>

          <section className="pb-section">
            <h2 className="pb-h2">Quick Reference</h2>
            <div className="pb-ref-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 36 }}>
              {Object.entries(QUICK_REF).map(([col, rows]) => (
                <div key={col} className="pb-ref-col">
                  <h4>{col}</h4>
                  {rows.map(([l, r], i) => (
                    <div key={i} className="pb-ref-row">
                      <span className="pb-ref-l">{l}</span>
                      <span className="pb-ref-r">{r}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── RULES sub-tab: non-negotiables + one question + mindset + emergency ── */}
      {subTab === 'rules' && (
        <>
          <section className="pb-section" style={{ marginTop: 0 }}>
            <h2 className="pb-h2">The Non-Negotiables</h2>
            <p className="pb-sub">These override everything. Every day. No exceptions.</p>
            <div>
              {NON_NEGOTIABLES.map(r => (
                <div key={r.n} className={`pb-rule ${r.tier}`}>
                  <span className="pb-rule-n">{r.n}.</span>
                  <span className="pb-rule-t">{r.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="pb-section">
            <div className="pb-question">
              Before every trade ask:<br />
              Am I taking this because the <em>SYSTEM</em> says to,<br />
              or because I <em>WANT</em> to?<br />
              <br />
              <span style={{ fontSize: 16, color: '#999' }}>If the answer is "because I want to" — you don't take it.</span>
            </div>
          </section>

          <section className="pb-section">
            <div className="pb-quote">"{quote}"</div>
            <div style={{ textAlign: 'center', fontFamily: MONO, fontSize: 10, color: '#444', marginTop: 12, letterSpacing: '0.16em' }}>{day.toUpperCase()}</div>
          </section>

          <div className="pb-emergency">
            <div className="pb-emer-line"><strong>Three losses today?</strong> STOP. Close this tab.</div>
            <div className="pb-emer-line"><strong>Feeling revenge?</strong> STOP. Walk away.</div>
            <div className="pb-emer-line"><strong>Already hit your limit?</strong> STOP. Come back tomorrow.</div>
          </div>
        </>
      )}

      {/* ── DECISION sub-tab: just the decision tree, with room to breathe ──── */}
      {subTab === 'decision' && (
        <section className="pb-section" style={{ marginTop: 0 }}>
          <h2 className="pb-h2">The Decision Tree</h2>
          <p className="pb-sub">Every time you think you see a setup.</p>
          <div className="pb-decision-wrap">
            <DecisionTreeSVG />
          </div>
        </section>
      )}
    </div>
  )
}
