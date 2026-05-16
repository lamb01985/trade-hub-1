import { useState, useEffect } from 'react'
import { Card, SLabel, Heading, Tile, Fld, Sel, Btn } from './ui.jsx'
import { LIME, RED, YELLOW, MONO, BORDER, SESSION_LABELS, SESSION_COLORS, SESSION_TIPS, getSession, todayStr, f2, fmtD, fmtU } from '../constants.js'

export default function Command({ trades, settings, onSettingsChange, lockedOut, onUnlock, apiKey, onApiKeyChange, anthropicKey, onAnthropicKeyChange, liveData, marketEvents }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const ts = todayStr()
  const tt = trades.filter(t => t.date.slice(0, 10) === ts)
  const todayPnl = tt.reduce((a, t) => a + (t.pnl || 0), 0)
  const todayClosed = tt.filter(t => t.status !== 'open')
  const todayWins = tt.filter(t => t.status === 'win').length
  const session = getSession()
  const sessionColor = SESSION_COLORS[session]

  const etTime = time.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const ctTime = time.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const closed = [...trades].filter(t => t.status === 'win' || t.status === 'loss').reverse()
  let streak = 0; for (const t of closed) { if (t.status === 'loss') streak++; else break }

  const lossUsed = Math.abs(Math.min(todayPnl, 0))
  const lpct = settings.dailyLossLimit > 0 ? (lossUsed / settings.dailyLossLimit) * 100 : 0

  const orLabels = { '5': '8:35 CT', '15': '8:45 CT', '30': '9:00 CT' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {lockedOut && (
        <div style={{ background: '#1a0000', border: `1px solid ${RED}44`, borderRadius: 5, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: RED, fontFamily: MONO }}>TRADING LOCKED</div>
            <div style={{ fontSize: 11, color: '#aa5555', fontFamily: MONO, marginTop: 4 }}>Daily loss limit reached. Step away and review.</div>
          </div>
          <Btn variant="danger" small onClick={onUnlock}>Override?</Btn>
        </div>
      )}

      {marketEvents && (
        <div style={{ background: '#110e00', border: `1px solid ${YELLOW}44`, borderRadius: 5, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ color: YELLOW, fontSize: 16, flexShrink: 0, lineHeight: 1.2 }}>⚠</span>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: YELLOW, fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>Market Event</div>
            <div style={{ fontSize: 12, color: '#c8a030', fontFamily: MONO, lineHeight: 1.5 }}>{marketEvents} — reassess size and setup before trading</div>
          </div>
        </div>
      )}

      {/* Setup CTA — shown when no API key */}
      {!apiKey && (
        <div style={{ background: '#0c1408', border: `1px solid ${LIME}33`, borderRadius: 5, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: LIME, fontFamily: MONO, letterSpacing: '0.08em', marginBottom: 6 }}>STEP 1 — CONNECT LIVE DATA</div>
          <div style={{ fontSize: 13, color: '#888', fontFamily: MONO, lineHeight: 1.7, marginBottom: 14 }}>
            Paste your Massive API key below to activate real-time QQQ price, VWAP, pivot levels, and WebSocket streaming. Get your key at <span style={{ color: LIME }}>massive.com</span> → Options Advanced plan → Dashboard.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Fld label="Massive API Key" value={apiKey || ''} onChange={v => onApiKeyChange(v.trim())} type="text" placeholder="paste your key here — levels activate immediately" mono />
            </div>
          </div>
          <div style={{ fontSize: 10, color: '#555', fontFamily: MONO, marginTop: 10 }}>Key stored in your browser only. Never sent to any server except api.polygon.io.</div>
        </div>
      )}

      {/* Live price + VWAP */}
      {liveData?.price && (
        <div style={{ background: '#0a1206', border: `1px solid ${LIME}28`, borderRadius: 5, padding: '18px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <SLabel color="#5a7a5a">Live QQQ — {liveData.connected ? 'WebSocket' : 'Polling'}</SLabel>
              <div style={{ fontSize: 48, fontWeight: 900, fontFamily: MONO, color: '#e8e8e8', letterSpacing: '-0.03em', lineHeight: 1 }}>${f2(liveData.price)}</div>
              {liveData.bid && liveData.ask && (
                <div style={{ fontSize: 11, fontFamily: MONO, color: '#777', marginTop: 6 }}>Bid ${f2(liveData.bid)} / Ask ${f2(liveData.ask)}</div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right' }}>
              {liveData.vwapData && (
                <>
                  <div>
                    <div style={{ fontSize: 9, color: '#666', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em' }}>VWAP</div>
                    <div style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: '#C084FC' }}>${f2(liveData.vwapData.vwap)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#666', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em' }}>vs VWAP</div>
                    <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: liveData.price > liveData.vwapData.vwap ? LIME : RED }}>
                      {liveData.price > liveData.vwapData.vwap ? '+' : ''}{f2(liveData.price - liveData.vwapData.vwap)}
                    </div>
                  </div>
                </>
              )}
              {liveData.wsError && <div style={{ fontSize: 9, color: RED, fontFamily: MONO, maxWidth: 140, textAlign: 'right' }}>{liveData.wsError}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Pre-market gap analysis */}
      {session === 'pre-market' && liveData?.price && liveData?.prevDay && (() => {
        const { price } = liveData
        const { high: pdh, low: pdl, close: pdc } = liveData.prevDay
        if (!pdc || !pdh || !pdl || pdh <= pdl) return null
        const gap = price - pdc
        const priorRange = pdh - pdl
        const gapPct = Math.abs(gap) / priorRange * 100
        const isGapUp = gap >= 0

        const margin = Math.max(priorRange * 0.08, 0.40)
        const minP = Math.min(pdl, price) - margin
        const maxP = Math.max(pdh, price) + margin
        const totalR = maxP - minP
        const toPct = v => `${((v - minP) / totalR * 100).toFixed(1)}%`

        let context, ctxColor
        if (gapPct < 25) { context = 'Small gap — likely fills before trending'; ctxColor = YELLOW }
        else if (gapPct <= 50) { context = 'Moderate gap — watch for fill attempt before trend'; ctxColor = YELLOW }
        else { context = `Large gap — gap-and-go likely, OR forms ${isGapUp ? 'above' : 'below'} prior range`; ctxColor = LIME }

        return (
          <div style={{ background: '#0d0d08', border: `1px solid ${YELLOW}33`, borderRadius: 5, padding: '14px 18px' }}>
            <SLabel>Pre-Market Gap Analysis</SLabel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, fontFamily: MONO, color: isGapUp ? LIME : RED, lineHeight: 1 }}>
                  {isGapUp ? '▲' : '▼'} {isGapUp ? '+' : ''}{f2(gap)}
                </div>
                <div style={{ fontSize: 10, color: '#555', fontFamily: MONO, marginTop: 4 }}>
                  {f2(gapPct)}% of prior range · PDC ${f2(pdc)} → PM ${f2(price)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, color: '#333', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Prior Range</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: '#555' }}>${f2(pdl)} – ${f2(pdh)}</div>
              </div>
            </div>

            {/* Position bar */}
            <div style={{ position: 'relative', height: 6, background: '#1a1a1a', borderRadius: 3, margin: '10px 0' }}>
              {/* Prior range band */}
              <div style={{ position: 'absolute', left: toPct(pdl), right: `${100 - parseFloat(toPct(pdh))}%`, top: 0, bottom: 0, background: '#2a2a2a', borderRadius: 3 }} />
              {/* PDC tick */}
              <div style={{ position: 'absolute', left: toPct(pdc), top: -2, bottom: -2, width: 2, background: '#555', transform: 'translateX(-50%)' }} />
              {/* Current price dot */}
              <div style={{ position: 'absolute', left: toPct(price), top: '50%', transform: 'translate(-50%, -50%)', width: 10, height: 10, borderRadius: '50%', background: isGapUp ? LIME : RED, boxShadow: `0 0 6px ${isGapUp ? LIME : RED}88`, zIndex: 1 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#333', fontFamily: MONO, marginBottom: 10 }}>
              <span>PDL ${f2(pdl)}</span><span>PDC ${f2(pdc)}</span><span>PDH ${f2(pdh)}</span>
            </div>

            <div style={{ fontSize: 11, fontFamily: MONO, color: ctxColor }}>{context}</div>
          </div>
        )
      })()}

      {/* Clock + Session */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card>
          <SLabel>Market Clock</SLabel>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: '#e8e8e8' }}>{etTime} ET</div>
          <div style={{ fontSize: 15, color: LIME, fontFamily: MONO, fontWeight: 700, marginTop: 2 }}>{ctTime} CT</div>
          <div style={{ fontSize: 10, color: '#666', fontFamily: MONO, marginTop: 4 }}>OR closes: {orLabels[settings.orPeriod] || '8:45 CT'}</div>
        </Card>
        <Card style={{ border: `1px solid ${sessionColor}33` }}>
          <SLabel>Session</SLabel>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: MONO, color: sessionColor, marginBottom: 6 }}>{SESSION_LABELS[session]}</div>
          <div style={{ fontSize: 11, color: '#666', fontFamily: MONO, lineHeight: 1.5 }}>{SESSION_TIPS[session]}</div>
        </Card>
      </div>

      {/* RIGHT NOW card */}
      {(() => {
        const cfg = {
          'pre-market': {
            color: '#888', bg: '#111', border: '#222',
            action: 'DO NOW',
            steps: [
              'Run "Load Market Data" in Prep tab — auto-fills PDH/PDL/PP/Strike',
              'Hit "Generate AI Brief" for your thesis and level context',
              'Open TradingView — mark your key levels on the 5-min chart',
              'Check IV tab — verify premium isn\'t too expensive',
              'Scan for news or catalysts (earnings, Fed, macro data)',
            ],
            note: 'Do not touch the market until 8:45 CT. Prep is the job right now.',
          },
          'open': {
            color: LIME, bg: '#0a1208', border: '#1e3018',
            action: 'PRIME WINDOW',
            steps: [
              'OR formed at 8:45 CT — load ORH/ORL into the ORB tab',
              'Watch Levels tab — is price touching or approaching a key level?',
              'Wait for a candle CLOSE above/below the level — not just a wick',
              'Calculator tab before entering — confirm 2:1 R:R on premium price',
              'Size one contract until the setup proves out',
            ],
            note: 'Your window is 8:45–10:30 CT. One good trade beats three mediocre ones.',
          },
          'chop': {
            color: YELLOW, bg: '#0e0c04', border: '#2a2010',
            action: 'AVOID ZONE',
            steps: [
              '10:30–1:30 CT — no new entries, no exceptions',
              'Theta is actively burning your premium right now',
              'If you\'re in a trade: trail your stop or close for the win',
              'Use this time to review your morning trades in Journal tab',
              'Update your AI brief notes — what happened vs your plan?',
            ],
            note: 'This is the hardest discipline in day trading. Doing nothing IS the trade.',
          },
          'power-hour': {
            color: '#F97316', bg: '#0e0800', border: '#2a1800',
            action: 'POWER HOUR',
            steps: [
              '1:30–3:00 CT — trend-follow only, no reversals',
              'Watch Levels tab — is price holding above/below key structure?',
              'Tighter stops — premium decay accelerates into close',
              'Smaller size — 1 contract max this late in the day',
              'Hard stop at 2:45 CT — do not hold 0DTE into the last 15 min',
            ],
            note: 'Power hour can move fast. Trust the trend, not your opinion.',
          },
          'after-hours': {
            color: '#555', bg: '#111', border: '#222',
            action: 'MARKET CLOSED',
            steps: [
              'Log all trades in Journal tab — do it now before you forget',
              'EOD review in Prep tab — what did you learn today?',
              'Check tomorrow\'s calendar — earnings, economic data, Fed?',
              'Run "Load Market Data" in Prep tab to pull tonight\'s PDH/PDL',
              'Generate tomorrow\'s AI brief — set your bias while it\'s fresh',
            ],
            note: 'Great traders prep at night. Tomorrow\'s edge is built right now.',
          },
        }
        const c = cfg[session]
        return (
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: '#555', fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>Right Now</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: c.color }}>{c.action}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, boxShadow: session === 'open' ? `0 0 10px ${LIME}` : 'none' }} />
            </div>
            {c.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: i < c.steps.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                <span style={{ color: c.color, fontFamily: MONO, fontSize: 10, minWidth: 16, opacity: 0.6, marginTop: 1 }}>{i + 1}.</span>
                <span style={{ color: session === 'open' ? '#aaa' : '#777', fontFamily: MONO, fontSize: 11, lineHeight: 1.5 }}>{step}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.border}`, fontSize: 10, color: c.color, fontFamily: MONO, opacity: 0.7, fontStyle: 'italic' }}>{c.note}</div>
          </div>
        )
      })()}

      {/* Market context from Massive */}
      {(liveData?.prevDay || liveData?.weeklyData) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {liveData.prevDay && [
            { label: 'PDH', value: `$${f2(liveData.prevDay.high)}`, color: RED },
            { label: 'PDL', value: `$${f2(liveData.prevDay.low)}`, color: '#4488FF' },
            { label: 'PDC', value: `$${f2(liveData.prevDay.close)}`, color: '#888' },
          ].map(({ label, value, color }) => (
            <Tile key={label} compact label={label} value={value} color={color} />
          ))}
        </div>
      )}

      {/* Today stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Tile compact label="Today P&L" value={fmtD(todayPnl)} color={todayPnl >= 0 ? LIME : RED} />
        <Tile compact label="Trades" value={`${tt.length}/${settings.maxTradesPerDay || '∞'}`} color={settings.maxTradesPerDay && tt.length >= settings.maxTradesPerDay ? RED : '#e8e8e8'} />
        <Tile compact label="Win Rate" value={todayClosed.length ? `${Math.round((todayWins / todayClosed.length) * 100)}%` : '—'} color={todayClosed.length && todayWins / todayClosed.length >= 0.5 ? LIME : '#e8e8e8'} />
        <Tile compact label="Loss Streak" value={streak > 0 ? `-${streak}` : '0'} color={streak >= 3 ? RED : streak >= 2 ? YELLOW : LIME} sub={streak >= 3 ? 'Stop. No revenge.' : streak >= 2 ? 'Reduce size' : ''} />
      </div>

      {/* Loss limit bar */}
      {settings.dailyLossLimit > 0 && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <SLabel>Daily Loss Limit</SLabel>
            <span style={{ fontSize: 11, fontFamily: MONO, color: lossUsed >= settings.dailyLossLimit ? RED : '#777' }}>{fmtU(lossUsed)} / {fmtU(settings.dailyLossLimit)}</span>
          </div>
          <div style={{ height: 5, background: '#111', borderRadius: 3, overflow: 'hidden', border: '1px solid #222' }}>
            <div style={{ height: '100%', width: `${Math.min(lpct, 100)}%`, background: lpct >= 100 ? RED : lpct >= 70 ? YELLOW : LIME, borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 10, color: '#666', fontFamily: MONO, marginTop: 6 }}>{lpct >= 100 ? 'Locked.' : `${fmtU(settings.dailyLossLimit - lossUsed)} remaining`}</div>
        </Card>
      )}

      {/* Risk controls */}
      <Card>
        <SLabel>Risk Controls</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Fld label="Daily Loss Limit" value={settings.dailyLossLimit || ''} onChange={v => onSettingsChange({ ...settings, dailyLossLimit: parseFloat(v) || 0 })} placeholder="500" prefix="$" />
          <Fld label="Max Trades" value={settings.maxTradesPerDay || ''} onChange={v => onSettingsChange({ ...settings, maxTradesPerDay: parseInt(v) || 0 })} placeholder="5" step="1" />
          <Sel label="OR Period" value={settings.orPeriod || '15'} onChange={v => onSettingsChange({ ...settings, orPeriod: v })} options={[{ value: '5', label: '5 min' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }]} />
        </div>
      </Card>

      {/* Massive API key — shown here when already set, for editing */}
      {apiKey && (
        <Card style={{ border: '1px solid #222' }}>
          <SLabel>Massive API Connection</SLabel>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Fld label="API Key" value={apiKey || ''} onChange={v => onApiKeyChange(v.trim())} type="text" placeholder="paste your Massive API key here" mono />
            </div>
            <Btn small variant="ghost" onClick={() => onApiKeyChange('')}>Clear</Btn>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: liveData?.connected ? LIME : liveData?.price ? YELLOW : '#444', boxShadow: liveData?.connected ? `0 0 6px ${LIME}` : 'none' }} />
            <span style={{ fontSize: 10, fontFamily: MONO, color: liveData?.connected ? LIME : liveData?.price ? YELLOW : '#666' }}>
              {liveData?.connected ? 'WebSocket connected — real-time streaming' : liveData?.price ? 'REST polling — 10s updates' : 'Connecting...'}
            </span>
          </div>
        </Card>
      )}

      {/* Claude API key */}
      <Card style={{ border: anthropicKey ? '1px solid #1e2a1e' : '1px solid #222' }}>
        <SLabel>Claude AI — Game Plan Generator</SLabel>
        <div style={{ fontSize: 11, color: '#666', fontFamily: MONO, marginBottom: 12, lineHeight: 1.7 }}>
          Powers the <strong style={{ color: '#aaa' }}>AI Brief</strong> button in Prep tab. Claude reads your market data (PDH/PDL, pivots, VWAP, IV) and writes your full game plan: thesis, key levels, entry conditions, ideal setup, what to avoid. Get your key at <span style={{ color: LIME }}>console.anthropic.com</span> → API Keys (same account as claude.ai).
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Fld label="Anthropic API Key" value={anthropicKey || ''} onChange={v => onAnthropicKeyChange(v.trim())} type="text" placeholder="sk-ant-..." mono />
          </div>
          {anthropicKey && <Btn small variant="ghost" onClick={() => onAnthropicKeyChange('')}>Clear</Btn>}
        </div>
        {anthropicKey && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: LIME, boxShadow: `0 0 6px ${LIME}` }} />
            <span style={{ fontSize: 10, fontFamily: MONO, color: LIME }}>Claude AI active — AI Brief available in Prep tab</span>
          </div>
        )}
        <div style={{ fontSize: 9, color: '#444', fontFamily: MONO, marginTop: 8 }}>Key stored in your browser only. Calls go directly to api.anthropic.com.</div>
      </Card>

      {/* Non-negotiables */}
      <div style={{ background: '#0d1208', border: '1px solid #1e2a18', borderRadius: 5, padding: '16px 20px' }}>
        <SLabel>Options ORB Non-Negotiables</SLabel>
        {[
          'Wait for the OR to fully form. Never trade inside the range.',
          'Underlying must CLOSE above/below OR level. Wicks do not count.',
          'Check IV before buying. High IV means expensive premium.',
          'Entry, stop, and target are the OPTION PRICE — not QQQ.',
          'Minimum 2:1 R:R on the contract premium. No exceptions.',
          '10:30–1:30 CT is chop. Theta burns. No new positions.',
          'Three consecutive losses = close the platform.',
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < 6 ? '1px solid #151e10' : 'none' }}>
            <span style={{ color: LIME, fontFamily: MONO, fontSize: 11, minWidth: 18, opacity: 0.5 }}>{i + 1}.</span>
            <span style={{ color: '#6a8060', fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
