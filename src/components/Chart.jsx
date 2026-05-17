import { useEffect, useRef, useState, useMemo } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts'
import { Pill } from './ui.jsx'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, MONO, BORDER, DARK, PANEL, f2 } from '../constants.js'

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
    case 'custom': return '#aaa'
    default: return '#666'
  }
}

function styleFor(type, label = '') {
  if (label.includes('Prev Day Close')) return LineStyle.Dashed
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

export default function ChartTab({ liveData, levelMap, trades, ticker }) {
  const wrapRef = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const volumeRef = useRef(null)
  const linesRef = useRef([])
  const markersRef = useRef(null)
  const currentCandleRef = useRef(null)

  const [timeframe, setTimeframe] = useState('5m')
  const [layers, setLayers] = useState({ pivots: true, vwap: true, fibs: true, zones: true, signals: true })

  // ── Initialize chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#888',
        fontFamily: 'DM Mono, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#141414' },
        horzLines: { color: '#141414' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#2c2c2c', scaleMargins: { top: 0.08, bottom: 0.22 } },
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
      scaleMargins: { top: 0.85, bottom: 0 },
      visible: false,
    })

    chartRef.current = chart
    candleRef.current = candle
    volumeRef.current = volume

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
      linesRef.current = []
      markersRef.current = null
      currentCandleRef.current = null
    }
  }, [])

  // ── Load bars when intradayBars or timeframe changes ───────────────────────
  useEffect(() => {
    if (!candleRef.current || !volumeRef.current) return
    const mins = TIMEFRAMES.find(t => t.id === timeframe)?.mins || 5
    const aggregated = aggregateBars(liveData?.intradayBars || [], mins)

    candleRef.current.setData(aggregated.map(b => ({
      time: Math.floor(b.t / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c,
    })))

    volumeRef.current.setData(aggregated.map(b => ({
      time: Math.floor(b.t / 1000),
      value: b.v,
      color: b.c >= b.o ? `${LIME}55` : `${RED}55`,
    })))

    const last = aggregated[aggregated.length - 1]
    currentCandleRef.current = last
      ? { time: Math.floor(last.t / 1000), open: last.o, high: last.h, low: last.l, close: last.c }
      : null
  }, [liveData?.intradayBars, timeframe])

  // ── Real-time price tick: update current candle ────────────────────────────
  useEffect(() => {
    if (!candleRef.current || !liveData?.price) return
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
  }, [liveData?.price, timeframe])

  // ── Draw level price lines ──────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return

    // Remove existing
    for (const line of linesRef.current) {
      try { candleRef.current.removePriceLine(line) } catch {}
    }
    linesRef.current = []

    const levels = levelMap?.levels || []
    for (const level of levels) {
      const group = groupForType(level.type)
      if (!layers[group]) continue
      if (level.price == null || isNaN(level.price)) continue

      const line = candleRef.current.createPriceLine({
        price: level.price,
        color: colorFor(level.type, level.label),
        lineWidth: widthFor(level.type, level.label),
        lineStyle: styleFor(level.type, level.label),
        axisLabelVisible: true,
        title: level.label,
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

      // ON LEVEL entry signal — flag at current bar
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
  const openTradeLinesRef = useRef([])
  useEffect(() => {
    if (!candleRef.current) return
    for (const line of openTradeLinesRef.current) {
      try { candleRef.current.removePriceLine(line) } catch {}
    }
    openTradeLinesRef.current = []
    if (!layers.signals) return

    const open = (trades || []).filter(t => t.status === 'open')
    for (const t of open) {
      if (t.stop != null) {
        const l = candleRef.current.createPriceLine({
          price: t.stop, color: RED, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: `STOP ${t.ticker}`,
        })
        openTradeLinesRef.current.push(l)
      }
      if (t.target != null) {
        const l = candleRef.current.createPriceLine({
          price: t.target, color: LIME, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title: `TGT ${t.ticker}`,
        })
        openTradeLinesRef.current.push(l)
      }
    }
  }, [trades, layers.signals])

  // ── Auto-fit ────────────────────────────────────────────────────────────────
  function autoFit() {
    chartRef.current?.timeScale().fitContent()
  }

  // ── Nearest levels for bottom bar ───────────────────────────────────────────
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
      {/* Controls row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 11, fontFamily: MONO, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{ticker || 'QQQ'}</span>
          {liveData?.price && (
            <span style={{ fontSize: 18, fontFamily: MONO, fontWeight: 900, color: LIME }}>${f2(liveData.price)}</span>
          )}
          {liveData?.rvol != null && (
            <span style={{ fontSize: 10, fontFamily: MONO, color: liveData.rvol >= 1.2 ? LIME : liveData.rvol >= 0.8 ? YELLOW : RED }}>
              RVOL {liveData.rvol.toFixed(2)}x
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TIMEFRAMES.map(tf => (
            <Pill key={tf.id} label={tf.label} active={timeframe === tf.id} onClick={() => setTimeframe(tf.id)} />
          ))}
          <span style={{ width: 8 }} />
          {LAYER_GROUPS.map(g => (
            <Pill key={g.id} label={g.label} active={layers[g.id]} onClick={() => setLayers(s => ({ ...s, [g.id]: !s[g.id] }))} />
          ))}
          <span style={{ width: 8 }} />
          <button onClick={autoFit} style={{
            background: 'transparent', border: `1px solid ${BORDER}`, color: '#888',
            fontFamily: MONO, fontSize: 9, padding: '4px 10px', borderRadius: 3,
            cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Auto-fit</button>
        </div>
      </div>

      {/* Chart canvas */}
      <div style={{ position: 'relative', width: '100%', height: '70vh', minHeight: 480, background: '#0a0a0a', border: `1px solid ${BORDER}`, borderRadius: 5 }}>
        <div ref={wrapRef} style={{ width: '100%', height: '100%' }} />
        {noData && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: '#444' }}>Waiting for intraday bars...</div>
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a' }}>Add a Massive API key in Command to populate the chart.</div>
          </div>
        )}
      </div>

      {/* Nearby levels strip */}
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
              const above = l.dist > 0
              return (
                <div key={i} style={{ background: '#0a0a0a', border: '1px solid #161616', borderRadius: 3, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: c, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{l.label}</div>
                  <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: '#e8e8e8' }}>${f2(l.price)}</div>
                  <div style={{ fontSize: 9, fontFamily: MONO, color: above ? '#777' : '#777', marginTop: 2 }}>
                    {above ? '↑' : '↓'} {f2(Math.abs(l.dist))}
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
