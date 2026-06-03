// ─────────────────────────────────────────────────────────────────────────────
// WheelScanner.jsx — options-income scanner for the wheel strategy.
//
// Data layer: Trade Hub's stock-data Massive plan (no options chain access).
//   - Technicals (price, prevDay, pivots, rvol, vwap) come from
//     useLiveDataMulti via the liveDataMulti prop.
//   - 252-day daily bars from getHistoricalBars(ticker, 252) feed
//     both 52W high/low and the 30-day historical volatility used by the
//     options estimator (src/lib/wheelOptions.js).
//   - Options data (strike + premium + delta) is HV-based Black-Scholes,
//     not real chain quotes. When the Massive options plan is active the
//     swap point lives inside wheelOptions.js getOptionsData().
//   - One Claude call per scan supplies thesis text per ticker. Scoring
//     is deterministic JS on real numbers.
//
// Persistence: useLocalStorage under tradeHub.wheel.*.v1 keys.
// Styling: shared constants (LIME / RED / YELLOW / MONO / DARK / BORDER /
// PANEL) so the scanner matches the rest of Trade Hub.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from 'react'
import {
  Crosshair, Target, Plus, X, RefreshCw, Settings, DollarSign,
  AlertCircle, ChevronRight,
} from 'lucide-react'
import { useLocalStorage } from '../hooks/useStore.js'
import { getHistoricalBars } from '../lib/massive.js'
import { computeHV30, getOptionsData } from '../lib/wheelOptions.js'
import { LIME, RED, YELLOW, BLUE, MONO, DARK, BORDER, PANEL, f2 } from '../constants.js'

// ── Tunable thresholds ──────────────────────────────────────────────────────
const TARGET_DTE = 30                      // target days to expiration
const ARMED_PUT_SCORE = 70                 // threshold for "ARMED" put phase
const WATCH_PUT_SCORE = 50                 // threshold for "WATCH" put phase
const HARVEST_CALL_SCORE = 65              // threshold for "HARVEST" call phase

// ── Pure helpers ────────────────────────────────────────────────────────────

// Classic Wilder RSI on a series of closes. Returns null if too few bars.
function rsi14(closes) {
  if (!closes || closes.length < 15) return null
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= 14; i++) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss -= change
  }
  avgGain /= 14
  avgLoss /= 14
  for (let i = 15; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = change >= 0 ? change : 0
    const loss = change < 0 ? -change : 0
    avgGain = (avgGain * 13 + gain) / 14
    avgLoss = (avgLoss * 13 + loss) / 14
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round(100 - 100 / (1 + rs))
}

// Simple trend classifier from 20-day SMA versus current price.
function trendFromBars(bars, currentPrice) {
  if (!bars || bars.length < 20 || currentPrice == null) return 'sideways'
  const last20 = bars.slice(-20)
  const sma = last20.reduce((s, b) => s + b.c, 0) / last20.length
  const diffPct = (currentPrice - sma) / sma
  if (diffPct > 0.02) return 'uptrend'
  if (diffPct < -0.02) return 'downtrend'
  return 'sideways'
}

// Bucket annualized HV into an IV-environment label.
function ivEnvFromHV(hv) {
  if (hv == null) return 'unknown'
  if (hv < 0.20) return 'low'
  if (hv < 0.35) return 'normal'
  if (hv < 0.55) return 'elevated'
  return 'high'
}

// Defensive JSON parse: strip markdown fences, slice between first { and last }.
function parseJsonBlock(text) {
  if (!text) return null
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }
}

// ── Scoring (operates on real numbers gathered above) ───────────────────────

function scorePut(analysis) {
  if (!analysis?.putCandidate || analysis.price == null) return 0
  const a = analysis
  let score = 0
  if (a.rsi != null) {
    if (a.rsi < 30) score += 28
    else if (a.rsi < 40) score += 20
    else if (a.rsi < 50) score += 12
    else if (a.rsi > 70) score -= 12
  }
  if (a.support != null) {
    const dist = Math.abs(a.price - a.support) / a.price
    if (dist < 0.02) score += 22
    else if (dist < 0.05) score += 14
    else if (dist < 0.10) score += 6
  }
  const yieldPct = (a.putCandidate.estPremium || 0) / (a.putCandidate.strike || 1) * 100
  const annualized = yieldPct * (365 / (a.putCandidate.dte || TARGET_DTE))
  if (annualized > 35) score += 28
  else if (annualized > 22) score += 20
  else if (annualized > 12) score += 12
  else score += 4
  if (a.trend === 'uptrend') score += 6
  if (a.trend === 'downtrend') score -= 8
  if (a.ivEnv === 'elevated') score += 4
  if (a.ivEnv === 'high') score += 8
  return Math.max(0, Math.min(100, Math.round(score)))
}

function scoreCall(analysis, costBasis) {
  if (!analysis?.callCandidate || analysis.price == null) return 0
  const a = analysis
  let score = 0
  if (a.rsi != null) {
    if (a.rsi > 70) score += 28
    else if (a.rsi > 60) score += 18
    else if (a.rsi > 50) score += 10
    else if (a.rsi < 30) score -= 10
  }
  if (a.resistance != null) {
    const dist = Math.abs(a.resistance - a.price) / a.price
    if (dist < 0.02) score += 20
    else if (dist < 0.05) score += 12
  }
  if (a.callCandidate.strike >= costBasis) score += 18
  else score -= 22
  const yieldPct = (a.callCandidate.estPremium || 0) / (costBasis || 1) * 100
  const annualized = yieldPct * (365 / (a.callCandidate.dte || TARGET_DTE))
  if (annualized > 25) score += 22
  else if (annualized > 15) score += 14
  else score += 4
  if (a.ivEnv === 'elevated') score += 4
  if (a.ivEnv === 'high') score += 8
  return Math.max(0, Math.min(100, Math.round(score)))
}

// ── Component ───────────────────────────────────────────────────────────────

export default function WheelScanner({
  watchlist = [],
  onWatchlistChange = null,
  liveDataMulti = {},
  apiKey = '',
  anthropicKey = '',
}) {
  const [positions, setPositions] = useLocalStorage('tradeHub.wheel.positions.v1', [])
  const [capital, setCapital] = useLocalStorage('tradeHub.wheel.capital.v1', 25000)
  const [scanState, setScanState] = useLocalStorage('tradeHub.wheel.lastResults.v1', { results: {}, timestamp: null })

  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanError, setScanError] = useState(null)
  const [activeTab, setActiveTab] = useState('hunt')
  const [newTicker, setNewTicker] = useState('')
  const [expandedTicker, setExpandedTicker] = useState(null)
  const [editingPos, setEditingPos] = useState(false)
  const [posDraft, setPosDraft] = useState({ ticker: '', shares: 100, costBasis: '' })

  const scanResults = scanState?.results || {}
  const lastScan = scanState?.timestamp || null

  // ── Build a per-ticker analysis from bundle + HV-based options estimate ──
  const gatherAnalysis = useCallback((ticker, histBars, position) => {
    const bundle = liveDataMulti[ticker]
    if (!bundle) return { ticker, error: 'No live data bundle yet. Connect Massive API key in Command.' }
    const price = bundle.price
    if (price == null) return { ticker, error: 'Waiting for live price.' }

    const closes = (histBars || []).map(b => b.c).filter(v => v != null)
    const rsi = rsi14(closes)
    const wk52High = closes.length ? Math.max(...closes) : null
    const wk52Low = closes.length ? Math.min(...closes) : null
    const trend = trendFromBars(histBars, price)
    const hv = computeHV30(histBars)
    const ivEnv = ivEnvFromHV(hv)
    const ivPct = hv != null ? Math.round(hv * 100) : null

    const pivots = bundle.pivots
    const prevDay = bundle.prevDay
    const support = pivots?.s1 ?? prevDay?.low ?? null
    const resistance = pivots?.r1 ?? prevDay?.high ?? null

    const { putCandidate, callCandidate } = getOptionsData({
      price,
      hv,
      dte: TARGET_DTE,
      costBasis: position ? position.costBasis : null,
    })

    // Confidence baseline: medium when HV computes cleanly, low if too few
    // daily bars. Claude may upgrade or downgrade in the thesis step.
    const confidence = hv == null ? 'low' : 'medium'

    return {
      ticker,
      price,
      rvol: bundle.rvol ?? null,
      changePct: prevDay?.close ? ((price - prevDay.close) / prevDay.close) * 100 : null,
      rsi,
      wk52High,
      wk52Low,
      support,
      resistance,
      trend,
      hv,
      ivPct,
      ivEnv,
      putCandidate,
      callCandidate,
      confidence,
      gatheredAt: Date.now(),
    }
  }, [liveDataMulti])

  // ── Bulk Claude call for thesis layer ─────────────────────────────────────
  // Matches the existing direct-to-anthropic pattern (see Journal.jsx,
  // ShortThesis.jsx, tabs.jsx PrepTab generateBrief). Returns a map
  // { [TICKER]: { putThesis, callThesis, confidence } } or {} on failure.
  const fetchThesisBatch = useCallback(async (analyses) => {
    if (!anthropicKey || !analyses?.length) return {}
    const summary = analyses
      .filter(a => !a.error)
      .map(a => ({
        ticker: a.ticker,
        price: a.price,
        rsi: a.rsi,
        trend: a.trend,
        support: a.support,
        resistance: a.resistance,
        hv: a.hv != null ? Math.round(a.hv * 1000) / 1000 : null,
        ivPct: a.ivPct,
        ivEnv: a.ivEnv,
        wk52High: a.wk52High,
        wk52Low: a.wk52Low,
        hasPosition: !!positions.find(p => p.ticker === a.ticker),
        costBasis: positions.find(p => p.ticker === a.ticker)?.costBasis ?? null,
        putCandidate: a.putCandidate,
        callCandidate: a.callCandidate,
      }))
    if (!summary.length) return {}

    const prompt = `You are an options income (wheel strategy) coach. For each ticker below, write a single-sentence thesis on the suggested put (and the covered call if a callCandidate is present), then rate your confidence in the trade. Be specific about RSI, the HV environment, trend, and proximity to support/resistance. Do not invent prices; use the numbers given. Strikes and premiums are HV-based estimates, not live quotes, so frame thesis language accordingly.

Return ONLY valid JSON, no markdown fences, no commentary. Schema:
{
  "TICKER": {
    "putThesis": "one sentence on the suggested put",
    "callThesis": "one sentence on the covered call, or null if no callCandidate",
    "confidence": "low" | "medium" | "high"
  },
  ...
}

Tickers and data:
${JSON.stringify(summary, null, 2)}`

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      const text = data?.content?.[0]?.text || ''
      const parsed = parseJsonBlock(text)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }, [anthropicKey, positions])

  // ── Main scan flow ────────────────────────────────────────────────────────
  const runScan = async () => {
    setIsScanning(true)
    setScanError(null)
    setScanProgress(0)
    if (!apiKey) {
      setScanError('Add your Massive API key in the Command tab.')
      setIsScanning(false)
      return
    }
    if (!watchlist || watchlist.length === 0) {
      setScanError('Watchlist is empty. Add tickers in Setup.')
      setIsScanning(false)
      return
    }

    try {
      // Pull 252-day histBars for every ticker in parallel. One request per
      // ticker; feeds both the 52W range and the HV30 used by the estimator.
      const histPairs = await Promise.all(watchlist.map(async (ticker) => {
        try {
          const bars = await getHistoricalBars(ticker, 252)
          return [ticker, bars || []]
        } catch {
          return [ticker, []]
        }
      }))
      const histMap = Object.fromEntries(histPairs)
      setScanProgress(60)

      // Gather per-ticker analysis (sync now, no per-ticker network calls).
      const analyses = watchlist.map((ticker) => {
        const pos = positions.find(p => p.ticker === ticker)
        return gatherAnalysis(ticker, histMap[ticker], pos)
      })
      setScanProgress(80)

      // Single thesis call for the batch.
      const thesisMap = await fetchThesisBatch(analyses)
      setScanProgress(95)

      // Merge thesis + compute scores.
      const results = {}
      for (const a of analyses) {
        if (a.error) { results[a.ticker] = a; continue }
        const pos = positions.find(p => p.ticker === a.ticker)
        const thesis = thesisMap[a.ticker] || {}
        const merged = {
          ...a,
          putThesis: thesis.putThesis || null,
          callThesis: pos ? (thesis.callThesis || null) : null,
          confidence: thesis.confidence || a.confidence,
        }
        merged.putScore = scorePut(merged)
        merged.callScore = pos ? scoreCall(merged, pos.costBasis) : null
        results[a.ticker] = merged
      }

      const ts = new Date().toISOString()
      setScanState({ results, timestamp: ts })
      setScanProgress(100)
    } catch (e) {
      setScanError(e?.message || 'Scan failed.')
    } finally {
      setIsScanning(false)
    }
  }

  // ── Watchlist mutators (delegate up to parent) ───────────────────────────
  const addTicker = () => {
    const t = newTicker.trim().toUpperCase()
    if (!t) return
    if (!/^[A-Z]{1,6}$/.test(t)) { setNewTicker(''); return }
    if ((watchlist || []).includes(t)) { setNewTicker(''); return }
    onWatchlistChange?.([...(watchlist || []), t])
    setNewTicker('')
  }
  const removeTicker = (t) => {
    if (!onWatchlistChange) return
    const next = (watchlist || []).filter(x => x !== t)
    if (next.length === 0) return
    onWatchlistChange(next)
  }

  // ── Position mutators ─────────────────────────────────────────────────────
  const addPosition = () => {
    if (!posDraft.ticker || !posDraft.costBasis) return
    const t = posDraft.ticker.toUpperCase()
    const next = [
      ...positions.filter(p => p.ticker !== t),
      { ticker: t, shares: Number(posDraft.shares), costBasis: Number(posDraft.costBasis), opened: new Date().toISOString() },
    ]
    setPositions(next)
    setPosDraft({ ticker: '', shares: 100, costBasis: '' })
    setEditingPos(false)
  }
  const removePosition = (ticker) => {
    setPositions(positions.filter(p => p.ticker !== ticker))
  }

  // ── Derived row lists for Hunt / Hold ─────────────────────────────────────
  const huntRows = useMemo(() => {
    return (watchlist || [])
      .filter(t => !positions.find(p => p.ticker === t))
      .map(t => ({ ticker: t, ...scanResults[t] }))
      .sort((a, b) => (b.putScore ?? -1) - (a.putScore ?? -1))
  }, [watchlist, positions, scanResults])

  const holdRows = useMemo(() => {
    return positions.map(p => ({ ...p, ...scanResults[p.ticker] }))
  }, [positions, scanResults])

  const phaseFor = (ticker, analysis) => {
    const pos = positions.find(p => p.ticker === ticker)
    if (pos) {
      const s = analysis?.callScore ?? -1
      if (s >= HARVEST_CALL_SCORE) return { name: 'HARVEST', color: LIME, desc: 'Sell call now' }
      return { name: 'HOLD', color: '#94a3b8', desc: 'Wait for better setup' }
    }
    const s = analysis?.putScore ?? -1
    if (s >= ARMED_PUT_SCORE) return { name: 'ARMED', color: LIME, desc: 'Sell put now' }
    if (s >= WATCH_PUT_SCORE) return { name: 'WATCH', color: YELLOW, desc: 'Setting up' }
    return { name: 'HUNT', color: '#64748b', desc: 'No signal yet' }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`)
  const fmtMoney = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
  const fmtTime = (iso) => {
    if (!iso) return 'Never'
    const d = new Date(iso)
    const mins = Math.round((Date.now() - d.getTime()) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div style={{ fontFamily: MONO, color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Options income system</div>
          <div style={{ fontSize: 22, color: '#e8e8e8', fontWeight: 800, letterSpacing: '-0.02em' }}>
            The Wheel<span style={{ color: LIME }}>.</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Last scan</div>
          <div style={{ fontSize: 11, color: '#aaa' }}>{fmtTime(lastScan)}</div>
        </div>
      </div>
      <div style={{ height: 1, background: BORDER, marginBottom: 14 }} />

      {/* Scan bar */}
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6,
        padding: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <button
          onClick={runScan}
          disabled={isScanning || (watchlist || []).length === 0 || !apiKey}
          title={!apiKey ? 'Add Massive API key in Command tab' : undefined}
          style={{
            background: isScanning || !apiKey ? '#1a1a1a' : LIME,
            color: isScanning || !apiKey ? '#666' : '#000',
            border: 'none', padding: '8px 16px', borderRadius: 4,
            fontWeight: 800, fontSize: 11, fontFamily: MONO, letterSpacing: '0.14em',
            textTransform: 'uppercase', cursor: isScanning || !apiKey ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <RefreshCw size={12} style={{ animation: isScanning ? 'wheel-spin 1s linear infinite' : 'none' }} />
          {isScanning ? `Scanning ${scanProgress}%` : 'Run scan'}
        </button>
        <style>{`@keyframes wheel-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ flex: 1, minWidth: 100, height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
          {isScanning && (
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${scanProgress}%`, background: LIME, transition: 'width 0.3s ease' }} />
          )}
        </div>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.06em' }}>
          {(watchlist || []).length} watch · {positions.length} held
        </div>
      </div>
      {scanError && (
        <div style={{ background: '#150505', border: `1px solid ${RED}44`, color: RED, padding: '8px 12px', borderRadius: 4, marginBottom: 12, fontSize: 11, fontFamily: MONO }}>
          {scanError}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: `1px solid ${BORDER}` }}>
        {[
          { id: 'hunt', label: 'Hunt', icon: Crosshair },
          { id: 'hold', label: 'Hold', icon: Target },
          { id: 'settings', label: 'Setup', icon: Settings },
        ].map(tab => {
          const active = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent',
                color: active ? LIME : '#666',
                border: 'none',
                borderBottom: active ? `2px solid ${LIME}` : '2px solid transparent',
                padding: '8px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: MONO, textTransform: 'uppercase', marginBottom: -1,
              }}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* HUNT TAB */}
      {activeTab === 'hunt' && (
        <div>
          {huntRows.length === 0 && <EmptyState text="Add tickers in Setup to begin hunting" />}
          {huntRows.map(r => {
            const hasData = r.price != null
            const phase = hasData ? phaseFor(r.ticker, r) : { name: 'HUNT', color: '#666', desc: 'Not scanned' }
            const isExpanded = expandedTicker === r.ticker
            return (
              <div
                key={r.ticker}
                onClick={() => setExpandedTicker(isExpanded ? null : r.ticker)}
                style={{
                  background: PANEL, border: `1px solid ${isExpanded ? phase.color : BORDER}`,
                  borderLeft: `3px solid ${LIME}`, borderRadius: 5,
                  padding: 12, marginBottom: 8, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#e8e8e8', minWidth: 60, letterSpacing: '0.06em' }}>{r.ticker}</div>
                  {hasData ? (
                    <>
                      <div style={{ flex: 1, fontSize: 12, color: '#e8e8e8' }}>
                        {fmtMoney(r.price)}{' '}
                        <span style={{ color: (r.changePct ?? 0) >= 0 ? LIME : RED, fontSize: 10 }}>{fmtPct(r.changePct)}</span>
                      </div>
                      <PhaseBadge phase={phase} />
                      <ScoreRing score={r.putScore} color={phase.color} />
                    </>
                  ) : (
                    <div style={{ flex: 1, fontSize: 11, color: '#666' }}>{r.error ? `Error: ${r.error}` : 'Not yet scanned'}</div>
                  )}
                  <ChevronRight size={13} style={{ color: '#444', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>

                {isExpanded && hasData && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                    <MetricsGrid r={r} />
                    {r.putCandidate && (
                      <PutCandidateCard candidate={r.putCandidate} thesis={r.putThesis} capital={capital} />
                    )}
                    {r.confidence === 'low' && <ConfidenceBanner />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* HOLD TAB */}
      {activeTab === 'hold' && (
        <div>
          {positions.length === 0 && <EmptyState text="No assigned shares yet. Add positions in Setup." />}
          {holdRows.map(p => {
            const hasData = p.price != null
            const phase = hasData ? phaseFor(p.ticker, p) : { name: 'HOLD', color: '#94a3b8', desc: 'Not scanned' }
            const pnl = hasData ? (p.price - p.costBasis) * p.shares : null
            const pnlPct = hasData ? ((p.price - p.costBasis) / p.costBasis) * 100 : null
            return (
              <div
                key={p.ticker}
                style={{
                  background: PANEL, border: `1px solid ${BORDER}`,
                  borderLeft: `3px solid ${BLUE}`, borderRadius: 5,
                  padding: 12, marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#e8e8e8', minWidth: 60, letterSpacing: '0.06em' }}>{p.ticker}</div>
                  <div style={{ fontSize: 10, color: '#aaa' }}>{p.shares} sh @ {fmtMoney(p.costBasis)}</div>
                  {hasData && (
                    <div style={{ fontSize: 11, color: pnl >= 0 ? LIME : RED }}>
                      {fmtMoney(pnl)} ({fmtPct(pnlPct)})
                    </div>
                  )}
                  <div style={{ flex: 1 }} />
                  {hasData && <PhaseBadge phase={phase} />}
                  {hasData && <ScoreRing score={p.callScore} color={phase.color} />}
                  <button
                    onClick={() => removePosition(p.ticker)}
                    style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 4 }}
                    title="Remove position"
                  ><X size={14} /></button>
                </div>
                {hasData && (
                  <div style={{ paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                    <MetricsGrid r={p} />
                    {p.callCandidate && (
                      <CallCandidateCard candidate={p.callCandidate} thesis={p.callThesis} costBasis={p.costBasis} shares={p.shares} />
                    )}
                    {p.confidence === 'low' && <ConfidenceBanner />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div>
          <SectionLabel>Capital allocated</SectionLabel>
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 12, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={14} style={{ color: LIME }} />
            <input
              type="number"
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              style={{
                background: 'transparent', border: 'none', color: '#e8e8e8',
                fontSize: 14, fontFamily: MONO, flex: 1, outline: 'none',
              }}
            />
            <div style={{ fontSize: 10, color: '#666' }}>per put cycle</div>
          </div>

          <SectionLabel>Watchlist</SectionLabel>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && addTicker()}
              placeholder="Add ticker (e.g. PLTR)"
              maxLength={6}
              style={{
                flex: 1, background: PANEL, border: `1px solid ${BORDER}`,
                color: '#e8e8e8', padding: '8px 10px', borderRadius: 4,
                fontFamily: MONO, fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={addTicker}
              style={{
                background: LIME, color: '#000', border: 'none',
                padding: '8px 12px', borderRadius: 4, cursor: 'pointer',
                display: 'flex', alignItems: 'center', fontFamily: MONO,
              }}
            ><Plus size={13} /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
            {(watchlist || []).map(t => (
              <div
                key={t}
                style={{
                  background: PANEL, border: `1px solid ${BORDER}`,
                  borderLeft: `3px solid ${LIME}`,
                  padding: '5px 9px', borderRadius: 3,
                  fontSize: 11, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ color: '#e8e8e8', fontWeight: 700, letterSpacing: '0.06em' }}>{t}</span>
                <button
                  onClick={() => removeTicker(t)}
                  style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: 0, display: 'flex' }}
                ><X size={11} /></button>
              </div>
            ))}
          </div>

          <SectionLabel>Open positions (for covered calls)</SectionLabel>
          <div style={{ marginBottom: 10 }}>
            {!editingPos && (
              <button
                onClick={() => setEditingPos(true)}
                style={{
                  background: 'transparent', color: LIME,
                  border: `1px dashed ${BORDER}`, padding: '10px',
                  borderRadius: 5, cursor: 'pointer', fontSize: 11, fontFamily: MONO,
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, letterSpacing: '0.12em', textTransform: 'uppercase',
                }}
              ><Plus size={12} /> Add position</button>
            )}
            {editingPos && (
              <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
                <input placeholder="TICKER" value={posDraft.ticker} onChange={(e) => setPosDraft({ ...posDraft, ticker: e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Shares" value={posDraft.shares} onChange={(e) => setPosDraft({ ...posDraft, shares: e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Cost basis $" value={posDraft.costBasis} onChange={(e) => setPosDraft({ ...posDraft, costBasis: e.target.value })} style={inputStyle} />
                <button onClick={addPosition} style={{ ...inputStyle, background: LIME, color: '#000', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.12em' }}>SAVE</button>
                <button onClick={() => setEditingPos(false)} style={{ ...inputStyle, color: '#666', cursor: 'pointer' }}>CANCEL</button>
              </div>
            )}
          </div>
          {positions.map(p => (
            <div key={p.ticker} style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: 9, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#e8e8e8', fontWeight: 700, minWidth: 60, letterSpacing: '0.06em' }}>{p.ticker}</span>
              <span style={{ fontSize: 11, color: '#aaa' }}>{p.shares} sh @ {fmtMoney(p.costBasis)}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => removePosition(p.ticker)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}><X size={13} /></button>
            </div>
          ))}

          <div style={{ marginTop: 22, padding: 12, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: LIME, marginBottom: 6, textTransform: 'uppercase' }}>Scoring + estimates</div>
            <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>
              <strong style={{ color: '#e8e8e8' }}>Put score</strong>: RSI (28), proximity to support (22), annualized premium yield (28), trend bias (±8), HV environment bonus (4-8). ARMED ≥ {ARMED_PUT_SCORE}, WATCH ≥ {WATCH_PUT_SCORE}.
              <br /><br />
              <strong style={{ color: '#e8e8e8' }}>Call score</strong>: RSI (28), proximity to resistance (20), strike at or above cost basis (18), annualized yield (22), HV environment bonus (4-8). HARVEST ≥ {HARVEST_CALL_SCORE}.
              <br /><br />
              <strong style={{ color: '#e8e8e8' }}>Strikes + premiums</strong> are HV-based Black-Scholes estimates (Trade Hub uses Massive's stock-data plan, no live option chains). When the options plan is active, getOptionsData in src/lib/wheelOptions.js will swap in real quotes.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: 10, borderTop: `1px solid ${BORDER}`, fontSize: 9, color: '#444', textAlign: 'center', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        HV-based estimates only · Verify chain pricing in your broker before placing
      </div>
    </div>
  )
}

// ── Atom components ─────────────────────────────────────────────────────────

const inputStyle = {
  background: DARK,
  border: `1px solid ${BORDER}`,
  color: '#e8e8e8',
  padding: '7px 9px',
  borderRadius: 3,
  fontFamily: MONO,
  fontSize: 11,
  outline: 'none',
}

function PhaseBadge({ phase }) {
  return (
    <div style={{
      background: `${phase.color}15`,
      border: `1px solid ${phase.color}44`,
      color: phase.color,
      padding: '3px 7px',
      borderRadius: 3,
      fontSize: 9,
      letterSpacing: '0.14em',
      fontWeight: 700,
      fontFamily: MONO,
    }}>{phase.name}</div>
  )
}

function ScoreRing({ score, color }) {
  if (score == null) return null
  const pct = score / 100
  const circumference = 2 * Math.PI * 16
  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r="14" fill="none" stroke="#1a1a1a" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="14" fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color, fontFamily: MONO,
      }}>{score}</div>
    </div>
  )
}

function MetricsGrid({ r }) {
  const cells = [
    { label: 'RSI', value: r.rsi, color: r.rsi == null ? '#666' : r.rsi < 30 ? LIME : r.rsi > 70 ? RED : '#aaa' },
    { label: 'HV30', value: r.ivPct != null ? `${r.ivPct}%` : '—', color: r.ivEnv === 'high' || r.ivEnv === 'elevated' ? LIME : '#aaa' },
    { label: 'Trend', value: (r.trend || '—').toUpperCase(), color: r.trend === 'uptrend' ? LIME : r.trend === 'downtrend' ? RED : '#aaa' },
    { label: 'IV Env', value: (r.ivEnv || 'unknown').toUpperCase(), color: r.ivEnv === 'high' || r.ivEnv === 'elevated' ? LIME : '#aaa' },
  ]
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
        {cells.map(c => (
          <div key={c.label} style={{ padding: 7, background: DARK, borderRadius: 3 }}>
            <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.12em', marginBottom: 2, textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 12, color: c.color, fontWeight: 700, fontFamily: MONO }}>{c.value ?? '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: '#666', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        <span>Support <span style={{ color: '#aaa' }}>${f2(r.support)}</span></span>
        <span>Resistance <span style={{ color: '#aaa' }}>${f2(r.resistance)}</span></span>
        <span>52W <span style={{ color: '#aaa' }}>${f2(r.wk52Low)}–${f2(r.wk52High)}</span></span>
      </div>
    </>
  )
}

function PutCandidateCard({ candidate, thesis, capital }) {
  const dte = candidate?.dte || TARGET_DTE
  const premium = candidate?.estPremium || 0
  const strike = candidate?.strike || 0
  const yieldPct = strike ? (premium / strike) * 100 : 0
  const annualized = yieldPct * (365 / dte)
  const contracts = strike ? Math.floor(capital / (strike * 100)) : 0
  const totalPremium = contracts * premium * 100
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderLeft: `2px solid ${LIME}`, padding: 10, borderRadius: 3 }}>
      <div style={{ fontSize: 9, color: LIME, letterSpacing: '0.14em', marginBottom: 6, textTransform: 'uppercase' }}>
        Suggested put · {dte}D · estimate
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, color: '#e8e8e8', fontFamily: MONO, fontWeight: 700 }}>${f2(strike)}P</div>
        <div style={{ fontSize: 12, color: LIME, fontFamily: MONO, fontWeight: 700 }}>${f2(premium)}</div>
        <div style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>{yieldPct.toFixed(2)}% / {annualized.toFixed(1)}% ann</div>
        {candidate?.deltaApprox != null && <div style={{ fontSize: 10, color: '#666', fontFamily: MONO }}>Δ {candidate.deltaApprox.toFixed(2)}</div>}
      </div>
      {contracts > 0 && (
        <div style={{ fontSize: 10, color: '#aaa', marginBottom: 6, fontFamily: MONO }}>
          ${capital.toLocaleString()} → {contracts} contract{contracts > 1 ? 's' : ''} · <span style={{ color: LIME }}>+${totalPremium.toFixed(0)} premium</span>
        </div>
      )}
      {thesis && (
        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5, fontFamily: MONO, borderTop: `1px solid ${BORDER}`, paddingTop: 6, marginTop: 6 }}>
          {thesis}
        </div>
      )}
    </div>
  )
}

function CallCandidateCard({ candidate, thesis, costBasis, shares }) {
  const dte = candidate?.dte || TARGET_DTE
  const premium = candidate?.estPremium || 0
  const strike = candidate?.strike || 0
  const yieldPct = costBasis ? (premium / costBasis) * 100 : 0
  const annualized = yieldPct * (365 / dte)
  const contracts = Math.floor(shares / 100)
  const totalPremium = contracts * premium * 100
  const aboveCost = strike >= costBasis
  const accent = aboveCost ? LIME : RED
  return (
    <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderLeft: `2px solid ${accent}`, padding: 10, borderRadius: 3 }}>
      <div style={{ fontSize: 9, color: accent, letterSpacing: '0.14em', marginBottom: 6, textTransform: 'uppercase' }}>
        Suggested call · {dte}D · estimate {!aboveCost && '· below cost'}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, color: '#e8e8e8', fontFamily: MONO, fontWeight: 700 }}>${f2(strike)}C</div>
        <div style={{ fontSize: 12, color: LIME, fontFamily: MONO, fontWeight: 700 }}>${f2(premium)}</div>
        <div style={{ fontSize: 10, color: '#aaa', fontFamily: MONO }}>{yieldPct.toFixed(2)}% / {annualized.toFixed(1)}% ann</div>
        {candidate?.deltaApprox != null && <div style={{ fontSize: 10, color: '#666', fontFamily: MONO }}>Δ {candidate.deltaApprox.toFixed(2)}</div>}
      </div>
      <div style={{ fontSize: 10, color: '#aaa', marginBottom: 6, fontFamily: MONO }}>
        {contracts} contract{contracts !== 1 ? 's' : ''} on {shares} sh · <span style={{ color: LIME }}>+${totalPremium.toFixed(0)}</span>
      </div>
      {thesis && (
        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5, fontFamily: MONO, borderTop: `1px solid ${BORDER}`, paddingTop: 6, marginTop: 6 }}>
          {thesis}
        </div>
      )}
    </div>
  )
}

function ConfidenceBanner() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10, padding: 8, background: '#150d04', border: `1px solid ${YELLOW}44`, borderRadius: 3 }}>
      <AlertCircle size={11} style={{ color: YELLOW, marginTop: 2, flexShrink: 0 }} />
      <div style={{ fontSize: 10, color: YELLOW, lineHeight: 1.5, fontFamily: MONO }}>
        Low confidence (insufficient daily history for a reliable HV). Treat the premium as a rough sanity check, not a quote.
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: '0.16em', color: '#666', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', fontFamily: MONO }}>
      {children}
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: 32, textAlign: 'center', color: '#666', fontSize: 11, border: `1px dashed ${BORDER}`, borderRadius: 5, fontFamily: MONO }}>
      {text}
    </div>
  )
}
