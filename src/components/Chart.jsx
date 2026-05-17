import { useEffect, useRef, useState, useMemo } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts'
import { Pill } from './ui.jsx'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, MONO, BORDER, PANEL, f2 } from '../constants.js'

const TIMEFRAMES = [
  { id: '1m', mins: 1, label: '1m' },
  { id: '3m', mins: 3, label: '3m' },
  { id: '5m', mins: 5, label: '5m' },
  { id: '15m', mins: 15, label: '15m' },
  { id: '1h', mins: 60, label: '1H' },
]

const LAYER_GROUPS = [
  { id: 'pivots', label: 'Pivots', types: ['pivot', 'pivot-r', 'pivot-s', 'structure', 'weekly', 'orb', 'custom'] },
  { id: 'vwap', label: 'VWAP', types: ['vwap', 'vwap-band'] },
  { id: 'fibs', label: 'Fibs', types: ['fib'] },
  { id: 'zones', label: 'Zones', types: ['supply', 'demand', 'poc', 'hvn', 'lvn'] },
  { id: 'signals', label: 'Signals', types: [] },
]

function colorFor(type, label = '') {
  if (label.includes('Prev Day Close')) return '#888'
  if (label.includes('Prev Day')) return '#FFFFFF'
  if (label.includes('Fib 61.8')) return LIME
  switch (type) {
    case 'vwap': return PURPLE
    case 'vwap-band': return '#7050A0'
    case 'pivot': return '#888'
    case 'pivot-r': return ORANGE
    case 'pivot-s': return BLUE
    case 'structure': return '#FFFFFF'
    case 'weekly': return '#FF6600'
    case 'orb': return LIME
    case 'fib': return YELLOW
    case 'supply': return RED
    case 'demand': return BLUE
    case 'poc': return '#FFFFFF'
    case 'hvn': return '#6699FF'
    case 'lvn': return '#445'
    case 'custom': return '#FFFFFF'
    default: return '#666'
  }
}

function styleFor(type, label = '') {
  if (label.includes('Prev Day Close')) return LineStyle.Dashed
  if (type === 'custom') return LineStyle.Dashed
  if (type === 'vwap-band' || type === 'weekly') return LineStyle.Dashed
  if (type === 'fib' && !label.includes('61.8')) return LineStyle.Dotted
  if (type === 'supply' || type === 'demand') return LineStyle.Dotted
  return LineStyle.Solid
}

function widthFor(type, label = '') {
  if (label.includes('Fib 61.8') || type === 'poc' || type === 'vwap') return 2
  return 1
}

function groupForType(type) {
  for (const g of LAYER_GROUPS) {
    if (g.types.includes(type)) return g.id
  }
  return 'pivots'
}

function aggregateBars(bars, mins) {
  if (!bars?.length) return []
  if (mins === 1) return bars
  const bucketMs = mins * 60000
  const groups = new Map()
  for (const b of bars) {
    const bucket = Math.floor(b.t / bucketMs) * bucketMs
    const existing = groups.get(bucket)
    if (!existing) {
      groups.set(bucket, { t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })
    } else {
      existing.h = Math.max(existing.h, b.h)
      existing.l = Math.min(existing.l, b.l)
      existing.c = b.c
      existing.v += b.v
    }
  }
  return [...groups.values()].sort((a, b) => a.t - b.t)
}

function shortName(label) {
  if (!label) return ''
  return label
    .replace(/Prev Day High/i, 'PDH')
    .replace(/Prev Day Low/i, 'PDL')
    .replace(/Prev Day Close/i, 'PDC')
    .replace(/Weekly High/i, 'WH')
    .replace(/Weekly Low/i, 'WL')
    .replace(/Pivot/i, 'PP')
    .replace(/OR High/i, 'ORH')
    .replace(/OR Low/i, 'ORL')
    .replace(/Fib /i, 'Fib ')
}

function detectConfluences(levels, threshold = 0.30) {
  const sorted = [...levels].filter(l => l.price != null && !isNaN(l.price)).sort((a, b) => a.price - b.price)
  const clusters = []
  let current = []
  for (const lvl of sorted) {
    if (!current.length) { current.push(lvl); continue }
    const last = current[current.length - 1]
    if (lvl.price - last.price <= threshold) current.push(lvl)
    else {
      if (current.length >= 2) clusters.push(current)
      current = [lvl]
    }
  }
  if (current.length >= 2) clusters.push(current)
  return clusters.map(group => {
    const avg = group.reduce((s, l) => s + l.price, 0) / group.length
    const names = group.map(l => shortName(l.label)).slice(0, 3).join('+')
    return { price: avg, label: `CONFLUENCE: ${names}`, count: group.length }
  })
}

export default function ChartTab({ liveData, levelMap, trades, ticker, customLevels = [], onCustomLevelsChange }) {
  const wrapRef = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const volumeRef = useRef(null)
  const avgVolLineRef = useRef(null)
  const linesRef = useRef([])
  const tradeLinesRef = useRef([])
  const markersRef = useRef(null)
  const currentCandleRef = useRef(null)

  const [timeframe, setTimeframe] = useState('5m')
  const [layers, setLayers] = useState({ pivots: true, vwap: true, fibs: true, zones: true, signals: true })
  const [addOpen, setAddOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newPrice, setNewPrice] = useState('')

  // ── Initialize chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#aaa',
        fontFamily: 'DM Mono, monospace',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#141414' },
        horzLines: { color: '#141414' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2c2c2c', scaleMargins: { top: 0.05, bottom: 0.22 } },
      timeScale: { borderColor: '#2c2c2c', timeVisible: true, secondsVisible: false, rightOffset: 10 },
    })

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: LIME,
      downColor: RED,
      borderUpColor: LIME,
      borderDownColor: RED,
      wickUpColor: LIME,
      wickDownColor: RED,
      priceLineColor: LIME,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Solid,
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      color: '#444',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      visible: false,
    })

    const avgVolLine = chart.addSeries(LineSeries, {
      priceScaleId: 'vol',
      color: '#FFD16677',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    })

    chartRef.current = chart
    candleRef.current = candle
    volumeRef.current = volume
    avgVolLineRef.current = avgVolLine

    const onResize = () => {
      if (!el || !chartRef.current) return
      chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight })
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
      avgVolLineRef.current = null
      linesRef.current = []
      tradeLinesRef.current = []
      markersRef.current = null
      currentCandleRef.current = null
    }
  }, [])

  // ── Load bars when intradayBars or timeframe changes ───────────────────────
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return
    const mins = TIMEFRAMES.find(t => t.id === timeframe)?.mins || 5
    const aggregated = aggregateBars(liveData?.intradayBars || [], mins)

    const candleData = aggregated.map(b => ({
      time: Math.floor(b.t / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c,
    }))
    candleRef.current.setData(candleData)

    volumeRef.current.setData(aggregated.map(b => ({
      time: Math.floor(b.t / 1000),
      value: b.v,
      color: b.c >= b.o ? `${LIME}55` : `${RED}55`,
    })))

    // 20-day average volume line — scaled down to per-bar (avg daily vol / bars per day)
    const avg = liveData?.avgDayVol
    if (avg && candleData.length >= 2) {
      const barsPerDay = Math.round(390 / mins)
      const perBar = avg / Math.max(1, barsPerDay)
      avgVolLineRef.current?.setData([
        { time: candleData[0].time, value: perBar },
        { time: candleData[candleData.length - 1].time, value: perBar },
      ])
    } else {
      avgVolLineRef.current?.setData([])
    }

    const last = aggregated[aggregated.length - 1]
    currentCandleRef.current = last
      ? { time: Math.floor(last.t / 1000), open: last.o, high: last.h, low: last.l, close: last.c }
      : null
  }, [liveData?.intradayBars, liveData?.avgDayVol, timeframe])

  // ── Real-time price tick: update current candle (only when not on fallback) ─
  useEffect(() => {
    if (!candleRef.current || !liveData?.price) return
    if (liveData?.isHistoricalFallback) return
    const mins = TIMEFRAMES.find(t => t.id === timeframe)?.mins || 5
    const bucketMs = mins * 60000
    const now = Date.now()
    const bucket = Math.floor(now / bucketMs) * bucketMs
    const time = Math.floor(bucket / 1000)
    const price = liveData.price
    const cur = currentCandleRef.current

    if (!cur || cur.time !== time) {
      const newBar = { time, open: price, high: price, low: price, close: price }
      candleRef.current.update(newBar)
      currentCandleRef.current = newBar
    } else {
      const updated = {
        time,
        open: cur.open,
        high: Math.max(cur.high, price),
        low: Math.min(cur.low, price),
        close: price,
      }
      candleRef.current.update(updated)
      currentCandleRef.current = updated
    }
  }, [liveData?.price, liveData?.isHistoricalFallback, timeframe])

  // ── Draw level price lines ──────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return

    for (const line of linesRef.current) {
      try { candleRef.current.removePriceLine(line) } catch {}
    }
    linesRef.current = []

    const levels = (levelMap?.levels || []).filter(l => l.price != null && !isNaN(l.price))

    for (const level of levels) {
      const group = groupForType(level.type)
      if (!layers[group]) continue

      const color = colorFor(level.type, level.label)
      const line = candleRef.current.createPriceLine({
        price: level.price,
        color,
        lineWidth: widthFor(level.type, level.label),
        lineStyle: styleFor(level.type, level.label),
        axisLabelVisible: true,
        axisLabelColor: '#1a1a1a',
        axisLabelTextColor: color,
        title: `${shortName(level.label)} $${f2(level.price)}`,
      })
      linesRef.current.push(line)
    }

    // Confluence highlighting — single bold lime line at the cluster midpoint
    const visibleLevels = levels.filter(l => layers[groupForType(l.type)])
    const clusters = detectConfluences(visibleLevels, 0.30)
    for (const cluster of clusters) {
      const line = candleRef.current.createPriceLine({
        price: cluster.price,
        color: LIME,
        lineWidth: 3,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        axisLabelColor: `${LIME}33`,
        axisLabelTextColor: '#000',
        title: `${cluster.label} $${f2(cluster.price)}`,
      })
      linesRef.current.push(line)
    }
  }, [levelMap, layers])

  // ── Trade & signal markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return
    const markers = []

    if (layers.signals) {
      const openTrades = (trades || []).filter(t => t.status === 'open' && t.date)
      for (const t of openTrades) {
        markers.push({
          time: Math.floor(new Date(t.date).getTime() / 1000),
          position: t.optType === 'put' ? 'aboveBar' : 'belowBar',
          color: t.optType === 'put' ? RED : LIME,
          shape: t.optType === 'put' ? 'arrowDown' : 'arrowUp',
          text: `${t.ticker} ${(t.optType || '').toUpperCase()} ${t.strike ? '$' + t.strike : ''}`,
        })
      }

      if (levelMap?.setupQuality === 'ON LEVEL' && currentCandleRef.current) {
        markers.push({
          time: currentCandleRef.current.time,
          position: 'belowBar',
          color: LIME,
          shape: 'circle',
          text: 'ON LEVEL — await candle close',
        })
      }
    }

    markers.sort((a, b) => a.time - b.time)

    if (markersRef.current) {
      markersRef.current.setMarkers(markers)
    } else {
      markersRef.current = createSeriesMarkers(candleRef.current, markers)
    }
  }, [trades, layers.signals, levelMap?.setupQuality])

  // ── Stop / target lines for open trades ─────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return
    for (const line of tradeLinesRef.current) {
      try { candleRef.current.removePriceLine(line) } catch {}
    }
    tradeLinesRef.current = []
    if (!layers.signals) return

    const open = (trades || []).filter(t => t.status === 'open')
    for (const t of open) {
      if (t.stop != null) {
        const l = candleRef.current.createPriceLine({
          price: t.stop, color: RED, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, axisLabelColor: '#1a1a1a', axisLabelTextColor: RED,
          title: `STOP ${t.ticker} $${f2(t.stop)}`,
        })
        tradeLinesRef.current.push(l)
      }
      if (t.target != null) {
        const l = candleRef.current.createPriceLine({
          price: t.target, color: LIME, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, axisLabelColor: '#1a1a1a', axisLabelTextColor: LIME,
          title: `TGT ${t.ticker} $${f2(t.target)}`,
        })
        tradeLinesRef.current.push(l)
      }
    }
  }, [trades, layers.signals])

  function autoFit() {
    chartRef.current?.timeScale().fitContent()
  }

  function submitAddLevel() {
    const p = parseFloat(newPrice)
    const label = newLabel.trim()
    if (!label || isNaN(p)) return
    onCustomLevelsChange?.([...(customLevels || []), { label, price: p, type: 'custom' }])
    setNewLabel(''); setNewPrice(''); setAddOpen(false)
  }

  const nearby = useMemo(() => {
    const price = liveData?.price
    if (!price || !levelMap?.levels?.length) return []
    return [...levelMap.levels]
      .filter(l => l.price != null && !isNaN(l.price))
      .map(l => ({ ...l, dist: l.price - price }))
      .sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist))
      .slice(0, 5)
  }, [levelMap, liveData?.price])

  const noData = !liveData?.intradayBars?.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontFamily: MONO, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{ticker || 'QQQ'}</span>
          {liveData?.price && (
            <span style={{ fontSize: 18, fontFamily: MONO, fontWeight: 900, color: LIME }}>${f2(liveData.price)}</span>
          )}
          {liveData?.rvol != null && (
            <span style={{ fontSize: 10, fontFamily: MONO, color: liveData.rvol >= 1.2 ? LIME : liveData.rvol >= 0.8 ? YELLOW : RED }}>
              RVOL {liveData.rvol.toFixed(2)}x
            </span>
          )}
          {liveData?.isHistoricalFallback && (
            <span style={{ fontSize: 9, fontFamily: MONO, color: YELLOW, border: `1px solid ${YELLOW}33`, borderRadius: 3, padding: '2px 6px', letterSpacing: '0.08em' }}>
              SHOWING PRIOR SESSION
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {TIMEFRAMES.map(tf => (
            <Pill key={tf.id} label={tf.label} active={timeframe === tf.id} onClick={() => setTimeframe(tf.id)} />
          ))}
          <span style={{ width: 8 }} />
          {LAYER_GROUPS.map(g => (
            <Pill key={g.id} label={g.label} active={layers[g.id]} onClick={() => setLayers(s => ({ ...s, [g.id]: !s[g.id] }))} />
          ))}
          <span style={{ width: 8 }} />
          <button onClick={() => setAddOpen(s => !s)} style={{
            background: addOpen ? LIME : 'transparent', border: `1px solid ${addOpen ? LIME : BORDER}`,
            color: addOpen ? '#000' : '#aaa', fontFamily: MONO, fontSize: 9, padding: '4px 10px',
            borderRadius: 3, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
          }}>+ Level</button>
          <button onClick={autoFit} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#888',
            fontFamily: MONO, fontSize: 9, padding: '4px 10px', borderRadius: 3,
            cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Auto-fit</button>
        </div>
      </div>

      {addOpen && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '10px 12px' }}>
          <input type="text" value={newLabel} onInput={e => setNewLabel(e.target.value)} placeholder="Label (e.g. Supply Top)"
            style={{ flex: 1, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, color: '#e8e8e8', fontFamily: MONO, fontSize: 11, padding: '7px 10px', outline: 'none' }} />
          <input type="number" value={newPrice} onInput={e => setNewPrice(e.target.value)} placeholder="Price" step="0.01"
            style={{ width: 110, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 3, color: '#e8e8e8', fontFamily: MONO, fontSize: 11, padding: '7px 10px', outline: 'none' }}
            onKeyDown={e => e.key === 'Enter' && submitAddLevel()} />
          <button onClick={submitAddLevel} disabled={!newLabel.trim() || isNaN(parseFloat(newPrice))} style={{
            background: LIME, border: 'none', color: '#000', fontFamily: MONO, fontSize: 10, padding: '7px 14px',
            borderRadius: 3, cursor: 'pointer', fontWeight: 700, letterSpacing: '0.08em',
            opacity: !newLabel.trim() || isNaN(parseFloat(newPrice)) ? 0.4 : 1,
          }}>Add</button>
          <button onClick={() => { setAddOpen(false); setNewLabel(''); setNewPrice('') }} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#666', fontFamily: MONO, fontSize: 10,
            padding: '7px 12px', borderRadius: 3, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      )}

      <div style={{ position: 'relative', width: '100%', height: '70vh', minHeight: 480, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5 }}>
        <div ref={wrapRef} style={{ width: '100%', height: '100%' }} />
        {noData && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: '#444' }}>Waiting for bars...</div>
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a' }}>Add a Massive API key in Command to populate the chart.</div>
          </div>
        )}
      </div>

      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontFamily: MONO, color: '#666', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Nearest 5 Levels</span>
          {levelMap?.setupQuality && (
            <span style={{ fontSize: 9, fontFamily: MONO, color: levelMap.setupQuality === 'ON LEVEL' ? LIME : levelMap.setupQuality === 'APPROACHING' ? YELLOW : '#444', letterSpacing: '0.14em' }}>
              {levelMap.setupQuality}
            </span>
          )}
        </div>
        {nearby.length === 0 ? (
          <div style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a' }}>No levels mapped yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {nearby.map((l, i) => {
              const c = colorFor(l.type, l.label)
              const isOnLevel = Math.abs(l.dist) < 0.15
              const above = l.dist > 0
              const arrow = isOnLevel ? '●' : above ? '▲' : '▼'
              const arrowColor = isOnLevel ? LIME : above ? ORANGE : BLUE
              return (
                <div key={i} style={{ background: '#0a0a0a', border: `1px solid ${isOnLevel ? LIME + '44' : '#161616'}`, borderRadius: 3, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: c, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{shortName(l.label)}</div>
                  <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: '#e8e8e8' }}>${f2(l.price)}</div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: arrowColor, marginTop: 2, fontWeight: 700 }}>
                    {arrow} ${f2(Math.abs(l.dist))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
