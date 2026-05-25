// ─────────────────────────────────────────────────────────────────────────────
// conditionLibrary.js — catalog of trigger conditions the Setup engine can
// evaluate. Pure data. The actual evaluation logic per id lives in
// conditionEvaluators.js. The Setup builder UI walks this catalog to render
// the condition picker and param inputs.
//
// Keep this file in sync with conditionEvaluators.js: every id listed here
// must have a matching evaluator. Adding a new condition is a two-file change.
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'TREND', label: 'Trend' },
  { id: 'PRICE', label: 'Price' },
  { id: 'MOMENTUM', label: 'Momentum' },
  { id: 'VOLUME', label: 'Volume' },
  { id: 'PATTERN', label: 'Pattern' },
  { id: 'FUNDAMENTALS', label: 'Fundamentals' },
]

// Each entry: { id, label, category, description, params: [...] }
// Param types: 'number', 'select', 'string'.
// Select params include `options: [{value, label}]`.
export const CONDITIONS = [
  // ── TREND ──────────────────────────────────────────────────────────────
  {
    id: 'emas_stacked_bullish',
    label: 'EMAs stacked bullish (9>21>50>200)',
    category: 'TREND',
    description: 'Daily EMAs in trending-up order with no overlap.',
    params: [],
  },
  {
    id: 'emas_stacked_bearish',
    label: 'EMAs stacked bearish (9<21<50<200)',
    category: 'TREND',
    description: 'Daily EMAs in trending-down order with no overlap.',
    params: [],
  },
  {
    id: 'ema_cross_up',
    label: 'EMA cross up',
    category: 'TREND',
    description: 'Fast EMA crossed above slow EMA on the most recent daily bar.',
    params: [
      { name: 'fast', type: 'number', label: 'Fast period', default: 9 },
      { name: 'slow', type: 'number', label: 'Slow period', default: 21 },
    ],
  },
  {
    id: 'ema_cross_down',
    label: 'EMA cross down',
    category: 'TREND',
    description: 'Fast EMA crossed below slow EMA on the most recent daily bar.',
    params: [
      { name: 'fast', type: 'number', label: 'Fast period', default: 9 },
      { name: 'slow', type: 'number', label: 'Slow period', default: 21 },
    ],
  },
  {
    id: 'price_above_ema',
    label: 'Price above EMA',
    category: 'TREND',
    description: 'Current price is above the specified EMA period.',
    params: [
      { name: 'period', type: 'select', label: 'EMA period', default: 21, options: [9, 21, 50, 200].map(n => ({ value: n, label: String(n) })) },
    ],
  },
  {
    id: 'price_below_ema',
    label: 'Price below EMA',
    category: 'TREND',
    description: 'Current price is below the specified EMA period.',
    params: [
      { name: 'period', type: 'select', label: 'EMA period', default: 21, options: [9, 21, 50, 200].map(n => ({ value: n, label: String(n) })) },
    ],
  },

  // ── PRICE ──────────────────────────────────────────────────────────────
  {
    id: 'price_above',
    label: 'Price above',
    category: 'PRICE',
    description: 'Last price strictly above the value.',
    params: [{ name: 'value', type: 'number', label: 'Price', default: 100 }],
  },
  {
    id: 'price_below',
    label: 'Price below',
    category: 'PRICE',
    description: 'Last price strictly below the value.',
    params: [{ name: 'value', type: 'number', label: 'Price', default: 100 }],
  },
  {
    id: 'price_within_pct_of',
    label: 'Price within % of value',
    category: 'PRICE',
    description: 'Last price within the given percent of a reference value.',
    params: [
      { name: 'value', type: 'number', label: 'Reference price', default: 100 },
      { name: 'pct', type: 'number', label: 'Tolerance %', default: 1 },
    ],
  },
  {
    id: 'price_above_vwap',
    label: 'Price above VWAP',
    category: 'PRICE',
    description: 'Last price above today\'s VWAP.',
    params: [],
  },
  {
    id: 'price_below_vwap',
    label: 'Price below VWAP',
    category: 'PRICE',
    description: 'Last price below today\'s VWAP.',
    params: [],
  },
  {
    id: 'price_at_pivot',
    label: 'Price at pivot',
    category: 'PRICE',
    description: 'Last price within the tolerance of a pivot level.',
    params: [
      { name: 'pivot', type: 'select', label: 'Pivot', default: 'pp', options: ['pp', 'r1', 'r2', 'r3', 's1', 's2', 's3'].map(v => ({ value: v, label: v.toUpperCase() })) },
      { name: 'pct', type: 'number', label: 'Tolerance %', default: 0.5 },
    ],
  },
  {
    id: 'price_broke_pivot',
    label: 'Price broke pivot',
    category: 'PRICE',
    description: 'Last bar closed on the breakout side of a pivot level.',
    params: [
      { name: 'pivot', type: 'select', label: 'Pivot', default: 'pp', options: ['pp', 'r1', 'r2', 'r3', 's1', 's2', 's3'].map(v => ({ value: v, label: v.toUpperCase() })) },
      { name: 'direction', type: 'select', label: 'Break direction', default: 'above', options: [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }] },
    ],
  },
  {
    id: 'price_at_prev_day_high',
    label: 'Price at prev day high',
    category: 'PRICE',
    description: 'Within tolerance of yesterday\'s high.',
    params: [{ name: 'pct', type: 'number', label: 'Tolerance %', default: 0.25 }],
  },
  {
    id: 'price_at_prev_day_low',
    label: 'Price at prev day low',
    category: 'PRICE',
    description: 'Within tolerance of yesterday\'s low.',
    params: [{ name: 'pct', type: 'number', label: 'Tolerance %', default: 0.25 }],
  },
  {
    id: 'price_above_prev_day_high',
    label: 'Price above prev day high',
    category: 'PRICE',
    description: 'Last price strictly above yesterday\'s high.',
    params: [],
  },
  {
    id: 'price_below_prev_day_low',
    label: 'Price below prev day low',
    category: 'PRICE',
    description: 'Last price strictly below yesterday\'s low.',
    params: [],
  },

  // ── MOMENTUM ───────────────────────────────────────────────────────────
  {
    id: 'rsi_above',
    label: 'RSI above',
    category: 'MOMENTUM',
    description: 'Daily RSI of given period above value.',
    params: [
      { name: 'period', type: 'number', label: 'Period', default: 14 },
      { name: 'value', type: 'number', label: 'Threshold', default: 70 },
    ],
  },
  {
    id: 'rsi_below',
    label: 'RSI below',
    category: 'MOMENTUM',
    description: 'Daily RSI of given period below value.',
    params: [
      { name: 'period', type: 'number', label: 'Period', default: 14 },
      { name: 'value', type: 'number', label: 'Threshold', default: 35 },
    ],
  },
  {
    id: 'rsi_oversold',
    label: 'RSI oversold (<30)',
    category: 'MOMENTUM',
    description: 'Daily RSI(14) below 30.',
    params: [],
  },
  {
    id: 'rsi_overbought',
    label: 'RSI overbought (>70)',
    category: 'MOMENTUM',
    description: 'Daily RSI(14) above 70.',
    params: [],
  },
  {
    id: 'macd_bullish_cross',
    label: 'MACD bullish cross',
    category: 'MOMENTUM',
    description: 'Daily MACD line crossed above signal line on the most recent bar (12-26-9).',
    params: [],
  },
  {
    id: 'macd_bearish_cross',
    label: 'MACD bearish cross',
    category: 'MOMENTUM',
    description: 'Daily MACD line crossed below signal line on the most recent bar (12-26-9).',
    params: [],
  },

  // ── VOLUME ─────────────────────────────────────────────────────────────
  {
    id: 'volume_above_avg',
    label: 'Volume above N x average',
    category: 'VOLUME',
    description: 'Relative volume multiple (intraday RVOL).',
    params: [{ name: 'multiple', type: 'number', label: 'Multiple', default: 1.5 }],
  },
  {
    id: 'rvol_above',
    label: 'RVOL above',
    category: 'VOLUME',
    description: 'Intraday RVOL above the given value.',
    params: [{ name: 'value', type: 'number', label: 'Value', default: 1.5 }],
  },

  // ── PATTERN ────────────────────────────────────────────────────────────
  {
    id: 'gap_up',
    label: 'Gap up',
    category: 'PATTERN',
    description: 'Today\'s open at least N percent above yesterday\'s close.',
    params: [{ name: 'pct', type: 'number', label: 'Gap %', default: 1 }],
  },
  {
    id: 'gap_down',
    label: 'Gap down',
    category: 'PATTERN',
    description: 'Today\'s open at least N percent below yesterday\'s close.',
    params: [{ name: 'pct', type: 'number', label: 'Gap %', default: 1 }],
  },
  {
    id: 'breakout_high',
    label: 'Breakout above N-day high',
    category: 'PATTERN',
    description: 'Last close above the highest close of the prior N days.',
    params: [{ name: 'days', type: 'number', label: 'Lookback days', default: 20 }],
  },
  {
    id: 'breakdown_low',
    label: 'Breakdown below N-day low',
    category: 'PATTERN',
    description: 'Last close below the lowest close of the prior N days.',
    params: [{ name: 'days', type: 'number', label: 'Lookback days', default: 20 }],
  },
  {
    id: 'failed_breakout',
    label: 'Failed breakout',
    category: 'PATTERN',
    description: 'In the last N days price exceeded the N-day high but is now back below it.',
    params: [{ name: 'days', type: 'number', label: 'Lookback days', default: 20 }],
  },

  // ── FUNDAMENTALS ───────────────────────────────────────────────────────
  {
    id: 'ps_ratio_above',
    label: 'P/S ratio above',
    category: 'FUNDAMENTALS',
    description: 'Trailing P/S above the value. Data quality varies by ticker.',
    params: [{ name: 'value', type: 'number', label: 'Threshold', default: 20 }],
  },
  {
    id: 'pe_ratio_above',
    label: 'P/E ratio above',
    category: 'FUNDAMENTALS',
    description: 'Trailing P/E above the value.',
    params: [{ name: 'value', type: 'number', label: 'Threshold', default: 40 }],
  },
  {
    id: 'pe_negative',
    label: 'P/E negative (no earnings)',
    category: 'FUNDAMENTALS',
    description: 'Trailing P/E is negative (company is unprofitable).',
    params: [],
  },
  {
    id: 'down_from_high_pct',
    label: 'Down from 52W high by %',
    category: 'FUNDAMENTALS',
    description: 'Price drawdown from 52-week high is at least N percent.',
    params: [{ name: 'pct', type: 'number', label: 'Drawdown %', default: 15 }],
  },
  {
    id: 'scanner_score_above',
    label: 'Short scanner score above',
    category: 'FUNDAMENTALS',
    description: 'Short Thesis scanner score above value. Requires a recent scanner run for the ticker.',
    params: [{ name: 'value', type: 'number', label: 'Threshold', default: 40 }],
  },
]

// Indexed lookup. Used by evaluators + UI to validate condition ids.
export const CONDITIONS_BY_ID = Object.fromEntries(CONDITIONS.map(c => [c.id, c]))

// Used by the SetupBuilder picker.
export function conditionsByCategory() {
  const out = {}
  for (const c of CONDITIONS) {
    if (!out[c.category]) out[c.category] = []
    out[c.category].push(c)
  }
  return out
}

// Initial params for a freshly-added condition. Pulls defaults from the catalog.
export function defaultParamsFor(conditionId) {
  const def = CONDITIONS_BY_ID[conditionId]
  if (!def) return {}
  const out = {}
  for (const p of def.params || []) out[p.name] = p.default
  return out
}
