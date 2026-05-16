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
}

export const SESSION_COLORS = {
  'pre-market': '#444',
  open: LIME,
  chop: YELLOW,
  'power-hour': ORANGE,
  'after-hours': '#444',
}

export const SESSION_TIPS = {
  'pre-market': 'Market opens 8:30 CT. Build your level map. Pick your strike. Do not trade yet.',
  open: 'Prime ORB window 8:30–10:30 CT. Check Levels tab. Wait for a level touch. Then execute.',
  chop: 'Avoid 10:30–1:30 CT. Price chops between levels, theta kills you. No new positions.',
  'power-hour': 'Power hour: trend follow only. Tighter stops. Watch for level breaks.',
  'after-hours': 'Market closed. Log trades, review the level map, prep tomorrow.',
}

export const SETUP_TYPES = ['ORB','Trend Continuation','VWAP Bounce','VWAP Band Touch','Pivot Level','Fibonacci','Supply/Demand Zone','Reversal','Bull Flag','Bear Flag','Gap Fill','Other']

export function getETMins() {
  const s = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

export function getSession() {
  const e = getETMins()
  if (e < 570) return 'pre-market'
  if (e >= 960) return 'after-hours'
  if (e >= 690 && e < 870) return 'chop'
  if (e >= 900) return 'power-hour'
  return 'open'
}

export const todayStr = () => new Date().toISOString().slice(0, 10)
export const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
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
