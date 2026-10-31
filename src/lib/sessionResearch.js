export const RESEARCH_SESSION = '2026-10-30'
export const RESEARCH_PREP_DATE = '2026-10-29'
export const RESEARCH_SOURCE = 'Massive adjusted daily bars and 5-minute after-hours bars'
export const RESEARCH_AS_OF = '2026-10-30T00:00:00Z'

// These are dated research references, never executable signals or live quotes.
export const SESSION_RESEARCH = [
  {
    ticker: 'QQQ', priority: 1, thesis: 'Tech weakness: failed bounce or failed breakdown reversal.',
    close: 715.34, afterHours: 704.30,
    levels: [
      { price: 700, label: 'Sep 16 low and round number', kind: 'daily' },
      { price: 701.16, label: 'Oct 23 low', kind: 'daily' },
      { price: 701.90, label: 'Oct 22 low', kind: 'daily' },
      { price: 702.50, label: 'Oct 29 after-hours low', kind: 'extended' },
      { price: 705.58, label: 'Oct 26 low', kind: 'daily' },
      { price: 707.23, label: 'Oct 16 low', kind: 'daily' },
      { price: 709.30, label: 'Oct 23 high', kind: 'daily' },
      { price: 711.62, label: 'Oct 29 regular-session low', kind: 'daily' },
      { price: 715.34, label: 'Oct 29 regular-session close', kind: 'daily' },
    ],
    bearish: 'Below VWAP, a bounce rejects 705.58 or 707.23, then breaks its pullback low. Targets: 702.50, 701.90, 701.16, 700.00, only when below entry.',
    bullish: 'Sweep and reclaim 702.50 or the 701.16-701.90 zone, form a higher low, then reclaim regular-session VWAP. Targets: 705.58, 707.23, 709.30.',
    invalidation: 'Short: above the rejection swing high. Long: below the reclaim swing low. A sustained reclaim of the short trigger cancels that rejection thesis.',
  },
  {
    ticker: 'AMZN', priority: 2, thesis: 'Direct earnings catalyst; large gap requires a fresh opening range.',
    close: 243.79, afterHours: 225.99,
    levels: [
      { price: 214.01, label: 'Oct 29 earnings after-hours extreme', kind: 'extended' },
      { price: 219.62, label: 'Apr 8 low, older reference', kind: 'daily' },
      { price: 223.27, label: 'Apr 9 low, older reference', kind: 'daily' },
      { price: 225.30, label: 'Oct 29 late after-hours low', kind: 'extended' },
      { price: 225.55, label: 'Jun 25 low', kind: 'daily' },
      { price: 226.16, label: 'Jul 29 low', kind: 'daily' },
      { price: 227.59, label: 'Oct 29 late after-hours bounce high', kind: 'extended' },
      { price: 228.10, label: 'Jul 28 low', kind: 'daily' },
      { price: 232.82, label: 'Jul 29 high', kind: 'daily' },
      { price: 241.24, label: 'Oct 29 regular-session low', kind: 'daily' },
    ],
    bearish: 'Reject 227.59-228.10 below VWAP, or break 225.30 and fail the retest. Targets: 225.55/225.30, 223.27, 219.62, only when below entry.',
    bullish: 'Hold 225.30-226.16, reclaim VWAP and 228.10, then hold the retest. Target: 232.82. The 241.24 gap reference is distant, not an assumed fill.',
    invalidation: 'Use the actual rejection high or reclaim low. The 214.01 earnings wick is an extreme reference, not a forecast or a default stop.',
  },
  {
    ticker: 'IWM', priority: 3, thesis: 'Relative-strength long candidate if tech stabilizes.',
    close: 284.01, afterHours: 283.83,
    levels: [
      { price: 279.05, label: 'Oct 28 low', kind: 'daily' },
      { price: 280.40, label: 'Oct 27 high', kind: 'daily' },
      { price: 281.29, label: 'Oct 28 close', kind: 'daily' },
      { price: 281.48, label: 'Oct 28 high', kind: 'daily' },
      { price: 282.15, label: 'Oct 29 low', kind: 'daily' },
      { price: 283.47, label: 'Oct 29 after-hours low', kind: 'extended' },
      { price: 285.26, label: 'Oct 29 high', kind: 'daily' },
      { price: 286.45, label: 'Sep 21 high', kind: 'daily' },
      { price: 286.93, label: 'Sep 15 high', kind: 'daily' },
      { price: 287.04, label: 'Sep 16 high', kind: 'daily' },
    ],
    bullish: 'Hold VWAP, break 285.26 and hold a retest with relative strength. Targets: 286.45, 286.93-287.04. Alternate: reclaim 282.15 after a sweep, targeting 283.47 then 285.26.',
    bearish: 'Lose 282.15 and fail the retest below VWAP. Targets: 281.48-281.29, 280.40, 279.05. Above 282.15, the bearish breakdown is not confirmed.',
    invalidation: 'Below the held retest low for longs; above the failed retest high for shorts. Skip a wide stop when the first target is too close.',
  },
  {
    ticker: 'PLTR', priority: 4, thesis: 'Conditional tech setup; earnings Nov 2 after close.',
    close: 196.42, afterHours: 193.8344,
    levels: [
      { price: 184.45, label: 'Oct 16 low', kind: 'daily' },
      { price: 186.155, label: 'Oct 19 low', kind: 'daily' },
      { price: 189.42, label: 'Oct 20 low', kind: 'daily' },
      { price: 190.36, label: 'Oct 29 low', kind: 'daily' },
      { price: 190.5702, label: 'Oct 23 low', kind: 'daily' },
      { price: 193.1306, label: 'Oct 28 low', kind: 'daily' },
      { price: 193.3434, label: 'Oct 29 after-hours low', kind: 'extended' },
      { price: 194.535, label: 'Oct 22 low', kind: 'daily' },
      { price: 196.42, label: 'Oct 29 close', kind: 'daily' },
      { price: 198.51, label: 'Oct 29 high', kind: 'daily' },
      { price: 198.74, label: 'Oct 28 high', kind: 'daily' },
    ],
    bearish: 'Break 193.13-193.34 and fail the retest below VWAP. Targets: 190.57-190.36, 189.42, 186.16. Alternate: reject 194.54 with enough room to first support.',
    bullish: 'Defend or reclaim 193.13-193.34, reclaim 194.54 and VWAP, then hold a higher low. Targets: 196.42, 198.51-198.74.',
    invalidation: 'Stop beyond the actual retest swing. Expiries after Nov 2 close carry earnings exposure; check the selected contract spread and size.',
  },
  {
    ticker: 'NVDA', priority: 5, thesis: 'Semiconductor alternative; confirm weakness beyond Intel.',
    close: 213.66, afterHours: 210.1468,
    levels: [
      { price: 208.29, label: 'Oct 29 after-hours low', kind: 'extended' },
      { price: 208.93, label: 'Sep 14 low', kind: 'daily' },
      { price: 210.18, label: 'Oct 23 low', kind: 'daily' },
      { price: 211.26, label: 'Oct 22 low', kind: 'daily' },
      { price: 212.08, label: 'Oct 29 low', kind: 'daily' },
      { price: 213.66, label: 'Oct 29 close', kind: 'daily' },
      { price: 215.33, label: 'Oct 29 high', kind: 'daily' },
    ],
    bearish: 'Reject 210.18-211.26 below VWAP, then break the pullback low. Targets: 208.93, 208.29, only if below entry. Below 208.29, remap older support before assigning another target.',
    bullish: 'Sweep and reclaim 208.29, then regain 210.18 and VWAP. Targets: 211.26, 212.08, 213.66.',
    invalidation: 'Above the failed-bounce high for shorts; below the reclaim low for longs. Do not treat correlation with Intel as confirmation.',
  },
]

export function researchStatus(marketDate) {
  return marketDate > RESEARCH_SESSION ? 'ARCHIVED' : marketDate < RESEARCH_SESSION ? 'EVENING PREP' : 'SESSION PLAN'
}

export function getResearchLevels(ticker, marketDate) {
  if (marketDate < RESEARCH_PREP_DATE || marketDate > RESEARCH_SESSION) return []
  return SESSION_RESEARCH.find(item => item.ticker === ticker)?.levels ?? []
}
