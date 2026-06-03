import { useState, useMemo, useEffect } from 'react'
import { useLocalStorage } from '../hooks/useStore.js'
import { Card, SLabel, Heading, Btn, Pill } from './ui.jsx'
import { LIME, RED, YELLOW, BLUE, ORANGE, MONO, BORDER, PANEL, f2, fmtD, fmtU } from '../constants.js'
import { DEFAULT_UNIVERSE, scanUniverse, scoreLabel, stageColor, highFreshness } from '../lib/shortThesis.js'
import { getRecentNews } from '../lib/massive.js'
import { rotationContextForTicker } from '../lib/sectors.js'

function fmtPct(v, digits = 1) {
  if (v == null || isNaN(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

function fmtBig(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(0)}`
}

// ── First-time explainer ─────────────────────────────────────────────────────

function Explainer({ onDismiss }) {
  return (
    <div style={{ background: '#150505', border: `1px solid ${RED}33`, borderRadius: 6, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SLabel style={{ marginBottom: 0, color: RED }}>Finding them early — the edge</SLabel>
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em' }}>DISMISS ✕</button>
      </div>
      <div style={{ fontSize: 12, fontFamily: MONO, color: '#aa6666', lineHeight: 1.8 }}>
        The best put trades look <em style={{ color: '#cc7a7a' }}>wrong</em> at first. The stock is still near highs. Everyone believes the growth story. Fundamentals are "fine" on the surface.
        <br /><br />
        But underneath:
        <br />— Growth is decelerating quarter by quarter
        <br />— Cash is burning faster than revenue grows
        <br />— Insiders are quietly selling
        <br />— Short volume is slowly rising
        <br />— The valuation only works if perfection continues
        <br /><br />
        When one quarter disappoints, the multiple compresses <strong style={{ color: RED }}>violently</strong>. A stock at 25× P/S going to 8× P/S is a 68% loss for shareholders <em>even with no change in revenue</em>.
      </div>
      <div style={{ background: '#0a0a0a', border: '1px solid #2a1010', borderRadius: 4, padding: '12px 16px', fontSize: 11, fontFamily: MONO, color: '#cc7a7a', lineHeight: 1.7 }}>
        <strong style={{ color: RED }}>ROBLOX example:</strong> At $140 — P/S 22×, growth slowing 83% → 45% → 22%, short volume rising. Nobody cared. Three quarters later: $40.
        <br /><br />
        That's what we're looking for. <strong style={{ color: '#e8c8c8' }}>Not after $140 → $40. At $140, when the cracks are forming.</strong>
      </div>
    </div>
  )
}

// ── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, tier }) {
  const c = tier === 'strong' ? RED : tier === 'candidate' ? ORANGE : tier === 'watch' ? YELLOW : '#666'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: c, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 900, color: c, minWidth: 24, textAlign: 'right' }}>{score}</span>
    </div>
  )
}

// ── Expanded analysis ────────────────────────────────────────────────────────

function ExpandedAnalysis({ result, apiKey, anthropicKey, theses, onSaveThesis }) {
  const [news, setNews] = useState(null)
  const [thesisLoading, setThesisLoading] = useState(false)
  const [thesisError, setThesisError] = useState('')
  const d = result.data
  const existing = theses?.[result.ticker]

  useEffect(() => {
    if (!d?.ticker) return
    let alive = true
    getRecentNews(d.ticker, 3).then(n => { if (alive) setNews(n) }).catch(() => { if (alive) setNews([]) })
    return () => { alive = false }
  }, [d?.ticker])

  if (!d) return <div style={{ padding: '14px 18px', fontSize: 11, fontFamily: MONO, color: '#555' }}>No data available for {result.ticker}.</div>

  const psFairValueText = d.ps && d.yoyGrowth?.[0] != null
    ? `For a company growing revenue at ${d.yoyGrowth[0].toFixed(0)}% annually, fair-value P/S is roughly ${Math.max(3, (d.yoyGrowth[0] / 5)).toFixed(0)}-${(Math.max(4, d.yoyGrowth[0] / 4)).toFixed(0)}×. Current valuation implies revenue must grow ${((d.ps / Math.max(3, d.yoyGrowth[0] / 5)) * 100 - 100).toFixed(0)}% to justify the price.`
    : ''

  async function generateThesis() {
    if (!anthropicKey) { setThesisError('Add Claude API key in Command tab.'); return }
    setThesisLoading(true); setThesisError('')
    const dataBlob = `Ticker: ${d.ticker} · Price: $${f2(d.price)}
P/S: ${d.ps?.toFixed(1) || 'N/A'}×  P/E: ${d.pe?.toFixed(1) || 'N/A'}  Market Cap: ${fmtBig(d.mktCap)}
TTM Revenue: ${fmtBig(d.ttmRev)}  TTM EPS: $${d.ttmEPS?.toFixed(2) || 'N/A'}
Revenue growth (last 4 YoY %): ${d.yoyGrowth?.slice(0, 4).map(g => g.toFixed(1) + '%').join(', ') || 'N/A'}
Deceleration streak: ${d.decelStreak} quarters
Gross margins (recent): ${d.grossMargins?.slice(0, 4).map(m => m.toFixed(1) + '%').join(', ') || 'N/A'}
Margins compressing: ${d.marginsCompressing}
FCF turned negative: ${d.fcfTurnedNegative}
52-week high: $${f2(d.wHigh52)}  · From high: ${fmtPct(d.fromHighPct)}
Lower-highs structure: ${d.lowerHighs}
Days to cover: ${d.daysToCover ?? 'N/A'}
Bear score: ${result.score}/100 (${result.label})
Key reasons: ${result.reasons.join('; ')}`

    const prompt = `You are a professional short seller specializing in early identification of overvalued growth stocks before the inevitable multiple compression.

Focus on: valuation extreme + growth deceleration + cash burn + dilution risk.

The stock is still near highs — this is an EARLY thesis, not a late one. Do NOT mention technical breakdown (it hasn't happened yet). DO focus on when/why the narrative will crack.

Write the thesis as if you're a hedge fund analyst presenting to a PM: specific, data-driven, early. Use these exact section headers:

[${d.ticker}] EARLY PUT THESIS

EARLY WARNING SIGNALS DETECTED
[List the specific data points that triggered this alert — P/S, deceleration, FCF, dilution. Bullet form.]

WHEN THE NARRATIVE CRACKS
[What specific event will cause the market to reprice this. Examples: next earnings miss, insider selling accelerates, secondary offering, revenue guidance cut. Be specific about which catalyst is most likely.]

THE SETUP
Stock at $${f2(d.price)} with P/S of ${d.ps?.toFixed(1) || 'N/A'}×.
For this valuation to be justified: [specific math — what revenue growth must continue]
Current trajectory suggests: [where growth is heading based on the deceleration data]

OPTIMAL ENTRY
Wait for [specific event/level]. Consider 45-60 DTE puts at [strike] when [condition]. Do NOT enter before [confirmation event].

POSITION SIZING
This is an EARLY thesis — sizing should be 25-50% of normal. Add size when the narrative cracks. Starter position now, full position later.

CONVICTION: HIGH / MEDIUM / LOW

RISK FACTORS
[Short squeeze risk, positive catalyst, sector rotation. Be specific to this name.]

Data:
${dataBlob}`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      if (data.content?.[0]?.text) {
        const text = data.content[0].text
        // Try to extract trigger from "Wait for break and close below $XX"
        const triggerMatch = text.match(/(?:below|under)\s+\$?\s*([\d.]+)/i)
        const trigger = triggerMatch ? parseFloat(triggerMatch[1]) : null
        const stopMatch = text.match(/STOP:?\s*\$?\s*([\d.]+)/i)
        const stop = stopMatch ? parseFloat(stopMatch[1]) : null
        onSaveThesis(d.ticker, { text, trigger, stop, createdAt: new Date().toISOString(), score: result.score, price: d.price })
      } else {
        setThesisError(data.error?.message || 'Thesis generation failed')
      }
    } catch (e) {
      setThesisError('Network error: ' + e.message)
    }
    setThesisLoading(false)
  }

  const sectorCtx = rotationContextForTicker(result.ticker)

  return (
    <div style={{ background: '#0a0606', borderTop: `1px solid ${RED}22`, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Stage badge + DTE guidance */}
      {result.stage && (() => {
        const sc = stageColor(result.stage.stage)
        const fresh = highFreshness(d.daysFromHigh)
        return (
          <div style={{ background: result.stage.background, border: `1px solid ${sc}55`, borderRadius: 4, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 900, color: sc, letterSpacing: '0.14em' }}>
                {result.stage.icon} STAGE {result.stage.stage} · {result.stage.label}
              </div>
              {fresh && d.daysFromHigh != null && (
                <div style={{ fontSize: 10, fontFamily: MONO, color: fresh.color }}>
                  {fresh.icon} {fresh.label} — 52w high {d.daysFromHigh}d ago
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: '#e8e8e8', marginBottom: 6 }}>
              Recommended DTE: <span style={{ color: sc }}>{result.stage.dteRange}{result.isMeme && result.stage.stage <= 2 ? ' (minimum 45-60 due to meme/momentum)' : ''}</span>
            </div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#aa8888', lineHeight: 1.6 }}>{result.stage.dteCopy}</div>
          </div>
        )
      })()}

      {/* Momentum / meme stock warning */}
      {result.isMeme && (
        <div style={{ background: '#110d04', border: `1px solid ${YELLOW}55`, borderRadius: 4, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 900, color: YELLOW, letterSpacing: '0.1em', marginBottom: 5 }}>⚠ MOMENTUM / MEME STOCK</div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#c8a030', lineHeight: 1.6 }}>
            High short-squeeze risk. Use <strong style={{ color: YELLOW }}>45-60 DTE minimum</strong>. Size at <strong style={{ color: YELLOW }}>50%</strong> of normal. Never buy puts into a rip — wait for the failed rally entry.
          </div>
        </div>
      )}

      {/* Timing risk */}
      {result.timing && result.timing.score > 0 && (
        <div style={{ background: result.timing.level === 'EXTREME' || result.timing.level === 'HIGH' ? '#150505' : '#110d04', border: `1px solid ${result.timing.score >= 40 ? RED : YELLOW}55`, borderRadius: 4, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, fontFamily: MONO, color: result.timing.score >= 40 ? RED : YELLOW, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 5 }}>Timing Risk · {result.timing.level}</div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: result.timing.score >= 40 ? '#cc7a7a' : '#c8a030', lineHeight: 1.55 }}>{result.timing.msg}</div>
        </div>
      )}

      {/* Sector outflow context */}
      {sectorCtx && (sectorCtx.tier === 'mod-out' || sectorCtx.tier === 'strong-out') && (
        <div style={{ background: '#0d0606', border: `1px solid ${RED}44`, borderRadius: 4, padding: '10px 14px', fontSize: 11, fontFamily: MONO, color: '#cc8888', lineHeight: 1.6 }}>
          <strong style={{ color: RED }}>Sector {sectorCtx.name}</strong> is seeing {sectorCtx.label.toLowerCase()} (score {sectorCtx.score > 0 ? '+' : ''}{sectorCtx.score}) — strengthens the bearish thesis on this ticker.
        </div>
      )}

      {/* Entry timing checklist */}
      <div style={{ background: '#0a0a0a', border: '1px solid #161616', borderRadius: 4, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontFamily: MONO, color: '#666', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Entry Timing — wait for one</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontFamily: MONO, color: '#888', lineHeight: 1.7 }}>
          <div>□ Failed retest of broken support</div>
          <div>□ Lower high confirmed on 5-min chart</div>
          <div>□ Dead-cat bounce fails after earnings</div>
        </div>
        <div style={{ fontSize: 10, fontFamily: MONO, color: existing?.trigger != null ? RED : '#444', marginTop: 8 }}>
          Status: {existing?.trigger != null
            ? (d.price <= existing.trigger ? 'TRIGGERED — below thesis level' : `waiting — above $${f2(existing.trigger)}`)
            : 'No thesis trigger set yet'}
        </div>
      </div>

      {/* Valuation analysis */}
      <div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: RED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>1 · Valuation Analysis</div>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.7 }}>
          {d.ps != null ? (
            <>
              <strong style={{ color: RED }}>P/S of {d.ps.toFixed(1)}×</strong> means you're paying ${d.ps.toFixed(2)} for every $1 of revenue. {psFairValueText}
            </>
          ) : (
            <span style={{ color: '#666' }}>Valuation data unavailable (Polygon free tier may not include fundamentals for this ticker).</span>
          )}
        </div>
      </div>

      {/* Fundamental trend */}
      <div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: RED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>2 · Fundamental Trend</div>
        {d.yoyGrowth?.length ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {d.yoyGrowth.slice(0, 4).reverse().map((g, i) => {
                const idx = d.yoyGrowth.length - 1 - i
                const period = `Q${(idx % 4) + 1}`
                const c = g < 0 ? RED : g < 10 ? ORANGE : g < 25 ? YELLOW : LIME
                const w = Math.min(100, Math.max(2, Math.abs(g) * 2))
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 11 }}>
                    <span style={{ minWidth: 50, color: '#666' }}>{period}:</span>
                    <span style={{ minWidth: 60, color: c, fontWeight: 700 }}>{fmtPct(g)}</span>
                    <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${w}%`, background: c, borderRadius: 2 }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#aa6666' }}>
              {d.decelStreak >= 2 ? `Revenue growth decelerating ${d.decelStreak + 1} consecutive quarters — classic deterioration pattern.` : 'Growth trend stable or improving.'}
            </div>
          </>
        ) : <span style={{ fontSize: 11, fontFamily: MONO, color: '#666' }}>Revenue growth history unavailable.</span>}
      </div>

      {/* Short flow */}
      <div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: RED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>3 · Short Flow Analysis</div>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.7 }}>
          {d.shortInterest ? (
            <>
              {d.daysToCover != null && `Days to cover: ${d.daysToCover.toFixed(1)}. `}
              {d.shortInterest.short_interest != null && `Short interest: ${(d.shortInterest.short_interest / 1e6).toFixed(1)}M shares.`}
            </>
          ) : (
            <span style={{ color: '#666' }}>Short flow data unavailable on the free Polygon tier — check shortinterest.com manually.</span>
          )}
        </div>
      </div>

      {/* Technical context */}
      <div>
        <div style={{ fontSize: 9, fontFamily: MONO, color: RED, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>4 · Technical Context</div>
        <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.7 }}>
          Current price <strong style={{ color: '#e8e8e8' }}>${f2(d.price)}</strong>
          {d.fromHighPct != null && d.wHigh52 ? ` is ${Math.abs(d.fromHighPct).toFixed(0)}% below 52-week high of $${f2(d.wHigh52)}.` : '.'}
          {d.lowerHighs ? ' Market structure: BEARISH (lower-highs confirmed on weekly).' : ''}
        </div>
      </div>

      {/* Recent news (display only — not used in scoring) */}
      {news && news.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>Recent News</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {news.slice(0, 3).map((n, i) => (
              <a key={i} href={n.article_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontFamily: MONO, color: '#888', textDecoration: 'none', lineHeight: 1.5, borderLeft: '2px solid #1a1a1a', paddingLeft: 8 }}>
                {n.title} <span style={{ color: '#444' }}>— {new Date(n.published_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Put thesis generator */}
      <div style={{ borderTop: `1px solid ${RED}22`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {existing ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontFamily: MONO, color: RED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Active Put Thesis</span>
              <Btn small variant="ghost" onClick={generateThesis} disabled={thesisLoading || !anthropicKey}>{thesisLoading ? 'Writing...' : 'Regenerate'}</Btn>
            </div>
            <pre style={{ fontFamily: MONO, fontSize: 11, color: '#cc8a8a', background: '#150505', border: `1px solid ${RED}33`, borderRadius: 5, padding: '14px 16px', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{existing.text}</pre>
          </>
        ) : (
          <button onClick={generateThesis} disabled={thesisLoading || !anthropicKey} style={{ background: thesisLoading || !anthropicKey ? '#1a1a1a' : RED, color: thesisLoading || !anthropicKey ? '#444' : '#fff', border: 'none', borderRadius: 4, padding: '12px', fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', cursor: thesisLoading || !anthropicKey ? 'not-allowed' : 'pointer' }}>
            {thesisLoading ? '✦ Writing thesis...' : anthropicKey ? '✦ Generate Put Thesis →' : 'Add Claude API key to generate thesis'}
          </button>
        )}
        {thesisError && <div style={{ fontSize: 10, fontFamily: MONO, color: RED }}>{thesisError}</div>}
      </div>

    </div>
  )
}

// ── Active theses panel ─────────────────────────────────────────────────────

function ActiveTheses({ theses, results, onRemove, onUpdate }) {
  const entries = Object.entries(theses || {})
  if (entries.length === 0) return null
  return (
    <div>
      <SLabel>Active Put Theses</SLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {entries.map(([ticker, t]) => {
          const latest = results?.find(r => r.ticker === ticker)
          const currentPrice = latest?.data?.price ?? t.price
          const status = t.trigger == null ? 'no trigger'
            : currentPrice && currentPrice <= t.trigger ? 'TRIGGERED'
            : currentPrice && currentPrice <= t.trigger * 1.01 ? 'WITHIN 1%'
            : 'waiting'
          const statusColor = status === 'TRIGGERED' ? RED : status === 'WITHIN 1%' ? ORANGE : YELLOW
          const days = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000)
          return (
            <div key={ticker} style={{ background: status === 'TRIGGERED' ? '#150505' : '#0a0a0a', border: `1px solid ${statusColor}44`, borderRadius: 5, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, animation: status === 'TRIGGERED' ? 'hdrpulse 1.5s infinite' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 900, fontFamily: MONO, color: RED, letterSpacing: '0.04em' }}>{ticker}</span>
                <span style={{ fontSize: 9, fontFamily: MONO, color: '#555' }}>created {days}d ago{t.score ? ` · score ${t.score}` : ''}</span>
              </div>
              <div style={{ fontSize: 10, fontFamily: MONO, color: '#666' }}>
                Current: <strong style={{ color: '#e8e8e8' }}>${f2(currentPrice)}</strong>
                {t.trigger != null && <> · Trigger: <strong style={{ color: RED }}>${f2(t.trigger)}</strong></>}
              </div>
              <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 700, color: statusColor, letterSpacing: '0.06em' }}>{status === 'TRIGGERED' ? 'TRIGGERED ↓' : status === 'WITHIN 1%' ? 'WITHIN 1% OF TRIGGER ↓' : status === 'waiting' ? `Waiting — above $${f2(t.trigger)}` : 'No trigger price'}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={() => onUpdate(ticker)} style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, color: '#aaa', fontFamily: MONO, fontSize: 9, padding: '5px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.08em' }}>UPDATE</button>
                <button onClick={() => onRemove(ticker)} style={{ flex: 1, background: 'transparent', border: `1px solid #2a1010`, color: RED, fontFamily: MONO, fontSize: 9, padding: '5px 8px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.08em' }}>REMOVE</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export default function ShortThesis({ apiKey, anthropicKey, theses, onThesesChange }) {
  const [universe, setUniverse] = useLocalStorage('th-short-universe', DEFAULT_UNIVERSE)
  const [explainerDismissed, setExplainerDismissed] = useLocalStorage('th-short-explainer', false)
  const [results, setResults] = useState([])
  const [scanState, setScanState] = useState({ state: 'idle', current: '', done: 0, total: 0, error: '' })
  const [expanded, setExpanded] = useState(null)
  const [addInput, setAddInput] = useState('')
  const [showUniverse, setShowUniverse] = useState(false)

  const lastScanAt = useMemo(() => {
    try {
      const v = localStorage.getItem('th-short-last-scan')
      return v ? new Date(parseInt(v)) : null
    } catch { return null }
  }, [results.length])

  async function runScan() {
    if (!apiKey) { setScanState({ state: 'error', error: 'Add Massive API key in Command tab.', current: '', done: 0, total: 0 }); return }
    setScanState({ state: 'running', current: universe[0] || '', done: 0, total: universe.length, error: '' })
    setResults([])
    try {
      await scanUniverse(universe, ({ done, total, current, all }) => {
        setResults(all.slice().sort((a, b) => b.score - a.score))
        setScanState({ state: 'running', current, done, total, error: '' })
      })
      try { localStorage.setItem('th-short-last-scan', String(Date.now())) } catch {}
      setScanState(s => ({ ...s, state: 'done' }))
    } catch (e) {
      setScanState({ state: 'error', error: e.message, current: '', done: 0, total: 0 })
    }
  }

  function saveThesis(ticker, payload) {
    onThesesChange({ ...(theses || {}), [ticker]: payload })
  }

  function removeThesis(ticker) {
    if (!confirm(`Remove ${ticker} put thesis?`)) return
    const next = { ...(theses || {}) }
    delete next[ticker]
    onThesesChange(next)
  }

  function addTickerToUniverse() {
    const t = addInput.trim().toUpperCase()
    if (!t || universe.includes(t)) { setAddInput(''); return }
    setUniverse([...universe, t])
    setAddInput('')
  }

  function removeTicker(t) {
    setUniverse(universe.filter(x => x !== t))
  }

  const visible = useMemo(() => results.filter(r => r.score >= 35).slice().sort((a, b) => b.score - a.score), [results])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <SLabel>Early Warning Scanner</SLabel>
          <Heading>Short Thesis</Heading>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#555', marginTop: 4 }}>Overvalued stocks with deteriorating fundamentals before breakdown</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {lastScanAt && <span style={{ fontSize: 10, fontFamily: MONO, color: '#444' }}>Last scan {lastScanAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={runScan} disabled={scanState.state === 'running'} style={{ background: scanState.state === 'running' ? '#1a1a1a' : RED, color: scanState.state === 'running' ? '#666' : '#fff', border: 'none', borderRadius: 4, padding: '10px 16px', fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', cursor: scanState.state === 'running' ? 'not-allowed' : 'pointer' }}>
            {scanState.state === 'running' ? `Scanning ${scanState.done}/${scanState.total}...` : 'Scan Universe →'}
          </button>
        </div>
      </div>

      {scanState.state === 'running' && (
        <div style={{ background: PANEL, border: `1px solid ${RED}33`, borderRadius: 4, padding: '10px 14px', fontSize: 11, fontFamily: MONO, color: '#aaa' }}>
          Scanning <strong style={{ color: RED }}>{scanState.current}</strong>... ({scanState.done}/{scanState.total}) — results updating in real time below.
        </div>
      )}
      {scanState.state === 'error' && (
        <div style={{ background: '#150505', border: `1px solid ${RED}55`, borderRadius: 4, padding: '12px 16px', fontSize: 11, fontFamily: MONO, color: RED }}>
          {scanState.error}
        </div>
      )}

      {!apiKey && (
        <div style={{ background: '#0c0c0c', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '14px 18px', fontSize: 11, fontFamily: MONO, color: '#888', lineHeight: 1.7 }}>
          Add a Massive API key in the <strong style={{ color: LIME }}>Command</strong> tab to activate screening. Without one, only the universe list and saved theses are visible.
        </div>
      )}

      {!explainerDismissed && <Explainer onDismiss={() => setExplainerDismissed(true)} />}

      <ActiveTheses theses={theses} results={results} onRemove={removeThesis} onUpdate={runScan} />

      {/* Universe editor */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <SLabel style={{ marginBottom: 0 }}>Scan Universe — {universe.length} tickers</SLabel>
          <button onClick={() => setShowUniverse(s => !s)} style={{ background: 'transparent', border: 'none', color: '#666', fontFamily: MONO, fontSize: 10, cursor: 'pointer', letterSpacing: '0.1em' }}>{showUniverse ? 'HIDE' : 'EDIT'}</button>
        </div>
        {showUniverse && (
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={addInput} onChange={e => setAddInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addTickerToUniverse()} placeholder="Add ticker (e.g. NVDA)" style={{ flex: 1, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, color: '#e8e8e8', fontFamily: MONO, fontSize: 11, padding: '7px 10px', outline: 'none' }} />
              <button onClick={addTickerToUniverse} style={{ background: LIME, color: '#000', border: 'none', borderRadius: 3, padding: '7px 14px', fontFamily: MONO, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>ADD</button>
              <button onClick={() => setUniverse(DEFAULT_UNIVERSE)} style={{ background: 'transparent', color: '#666', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '7px 14px', fontFamily: MONO, fontSize: 10, cursor: 'pointer' }}>RESET</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {universe.map(t => (
                <span key={t} style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '4px 8px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 10, fontFamily: MONO, color: '#888' }}>
                  {t}
                  <button onClick={() => removeTicker(t)} style={{ background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', fontFamily: MONO }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results table */}
      {visible.length === 0 && results.length === 0 ? (
        <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '40px 24px' }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#2a2a2a', marginBottom: 8 }}>No scan run yet.</div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#1e1e1e', lineHeight: 1.8 }}>Hit Scan Universe to score each ticker on valuation, fundamental deterioration, short flow, and technical breakdown. Only tickers scoring above 35 are shown.</div>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '24px 18px', fontSize: 11, fontFamily: MONO, color: '#666' }}>
          Scan complete. No tickers scored above 35 — universe is currently clean of bearish signals. ({results.length} scanned)
        </div>
      ) : (
        <div style={{ background: '#090909', border: `1px solid ${BORDER}`, borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 70px 70px 80px 60px 60px 70px 100px 110px 24px', gap: 8, padding: '10px 14px', borderBottom: '1px solid #111', background: '#0a0a0a' }}>
            {['#', 'Ticker', 'Price', 'From High', 'P/S', 'P/E', 'D2C', 'Signal', 'Score', ''].map(h => <span key={h} style={{ fontSize: 9, letterSpacing: '0.1em', color: '#333', textTransform: 'uppercase', fontFamily: MONO }}>{h}</span>)}
          </div>
          {visible.map((r, i) => {
            const isTop3 = i < 3
            const isOpen = expanded === r.ticker
            const c = r.tier === 'strong' ? RED : r.tier === 'candidate' ? ORANGE : r.tier === 'watch' ? YELLOW : '#666'
            return (
              <div key={r.ticker} style={{ borderLeft: isTop3 ? `3px solid ${RED}` : '3px solid transparent', background: isOpen ? '#0a0606' : 'transparent', borderBottom: '1px solid #0d0d0d' }}>
                <div onClick={() => setExpanded(isOpen ? null : r.ticker)} style={{ display: 'grid', gridTemplateColumns: '32px 70px 70px 80px 60px 60px 70px 100px 110px 24px', gap: 8, padding: '11px 14px', cursor: 'pointer', alignItems: 'center', fontFamily: MONO, fontSize: 11 }}>
                  <span style={{ color: '#444', fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ color: RED, fontWeight: 900, fontSize: 12 }}>{r.ticker}</span>
                  <span style={{ color: '#aaa' }}>${f2(r.data?.price)}</span>
                  <span style={{ color: r.data?.fromHighPct < -40 ? RED : r.data?.fromHighPct < -20 ? YELLOW : '#888' }}>{r.data?.fromHighPct != null ? fmtPct(r.data.fromHighPct, 0) : '—'}</span>
                  <span style={{ color: r.data?.ps > 10 ? RED : r.data?.ps > 5 ? YELLOW : '#888' }}>{r.data?.ps?.toFixed(1) ?? '—'}</span>
                  <span style={{ color: '#888' }}>{r.data?.pe?.toFixed(0) ?? '—'}</span>
                  <span style={{ color: r.data?.daysToCover > 5 ? RED : '#888' }}>{r.data?.daysToCover?.toFixed(1) ?? '—'}</span>
                  <span style={{ color: c, fontWeight: 700, fontSize: 10, letterSpacing: '0.06em' }}>
                    {r.icon} {r.label}
                    {r.timing?.score >= 40 && <span style={{ color: r.timing.score >= 60 ? RED : YELLOW, marginLeft: 6, fontSize: 9 }}>⚠ TIMING</span>}
                    {r.isMeme && <span style={{ color: YELLOW, marginLeft: 6, fontSize: 9 }}>MEME</span>}
                  </span>
                  <ScoreBar score={r.score} tier={r.tier} />
                  <span style={{ color: '#444', fontSize: 14 }}>{isOpen ? '−' : '+'}</span>
                </div>
                {isOpen && (
                  <ExpandedAnalysis result={r} apiKey={apiKey} anthropicKey={anthropicKey} theses={theses} onSaveThesis={saveThesis} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
