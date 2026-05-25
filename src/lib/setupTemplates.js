// ─────────────────────────────────────────────────────────────────────────────
// setupTemplates.js — professional setup templates the user can clone instead
// of building from scratch.
//
// Each template carries enough metadata for the library UI (category, source,
// description, when it works, when it doesn't, notes) plus the default
// universe / conditions / operator / tradePlan that get pre-filled into the
// SetupBuilder.
//
// Condition coverage: a few classic setups depend on signals Trade Hub
// doesn't yet evaluate (ATR compression, "after consolidation", multi-leg
// option structures, intraday-level pattern detection, true 15-min ORB). The
// templates approximate those with the closest existing conditions. The
// `notes` field calls out anywhere a template needs the user to refine or
// wait for a future condition.
// ─────────────────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS = {
  long_swing: 'Long swing',
  short_swing: 'Short swing',
  long_momentum: 'Long momentum',
  short_momentum: 'Short momentum',
  income: 'Income',
  intraday: 'Intraday',
}

export const CATEGORY_ORDER = ['long_swing', 'short_swing', 'income', 'intraday']

export const SETUP_TEMPLATES = [
  // ── LONG SWING ──────────────────────────────────────────────────────────
  {
    id: 'ema_9_21_bounce_uptrend',
    name: 'EMA 9/21 bounce in uptrend',
    category: 'long_swing',
    source: 'Stockbee / classic momentum-trend playbook',
    description: 'Buy quality uptrending names on the first pullback to the 9/21 EMA cluster while the broader trend remains intact.',
    whenItWorks: 'Established uptrends with healthy pullbacks. Quality liquid names.',
    whenItDoesnt: 'Broken trends, names rolling over, late-cycle exhaustion. Skip when 200 EMA is rolling down.',
    direction: 'long',
    defaultUniverse: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'COST', 'JPM', 'V', 'MA'],
    defaultConditions: [
      { type: 'emas_stacked_bullish', params: {} },
      { type: 'rsi_below', params: { period: 14, value: 45 } },
      { type: 'price_above_ema', params: { period: 50 } },
      { type: 'volume_above_avg', params: { multiple: 1.0 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.02, dte: 30, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 14,
    },
    notes: 'Confirmation matters. Wait for a green candle off the EMA, do not pre-empt the bounce.',
  },
  {
    id: 'ema_50_bounce_uptrend',
    name: '50 EMA bounce in uptrend',
    category: 'long_swing',
    source: 'Deeper pullback variant of the 9/21 bounce',
    description: 'Same idea as the 9/21 bounce but for deeper retracements. Names still above the 200 EMA pulling back to the 50.',
    whenItWorks: 'Healthy uptrends that retest the rising 50 EMA.',
    whenItDoesnt: 'When the 50 EMA itself starts rolling over. Confirm the slope is up.',
    direction: 'long',
    defaultUniverse: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'COST'],
    defaultConditions: [
      { type: 'price_above_ema', params: { period: 200 } },
      { type: 'price_above_ema', params: { period: 50 } },
      { type: 'rsi_below', params: { period: 14, value: 45 } },
      { type: 'volume_above_avg', params: { multiple: 1.2 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.02, dte: 35, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 14,
    },
    notes: 'Approximates "within 3% of 50 EMA" using price_above_ema 50 + low RSI. A true distance-to-EMA condition is on the future-conditions list.',
  },
  {
    id: 'minervini_vcp',
    name: 'Volatility contraction pattern (Minervini)',
    category: 'long_swing',
    source: 'Mark Minervini, Trade Like a Stock Market Wizard',
    description: 'Healthy uptrend, narrowing price range and shrinking volume across pullbacks, then a clean breakout above the consolidation high on expanded volume.',
    whenItWorks: 'Quality growth names in clear uptrends with multi-week base building.',
    whenItDoesnt: 'During earnings runs without consolidation, choppy markets, fake breakouts.',
    direction: 'long',
    defaultUniverse: ['NVDA', 'AVGO', 'CRWD', 'AAPL', 'MSFT', 'AMZN'],
    defaultConditions: [
      { type: 'price_above_ema', params: { period: 50 } },
      { type: 'price_above_ema', params: { period: 200 } },
      { type: 'rsi_above', params: { period: 14, value: 50 } },
      { type: 'rsi_below', params: { period: 14, value: 65 } },
      { type: 'breakout_high', params: { days: 20 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.03, dte: 45, sizingValue: 0.015,
      targetExitPct: 120, stopExitPct: 50, stopExitPrice: null, timeExitDte: 14,
    },
    notes: 'A true ATR-compression condition would let this fire only after the base. Approximates with RSI 50-65 + 20-day breakout. Revisit when atr_compressed lands.',
  },
  {
    id: 'episodic_pivot_long',
    name: 'Episodic Pivot (Stockbee)',
    category: 'long_swing',
    source: 'Stockbee / Pradeep Bonde',
    description: 'Gap up 4%+ on heavy volume in a name with a positive fundamental catalyst. Buy the open or the first pullback that holds.',
    whenItWorks: 'Earnings beats, contract wins, unexpected good news. Confirms with sustained volume.',
    whenItDoesnt: 'On low-quality gaps that fade. Skip when broader market is broken.',
    direction: 'long',
    defaultUniverse: ['NVDA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'AVGO', 'CRM', 'TSLA', 'NFLX'],
    defaultConditions: [
      { type: 'gap_up', params: { pct: 4 } },
      { type: 'volume_above_avg', params: { multiple: 3.0 } },
      { type: 'price_above_ema', params: { period: 50 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.02, dte: 21, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 7,
    },
    notes: 'Confirm the catalyst is real (earnings, news). Avoid sympathy moves. Best entries on first hold of the gap area.',
  },
  {
    id: 'bull_flag_breakout',
    name: 'Bull flag breakout',
    category: 'long_swing',
    source: 'Classic technical pattern',
    description: 'Sharp rally, tight consolidation (the flag), then breakout on volume.',
    whenItWorks: 'Strong trending markets, post-news consolidations, momentum names.',
    whenItDoesnt: 'When the broader market is choppy. Flags need clean rallies to work.',
    direction: 'long',
    defaultUniverse: ['NVDA', 'AVGO', 'AMD', 'PLTR', 'CRWD', 'NET', 'DDOG'],
    defaultConditions: [
      { type: 'price_above_ema', params: { period: 21 } },
      { type: 'breakout_high', params: { days: 5 } },
      { type: 'volume_above_avg', params: { multiple: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.02, dte: 21, sizingValue: 0.015,
      targetExitPct: 75, stopExitPct: 50, stopExitPrice: null, timeExitDte: 7,
    },
    notes: 'Approximates "after consolidation" with a 5-day breakout. Best results when you visually confirm the flag shape before activating.',
  },

  // ── SHORT SWING ─────────────────────────────────────────────────────────
  {
    id: 'parabolic_exhaustion_short',
    name: 'Parabolic Exhaustion Short',
    category: 'short_swing',
    source: 'Classic mean-reversion, documented across multiple traders',
    description: 'Short overextended momentum stocks after parabolic moves break key support on volume.',
    whenItWorks: 'Late-cycle momentum stocks, exhausted up-trends, sentiment euphoria.',
    whenItDoesnt: 'Trends with strong fundamental drivers continuing, low-IV environments, before clear reversal confirmation.',
    direction: 'short',
    defaultUniverse: ['NVDA', 'AVGO', 'CRWD', 'PLTR', 'MSTR', 'COIN', 'AMD', 'TSLA', 'META', 'NFLX'],
    defaultConditions: [
      { type: 'rsi_above', params: { period: 14, value: 75 } },
      { type: 'price_above_ema', params: { period: 200 } },
      { type: 'breakdown_low', params: { days: 5 } },
      { type: 'volume_above_avg', params: { multiple: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.05, dte: 28, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 7,
    },
    notes: 'Wait for the break of a recent low on volume. The parabolic itself is not the trigger.',
  },
  {
    id: 'failed_breakout_fade',
    name: 'Failed breakout fade',
    category: 'short_swing',
    source: 'Classic trap pattern',
    description: 'Recent breakout fails. Price loses VWAP on heavier volume. Fade the trapped buyers.',
    whenItWorks: 'After hot tape, into resistance, on news that fades.',
    whenItDoesnt: 'In strong-trend bull regimes. Use sparingly during pullback environments.',
    direction: 'short',
    defaultUniverse: ['SPY', 'QQQ', 'IWM', 'NVDA', 'TSLA'],
    defaultConditions: [
      { type: 'failed_breakout', params: { days: 5 } },
      { type: 'price_below_vwap', params: {} },
      { type: 'volume_above_avg', params: { multiple: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.05, dte: 21, sizingValue: 0.01,
      targetExitPct: 75, stopExitPct: 60, stopExitPrice: null, timeExitDte: 7,
    },
    notes: 'Take profits quickly. Failed-breakout fades work fast or not at all.',
  },
  {
    id: 'multiple_compression_short',
    name: 'Multiple compression short',
    category: 'short_swing',
    source: 'Long-cycle bear thesis on overvalued growth',
    description: 'High P/S growth name already 15% off the highs, with the breakdown line broken on elevated volume.',
    whenItWorks: 'Late-cycle, after growth deceleration becomes visible, on broad-market wobble.',
    whenItDoesnt: 'When fundamentals reaccelerate. Stop out fast on guidance-raise.',
    direction: 'short',
    defaultUniverse: ['NET', 'CRWD', 'DDOG', 'NOW', 'SNOW', 'PLTR'],
    defaultConditions: [
      { type: 'ps_ratio_above', params: { value: 20 } },
      { type: 'down_from_high_pct', params: { pct: 15 } },
      { type: 'price_close_below', params: { value: 0 } },   // user must set the breakdown line
      { type: 'volume_above_avg', params: { multiple: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.07, dte: 35, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 14,
    },
    notes: 'Edit price_close_below to set your breakdown trigger. ps_ratio_above reads "not ready" until fundamentals are wired into the snapshot.',
  },
  {
    id: 'distribution_breakdown_short',
    name: 'Distribution breakdown short',
    category: 'short_swing',
    source: 'Classic distribution pattern',
    description: 'Stocks already in bearish EMA stack break to a fresh 20-day low on volume. Sustained distribution.',
    whenItWorks: 'Mid-to-late bear leg. Sector rotation away from a name.',
    whenItDoesnt: 'On capitulation lows. Avoid chasing the obvious breakdown into a bottom.',
    direction: 'short',
    defaultUniverse: ['NET', 'CRWD', 'DDOG', 'SNOW', 'PLTR', 'TSLA'],
    defaultConditions: [
      { type: 'emas_stacked_bearish', params: {} },
      { type: 'breakdown_low', params: { days: 20 } },
      { type: 'volume_above_avg', params: { multiple: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.05, dte: 30, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 10,
    },
    notes: 'Best entries on the second test of the breakdown level, not the first.',
  },
  {
    id: 'lower_high_reversal_short',
    name: 'Lower high reversal after broken uptrend',
    category: 'short_swing',
    source: 'Trend-reversal pattern',
    description: 'Recently broken uptrend produces a lower high; short the failure of that lower high.',
    whenItWorks: 'When a name loses its rising 50 EMA and rallies back to it without reclaiming.',
    whenItDoesnt: 'V-shaped recoveries that reclaim the EMA on volume.',
    direction: 'short',
    defaultUniverse: ['NFLX', 'TSLA', 'META', 'NVDA', 'PLTR'],
    defaultConditions: [
      { type: 'ema_cross_down', params: { fast: 9, slow: 21 } },
      { type: 'price_below_ema', params: { period: 50 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.05, dte: 28, sizingValue: 0.015,
      targetExitPct: 100, stopExitPct: 50, stopExitPrice: null, timeExitDte: 10,
    },
    notes: 'No true "lower high" detector yet. Visually confirm the lower-high structure before activating.',
  },

  // ── INCOME (puts / wheel-style) ─────────────────────────────────────────
  {
    id: 'csp_wheel_on_quality',
    name: 'Cash-secured put on quality',
    category: 'income',
    source: 'Wheel strategy classic',
    description: 'Sell an OTM put on a quality name in an uptrend after a mild RSI pullback. Collect premium or take assignment at a discount.',
    whenItWorks: 'Stable uptrends with reasonable IV. Names you would own anyway.',
    whenItDoesnt: 'During fast vol expansion. Don\'t fight a downtrend with naked puts.',
    direction: 'long',
    defaultUniverse: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JPM', 'COST'],
    defaultConditions: [
      { type: 'price_above_ema', params: { period: 200 } },
      { type: 'rsi_below', params: { period: 14, value: 40 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.07, dte: 35, sizingValue: 0.02,
      targetExitPct: 50, stopExitPct: 100, stopExitPrice: null, timeExitDte: 14,
    },
    notes: 'Direction is "long" because selling puts is a long-delta trade. Requires put-writing approval at your broker.',
  },
  {
    id: 'iron_condor_low_iv',
    name: 'Iron condor in low IV',
    category: 'income',
    source: 'Neutral-income strategy (planned, multi-leg)',
    description: 'Sell an iron condor when IV is depressed and price is range-bound near the 50 EMA.',
    whenItWorks: 'Range-bound regimes, post-earnings IV crush. Best when IV percentile is low.',
    whenItDoesnt: 'Before earnings, during regime changes, after big news.',
    direction: 'either',
    defaultUniverse: ['SPY', 'QQQ', 'IWM'],
    defaultConditions: [
      { type: 'price_above_ema', params: { period: 50 } },
      { type: 'rsi_above', params: { period: 14, value: 40 } },
      { type: 'rsi_below', params: { period: 14, value: 60 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: -0.05, dte: 30, sizingValue: 0.01,
      targetExitPct: 50, stopExitPct: 100, stopExitPrice: null, timeExitDte: 7,
    },
    notes: 'Multi-leg structures are not yet supported in the trade plan. Treat this template as a watch-only frame until iron-condor staging lands.',
  },

  // ── INTRADAY ────────────────────────────────────────────────────────────
  {
    id: 'orb_long',
    name: 'Opening range breakout long',
    category: 'intraday',
    source: 'Classic intraday momentum',
    description: 'Gap up on volume, break above the opening range, ride the day.',
    whenItWorks: 'Strong-tape days, post-news gaps, sector momentum.',
    whenItDoesnt: 'Choppy ranges, fade-the-open conditions.',
    direction: 'long',
    defaultUniverse: ['QQQ', 'SPY', 'TQQQ', 'NVDA', 'TSLA'],
    defaultConditions: [
      { type: 'gap_up', params: { pct: 1 } },
      { type: 'rvol_above', params: { value: 2.0 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.0, dte: 7, sizingValue: 0.01,
      targetExitPct: 50, stopExitPct: 50, stopExitPrice: null, timeExitDte: 1,
    },
    notes: 'No true 15-min ORB-high condition yet. Use gap_up + rvol_above as the proxy and visually confirm the break before taking it.',
  },
  {
    id: 'vwap_reclaim_long',
    name: 'VWAP reclaim long',
    category: 'intraday',
    source: 'Mean-reversion intraday',
    description: 'Price drops below VWAP early, then reclaims on volume. Long the reclaim.',
    whenItWorks: 'Strong-trend days where pullbacks are bought.',
    whenItDoesnt: 'On distribution days where each VWAP test gets sold.',
    direction: 'long',
    defaultUniverse: ['QQQ', 'SPY', 'TQQQ', 'NVDA', 'AMD'],
    defaultConditions: [
      { type: 'price_above_vwap', params: {} },
      { type: 'rvol_above', params: { value: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'call',
      strikeOffset: 0.0, dte: 7, sizingValue: 0.01,
      targetExitPct: 50, stopExitPct: 50, stopExitPrice: null, timeExitDte: 1,
    },
    notes: 'No cross-detection yet. Conditions only see current state, not the reclaim event. Visually confirm the cross before activating.',
  },
  {
    id: 'pdh_fade_short',
    name: 'Prev day high fade short',
    category: 'intraday',
    source: 'Classic mean-reversion intraday',
    description: 'Price tags the prior day high on heavy volume but stalls. Fade the rejection.',
    whenItWorks: 'Range-bound days, post-news fades, after a big up day.',
    whenItDoesnt: 'In sustained trends where every tag breaks through.',
    direction: 'short',
    defaultUniverse: ['QQQ', 'SPY', 'NVDA', 'TSLA'],
    defaultConditions: [
      { type: 'price_at_prev_day_high', params: { pct: 0.25 } },
      { type: 'rvol_above', params: { value: 1.5 } },
    ],
    defaultOperator: 'all',
    defaultTradePlan: {
      instrumentType: 'option', optionType: 'put',
      strikeOffset: 0.0, dte: 7, sizingValue: 0.01,
      targetExitPct: 50, stopExitPct: 50, stopExitPrice: null, timeExitDte: 1,
    },
    notes: 'No bearish-reversal-candle detector yet. Visually confirm the rejection before activating.',
  },
]

// Lookup by id.
export const TEMPLATE_BY_ID = Object.fromEntries(SETUP_TEMPLATES.map(t => [t.id, t]))

// Grouped by category for the picker UI.
export function templatesByCategory() {
  const out = {}
  for (const t of SETUP_TEMPLATES) {
    if (!out[t.category]) out[t.category] = []
    out[t.category].push(t)
  }
  return out
}
