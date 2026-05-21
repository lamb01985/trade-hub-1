import { useEffect, useRef, useState, useMemo } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts'
import { Pill } from './ui.jsx'
import { LIME, RED, YELLOW, BLUE, PURPLE, ORANGE, MONO, BORDER, PANEL, f2 } from '../constants.js'
import { fullAnalysis } from '../lib/structure.js'
import { isPreMarketBar, isRegularSessionBar } from '../lib/premarket.js'

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
  { id: 'zones', label: 'Zones', types: ['supply', 'demand', 'poc', 'vah', 'val', 'hvn', 'lvn'] },
  { id: 'premarket', label: 'Pre-Mkt', types: ['premarket-high', 'premarket-low'] },
  { id: 'signals', label: 'Signals', types: [] },
  { id: 'structure', label: 'Structure', types: [] },
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
    case 'vah': return '#FFFFFF'
    case 'val': return '#FFFFFF'
    case 'hvn': return '#6699FF'
    case 'lvn': return '#445'
    case 'custom': return '#FFFFFF'
    case 'premarket-high': return LIME
    case 'premarket-low': return RED
    default: return '#666'
  }
}

function styleFor(type, label = '') {
  if (label.includes('Prev Day Close')) return LineStyle.Dashed
  if (type === 'custom') return LineStyle.Dashed
  if (type === 'vwap-band' || type === 'weekly') return LineStyle.Dashed
  if (type === 'vah' || type === 'val') return LineStyle.Dashed
  if (type === 'premarket-high' || type === 'premarket-low') return LineStyle.Dashed
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

// Convert a hex color (#RRGGBB or named LIME etc) into rgba with the given alpha.
// Used to fade distant level lines without re-creating them.
function withAlpha(color, alpha) {
  if (!color) return color
  if (color.startsWith('rgba') || color.startsWith('rgb(')) return color
  let c = color.startsWith('#') ? color.slice(1) : color
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]
  if (c.length < 6) return color
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const FADE_DISTANCE = 1.50
const ACTIVE_BAND_FILL = 'rgba(209, 255, 121, 0.06)'
const HALO_FILL = 'rgba(209, 255, 121, 0.12)'
const ABOVE_BG = '#15191A', ABOVE_BORDER = '#2A3320', ABOVE_TEXT = '#9DB877'
const BELOW_BG = '#1A1515', BELOW_BORDER = '#332020', BELOW_TEXT = '#C77575'

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

export default function ChartTab({ liveData, levelMap, trades, ticker, customLevels = [], onCustomLevelsChange, mtfAlignment, putThesis }) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (isMobile) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', maxWidth: 460, margin: '60px auto' }}>
        <div style={{ fontSize: 36, opacity: 0.4 }}>📊</div>
        <div style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: '#e8e8e8', letterSpacing: '0.04em' }}>Open on desktop for the full chart view.</div>
        <div style={{ fontSize: 12, fontFamily: MONO, color: '#666', lineHeight: 1.7 }}>
          Use the <strong style={{ color: LIME }}>Levels</strong> tab for real-time level intelligence, setup quality, alignment score, and entry conditions. Use <strong style={{ color: LIME }}>Journal</strong> with the floating + button to log trades from your phone.
        </div>
      </div>
    )
  }
  const wrapRef = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const volumeRef = useRef(null)
  const avgVolLineRef = useRef(null)
  const linesRef = useRef([])
  const tradeLinesRef = useRef([])
  const markersRef = useRef(null)
  const currentCandleRef = useRef(null)
  const swingHighLineRef = useRef(null)
  const swingLowLineRef = useRef(null)
  const bosLineRef = useRef(null)
  const profileOverlayRef = useRef(null)
  const [priceOverlay, setPriceOverlay] = useState(null)
  const putTriggerLineRef = useRef(null)

  const [timeframe, setTimeframe] = useState('5m')
  const [layers, setLayers] = useState({ pivots: true, vwap: true, fibs: true, zones: true, signals: true, structure: true, premarket: true, volprofile: true })
  const [addOpen, setAddOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newPrice, setNewPrice] = useState('')

  // ── Structure analysis (current timeframe) ─────────────────────────────────
  // Multi-TF comes from App via the mtfAlignment prop so the score stays
  // consistent across header / Levels / Checklist / AI brief.
  const currentAnalysis = useMemo(() => {
    const mins = TIMEFRAMES.find(t => t.id === timeframe)?.mins || 5
    const agg = aggregateBars(liveData?.intradayBars || [], mins)
    return fullAnalysis(agg)
  }, [liveData?.intradayBars, timeframe])

  const mtfAnalysis = mtfAlignment?.mtf || null

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
      // Built-in price line disabled — replaced by the custom overlay with halo
      // line, lime pill, distance badges, and position meter further down.
      priceLineVisible: false,
      lastValueVisible: false,
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

    const swingHighLine = chart.addSeries(LineSeries, {
      color: '#888', lineWidth: 1, lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    })
    const swingLowLine = chart.addSeries(LineSeries, {
      color: '#888', lineWidth: 1, lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    })

    chartRef.current = chart
    candleRef.current = candle
    volumeRef.current = volume
    avgVolLineRef.current = avgVolLine
    swingHighLineRef.current = swingHighLine
    swingLowLineRef.current = swingLowLine

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
      swingHighLineRef.current = null
      swingLowLineRef.current = null
      bosLineRef.current = null
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

    const candleData = aggregated.map(b => {
      const isPm = isPreMarketBar(b)
      const up = b.c >= b.o
      const baseUp = LIME, baseDown = RED
      const pmUp = '#7a8a6a', pmDown = '#8a5a5a'
      const color = isPm ? (up ? pmUp : pmDown) : (up ? baseUp : baseDown)
      return {
        time: Math.floor(b.t / 1000),
        open: b.o, high: b.h, low: b.l, close: b.c,
        color, borderColor: color, wickColor: color,
      }
    })
    candleRef.current.setData(candleData)

    volumeRef.current.setData(aggregated.map(b => {
      const isPm = isPreMarketBar(b)
      const up = b.c >= b.o
      const baseColor = up ? LIME : RED
      const alpha = isPm ? '33' : '55'
      return {
        time: Math.floor(b.t / 1000),
        value: b.v,
        color: `${baseColor}${alpha}`,
      }
    }))

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

    for (const entry of linesRef.current) {
      try { candleRef.current.removePriceLine(entry.line || entry) } catch {}
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
      linesRef.current.push({ line, level, baseColor: color, isConfluence: false, lastNear: null })
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
      linesRef.current.push({ line, level: { price: cluster.price, label: cluster.label, type: 'confluence' }, baseColor: LIME, isConfluence: true, lastNear: null })
    }
  }, [levelMap, layers])

  // ── Compute price overlay coords (current y, active band y range, %) ─────
  // Recomputes on price change AND on chart pan/zoom (subscribed below).
  useEffect(() => {
    function compute() {
      if (!candleRef.current || !liveData?.price) { setPriceOverlay(null); return }
      const price = liveData.price
      const currentY = candleRef.current.priceToCoordinate(price)
      if (currentY == null) { setPriceOverlay(null); return }

      const ceiling = levelMap?.nearestAbove?.price ?? null
      const floor = levelMap?.nearestBelow?.price ?? null
      const ceilingY = ceiling != null ? candleRef.current.priceToCoordinate(ceiling) : null
      const floorY = floor != null ? candleRef.current.priceToCoordinate(floor) : null

      let positionPct = null, toCeiling = null, toFloor = null
      if (ceiling != null && floor != null && ceiling > floor) {
        positionPct = Math.round(((price - floor) / (ceiling - floor)) * 100)
        toCeiling = ceiling - price
        toFloor = price - floor
      }

      setPriceOverlay({
        price, currentY,
        ceiling, ceilingY, ceilingLabel: levelMap?.nearestAbove?.label || null,
        floor, floorY, floorLabel: levelMap?.nearestBelow?.label || null,
        positionPct, toCeiling, toFloor,
      })
    }
    compute()
    if (!chartRef.current) return
    const ts = chartRef.current.timeScale()
    const handler = () => compute()
    ts.subscribeVisibleLogicalRangeChange(handler)
    return () => { try { ts.unsubscribeVisibleLogicalRangeChange(handler) } catch {} }
  }, [liveData?.price, levelMap?.nearestAbove?.price, levelMap?.nearestBelow?.price])

  // ── Fade distant level lines based on current price ──────────────────────
  // Lines within FADE_DISTANCE stay opaque; further lines fade. Confluence
  // lines fade less aggressively so they remain readable across the chart.
  useEffect(() => {
    if (!candleRef.current || !liveData?.price || !linesRef.current?.length) return
    const price = liveData.price
    for (const entry of linesRef.current) {
      if (!entry?.line || !entry.level) continue
      const near = Math.abs(entry.level.price - price) <= FADE_DISTANCE
      if (entry.lastNear === near) continue
      entry.lastNear = near
      const alpha = near ? 1 : (entry.isConfluence ? 0.5 : 0.35)
      const faded = withAlpha(entry.baseColor, alpha)
      try {
        entry.line.applyOptions({
          color: faded,
          axisLabelTextColor: entry.isConfluence ? (near ? '#000' : 'rgba(0,0,0,0.6)') : faded,
        })
      } catch {}
    }
  }, [liveData?.price])

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

    // Market Open separator marker on the first regular-session bar
    if (layers.premarket && liveData?.intradayBars?.length) {
      const firstReg = liveData.intradayBars.find(isRegularSessionBar)
      if (firstReg) {
        markers.push({
          time: Math.floor(firstReg.t / 1000),
          position: 'aboveBar',
          color: '#888',
          shape: 'square',
          text: '◐ Open 8:30 CT',
        })
      }
    }

    if (layers.structure && currentAnalysis?.swings?.length) {
      for (const s of currentAnalysis.swings) {
        markers.push({
          time: Math.floor(s.time / 1000),
          position: s.type === 'high' ? 'aboveBar' : 'belowBar',
          color: s.type === 'high' ? RED : LIME,
          shape: s.type === 'high' ? 'arrowDown' : 'arrowUp',
          text: s.type === 'high' ? 'SH' : 'SL',
        })
      }
      if (currentAnalysis.choch?.swing) {
        markers.push({
          time: Math.floor(currentAnalysis.choch.swing.time / 1000),
          position: currentAnalysis.choch.type === 'bullish' ? 'belowBar' : 'aboveBar',
          color: YELLOW,
          shape: 'circle',
          text: 'CHoCH',
        })
      }
    }

    // Deduplicate by time+position (latest wins)
    const dedup = new Map()
    for (const m of markers) dedup.set(`${m.time}-${m.position}-${m.text}`, m)
    const finalMarkers = [...dedup.values()].sort((a, b) => a.time - b.time)

    if (markersRef.current) {
      markersRef.current.setMarkers(finalMarkers)
    } else {
      markersRef.current = createSeriesMarkers(candleRef.current, finalMarkers)
    }
  }, [trades, layers.signals, layers.structure, layers.premarket, levelMap?.setupQuality, currentAnalysis, liveData?.intradayBars])

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

  // ── Render structure: swing lines, BOS, swing/CHoCH markers ────────────────
  useEffect(() => {
    if (!candleRef.current || !swingHighLineRef.current || !swingLowLineRef.current) return

    if (bosLineRef.current) {
      try { candleRef.current.removePriceLine(bosLineRef.current) } catch {}
      bosLineRef.current = null
    }

    if (!layers.structure || !currentAnalysis?.swings?.length) {
      swingHighLineRef.current.setData([])
      swingLowLineRef.current.setData([])
      return
    }

    const highs = currentAnalysis.swings.filter(s => s.type === 'high')
    const lows = currentAnalysis.swings.filter(s => s.type === 'low')

    const lastHighLabel = highs[highs.length - 1]?.label
    const lastLowLabel = lows[lows.length - 1]?.label
    const highColor = lastHighLabel === 'HH' ? LIME : lastHighLabel === 'LH' ? RED : '#666'
    const lowColor = lastLowLabel === 'HL' ? LIME : lastLowLabel === 'LL' ? RED : '#666'

    swingHighLineRef.current.applyOptions({ color: highColor })
    swingLowLineRef.current.applyOptions({ color: lowColor })

    swingHighLineRef.current.setData(highs.map(s => ({ time: Math.floor(s.time / 1000), value: s.price })))
    swingLowLineRef.current.setData(lows.map(s => ({ time: Math.floor(s.time / 1000), value: s.price })))

    if (currentAnalysis.bos) {
      const b = currentAnalysis.bos
      const color = b.type === 'bullish' ? LIME : RED
      bosLineRef.current = candleRef.current.createPriceLine({
        price: b.price, color, lineWidth: 2, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, axisLabelColor: '#1a1a1a', axisLabelTextColor: color,
        title: `BOS ${b.type === 'bullish' ? '▲' : '▼'} $${f2(b.price)}`,
      })
    }
  }, [currentAnalysis, layers.structure])

  // ── Active put-thesis entry trigger line ───────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return
    if (putTriggerLineRef.current) {
      try { candleRef.current.removePriceLine(putTriggerLineRef.current) } catch {}
      putTriggerLineRef.current = null
    }
    if (putThesis?.trigger != null) {
      putTriggerLineRef.current = candleRef.current.createPriceLine({
        price: putThesis.trigger,
        color: RED,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        axisLabelColor: '#1a1a1a',
        axisLabelTextColor: RED,
        title: `PUT ENTRY $${f2(putThesis.trigger)}`,
      })
    }
  }, [putThesis?.trigger])

  // ── Volume profile sidebar (SVG overlay on right side of chart) ────────────
  useEffect(() => {
    if (!chartRef.current || !candleRef.current || !profileOverlayRef.current) return
    const overlay = profileOverlayRef.current
    const vp = liveData?.volProfile

    const render = () => {
      if (!candleRef.current || !overlay) return
      if (!layers.volprofile || !vp?.byLevel?.length) { overlay.innerHTML = ''; return }
      const maxVol = Math.max(...vp.byLevel.map(([, v]) => v))
      if (!maxVol) { overlay.innerHTML = ''; return }
      const width = 60
      const innerW = width - 6
      const parts = [`<svg width="${width}" height="100%" style="position:absolute;top:0;right:0;pointer-events:none;">`]

      for (const [price, vol] of vp.byLevel) {
        const y = candleRef.current.priceToCoordinate(price)
        if (y == null) continue
        const w = Math.max(1, (vol / maxVol) * innerW)
        const isPoc = Math.abs(price - vp.poc) < 1e-9
        const fill = isPoc ? '#FFFFFF' : '#FFFFFF55'
        parts.push(`<rect x="${width - w - 3}" y="${y - 1.5}" width="${w}" height="3" fill="${fill}" />`)
      }

      if (vp.vah != null) {
        const y = candleRef.current.priceToCoordinate(vp.vah)
        if (y != null) parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#FFFFFF" stroke-opacity="0.55" stroke-dasharray="3,3" />`)
      }
      if (vp.val != null) {
        const y = candleRef.current.priceToCoordinate(vp.val)
        if (y != null) parts.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#FFFFFF" stroke-opacity="0.55" stroke-dasharray="3,3" />`)
      }
      parts.push('</svg>')
      overlay.innerHTML = parts.join('')
    }

    render()
    const ts = chartRef.current.timeScale()
    const onRange = () => render()
    ts.subscribeVisibleLogicalRangeChange(onRange)
    return () => {
      try { ts.unsubscribeVisibleLogicalRangeChange(onRange) } catch {}
    }
  }, [liveData?.volProfile, layers.volprofile, timeframe])

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
        <div ref={profileOverlayRef} style={{ position: 'absolute', top: 0, right: 60, width: 60, height: '100%', pointerEvents: 'none' }} />

        {/* ── Current-price overlay ───────────────────────────────────────── */}
        {priceOverlay && priceOverlay.currentY != null && (() => {
          const o = priceOverlay
          // The lightweight-charts right price scale is roughly 60px wide; the
          // pill anchors at the right edge of the chart plot area.
          const AXIS_W = 60
          const showActiveBand = o.ceilingY != null && o.floorY != null
          const bandTop = showActiveBand ? Math.min(o.ceilingY, o.floorY) : null
          const bandBottom = showActiveBand ? Math.max(o.ceilingY, o.floorY) : null
          // Position-meter fill: fraction from floor (bottom) upward
          const meterFillPct = (o.positionPct != null) ? Math.max(0, Math.min(100, o.positionPct)) : 0
          return (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              {/* Active zone fill — spans chart width between band ceiling and floor */}
              {showActiveBand && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  right: AXIS_W,
                  top: bandTop,
                  height: bandBottom - bandTop,
                  background: ACTIVE_BAND_FILL,
                }} />
              )}

              {/* Halo line behind main price line */}
              <div style={{
                position: 'absolute', left: 0, right: AXIS_W,
                top: o.currentY - 3, height: 6,
                background: HALO_FILL,
              }} />
              {/* Main price line */}
              <div style={{
                position: 'absolute', left: 0, right: AXIS_W,
                top: o.currentY - 1.25, height: 2.5,
                background: LIME,
              }} />

              {/* Distance badge ABOVE pill (to ceiling) */}
              {o.toCeiling != null && (
                <div style={{
                  position: 'absolute',
                  right: AXIS_W + 6,
                  top: o.currentY - 38,
                  background: ABOVE_BG, border: `0.5px solid ${ABOVE_BORDER}`,
                  color: ABOVE_TEXT, fontFamily: MONO, fontSize: 9,
                  padding: '2px 5px', borderRadius: 3, lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                }}>↑ +{f2(o.toCeiling)}</div>
              )}

              {/* Distance badge BELOW pill (to floor) */}
              {o.toFloor != null && (
                <div style={{
                  position: 'absolute',
                  right: AXIS_W + 6,
                  top: o.currentY + 18,
                  background: BELOW_BG, border: `0.5px solid ${BELOW_BORDER}`,
                  color: BELOW_TEXT, fontFamily: MONO, fontSize: 9,
                  padding: '2px 5px', borderRadius: 3, lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                }}>↓ −{f2(o.toFloor)}</div>
              )}

              {/* Current-price PILL on the right axis */}
              <div style={{
                position: 'absolute',
                right: 4,
                top: o.currentY - 11,
                background: LIME, color: '#000',
                fontFamily: MONO, fontSize: 13, fontWeight: 700,
                padding: '3px 8px', borderRadius: 4, lineHeight: 1.2,
                whiteSpace: 'nowrap',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              }}>${f2(o.price)}</div>

              {/* Position-in-zone meter — vertical bar to the right of the pill */}
              {showActiveBand && o.positionPct != null && (
                <>
                  <div style={{
                    position: 'absolute',
                    right: AXIS_W + 70,
                    top: bandTop,
                    width: 3,
                    height: bandBottom - bandTop,
                    background: '#1a1a1a', borderRadius: 1.5,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute',
                      bottom: 0, left: 0, right: 0,
                      height: `${meterFillPct}%`,
                      background: LIME,
                    }} />
                  </div>
                  <div style={{
                    position: 'absolute',
                    right: AXIS_W + 84,
                    top: bandTop + (bandBottom - bandTop) / 2 - 18,
                    color: LIME, fontFamily: MONO, fontSize: 10, fontWeight: 700,
                    lineHeight: 1.1,
                  }}>
                    <div>{o.positionPct}%</div>
                    <div style={{ color: '#666', fontSize: 8, marginTop: 2, fontWeight: 400, letterSpacing: '0.06em' }}>IN ZONE</div>
                    <div style={{ color: '#555', fontSize: 8, fontWeight: 400, letterSpacing: '0.06em' }}>off floor</div>
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {noData && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: '#444' }}>Waiting for bars...</div>
            <div style={{ fontSize: 10, fontFamily: MONO, color: '#2a2a2a' }}>Add a Massive API key in Command to populate the chart.</div>
          </div>
        )}
      </div>

      {/* ── Status bar — live readout of active zone ────────────────────────── */}
      {priceOverlay && priceOverlay.ceiling != null && priceOverlay.floor != null && (() => {
        const o = priceOverlay
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5 }}>
            {[
              { label: 'IN ZONE', value: `$${f2(o.floor)} to $${f2(o.ceiling)}`, color: '#aaa' },
              { label: 'POSITION', value: `${o.positionPct}% off floor`, color: '#aaa' },
              { label: 'TO CEILING', value: `+$${f2(o.toCeiling)}`, color: ABOVE_TEXT },
              { label: 'TO FLOOR', value: `−$${f2(o.toFloor)}`, color: BELOW_TEXT },
            ].map((col, i) => (
              <div key={col.label} style={{
                padding: '10px 14px',
                borderLeft: i > 0 ? '1px solid #161616' : 'none',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <span style={{ fontSize: 9, fontFamily: MONO, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>{col.label}</span>
                <span style={{ fontSize: 13, fontFamily: MONO, color: col.color, fontWeight: 600 }}>{col.value}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Multi-Timeframe Alignment Score card */}
      {mtfAlignment && mtfAlignment.score > 0 && (() => {
        const a = mtfAlignment
        const c = a.score >= 85 ? LIME : a.score >= 70 ? LIME : a.score >= 55 ? YELLOW : a.score >= 40 ? ORANGE : RED
        const states = a.mtf ? ['1h', '15m', '5m', '1m'].map(tf => ({ tf, state: a.mtf[tf]?.state })) : []
        return (
          <div style={{ background: PANEL, border: `1px solid ${c}55`, borderRadius: 5, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 9, fontFamily: MONO, color: '#666', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Timeframe Alignment</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {states.map(({ tf, state }) => {
                  const sc = state === 'BULLISH' ? LIME : state === 'BEARISH' ? RED : state === 'TRANSITION' ? ORANGE : YELLOW
                  const arrow = state === 'BULLISH' ? '▲' : state === 'BEARISH' ? '▼' : '◆'
                  return (
                    <span key={tf} style={{ fontSize: 9, fontFamily: MONO, color: sc, border: `1px solid ${sc}33`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.06em' }}>
                      {tf.toUpperCase()} {arrow} {state || '—'}
                    </span>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10 }}>
              <span style={{ fontSize: 42, fontWeight: 900, fontFamily: MONO, color: c, lineHeight: 1, letterSpacing: '-0.02em' }}>{a.score}</span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: '#666' }}>/ 100</span>
              <span style={{ fontSize: 12, fontFamily: MONO, color: c, fontWeight: 700, marginLeft: 12, letterSpacing: '0.06em' }}>{a.label}</span>
            </div>

            <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ height: '100%', width: `${a.score}%`, background: c, transition: 'width 0.4s' }} />
            </div>

            <div style={{ display: 'flex', gap: 18, fontSize: 10, fontFamily: MONO, color: '#888' }}>
              <span><span style={{ color: '#555' }}>Direction:</span> <strong style={{ color: c }}>{a.direction}</strong></span>
              <span><span style={{ color: '#555' }}>Confidence:</span> <strong style={{ color: c }}>{a.confidence}</strong></span>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, fontFamily: MONO, color: '#aaa', lineHeight: 1.55, fontStyle: 'italic' }}>
              "{a.recommendation}"
            </div>
          </div>
        )
      })()}

      {/* Market Structure Panel */}
      {(() => {
        const a = currentAnalysis
        const mtf = mtfAnalysis
        const stateColor = a?.state === 'BULLISH' ? LIME : a?.state === 'BEARISH' ? RED : a?.state === 'TRANSITION' ? ORANGE : YELLOW
        const strength = a?.strength || 0
        const strengthLabel = strength >= 5 ? 'Strong trend' : strength >= 3 ? 'Moderate trend' : strength >= 1 ? 'Weak trend' : 'No trend'
        const strengthPct = Math.min(100, (strength / 6) * 100)
        const labelColor = lbl => (lbl === 'HH' || lbl === 'HL') ? LIME : (lbl === 'LH' || lbl === 'LL') ? RED : '#888'

        // Multi-timeframe alignment
        const states = mtf ? [mtf['1m']?.state, mtf['5m']?.state, mtf['15m']?.state] : []
        const allBull = states.length === 3 && states.every(s => s === 'BULLISH')
        const allBear = states.length === 3 && states.every(s => s === 'BEARISH')
        const aligned = allBull || allBear

        const showBOS = a?.bos && a.bos.barsAgo <= 3
        const showCHoCH = !!a?.choch

        return (
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 5, padding: '14px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 9, fontFamily: MONO, color: '#666', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Market Structure — {timeframe}</span>
              {mtf && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {['1h', '15m', '5m', '1m'].map(tf => {
                    const s = mtf[tf]?.state
                    const c = s === 'BULLISH' ? LIME : s === 'BEARISH' ? RED : s === 'TRANSITION' ? ORANGE : YELLOW
                    return (
                      <span key={tf} style={{ fontSize: 9, fontFamily: MONO, color: c, border: `1px solid ${c}33`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.06em' }}>
                        {tf.toUpperCase()}: {s || '—'}
                      </span>
                    )
                  })}
                  <span style={{ marginLeft: 6, fontSize: 9, fontFamily: MONO, color: aligned ? LIME : YELLOW, letterSpacing: '0.08em', fontWeight: 700 }}>
                    {aligned ? 'ALIGNED ✓' : 'MIXED'}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 16, alignItems: 'stretch' }}>
              {/* Badge */}
              <div style={{ background: `${stateColor}11`, border: `1px solid ${stateColor}55`, borderRadius: 4, padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 9, color: '#555', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Current</div>
                <div style={{ fontSize: 18, fontFamily: MONO, fontWeight: 900, color: stateColor, letterSpacing: '0.04em' }}>{a?.state || 'NO DATA'}</div>
                <div style={{ fontSize: 9, fontFamily: MONO, color: '#555', marginTop: 4 }}>{strengthLabel}</div>
                <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ height: '100%', width: `${strengthPct}%`, background: stateColor, transition: 'width 0.3s' }} />
                </div>
              </div>

              {/* Last 4 swings */}
              <div style={{ background: '#080808', border: '1px solid #161616', borderRadius: 4, padding: '10px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                <div style={{ fontSize: 9, color: '#555', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Last 4 Swings</div>
                {a?.lastSwings?.length ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {a.lastSwings.map((s, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: labelColor(s.label) }}>
                          {s.label} ${f2(s.price)}
                        </span>
                        {i < a.lastSwings.length - 1 && <span style={{ fontSize: 11, color: '#333' }}>→</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, fontFamily: MONO, color: '#3a3a3a' }}>Not enough bars to detect swings yet.</div>
                )}
              </div>
            </div>

            {(showBOS || showCHoCH) && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {showBOS && (
                  <div style={{ background: a.bos.type === 'bullish' ? '#0a1208' : '#150808', border: `1px solid ${a.bos.type === 'bullish' ? LIME : RED}44`, borderRadius: 4, padding: '10px 14px', fontSize: 11, fontFamily: MONO, color: a.bos.type === 'bullish' ? LIME : RED, fontWeight: 700, animation: 'hdrpulse 1.5s infinite' }}>
                    ⚡ BREAK OF STRUCTURE {a.bos.type === 'bullish' ? '▲' : '▼'} at ${f2(a.bos.price)} — trend may be reversing. Watch next swing point.
                  </div>
                )}
                {showCHoCH && (
                  <div style={{ background: '#110d04', border: `1px solid ${YELLOW}44`, borderRadius: 4, padding: '10px 14px', fontSize: 11, fontFamily: MONO, color: YELLOW, fontWeight: 700 }}>
                    ⚠ CHARACTER CHANGE — first sign of reversal at ${f2(a.choch.swing.price)}. Do not fight the new direction.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

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
