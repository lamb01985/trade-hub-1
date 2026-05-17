import { useState, useMemo } from 'react'
import { Card, SLabel, Heading, Fld, Btn, Pill, Tip } from './ui.jsx'
import { buildLevelMap, calcFibs } from '../lib/levels.js'
import { requestNotificationPermission, Sounds } from '../lib/alerts.js'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, MONO, BORDER, LEVEL_COLORS, f2 } from '../constants.js'

const TYPE_COLORS = {
  'pivot': '#888',
  'pivot-r': '#FF7744',
  'pivot-s': '#4488FF',
  'structure': '#CCCCCC',
  'vwap': '#C084FC',
  'vwap-band': '#8050B0',
  'orb': LIME,
  'fib': '#FFD166',
  'supply': '#FF4D4D',
  'demand': '#60A5FA',
  'weekly': '#FF6600',
  'custom': '#888',
  'poc': '#FFFFFF',
  'vah': '#FFFFFF',
  'val': '#FFFFFF',
  'hvn': '#6699FF',
  'lvn': '#334',
  'premarket-high': LIME,
  'premarket-low': RED,
}

function LevelRow({ level, currentPrice }) {
  if (!level?.price) return null
  const dist = currentPrice ? level.price - currentPrice : null
  const absDist = dist ? Math.abs(dist) : null
  const isAbove = dist > 0
  const isVeryNear = absDist < 0.25
  const isNear = absDist < 0.75
  const color = TYPE_COLORS[level.type] || '#666'
  const isCurrentLevel = absDist < 0.08
  const isPOC = level.type === 'poc'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 16px',
      borderBottom: `1px solid #0f0f0f`,
      background: isCurrentLevel ? '#0d1a0d' : isVeryNear ? '#0f0f0a' : 'transparent',
      borderLeft: isCurrentLevel ? `3px solid ${LIME}` : isVeryNear ? `3px solid ${color}88` : isPOC ? '3px solid #444' : '3px solid transparent',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: isPOC ? 2 : '50%', background: color, flexShrink: 0, marginRight: 10, boxShadow: isNear ? `0 0 6px ${color}88` : 'none' }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontFamily: MONO, color: isNear ? color : isPOC ? '#999' : '#777', fontWeight: isPOC ? 900 : isNear ? 700 : 400 }}>{level.label}</span>
          {level.confluence > 0 && (
            <span style={{ fontSize: 8, background: `${YELLOW}22`, color: YELLOW, border: `1px solid ${YELLOW}44`, borderRadius: 2, padding: '1px 5px', fontFamily: MONO, letterSpacing: '0.08em' }}>
              CONFLUENCE ×{level.confluence + 1}
            </span>
          )}
        </div>
        {level.sublabel && <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 2 }}>{level.sublabel}</div>}
      </div>

      <div style={{ textAlign: 'right', marginLeft: 12 }}>
        <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: isPOC ? 900 : 700, color: isNear ? color : isPOC ? '#aaa' : '#555' }}>${f2(level.price)}</div>
        {dist !== null && (
          <div style={{ fontSize: 9, fontFamily: MONO, color: isAbove ? '#3a5a3a' : '#5a3a3a', marginTop: 1 }}>
            {isAbove ? '+' : ''}{f2(dist)} {isAbove ? '▲' : '▼'}
          </div>
        )}
      </div>
    </div>
  )
}

function CurrentPriceMarker({ price }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#0a1a0a', borderLeft: `3px solid ${LIME}`, borderTop: `1px solid ${LIME}33`, borderBottom: `1px solid ${LIME}33` }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: LIME, boxShadow: `0 0 10px ${LIME}`, flexShrink: 0, marginRight: 10, animation: 'pulse 1.5s infinite' }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 9, fontFamily: MONO, color: '#3a5a3a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Current Price</span>
      </div>
      <div style={{ fontSize: 18, fontFamily: MONO, fontWeight: 900, color: LIME, letterSpacing: '-0.02em' }}>${f2(price)}</div>
    </div>
  )
}

function buildSetupMsg(quality, nearestAbove, nearestBelow, price, atr, vwapData, volProfile, alignment) {
  const gapAbove = nearestAbove ? nearestAbove.price - price : null
  const gapBelow = nearestBelow ? price - nearestBelow.price : null
  const closestIsAbove = gapAbove !== null && gapBelow !== null ? gapAbove <= gapBelow : gapAbove !== null
  const stopOff = atr ? atr * 0.5 : 0.25
  const vwapRel = vwapData
    ? (price > vwapData.vwap
      ? ` Above VWAP ($${f2(vwapData.vwap)}) — bullish structure.`
      : ` Below VWAP ($${f2(vwapData.vwap)}) — bearish structure.`)
    : ''
  const pocRel = volProfile?.poc != null
    ? (Math.abs(price - volProfile.poc) < 0.10
      ? ` At POC ($${f2(volProfile.poc)}) — contested, wait for direction.`
      : price > volProfile.poc
      ? ` Above POC ($${f2(volProfile.poc)}) — buyers in control.`
      : ` Below POC ($${f2(volProfile.poc)}) — sellers in control.`)
    : ''
  const oneH = alignment?.mtf?.['1h']?.state
  const oneHText = oneH === 'BULLISH' ? ' 1H structure: BULLISH — higher TF confirms long bias.'
    : oneH === 'BEARISH' ? ' 1H structure: BEARISH — caution on longs, prefer puts.'
    : oneH === 'RANGING' || oneH === 'TRANSITION' ? ` 1H structure: ${oneH} — no clear higher TF bias.`
    : ''
  const alignRel = alignment?.score >= 85 ? `${oneHText} HIGH CONVICTION — all 4 timeframes aligned.`
    : alignment?.score >= 70 ? `${oneHText} ${alignment.label} (${alignment.score}/100) — normal size.`
    : alignment?.score >= 55 ? `${oneHText} MIXED SIGNALS — reduce size 50%.`
    : alignment?.score > 0 ? `${oneHText} LOW CONVICTION (${alignment.score}/100) — stand aside.`
    : ''

  if (quality === 'ON LEVEL') {
    const lvl = closestIsAbove ? nearestAbove : nearestBelow
    if (!lvl) return 'On a level. Wait for the candle close to confirm direction.'
    const callStop = f2(lvl.price - stopOff)
    const putStop = f2(lvl.price + stopOff)
    const callTgt = !closestIsAbove && nearestAbove ? ` target $${f2(nearestAbove.price)} (${nearestAbove.label})` : ''
    const putTgt = closestIsAbove && nearestBelow ? ` target $${f2(nearestBelow.price)} (${nearestBelow.label})` : ''
    return `${vwapRel}${pocRel}${alignRel} CALLS if price holds above ${lvl.label} ($${f2(lvl.price)}) on 5-min close — stop $${callStop}${callTgt}. PUTS if price rejects and closes below it — stop $${putStop}${putTgt}. Wait for the candle close, not the wick.`
  }
  if (quality === 'APPROACHING') {
    const lvl = closestIsAbove ? nearestAbove : nearestBelow
    if (!lvl) return 'Approaching a level. Get ready.'
    return `${vwapRel}${pocRel}${alignRel} Approaching ${lvl.label} at $${f2(lvl.price)}. Get ready. Watch for rejection or breakout on the next 5-min candle close. Do not enter until the candle confirms direction.`
  }
  if (quality === 'TIGHT RANGE') {
    if (!nearestAbove || !nearestBelow) return 'Tight range between levels. Watch for breakout.'
    return `${vwapRel} Price compressed between ${nearestAbove.label} ($${f2(nearestAbove.price)}) and ${nearestBelow.label} ($${f2(nearestBelow.price)}). Wait for a breakout candle close. The tighter the range, the bigger the move — but direction unknown until it breaks.`
  }
  if (quality === 'BETWEEN LEVELS') {
    if (!nearestAbove || !nearestBelow) return 'Between levels. No setup. Wait for a touch.'
    return `Between ${nearestAbove.label} ($${f2(nearestAbove.price)}, +$${f2(gapAbove)} away) and ${nearestBelow.label} ($${f2(nearestBelow.price)}, -$${f2(gapBelow)} away). No edge here — wait for price to reach a level.`
  }
  return null
}

function SetupBadge({ quality, nearestAbove, nearestBelow, price, atr, vwapData, volProfile, alignment }) {
  const configs = {
    'ON LEVEL': { color: LIME, bg: '#071208', border: '#1a3010' },
    'APPROACHING': { color: YELLOW, bg: '#0e0c04', border: '#2a2008' },
    'TIGHT RANGE': { color: ORANGE, bg: '#0e0800', border: '#2a1800' },
    'BETWEEN LEVELS': { color: '#555', bg: '#0a0a0a', border: '#161616' },
  }
  const c = configs[quality] || configs['BETWEEN LEVELS']
  const gapAbove = nearestAbove ? nearestAbove.price - price : null
  const gapBelow = nearestBelow ? price - nearestBelow.price : null
  const msg = buildSetupMsg(quality, nearestAbove, nearestBelow, price, atr, vwapData, volProfile, alignment)

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5, padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4, display: 'flex', alignItems: 'center' }}>Setup Quality<Tip tip="How close price is to a tradeable level right now. ON LEVEL means a potential entry exists at a known institutional level. APPROACHING means get ready. TIGHT RANGE means price is coiling. BETWEEN LEVELS means no edge — wait for price to reach a level." /></div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: c.color }}>{quality || 'NO DATA'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {gapAbove !== null && gapBelow !== null && (
            <div style={{ fontSize: 10, fontFamily: MONO }}>
              <div style={{ color: '#4a2a2a' }}>▲ +${f2(gapAbove)} to {nearestAbove?.label}</div>
              <div style={{ color: '#2a4a2a', marginTop: 3 }}>▼ -${f2(gapBelow)} to {nearestBelow?.label}</div>
            </div>
          )}
          {atr && <div style={{ fontSize: 9, color: '#333', fontFamily: MONO, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>ATR ${f2(atr)}<Tip tip="Average True Range — average daily price movement over 14 bars. Used to set stops that aren't too tight (noise) or too wide (too much loss). Stop offset = 0.5× ATR from your trigger level." /></div>}
        </div>
      </div>
      {msg && <div style={{ fontSize: 11, color: c.color === '#555' ? '#333' : c.color, fontFamily: MONO, opacity: 0.8, lineHeight: 1.6 }}>{msg}</div>}
    </div>
  )
}

export default function Levels({ liveData, orbHigh, orbLow, settings, onSettingsChange, mtfAlignment }) {
  const [customLabel, setCustomLabel] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customLevels, setCustomLevels] = useState([])
  const [notifGranted, setNotifGranted] = useState(typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')
  const notifSupported = typeof window !== 'undefined' && 'Notification' in window
  const [filter, setFilter] = useState('all')

  const { price, vwapData, prevDay, weeklyData, pivots, sdZones } = liveData || {}

  // Auto-compute Fibonacci from best available range: OR high/low → prev day → none
  const autoFibs = useMemo(() => {
    const oh = parseFloat(orbHigh), ol = parseFloat(orbLow)
    if (!isNaN(oh) && !isNaN(ol) && oh > ol) {
      return { fibs: calcFibs(oh, ol), source: `OR ($${f2(ol)} — $${f2(oh)})` }
    }
    if (prevDay?.high && prevDay?.low && prevDay.high > prevDay.low) {
      return { fibs: calcFibs(prevDay.high, prevDay.low), source: `prior day range ($${f2(prevDay.low)} — $${f2(prevDay.high)})` }
    }
    return null
  }, [orbHigh, orbLow, prevDay])

  const levelMap = useMemo(() => buildLevelMap(price, {
    pivots,
    fibs: autoFibs?.fibs ?? null,
    vwapData,
    prevDay,
    weeklyData,
    orbHigh: parseFloat(orbHigh) || null,
    orbLow: parseFloat(orbLow) || null,
    sdZones,
    customLevels,
    volProfile: liveData?.volProfile,
  }), [price, pivots, autoFibs, vwapData, prevDay, weeklyData, orbHigh, orbLow, sdZones, customLevels, liveData?.volProfile])

  const { levels, nearestAbove, nearestBelow, setupQuality } = levelMap

  // Filter levels for display
  const filteredLevels = filter === 'all' ? levels : levels.filter(l => {
    if (filter === 'pivot') return l.type.startsWith('pivot')
    if (filter === 'vwap') return l.type.startsWith('vwap')
    if (filter === 'structure') return ['structure', 'weekly', 'orb'].includes(l.type)
    if (filter === 'fib') return l.type === 'fib'
    if (filter === 'zone') return ['supply', 'demand'].includes(l.type)
    if (filter === 'vol') return ['poc', 'vah', 'val', 'hvn', 'lvn'].includes(l.type)
    return true
  })

  // Split into above/below current price for display
  const above = price ? filteredLevels.filter(l => l.price > price) : filteredLevels
  const below = price ? filteredLevels.filter(l => l.price <= price) : []

  const handleEnableAlerts = async () => {
    const granted = await requestNotificationPermission()
    setNotifGranted(granted)
    if (granted) {
      Sounds.clear()
      onSettingsChange?.({ ...settings, alertsEnabled: true })
    }
  }

  const addCustomLevel = () => {
    const p = parseFloat(customPrice)
    if (isNaN(p) || !customLabel) return
    setCustomLevels(prev => [...prev, { price: p, label: customLabel }])
    setCustomLabel('')
    setCustomPrice('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <SLabel>Real-Time Trading Intelligence</SLabel>
          <Heading>Level Map</Heading>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!notifSupported ? (
            <span style={{ fontSize: 9, fontFamily: MONO, color: '#666' }}>Alerts not supported on this browser</span>
          ) : !settings?.alertsEnabled ? (
            <Btn small variant="lime" onClick={handleEnableAlerts}>Enable Alerts + Sound</Btn>
          ) : (
            <span style={{ fontSize: 9, fontFamily: MONO, color: LIME }}>✓ ALERTS ON</span>
          )}
        </div>
      </div>

      {/* Setup quality banner */}
      {price && (
        <SetupBadge
          quality={setupQuality}
          nearestAbove={nearestAbove}
          nearestBelow={nearestBelow}
          price={price}
          atr={liveData?.atr}
          vwapData={vwapData}
          volProfile={liveData?.volProfile}
          alignment={mtfAlignment}
        />
      )}

      {/* MTF Alignment badges */}
      {mtfAlignment?.score > 0 && (() => {
        const a = mtfAlignment
        const c = a.score >= 70 ? LIME : a.score >= 55 ? YELLOW : a.score >= 40 ? ORANGE : RED
        const stateColor = s => s === 'BULLISH' ? LIME : s === 'BEARISH' ? RED : s === 'TRANSITION' ? ORANGE : YELLOW
        const arrow = s => s === 'BULLISH' ? '▲' : s === 'BEARISH' ? '▼' : '◆'
        return (
          <div style={{ background: '#0c0c0c', border: `1px solid ${c}33`, borderRadius: 4, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['1h', '15m', '5m', '1m'].map(tf => {
                const s = a.mtf?.[tf]?.state
                const sc = stateColor(s)
                return (
                  <span key={tf} style={{ fontSize: 9, fontFamily: MONO, color: sc, border: `1px solid ${sc}33`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.06em' }}>
                    {tf.toUpperCase()} {arrow(s)} {s || '—'}
                  </span>
                )
              })}
            </div>
            <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: c, letterSpacing: '0.06em' }}>
              Alignment: {a.score} — {a.label}
            </span>
          </div>
        )
      })()}

      {/* Value Area auction context */}
      {price && liveData?.volProfile?.vah != null && liveData?.volProfile?.val != null && (() => {
        const { vah, val, poc } = liveData.volProfile
        const above = price > vah
        const below = price < val
        const inside = !above && !below
        const aboveColor = above ? LIME : below ? RED : YELLOW
        const auctionMsg = above ? 'Bullish auction — buyers in control, expect continuation higher.'
          : below ? 'Bearish auction — sellers in control, expect continuation lower.'
          : 'Balanced market — price inside value area, expect rotation between VAH and VAL.'
        const pocRel = price > poc + 0.05 ? 'above POC' : price < poc - 0.05 ? 'below POC' : 'at POC'
        return (
          <div style={{ background: '#0a0a0a', border: `1px solid ${aboveColor}33`, borderRadius: 4, padding: '11px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontFamily: MONO, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Value Area</span>
              <span style={{ fontSize: 10, fontFamily: MONO, color: aboveColor, fontWeight: 700, letterSpacing: '0.06em' }}>
                {above ? 'ABOVE VAH' : below ? 'BELOW VAL' : 'INSIDE VA'} · {pocRel.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.55 }}>
              POC <strong style={{ color: '#FFFFFF' }}>${f2(poc)}</strong> · VAH <strong style={{ color: '#FFFFFF' }}>${f2(vah)}</strong> · VAL <strong style={{ color: '#FFFFFF' }}>${f2(val)}</strong>
            </div>
            <div style={{ fontSize: 10, fontFamily: MONO, color: aboveColor, lineHeight: 1.55, marginTop: 4, opacity: 0.85 }}>
              {auctionMsg}
            </div>
          </div>
        )
      })()}

      {!price && (
        <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '28px 24px' }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#2a2a2a', marginBottom: 10, letterSpacing: '0.04em' }}>Levels load automatically once your Massive API key is connected.</div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#1e1e1e', lineHeight: 1.8 }}>
            You'll see VWAP, pivot points, PDH/PDL, S/D zones, and Fibonacci drawn from the prior day range — all calculated automatically from live market data.
          </div>
          <div style={{ marginTop: 14, fontSize: 9, fontFamily: MONO, color: '#1a1a1a', letterSpacing: '0.08em' }}>→ Add your key in the Command tab to activate.</div>
        </div>
      )}

      {/* Stats row */}
      {price && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          {[
            { label: 'Live Price', value: `$${f2(price)}`, color: LIME },
            { label: 'VWAP', value: vwapData ? `$${f2(vwapData.vwap)}` : '—', color: PURPLE, tip: "Volume Weighted Average Price — the average price weighted by volume. Institutions use VWAP as their primary anchor. Price above VWAP favors longs, below favors shorts." },
            { label: 'vs VWAP', value: vwapData ? `${price > vwapData.vwap ? '+' : ''}$${f2(price - vwapData.vwap)}` : '—', color: vwapData ? (price > vwapData.vwap ? LIME : RED) : '#444' },
            { label: 'Active Levels', value: levels.length, color: '#777' },
          ].map(({ label, value, color, tip }) => (
            <Card key={label} style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, display: 'flex', alignItems: 'center' }}>{label}{tip && <Tip tip={tip} />}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All Levels' },
          { id: 'structure', label: 'Structure' },
          { id: 'pivot', label: 'Pivots' },
          { id: 'vwap', label: 'VWAP' },
          { id: 'fib', label: 'Fibonacci' },
          { id: 'zone', label: 'S/D Zones' },
          { id: 'vol', label: 'Vol Profile' },
        ].map(f => (
          <Pill key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />
        ))}
      </div>

      {/* Fib source label */}
      {autoFibs && (
        <div style={{ fontSize: 9, fontFamily: MONO, color: '#2a2a2a', paddingLeft: 2, letterSpacing: '0.06em' }}>
          Fibonacci drawn from {autoFibs.source}
        </div>
      )}

      {/* The level map */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Levels ABOVE price */}
        {above.length > 0 && above.map((level, i) => (
          <LevelRow key={`${level.label}-${level.price}`} level={level} currentPrice={price} />
        ))}

        {/* Current price marker */}
        {price && <CurrentPriceMarker price={price} />}

        {/* Levels BELOW price */}
        {below.length > 0 && below.map((level, i) => (
          <LevelRow key={`${level.label}-${level.price}`} level={level} currentPrice={price} />
        ))}

        {filteredLevels.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#2a2a2a', fontFamily: MONO, fontSize: 11 }}>
            No levels loaded yet. Add your API key in Command to load market context.
          </div>
        )}
      </Card>

      {/* Custom level input */}
      <Card>
        <SLabel>Add Custom Level</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
          <Fld label="Label" value={customLabel} onChange={setCustomLabel} type="text" placeholder="Key resistance" />
          <Fld label="Price" value={customPrice} onChange={setCustomPrice} prefix="$" placeholder="715.00" />
          <Btn small onClick={addCustomLevel} disabled={!customLabel || !customPrice}>Add</Btn>
        </div>
        {customLevels.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {customLevels.map((l, i) => (
              <div key={i} style={{ background: '#141414', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '4px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontFamily: MONO, color: '#888' }}>{l.label} ${f2(l.price)}</span>
                <span onClick={() => setCustomLevels(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 9, color: RED, cursor: 'pointer' }}>✕</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Level type legend */}
      <Card>
        <SLabel>Level Key</SLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {[
            { type: 'pivot-r', label: 'Resistance Pivots (R1-R3)' },
            { type: 'pivot-s', label: 'Support Pivots (S1-S3)' },
            { type: 'pivot', label: 'Pivot Point (PP)' },
            { type: 'structure', label: 'Prev Day H/L/C' },
            { type: 'weekly', label: 'Weekly H/L' },
            { type: 'orb', label: 'Opening Range' },
            { type: 'vwap', label: 'VWAP' },
            { type: 'vwap-band', label: 'VWAP ±1σ / ±2σ' },
            { type: 'fib', label: 'Fibonacci' },
            { type: 'supply', label: 'Supply Zone' },
            { type: 'demand', label: 'Demand Zone' },
            { type: 'poc', label: 'Point of Control (POC)' },
            { type: 'hvn', label: 'High Volume Node (HVN)' },
            { type: 'lvn', label: 'Low Volume Node (LVN)' },
          ].map(({ type, label }) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[type], flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontFamily: MONO, color: '#444' }}>{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Alert log */}
      {liveData?.lastAlerts?.length > 0 && (
        <Card>
          <SLabel>Alert Log</SLabel>
          {liveData.lastAlerts.slice(0, 5).map((alert, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? `1px solid #0f0f0f` : 'none' }}>
              <span style={{ fontSize: 11, fontFamily: MONO, color: alert.type === 'break' ? LIME : YELLOW }}>
                {alert.type === 'break' ? alert.direction : alert.type === 'confluence' ? '⊕ CONFLUENCE' : '◈ APPROACHING'} {alert.level?.label}
              </span>
              <span style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a' }}>${f2(alert.price)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
