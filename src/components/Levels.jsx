import { useState, useMemo } from 'react'
import { Card, SLabel, Heading, Fld, Btn, Pill } from './ui.jsx'
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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 16px',
      borderBottom: `1px solid #0f0f0f`,
      background: isCurrentLevel ? '#0d1a0d' : isVeryNear ? '#0f0f0a' : 'transparent',
      borderLeft: isCurrentLevel ? `3px solid ${LIME}` : isVeryNear ? `3px solid ${color}88` : '3px solid transparent',
    }}>
      {/* Level type indicator */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginRight: 10, boxShadow: isNear ? `0 0 6px ${color}88` : 'none' }} />

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontFamily: MONO, color: isNear ? color : '#777', fontWeight: isNear ? 700 : 400 }}>{level.label}</span>
          {level.confluence > 0 && (
            <span style={{ fontSize: 8, background: `${YELLOW}22`, color: YELLOW, border: `1px solid ${YELLOW}44`, borderRadius: 2, padding: '1px 5px', fontFamily: MONO, letterSpacing: '0.08em' }}>
              CONFLUENCE ×{level.confluence + 1}
            </span>
          )}
        </div>
        {level.sublabel && <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, marginTop: 2 }}>{level.sublabel}</div>}
      </div>

      {/* Price */}
      <div style={{ textAlign: 'right', marginLeft: 12 }}>
        <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: isNear ? color : '#555' }}>${f2(level.price)}</div>
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

function buildSetupMsg(quality, nearestAbove, nearestBelow, price) {
  const gapAbove = nearestAbove ? nearestAbove.price - price : null
  const gapBelow = nearestBelow ? price - nearestBelow.price : null
  const closestIsAbove = gapAbove !== null && gapBelow !== null ? gapAbove <= gapBelow : gapAbove !== null

  if (quality === 'ON LEVEL') {
    const lvl = closestIsAbove ? nearestAbove : nearestBelow
    if (!lvl) return 'On a level. Wait for the candle close to confirm direction.'
    return `CALLS if price holds above ${lvl.label} and closes a 5-min candle above it. PUTS if price rejects and closes below it. Wait for the candle close — do not front-run.`
  }
  if (quality === 'APPROACHING') {
    const lvl = closestIsAbove ? nearestAbove : nearestBelow
    if (!lvl) return 'Approaching a level. Get ready.'
    return `Approaching ${lvl.label} at $${f2(lvl.price)}. Get ready. Watch for rejection or breakout on the next 5-min candle close. Do not enter until the candle confirms direction.`
  }
  if (quality === 'TIGHT RANGE') {
    if (!nearestAbove || !nearestBelow) return 'Tight range between levels. Watch for breakout.'
    return `Price compressed between ${nearestAbove.label} at $${f2(nearestAbove.price)} and ${nearestBelow.label} at $${f2(nearestBelow.price)}. Wait for a breakout candle close. The tighter the range, the bigger the move — but direction unknown until it breaks.`
  }
  if (quality === 'BETWEEN LEVELS') {
    if (!nearestAbove || !nearestBelow) return 'Between levels. No setup. Wait for a touch.'
    return `Between ${nearestAbove.label} at $${f2(nearestAbove.price)} ($${f2(gapAbove)} away) and ${nearestBelow.label} at $${f2(nearestBelow.price)} ($${f2(gapBelow)} away). No edge here. Wait for price to reach a level before considering a trade.`
  }
  return null
}

function SetupBadge({ quality, nearestAbove, nearestBelow, price }) {
  const configs = {
    'ON LEVEL': { color: LIME, bg: '#071208', border: '#1a3010' },
    'APPROACHING': { color: YELLOW, bg: '#0e0c04', border: '#2a2008' },
    'TIGHT RANGE': { color: ORANGE, bg: '#0e0800', border: '#2a1800' },
    'BETWEEN LEVELS': { color: '#555', bg: '#0a0a0a', border: '#161616' },
  }
  const c = configs[quality] || configs['BETWEEN LEVELS']
  const gapAbove = nearestAbove ? nearestAbove.price - price : null
  const gapBelow = nearestBelow ? price - nearestBelow.price : null
  const msg = buildSetupMsg(quality, nearestAbove, nearestBelow, price)

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5, padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>Setup Quality</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: c.color }}>{quality || 'NO DATA'}</div>
        </div>
        {gapAbove !== null && gapBelow !== null && (
          <div style={{ textAlign: 'right', fontSize: 10, fontFamily: MONO }}>
            <div style={{ color: '#4a2a2a' }}>▲ +${f2(gapAbove)} to {nearestAbove?.label}</div>
            <div style={{ color: '#2a4a2a', marginTop: 3 }}>▼ -${f2(gapBelow)} to {nearestBelow?.label}</div>
          </div>
        )}
      </div>
      {msg && <div style={{ fontSize: 11, color: c.color === '#555' ? '#333' : c.color, fontFamily: MONO, opacity: 0.8 }}>{msg}</div>}
    </div>
  )
}

export default function Levels({ liveData, orbHigh, orbLow, settings, onSettingsChange }) {
  const [customLabel, setCustomLabel] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customLevels, setCustomLevels] = useState([])
  const [notifGranted, setNotifGranted] = useState(Notification.permission === 'granted')
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
  }), [price, pivots, autoFibs, vwapData, prevDay, weeklyData, orbHigh, orbLow, sdZones, customLevels])

  const { levels, nearestAbove, nearestBelow, setupQuality } = levelMap

  // Filter levels for display
  const filteredLevels = filter === 'all' ? levels : levels.filter(l => {
    if (filter === 'pivot') return l.type.startsWith('pivot')
    if (filter === 'vwap') return l.type.startsWith('vwap')
    if (filter === 'structure') return ['structure', 'weekly', 'orb'].includes(l.type)
    if (filter === 'fib') return l.type === 'fib'
    if (filter === 'zone') return ['supply', 'demand'].includes(l.type)
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
          {!settings?.alertsEnabled ? (
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
        />
      )}

      {!price && (
        <div style={{ background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#2a2a2a' }}>Waiting for live price — add your Massive API key in Command tab</div>
        </div>
      )}

      {/* Stats row */}
      {price && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Live Price', value: `$${f2(price)}`, color: LIME },
            { label: 'VWAP', value: vwapData ? `$${f2(vwapData.vwap)}` : '—', color: PURPLE },
            { label: 'vs VWAP', value: vwapData ? `${price > vwapData.vwap ? '+' : ''}$${f2(price - vwapData.vwap)}` : '—', color: vwapData ? (price > vwapData.vwap ? LIME : RED) : '#444' },
            { label: 'Active Levels', value: levels.length, color: '#777' },
          ].map(({ label, value, color }) => (
            <Card key={label} style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: '#2a2a2a', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
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
