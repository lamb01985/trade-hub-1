export const LIME = '#D1FF79'
export const RED = '#FF4D4D'
export const YELLOW = '#FFD166'
export const BLUE = '#60A5FA'
export const PURPLE = '#C084FC'
export const ORANGE = '#F97316'
export const DARK = '#0e0e0e'
export const PANEL = '#191919'
export const BORDER = '#2c2c2c'
export const MONO = "'DM Mono', monospace"
export const SANS = "'IBM Plex Sans', sans-serif"

export const LEVEL_COLORS = {
  pivot: '#888888',
  'pivot-r': '#FF7744',
  'pivot-s': '#4477FF',
  structure: '#CCCCCC',
  vwap: '#C084FC',
  'vwap-band': '#7050A0',
  orb: '#D1FF79',
  fib: '#FFD166',
  supply: '#FF4D4D',
  demand: '#60A5FA',
  weekly: '#FF6600',
}

export const SESSION_LABELS = {
  'pre-market': 'PRE-MARKET',
  open: 'MARKET OPEN',
  chop: 'MIDDAY CHOP',
  'power-hour': 'POWER HOUR',
  'after-hours': 'AFTER HOURS',
  weekend: 'WEEKEND',
  holiday: 'MARKET HOLIDAY',
}

export const SESSION_COLORS = {
  'pre-market': '#444',
  open: LIME,
  chop: YELLOW,
  'power-hour': ORANGE,
  'after-hours': '#444',
  weekend: '#3a3a3a',
  holiday: '#3a3a3a',
}

export const SESSION_TIPS = {
  'pre-market': 'Market opens 8:30 CT. Build your level map. Pick your strike. Do not trade yet.',
  open: 'Prime ORB window 8:30–10:30 CT. Check Levels tab. Wait for a level touch. Then execute.',
  chop: 'Avoid 10:30–1:30 CT. Price chops between levels, theta kills you. No new positions.',
  'power-hour': 'Power hour: trend follow only. Tighter stops. Watch for level breaks.',
  'after-hours': 'Market closed. Log trades, review the level map, prep tomorrow.',
  weekend: 'Markets closed — prep for Monday.',
  holiday: 'Market holiday — closed today.',
}

// US market holidays — hardcoded 2026 (date strings YYYY-MM-DD in ET).
// Refresh annually from nyse.com/markets/hours-calendars.
export const MARKET_HOLIDAYS_2026 = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Presidents' Day",
  '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas',
}

// Returns the holiday name if today is a market holiday in ET, otherwise null.
export function getMarketHolidayName(date = new Date()) {
  // Get the ET date as YYYY-MM-DD (handles timezone properly)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  const key = `${y}-${m}-${d}`
  return MARKET_HOLIDAYS_2026[key] || null
}

// Returns 0..6 day-of-week in ET (0=Sun, 6=Sat). Required for weekend detection
// because the user's local clock might be a different calendar day than ET.
export function getETDayOfWeek(date = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date)
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd]
}

export const SETUP_TYPES = ['ORB','Trend Continuation','VWAP Bounce','VWAP Band Touch','Pivot Level','Fibonacci','Supply/Demand Zone','Reversal','Bull Flag','Bear Flag','Gap Fill','Other']

export function getETMins() {
  const s = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

export function getSession() {
  // Day-of-week + holiday check first — the time-of-day check below is only
  // meaningful on a regular trading day.
  const dow = getETDayOfWeek()
  if (dow === 0 || dow === 6) return 'weekend'
  if (getMarketHolidayName()) return 'holiday'
  const e = getETMins()
  if (e < 570) return 'pre-market'
  if (e >= 960) return 'after-hours'
  if (e >= 690 && e < 870) return 'chop'
  if (e >= 900) return 'power-hour'
  return 'open'
}

export const todayStr = () => new Date().toISOString().slice(0, 10)
export const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
// Local-timezone YYYY-MM-DD for fields the user thinks of in their own day
// (trade dates entered via the Log Trade form). Differs from todayStr() near
// UTC midnight, which falls in CT evening.
export const localDateStr = (d = new Date()) => {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
export const uid = () => Math.random().toString(36).slice(2, 10)
export const f2 = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toFixed(d)
export const fmtD = n => n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtU = n => n == null || isNaN(n) ? '—' : `$${Math.abs(n).toFixed(2)}`
export const rrColor = rr => !rr || isNaN(rr) ? '#444' : rr >= 3 ? LIME : rr >= 2 ? YELLOW : RED

export function ivContext(iv) {
  if (iv < 15) return { label: 'VERY LOW', color: BLUE, detail: 'Cheap premium. Rare — double-check there\'s an expected move.' }
  if (iv < 22) return { label: 'LOW', color: LIME, detail: 'Below average. Good environment for buying premium.' }
  if (iv < 30) return { label: 'NORMAL', color: LIME, detail: 'Average for QQQ/SPY. Fair pricing.' }
  if (iv < 40) return { label: 'ELEVATED', color: YELLOW, detail: 'Above average. You\'re paying more. Consider smaller size.' }
  if (iv < 55) return { label: 'HIGH', color: ORANGE, detail: 'Juiced. You need a bigger, faster move. Size down.' }
  return { label: 'EXTREME', color: RED, detail: 'Extremely expensive. As a buyer you need a massive fast move just to break even.' }
}

export function calcOptionRR(entry, stop, target, contracts) {
  const e = parseFloat(entry), s = parseFloat(stop), t = parseFloat(target), n = parseInt(contracts) || 1
  if (isNaN(e) || isNaN(s) || isNaN(t) || e <= 0 || s <= 0 || t <= 0) return null
  const risk = e - s, reward = t - e
  if (risk <= 0 || reward <= 0) return null
  const rr = reward / risk
  return { rr, risk, reward, dollarRisk: risk * n * 100, dollarReward: reward * n * 100, totalCost: e * n * 100, breakEvenWin: (1 / (1 + rr)) * 100 }
}

// Black-Scholes
function npdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) }
function ncdf(x) {
  if (x < -8) return 0; if (x > 8) return 1
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911
  const sign = x < 0 ? -1 : 1, t = 1 / (1 + p * Math.abs(x) / Math.sqrt(2))
  return 0.5 * (1 + sign * (1 - ((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x/2)))
}
export function bsCalc(S, K, T, r, sig, type) {
  if (T <= 0 || sig <= 0 || S <= 0 || K <= 0) return null
  const sq = Math.sqrt(T), d1 = (Math.log(S/K) + (r+0.5*sig*sig)*T) / (sig*sq), d2 = d1 - sig*sq
  const g = npdf(d1) / (S*sig*sq), ve = S*npdf(d1)*sq/100
  if (type === 'call') return { price: S*ncdf(d1)-K*Math.exp(-r*T)*ncdf(d2), delta: ncdf(d1), gamma: g, theta: (-(S*npdf(d1)*sig)/(2*sq)-r*K*Math.exp(-r*T)*ncdf(d2))/365, vega: ve }
  return { price: K*Math.exp(-r*T)*ncdf(-d2)-S*ncdf(-d1), delta: ncdf(d1)-1, gamma: g, theta: (-(S*npdf(d1)*sig)/(2*sq)+r*K*Math.exp(-r*T)*ncdf(-d2))/365, vega: ve }
}
