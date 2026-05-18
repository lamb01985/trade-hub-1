import { useState, useEffect } from 'react'
import { Card, SLabel, Heading, Tile, Fld, Sel, Btn, Tip } from './ui.jsx'
import { LIME, RED, YELLOW, MONO, BORDER, SESSION_LABELS, SESSION_COLORS, SESSION_TIPS, getSession, getMarketHolidayName, todayStr, f2, fmtD, fmtU } from '../constants.js'

export default function Command({ trades, settings, onSettingsChange, lockedOut, onUnlock, apiKey, onApiKeyChange, anthropicKey, onAnthropicKeyChange, liveData, marketEvents, instrument, ticker = 'QQQ', levelMap, todayEvents = [], schwabCreds, onSchwabCredsChange, schwabToken, onSchwabTokenChange, schwabAccount, schwabAcctInfo, schwabDayTrades = 0, schwabConnectError }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const ts = todayStr()
  const tt = trades.filter(t => t.date.slice(0, 10) === ts)
  const todayPnl = tt.reduce((a, t) => a + (t.pnl || 0), 0)
  const todayClosed = tt.filter(t => t.status !== 'open')
  const todayWins = tt.filter(t => t.status === 'win').length
  const session = getSession()
  const sessionColor = SESSION_COLORS[session]
  const holidayName = getMarketHolidayName()

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

      {/* Onboarding — shown when no API key */}
      {!apiKey && (() => {
        const step1Done = !!apiKey
        const step2Done = !!anthropicKey
        const step3Done = settings.dailyLossLimit > 0 && settings.maxTradesPerDay > 0
        const doneCount = [step1Done, step2Done, step3Done].filter(Boolean).length

        const steps = [
          { n: 1, title: 'Connect Live Data', subtitle: 'Required', done: step1Done },
          { n: 2, title: 'Connect AI', subtitle: 'Optional but powerful', done: step2Done },
          { n: 3, title: 'Set Your Risk Rules', subtitle: 'Required', done: step3Done },
        ]

        return (
          <div style={{ background: '#0c1408', border: `1px solid ${LIME}33`, borderRadius: 5, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 9, color: '#5a7a5a', fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Getting Started</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {steps.map((s, i) => (
                  <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.done ? LIME : '#1a2a18', border: `1px solid ${s.done ? LIME : '#2a3a28'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontFamily: MONO, fontWeight: 900, color: s.done ? '#000' : '#3a5a38' }}>{s.done ? '✓' : s.n}</span>
                    </div>
                    {i < 2 && <div style={{ width: 32, height: 1, background: '#1e2e1e' }} />}
                  </div>
                ))}
                <span style={{ fontSize: 10, fontFamily: MONO, color: '#4a6a48', marginLeft: 6, alignSelf: 'center' }}>{doneCount}/3 complete</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: LIME, fontFamily: MONO, letterSpacing: '0.08em', marginBottom: 4 }}>Step 1 of 3 — Connect Data</div>
                <div style={{ fontSize: 12, color: '#666', fontFamily: MONO, lineHeight: 1.7, marginBottom: 10 }}>Add your Massive API key below. This connects live price, VWAP, pivot levels, and the level map. Everything activates automatically.</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Fld label="Massive API Key" value={apiKey || ''} onChange={v => onApiKeyChange(v.trim())} type="text" placeholder="paste your key here — levels activate immediately" mono />
                  </div>
                </div>
                <div style={{ fontSize: 9, color: '#333', fontFamily: MONO, marginTop: 6 }}>Key stored in your browser only. Calls go to api.polygon.io.</div>
              </div>

              <div style={{ borderTop: '1px solid #1a2a18', paddingTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: step2Done ? LIME : '#666', fontFamily: MONO, letterSpacing: '0.08em', marginBottom: 4 }}>Step 2 of 3 — Connect AI <span style={{ color: '#3a4a38', fontWeight: 400 }}>(optional)</span></div>
                <div style={{ fontSize: 12, color: '#555', fontFamily: MONO, lineHeight: 1.7, marginBottom: 10 }}>Add your Claude API key to enable AI morning briefs. Claude reads your market data and writes your full game plan each morning.</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Fld label="Anthropic API Key" value={anthropicKey || ''} onChange={v => onAnthropicKeyChange(v.trim())} type="text" placeholder="sk-ant-..." mono />
                  </div>
                </div>
                <div style={{ fontSize: 9, color: '#333', fontFamily: MONO, marginTop: 6 }}>Calls go directly to api.anthropic.com. Same account as claude.ai.</div>
              </div>

              <div style={{ borderTop: '1px solid #1a2a18', paddingTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: step3Done ? LIME : '#666', fontFamily: MONO, letterSpacing: '0.08em', marginBottom: 4 }}>Step 3 of 3 — Set Your Risk Rules</div>
                <div style={{ fontSize: 12, color: '#555', fontFamily: MONO, lineHeight: 1.7, marginBottom: 10 }}>Set your daily loss limit and max trades. The app locks you out automatically when hit. This is non-negotiable.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Fld label="Daily Loss Limit" value={settings.dailyLossLimit || ''} onChange={v => onSettingsChange({ ...settings, dailyLossLimit: parseFloat(v) || 0 })} placeholder="500" prefix="$" />
                  <Fld label="Max Trades Per Day" value={settings.maxTradesPerDay || ''} onChange={v => onSettingsChange({ ...settings, maxTradesPerDay: parseInt(v) || 0 })} placeholder="5" step="1" />
                </div>
              </div>

              {doneCount === 3 && (
                <div style={{ background: '#071208', border: `1px solid ${LIME}44`, borderRadius: 4, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: LIME, fontFamily: MONO, marginBottom: 3 }}>You're ready.</div>
                  <div style={{ fontSize: 11, color: '#5a7a5a', fontFamily: MONO }}>Start each day in the Prep tab.</div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Live price + VWAP */}
      {liveData?.price && (
        <div style={{ background: '#0a1206', border: `1px solid ${LIME}28`, borderRadius: 5, padding: '18px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <SLabel color="#5a7a5a">LIVE {ticker} — {liveData.connected ? 'WebSocket' : 'Polling'}</SLabel>
              <div style={{ fontSize: 48, fontWeight: 900, fontFamily: MONO, color: '#e8e8e8', letterSpacing: '-0.03em', lineHeight: 1 }}>${f2(liveData.price)}</div>
              {liveData.bid && liveData.ask && (
                <div style={{ fontSize: 11, fontFamily: MONO, color: '#777', marginTop: 6 }}>Bid ${f2(liveData.bid)} / Ask ${f2(liveData.ask)}</div>
              )}
              {liveData.volProfile?.poc != null && (() => {
                const poc = liveData.volProfile.poc
                const diff = liveData.price - poc
                const rel = Math.abs(diff) < 0.10 ? 'at' : diff > 0 ? 'above' : 'below'
                const c = rel === 'above' ? LIME : rel === 'below' ? RED : YELLOW
                return (
                  <div style={{ fontSize: 11, fontFamily: MONO, color: '#888', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    POC: <strong style={{ color: '#FFFFFF' }}>${f2(poc)}</strong>
                    <span style={{ color: c, fontWeight: 700 }}>({rel}{rel !== 'at' ? ` by $${f2(Math.abs(diff))}` : ''})</span>
                  </div>
                )
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right' }}>
              {liveData.vwapData && (
                <>
                  <div>
                    <div style={{ fontSize: 9, color: '#666', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>VWAP<Tip tip="Volume Weighted Average Price — the average price weighted by volume. Institutions use VWAP as their anchor. Price above = bullish structure, below = bearish. Watch for price to reclaim or reject VWAP as your directional signal." /></div>
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
              {(session === 'weekend' || session === 'holiday') ? (
                <div>
                  <div style={{ fontSize: 9, color: '#666', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em' }}>RVOL</div>
                  <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: '#666' }}>unavailable</div>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: '#444', marginTop: 2 }}>market closed</div>
                </div>
              ) : liveData.rvol != null && (
                <div>
                  <div style={{ fontSize: 9, color: '#666', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center' }}>RVOL<Tip tip="Relative Volume — how today's volume compares to the average at this time of day. Above 1.5x means institutional activity is elevated and moves are real. Below 0.8x means low conviction — don't chase breakouts." /></div>
                  <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: liveData.rvol >= 1.2 ? LIME : liveData.rvol >= 0.8 ? YELLOW : RED }}>
                    {liveData.rvol.toFixed(2)}x
                  </div>
                </div>
              )}
              {liveData.wsError && <div style={{ fontSize: 9, color: RED, fontFamily: MONO, maxWidth: 140, textAlign: 'right' }}>{liveData.wsError}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Setup Quality — the most important card during market hours */}
      {liveData?.price && (() => {
        const sq = levelMap?.setupQuality
        const above = levelMap?.nearestAbove
        const below = levelMap?.nearestBelow
        const price = liveData.price
        const vwap = liveData.vwapData?.vwap
        const vwapDelta = price != null && vwap != null ? price - vwap : null

        const qColor = sq === 'ON LEVEL' ? LIME : sq === 'APPROACHING' ? YELLOW : sq === 'TIGHT RANGE' ? '#C084FC' : '#888'
        const qBg = sq === 'ON LEVEL' ? '#0a1208' : sq === 'APPROACHING' ? '#100d04' : sq === 'TIGHT RANGE' ? '#0d0820' : '#0c0c0c'
        const qHint = sq === 'ON LEVEL' ? 'Price is touching a key level — wait for the candle to CLOSE before entering.'
          : sq === 'APPROACHING' ? 'Price is closing in on a level — prepare your entry, do not chase.'
          : sq === 'TIGHT RANGE' ? 'Price compressed between two close levels — breakout setup forming.'
          : sq === 'BETWEEN LEVELS' ? 'No level nearby — stand aside until price reaches one.'
          : 'Waiting for level map to load.'

        const orPeriod = settings.orPeriod || '15'
        const orMins = orPeriod === '5' ? '5-min' : orPeriod === '30' ? '30-min' : '5-min'

        return (
          <div style={{ background: qBg, border: `1px solid ${qColor}44`, borderRadius: 5, padding: '22px 26px', boxShadow: sq === 'ON LEVEL' ? `0 0 24px ${LIME}1a` : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <SLabel color="#555">Setup Quality</SLabel>
                <div style={{ fontSize: 38, fontWeight: 900, fontFamily: MONO, color: qColor, letterSpacing: '0.02em', lineHeight: 1, marginTop: 2 }}>
                  {sq || 'NO DATA'}
                </div>
                <div style={{ fontSize: 12, color: '#888', fontFamily: MONO, marginTop: 8, lineHeight: 1.5, maxWidth: 540 }}>{qHint}</div>
              </div>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: qColor, boxShadow: sq === 'ON LEVEL' ? `0 0 12px ${LIME}` : 'none', flexShrink: 0, marginTop: 6, animation: sq === 'ON LEVEL' ? 'hdrpulse 1.5s infinite' : 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16, borderTop: `1px solid ${qColor}22` }}>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Entry Conditions</div>

              {above ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: MONO }}>
                  <span style={{ color: LIME, fontSize: 14, fontWeight: 900, letterSpacing: '0.06em', minWidth: 70 }}>▲ CALLS</span>
                  <span style={{ color: '#aaa', fontSize: 12 }}>
                    if {orMins} candle closes above <strong style={{ color: '#e8e8e8' }}>{above.label} ${f2(above.price)}</strong>
                  </span>
                  <span style={{ color: '#555', fontSize: 11, marginLeft: 'auto' }}>${f2(above.price - price)} above</span>
                </div>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 12, color: '#444' }}>▲ CALLS — no level above current price</div>
              )}

              {below ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: MONO }}>
                  <span style={{ color: RED, fontSize: 14, fontWeight: 900, letterSpacing: '0.06em', minWidth: 70 }}>▼ PUTS</span>
                  <span style={{ color: '#aaa', fontSize: 12 }}>
                    if {orMins} candle closes below <strong style={{ color: '#e8e8e8' }}>{below.label} ${f2(below.price)}</strong>
                  </span>
                  <span style={{ color: '#555', fontSize: 11, marginLeft: 'auto' }}>${f2(price - below.price)} below</span>
                </div>
              ) : (
                <div style={{ fontFamily: MONO, fontSize: 12, color: '#444' }}>▼ PUTS — no level below current price</div>
              )}

              {vwapDelta != null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: MONO, marginTop: 4 }}>
                  <span style={{ color: '#C084FC', fontSize: 11, fontWeight: 700, minWidth: 70, letterSpacing: '0.06em' }}>vs VWAP</span>
                  <span style={{ color: '#888', fontSize: 11 }}>
                    VWAP ${f2(vwap)} — <strong style={{ color: vwapDelta >= 0 ? LIME : RED }}>
                      {vwapDelta >= 0 ? `Above by $${f2(vwapDelta)}` : `Below by $${f2(Math.abs(vwapDelta))}`}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })()}

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

        let fillMsg, fillColor
        if (gapPct < 50) { fillMsg = '~70% historical fill rate — expect the gap to fill before a new trend develops'; fillColor = YELLOW }
        else if (gapPct <= 100) { fillMsg = '~40% fill rate — watch for a partial fill attempt, then likely continuation'; fillColor = YELLOW }
        else { fillMsg = 'Exhaustion gap — <20% fill probability — gap-and-go, trade with the gap direction'; fillColor = LIME }

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
            <div style={{ fontSize: 10, fontFamily: MONO, color: fillColor, marginTop: 6, opacity: 0.7 }}>{fillMsg}</div>

            {/* Pre-market action: PMH/PML/trend/volume from actual pre-market bars */}
            {liveData?.preMarket?.active && (() => {
              const pm = liveData.preMarket
              const pmVolRatio = liveData.avgDayVol ? pm.vol / (liveData.avgDayVol * 0.15) : null  // ~15% of daily avg is typical pre-mkt
              const trendColor = pm.trend === 'trending up' ? LIME : pm.trend === 'trending down' ? RED : YELLOW
              return (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${YELLOW}22`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 8, fontFamily: MONO, color: '#444', letterSpacing: '0.12em', textTransform: 'uppercase' }}>PMH</div>
                    <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: LIME }}>${f2(pm.high)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontFamily: MONO, color: '#444', letterSpacing: '0.12em', textTransform: 'uppercase' }}>PML</div>
                    <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: RED }}>${f2(pm.low)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontFamily: MONO, color: '#444', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Trend</div>
                    <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: trendColor }}>{pm.trend}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontFamily: MONO, color: '#444', letterSpacing: '0.12em', textTransform: 'uppercase' }}>PM Vol</div>
                    <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: pmVolRatio && pmVolRatio > 1.5 ? LIME : pmVolRatio && pmVolRatio > 1.0 ? YELLOW : '#888' }}>
                      {pmVolRatio ? `${pmVolRatio.toFixed(1)}x avg` : `${(pm.vol / 1e6).toFixed(1)}M`}
                    </div>
                  </div>
                </div>
              )
            })()}
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
        const isTrendDay = !!(liveData?.atr && liveData?.openPrice && liveData?.price && liveData?.rvol != null
          && Math.abs(liveData.price - liveData.openPrice) > liveData.atr
          && liveData.rvol > 1.2)
        const isRangeDay = !!(liveData?.atr && liveData?.openPrice && liveData?.price && liveData?.rvol != null
          && Math.abs(liveData.price - liveData.openPrice) < liveData.atr * 0.5
          && liveData.rvol < 1.0)

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
            action: isTrendDay ? 'PRIME WINDOW — TREND DAY' : isRangeDay ? 'PRIME WINDOW — RANGE DAY' : 'PRIME WINDOW',
            steps: [
              'OR formed at 8:45 CT — load ORH/ORL into the ORB tab',
              isTrendDay
                ? 'TREND DAY: RVOL > 1.2x and price moved > 1 ATR from open — trend entries valid'
                : isRangeDay
                ? 'RANGE DAY: low RVOL, price contained — wait for level extremes only'
                : 'Watch Levels tab — is price touching or approaching a key level?',
              'Wait for a candle CLOSE above/below the level — not just a wick',
              'Calculator tab before entering — confirm 2:1 R:R on premium price',
              'Size one contract until the setup proves out',
            ],
            note: isTrendDay
              ? 'Trend day — ride the move but use the Levels tab to trail your stops.'
              : isRangeDay
              ? 'Range day — play the extremes only. Be more patient than usual.'
              : 'Your window is 8:45–10:30 CT. One good trade beats three mediocre ones.',
          },
          'chop': {
            color: isTrendDay ? LIME : YELLOW, bg: '#0e0c04', border: '#2a2010',
            action: isTrendDay ? 'CHOP — TREND ACTIVE' : isRangeDay ? 'CHOP — RANGING' : 'AVOID ZONE',
            steps: isTrendDay ? [
              'Trend day: RVOL elevated and price has moved > 1 ATR from open',
              'Power-hour entries may be valid — trend-follow only, no reversals',
              'Use Levels tab — only enter on level touch in trend direction',
              'Tighter stops — use ATR-based stops from the Setup Badge',
              'Close all by 2:45 CT — no 0DTE holds into the final 15 min',
            ] : [
              '10:30–1:30 CT — no new entries, no exceptions',
              'Theta is actively burning your premium right now',
              'If you\'re in a trade: trail your stop or close for the win',
              'Use this time to review your morning trades in Journal tab',
              'Update your AI brief notes — what happened vs your plan?',
            ],
            note: isTrendDay
              ? 'Trend day detected — RVOL and range confirm it. Trend-follow entries at levels are valid, but keep size small.'
              : isRangeDay
              ? 'Low-RVOL range day confirmed — midday chop is especially dangerous. Sit tight.'
              : 'This is the hardest discipline in day trading. Doing nothing IS the trade.',
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
          'weekend': {
            color: '#888', bg: '#0c0c0c', border: '#1e1e1e',
            action: 'WEEKEND — MARKETS CLOSED',
            steps: [
              'Run the Watchlist scanner for Monday setups',
              'Generate AI brief for Monday in the Prep tab',
              'Check Calendar tab for Monday\'s economic events and earnings',
              'Review last week\'s journal entries and discipline grades in Stats',
              'Set Monday\'s daily loss limit and max trades in Command',
              'Step away from charts — get some rest',
            ],
            note: 'Markets reopen Monday at 8:30 CT. Prep wins Monday before Monday arrives.',
          },
          'holiday': {
            color: '#888', bg: '#0c0c0c', border: '#1e1e1e',
            action: holidayName ? `HOLIDAY — ${holidayName.toUpperCase()}` : 'MARKET HOLIDAY',
            steps: [
              'US equity markets are closed today',
              'No trading — review last week\'s grades instead',
              'Update your prep for the next trading day',
              'Check Calendar tab to plan around the rest of the week',
              'Use the time off intentionally',
            ],
            note: 'Closed days exist for a reason. Treat them as part of the system.',
          },
        }
        const c = cfg[session] || cfg['after-hours']
        const eventSteps = (todayEvents || []).map(e => `⚠ ${e.name}${e.time ? ` at ${e.time} CT` : ''} today — adjust your plan around it.`)
        const openMultiDay = (trades || []).filter(t => t.status === 'open' && (parseInt(t.dte) || 0) >= 3)
        const multiDaySteps = openMultiDay.map(t => `◆ Multi-day position active (${t.ticker} ${t.optType?.toUpperCase()} ${t.strike ? '$' + t.strike : ''}, ${t.dte}DTE) — check delta and theta. Is the thesis still valid? Adjust stop if needed.`)
        const allSteps = [...eventSteps, ...multiDaySteps, ...c.steps]
        return (
          <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: '#555', fontFamily: MONO, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>Right Now</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: c.color }}>{c.action}</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, boxShadow: session === 'open' ? `0 0 10px ${LIME}` : 'none' }} />
            </div>
            {allSteps.map((step, i) => {
              const isEventStep = i < eventSteps.length
              const isMultiDayStep = !isEventStep && i < eventSteps.length + multiDaySteps.length
              const callout = isEventStep || isMultiDayStep
              const calloutColor = isEventStep ? YELLOW : isMultiDayStep ? '#60A5FA' : c.color
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: i < allSteps.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                  <span style={{ color: calloutColor, fontFamily: MONO, fontSize: 10, minWidth: 16, opacity: 0.6, marginTop: 1 }}>{callout ? (isEventStep ? '!' : '◆') : `${i - eventSteps.length - multiDaySteps.length + 1}.`}</span>
                  <span style={{ color: callout ? calloutColor : session === 'open' ? '#aaa' : '#777', fontFamily: MONO, fontSize: 11, lineHeight: 1.5 }}>{step}</span>
                </div>
              )
            })}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${c.border}`, fontSize: 10, color: c.color, fontFamily: MONO, opacity: 0.7, fontStyle: 'italic' }}>{c.note}</div>
            <div style={{ marginTop: 8, fontSize: 9, color: '#1e2e1e', fontFamily: MONO }}>New here? Tap any <span style={{ color: '#2a3a2a' }}>?</span> icon for an explanation.</div>
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

      {/* ── Broker — Schwab ─────────────────────────────────────────────── */}
      {(() => {
        const BLUE = '#3B82F6'
        const connected = !!schwabToken?.access_token
        const masked = schwabAccount?.number ? '••••' + String(schwabAccount.number).slice(-4) : null
        function connect() {
          if (!schwabCreds?.app_key || !schwabCreds?.app_secret) return
          window.location.href = `/api/schwab-auth?app_key=${encodeURIComponent(schwabCreds.app_key)}&redirect_uri=${encodeURIComponent(window.location.origin + '/callback')}`
        }
        function disconnect() {
          if (!confirm('Disconnect Schwab? You\'ll need to re-authorize to use Schwab features.')) return
          onSchwabTokenChange(null)
        }
        return (
          <Card style={{ border: connected ? `1px solid ${BLUE}33` : `1px solid ${BORDER}` }}>
            <SLabel>Broker — Schwab</SLabel>

            {!connected ? (
              <>
                <div style={{ fontSize: 11, color: '#666', fontFamily: MONO, marginBottom: 14, lineHeight: 1.7 }}>
                  Connecting Schwab unlocks live ask prices, order staging, journal sync, buying-power check, and PDT-rule tracking.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, fontSize: 10, fontFamily: MONO, color: '#666' }}>
                  <div style={{ color: '#aaa', fontWeight: 700 }}>Setup required:</div>
                  {[
                    'Register an app at developer.schwab.com with Accounts+Trading AND Market Data',
                    `Set callback URL to ${typeof window !== 'undefined' ? window.location.origin : 'https://trade-hub-1.vercel.app'}/callback`,
                    'Wait for Schwab approval (1–3 business days)',
                    'Paste your App Key + App Secret below and click Connect',
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: '#333' }}>{i + 1}.</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <Fld label="App Key (Client ID)" value={schwabCreds?.app_key || ''} onChange={v => onSchwabCredsChange({ ...schwabCreds, app_key: v.trim() })} type="text" placeholder="from developer.schwab.com" mono />
                  <Fld label="App Secret" value={schwabCreds?.app_secret || ''} onChange={v => onSchwabCredsChange({ ...schwabCreds, app_secret: v.trim() })} type="password" placeholder="••••••••••" mono />
                </div>

                <button
                  onClick={connect}
                  disabled={!schwabCreds?.app_key || !schwabCreds?.app_secret}
                  style={{
                    background: schwabCreds?.app_key && schwabCreds?.app_secret ? BLUE : '#1a1a1a',
                    color: schwabCreds?.app_key && schwabCreds?.app_secret ? '#fff' : '#444',
                    border: 'none', borderRadius: 4, padding: '10px 18px',
                    fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                    cursor: schwabCreds?.app_key && schwabCreds?.app_secret ? 'pointer' : 'not-allowed',
                  }}
                >
                  Connect Schwab →
                </button>

                {schwabConnectError && (
                  <div style={{ fontSize: 10, fontFamily: MONO, color: RED, marginTop: 10 }}>{schwabConnectError}</div>
                )}

                <div style={{ fontSize: 9, color: '#333', fontFamily: MONO, marginTop: 12, lineHeight: 1.6 }}>
                  Credentials stored in your browser only. OAuth flow uses /api/schwab-callback to keep the token exchange off the browser.
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: BLUE, boxShadow: `0 0 8px ${BLUE}` }} />
                  <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: BLUE, letterSpacing: '0.06em' }}>Schwab Connected</span>
                  {masked && <span style={{ fontSize: 10, fontFamily: MONO, color: '#888' }}>Account {masked}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 14, fontFamily: MONO }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Buying Power</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8e8' }}>{schwabAcctInfo?.buyingPower != null ? `$${schwabAcctInfo.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Day Trades</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: schwabDayTrades >= 3 ? RED : schwabDayTrades >= 2 ? YELLOW : LIME }}>{schwabDayTrades}/3 {schwabDayTrades >= 3 ? '— NO MORE' : 'remaining ' + (3 - schwabDayTrades)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>PDT Status</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: schwabAcctInfo?.isDayTrader ? LIME : '#aaa' }}>{schwabAcctInfo?.isDayTrader ? 'Marked PDT' : 'Standard'}</div>
                  </div>
                </div>

                <button onClick={disconnect} style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa', fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', padding: '8px 14px', borderRadius: 4, cursor: 'pointer' }}>
                  Disconnect
                </button>
              </>
            )}
          </Card>
        )
      })()}

      {/* Non-negotiables */}
      <div style={{ background: '#0d1208', border: '1px solid #1e2a18', borderRadius: 5, padding: '16px 20px' }}>
        <SLabel>{instrument === 'stock' ? 'Stock/ETF ORB Non-Negotiables' : 'Options ORB Non-Negotiables'}</SLabel>
        {(instrument === 'stock' ? [
          'Wait for OR to fully form. Never trade inside the range.',
          'Underlying must CLOSE above/below OR level. Wicks do not count.',
          'Entry, stop, and target are SHARE PRICES.',
          'Minimum 2:1 R:R on the trade. No exceptions.',
          '10:30–1:30 CT is chop. No new positions.',
          'Three consecutive losses = stop for the day.',
        ] : [
          'Wait for the OR to fully form. Never trade inside the range.',
          'Underlying must CLOSE above/below OR level. Wicks do not count.',
          'Check IV before buying. High IV means expensive premium.',
          'Entry, stop, and target are the OPTION PRICE — not QQQ.',
          'Minimum 2:1 R:R on the contract premium. No exceptions.',
          '10:30–1:30 CT is chop. Theta burns. No new positions.',
          'Three consecutive losses = close the platform.',
        ]).map((r, i, arr) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid #151e10' : 'none' }}>
            <span style={{ color: LIME, fontFamily: MONO, fontSize: 11, minWidth: 18, opacity: 0.5 }}>{i + 1}.</span>
            <span style={{ color: '#6a8060', fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
