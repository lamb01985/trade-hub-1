// Calendar data: OPEX (computed), FOMC (hardcoded 2026), recurring economic
// releases (algorithmic), and a small hardcoded one-off list for the next 30
// days. Earnings come from a best-effort Nasdaq fetch with hardcoded fallback.

export const MAJOR_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD']

// ── Date helpers ──────────────────────────────────────────────────────────────

export function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s) {
  // Local date — avoid the UTC shift you get with new Date('2026-05-16')
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function nthWeekday(year, month, weekday, n) {
  // month 0-indexed; weekday 0=Sun .. 5=Fri
  const d = new Date(year, month, 1)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + (n - 1) * 7)
  return d
}

export function isTripleWitchingDate(date) {
  const m = date.getMonth()
  if (![2, 5, 8, 11].includes(m)) return false
  const tw = nthWeekday(date.getFullYear(), m, 5, 3)
  return tw.getDate() === date.getDate()
}

export function isMonthlyOPEX(date) {
  if (date.getDay() !== 5) return false
  const tw = nthWeekday(date.getFullYear(), date.getMonth(), 5, 3)
  return tw.getDate() === date.getDate()
}

// ── FOMC 2026 (typical Tue-Wed pattern, decision day at 1:00 CT) ─────────────

const FOMC_2026 = [
  { date: '2026-01-28', name: 'FOMC Rate Decision' },
  { date: '2026-03-18', name: 'FOMC Rate Decision + SEP' },
  { date: '2026-04-29', name: 'FOMC Rate Decision' },
  { date: '2026-06-17', name: 'FOMC Rate Decision + SEP' },
  { date: '2026-07-29', name: 'FOMC Rate Decision' },
  { date: '2026-09-16', name: 'FOMC Rate Decision + SEP' },
  { date: '2026-10-28', name: 'FOMC Rate Decision' },
  { date: '2026-12-09', name: 'FOMC Rate Decision + SEP' },
]

// ── Hardcoded one-off economic events for the rolling 30-day window ──────────
// These are typical release dates and may shift ±1 day from the official BLS
// schedule. Refresh manually each month from www.bls.gov/schedule/news_release/
// and www.bea.gov/news/schedule.

const ONE_OFF_EVENTS = [
  // May 2026
  { date: '2026-05-26', time: '09:00', name: 'Consumer Confidence', impact: 'medium' },
  { date: '2026-05-26', time: '09:00', name: 'New Home Sales', impact: 'low' },
  { date: '2026-05-28', time: '07:30', name: 'GDP Q1 (Second Estimate)', impact: 'high' },
  { date: '2026-05-29', time: '07:30', name: 'PCE Price Index', impact: 'high' },
  { date: '2026-05-29', time: '07:30', name: 'Personal Income & Spending', impact: 'medium' },
  // June 2026
  { date: '2026-06-02', time: '09:00', name: 'ISM Manufacturing PMI', impact: 'medium' },
  { date: '2026-06-04', time: '09:00', name: 'ISM Services PMI', impact: 'medium' },
  { date: '2026-06-11', time: '07:30', name: 'CPI (May)', impact: 'high' },
  { date: '2026-06-12', time: '07:30', name: 'PPI (May)', impact: 'medium' },
  { date: '2026-06-17', time: '07:30', name: 'Retail Sales (May)', impact: 'high' },
  { date: '2026-06-26', time: '07:30', name: 'PCE Price Index', impact: 'high' },
]

// ── Hardcoded major-ticker earnings for the rolling 30-day window ────────────
// Refresh quarterly; sourced from each company's IR calendar.

const HARDCODED_EARNINGS = [
  { date: '2026-05-27', time: '15:30', ticker: 'NVDA', bmo: 'AMC', name: 'NVDA Q1 Earnings' },
]

// ── Generators ────────────────────────────────────────────────────────────────

function generateOPEX(start, end) {
  const events = []
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  while (d <= end) {
    if (d.getDay() === 5) {
      const tw = isTripleWitchingDate(d)
      const monthly = isMonthlyOPEX(d)
      events.push({
        date: ymd(d),
        time: '15:00',
        type: 'opex',
        impact: tw ? 'high' : monthly ? 'medium' : 'low',
        name: tw ? 'Triple Witching OPEX' : monthly ? 'Monthly OPEX' : 'Weekly OPEX',
        tripleWitching: tw,
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return events
}

function generateJoblessClaims(start, end) {
  const events = []
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  while (d <= end) {
    if (d.getDay() === 4) {
      events.push({
        date: ymd(d), time: '07:30', type: 'economic', impact: 'medium',
        name: 'Initial Jobless Claims',
      })
    }
    d.setDate(d.getDate() + 1)
  }
  return events
}

function generateNFP(start, end) {
  const events = []
  const months = new Set()
  const d = new Date(start)
  while (d <= end) {
    months.add(`${d.getFullYear()}-${d.getMonth()}`)
    d.setDate(d.getDate() + 1)
  }
  for (const key of months) {
    const [y, m] = key.split('-').map(Number)
    const fri = nthWeekday(y, m, 5, 1)
    if (fri >= start && fri <= end) {
      events.push({
        date: ymd(fri), time: '07:30', type: 'economic', impact: 'high',
        name: 'Nonfarm Payrolls (NFP)',
      })
    }
  }
  return events
}

function expandFOMC(start, end) {
  return FOMC_2026
    .filter(e => {
      const d = parseYmd(e.date)
      return d >= start && d <= end
    })
    .map(e => ({
      date: e.date, time: '13:00', type: 'fomc', impact: 'high',
      name: e.name, details: 'Statement at 1:00 CT, presser at 1:30 CT',
    }))
}

function expandOneOffs(start, end) {
  return ONE_OFF_EVENTS
    .filter(e => {
      const d = parseYmd(e.date)
      return d >= start && d <= end
    })
    .map(e => ({ ...e, type: 'economic' }))
}

function expandHardcodedEarnings(start, end) {
  return HARDCODED_EARNINGS
    .filter(e => {
      const d = parseYmd(e.date)
      return d >= start && d <= end
    })
    .map(e => ({ ...e, type: 'earnings', impact: 'medium' }))
}

// ── Earnings fetch via /api/calendar-earnings (Vercel proxy) ────────────────
// Direct calls to api.nasdaq.com are blocked by CORS in the browser, so this
// goes through a same-origin serverless function that proxies the request.

export async function fetchNasdaqEarnings(dateStr) {
  try {
    const res = await fetch(`/api/calendar-earnings?date=${encodeURIComponent(dateStr)}`, {
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    const rows = data?.data?.rows || []
    return rows
      .filter(r => MAJOR_TICKERS.includes((r.symbol || '').toUpperCase()))
      .map(r => ({
        date: dateStr,
        time: r.time === 'time-pre-market' ? '07:00' : r.time === 'time-after-hours' ? '15:30' : '12:00',
        type: 'earnings',
        impact: 'medium',
        name: `${r.symbol} Earnings`,
        ticker: r.symbol,
        bmo: r.time === 'time-pre-market' ? 'BMO' : r.time === 'time-after-hours' ? 'AMC' : '—',
        est: r.epsForecast || null,
      }))
  } catch {
    return []
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getAllEvents(fromDate, daysAhead = 14) {
  const start = new Date(fromDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + daysAhead)
  end.setHours(23, 59, 59, 999)

  const events = [
    ...generateOPEX(start, end),
    ...generateJoblessClaims(start, end),
    ...generateNFP(start, end),
    ...expandFOMC(start, end),
    ...expandOneOffs(start, end),
    ...expandHardcodedEarnings(start, end),
  ]

  // Sort by date then time
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return (a.time || '').localeCompare(b.time || '')
  })

  return events
}

export function eventsOn(events, dateStr) {
  return events.filter(e => e.date === dateStr)
}

export function highImpactToday(events) {
  const today = ymd(new Date())
  return events.filter(e => e.date === today && e.impact === 'high')
}

export function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday as start
  d.setDate(d.getDate() + diff)
  return d
}

export function colorForEvent(e) {
  if (e.type === 'fomc') return '#F97316' // orange
  if (e.type === 'opex' && e.tripleWitching) return '#F97316'
  if (e.type === 'opex') return '#D1FF79' // lime
  if (e.type === 'earnings') return '#60A5FA' // blue
  if (e.impact === 'high') return '#FF4D4D' // red
  if (e.impact === 'medium') return '#FFD166' // yellow
  return '#888'
}
