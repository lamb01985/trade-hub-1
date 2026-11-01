# Final Monday trading readiness and acceptance

Verified 2026-11-01T21:23:14.856Z against the owner's configured Massive account, from baseline `8fb789c` on `fix/tradehub-monday-market-data`.

**Acceptance: GO for local research and Monday session preparation.** Closed-market correctness, independent bar calculations and failure behavior pass. Current-session data freshness must still be confirmed when the feed opens Monday. No trade execution or statistical edge is implied.

## Provider checks

All ten symbols match direct Massive snapshots and reference metadata. QQQ/SPY/IWM are ETFs; the other seven are common-stock equities. Trades and quotes retain separate SIP/source timestamps. Observed daily-change baselines are dated; Friday extended-hours observations remain historical on Sunday.

| Symbol | Last recorded trade | Bid / ask | Trade source time (UTC) | Prior regular close* |
| --- | ---: | --- | --- | ---: |
| QQQ | 692.74 | 692.63 / 692.69 | 2026-10-30T23:59:55.485Z | 715.34 |
| SPY | 755.72 | 757 / 757.18 | 2026-10-31T00:00:00.004Z | 769.36 |
| IWM | 279.33 | 279.28 / 279.98 | 2026-10-31T00:00:00.150Z | 284.01 |
| NVDA | 205.2499 | 205.23 / 205.25 | 2026-10-30T23:59:57.576Z | 213.66 |
| AMD | 508.2186 | 508.4 / 508.7 | 2026-10-30T23:59:53.183Z | 566.42 |
| MU | 889.2 | 889.15 / 889.2 | 2026-10-30T23:59:54.618Z | 934.27 |
| PLTR | 184.5554 | 184.55 / 184.8 | 2026-10-30T23:58:15.380Z | 196.42 |
| TSLA | 400.22 | 400.21 / 400.25 | 2026-10-30T23:59:46.792Z | 403.3 |
| ORCL | 130.9845 | 130.84 / 130.97 | 2026-10-30T23:59:47.376Z | 139.56 |
| CRWV | 55.16 | 55.16 / 55.19 | 2026-10-30T23:59:55.331Z | 60.74 |

*The snapshot observation date is October 30; its prior close is Thursday October 29. In Today structure on Sunday/Monday, the previous completed regular-session bar is instead Friday October 30. The two dates are not silently interchanged. SPY/IWM source timestamps fall just after midnight UTC but remain October 30 in New York. Prints just beyond the standard extended-session boundary are conservatively labeled CLOSED, never current liquidity.

VIX returned `NOT_ENTITLED`. ES/NQ remain `CONTRACT_AND_ENTITLEMENT_UNVERIFIED`, with no price or ETF substitute. Exchange licensing and real-time delay rights are not inferred from HTTP success.

## Completed candles and independent calculations

For each of QQQ, SPY, NVDA and AMD, every returned Friday October 30 minute OHLCV/VWAP field was compared with raw provider bars. All have 390 RTH minutes. Thursday daily H/L/C, Friday daily close, premarket extremes, and after-hours extremes/last bar also match. Independent calculations use explicit October 30 UTC boundaries (RTH 13:30–20:00 UTC), rather than the application session filter. EMA verification uses a separate SMA-seeded recurrence. VWAP is RTH minute VWAP weighted by minute volume, not an asserted tick-level execution benchmark.

| Symbol | Prior H / L / C (Oct 29) | Friday RTH close | Friday premarket H / L |
| --- | --- | ---: | --- |
| QQQ | 718.07 / 711.62 / 715.34 | 690.49 | 703.5 / 696.2 |
| SPY | 770.76 / 766.62 / 769.36 | 755.72 | 763.76 / 760.9 |
| NVDA | 215.33 / 212.08 / 213.66 | 204.64 | 209.5 / 206.5 |
| AMD | 575.1 / 560.57 / 566.42 | 504.8 | 534.61 / 508.01 |

| Symbol | Friday RTH VWAP | EMA9 | EMA20 | EMA50 |
| --- | ---: | ---: | ---: | ---: |
| QQQ | 693.0436 | 690.2777 | 689.6399 | 688.3653 |
| SPY | 756.4968 | 755.3927 | 754.8348 | 753.8913 |
| NVDA | 204.6043 | 204.5490 | 204.0803 | 203.4050 |
| AMD | 505.7583 | 503.8076 | 502.2479 | 499.9738 |

All numbers in these tables are historical. They are not Monday levels or current prices. Friday review uses October 29 prior-day levels. Monday Today uses October 30 prior-day levels and only November 2 intraday bars.

Chart regressions verify 08:30 Central labels for Friday 13:30 UTC (CDT) and Monday 14:30 UTC (CST), with unchanged provider epochs. A later last-trade update does not synthesize a candle. The backend Monday-clock regression requests November 2 bars, rejects a supplied October 30 bar as `INVALID_BAR`, and leaves indicators unavailable. Sunday Today returns an empty series without Friday fallback.

Floor pivots and bullish/bearish boundaries were checked against their documented formulas. Scenarios remain discretionary five-minute-close/retest hypotheses; invalidation crosses back through the boundary. Next references use supplied/calculated levels only. Manual entry 100, stop 99, target 102 yields 2:1 before costs/slippage/gap risk; stop equal to entry yields unavailable, not infinite reward/risk. No inferred option premiums, fills or guaranteed outcomes.

## Reliability correction

The provider helper already parsed `Retry-After`, but the desk response discarded it and the client used a fixed 60-second backoff. The final fix propagates that field, honors longer provider delays, and disables manual refresh until the affected cooldown expires. Invalid/out-of-range retry hints pause automatic refresh with a visible error and manual recovery path. Missing hints retain a conservative 60-second fallback. The manual options loader also now stops immediate rate-limit retries and disables its load button during the provider cooldown. Its normal authenticated snapshot path passed the final browser smoke test at 21:28 UTC.

Fake-clock tests verify no extra watchlist calls before a 120-second retry deadline, one retry at the deadline, and no further requests after unmount. They also verify explicit pause on an invalid hint. Existing tests cover cancellation of late symbol responses and clearing prices on failure. One watchlist loop and one selected-context loop remain; ordinary one-second clock renders do not spawn new polling loops. Refresh was tested in the mounted real browser without a page reload; retrieval time advanced while Friday source timestamps remained unchanged.

## Credential and execution containment

- The configured key remains server-only and `.env.local` is unchanged (before/after hash compared privately).
- No configured-key value was found in captured browser request URLs/headers, response bodies or console output; tracked files; 1,908 reachable Git objects; or the generated `dist/` files.
- Direct `.env.local`, Vite `@fs` access to it, and ignored evidence paths returned 403. The nonexistent worktree `/.git/config` path returned the SPA HTML fallback, not Git contents or credentials.
- Server error paths redact provider echoes and return sanitized failures. Existing server stdout/stderr point to the owner terminal, so no claim is made to have audited historical terminal scrollback.
- Anonymous desk requests are denied. Broker quote/order, AI, email and Telegram routes remain blocked by the local launcher. No broker execution, automation, deployment, purchase or external service activation occurred.

## Verification commands and artifacts

```bash
cd /Users/sarahlambertson/Desktop/tradehub-monday-readiness
npm test -- --reporter=dot
npm run build
node scripts/verify-monday-acceptance.mjs
```

All **283 tests across 44 files** and the production build pass. `git diff --check` passes. Existing Vite deprecation/bundle-size warnings remain. The new acceptance script is a **closed-market October 30/Sunday check**, not a universal live-session monitor: its exact snapshot comparisons and Sunday-empty assertions should not be reused unmodified during an advancing Monday feed.

Ignored local artifacts: `.local/monday-acceptance.json`, `.local/monday-provider-checks.json`, and `.local/acceptance-{QQQ,SPY,NVDA,AMD}-friday.png`. They are not runtime fixtures, public assets or Git/deployment inputs.

## Monday morning checklist

1. In the desk terminal, start a fresh local run before the regular-session open (stop that desk with Control-C if necessary, then run the commands below). This reloads the existing key without editing it and resets process-local sessions. Do not stop unrelated worktree servers.
2. Open the exact desk URL. Local operator sessions last eight hours; if an older tab reaches the operator-expired screen, reopen the root desk URL to obtain a new local-only session. No broker login or provider password entry is needed.
3. Select **Today**. Date must be November 2, previous-day references October 30. **Last completed session** is explicitly historical review.
4. Premarket starts 03:00 CST (04:00 EST); regular trading starts 08:30 CST (09:30 EST), closes 15:00 CST (16:00 EST). Verify November 2 source timestamps advance, quote freshness is appropriate, and minute bars arrive. EMA50 is unavailable until sufficient supplied RTH bars exist.
5. Check Data Health for missing fields, entitlement errors or provider cooldown. Do not interpret Massive connected, retrieval time, or a historical candle as a current price.
6. Options quotes must have the correct underlying/expiry/strike and a recent source timestamp. The prior verified options path remains available; closed/stale quotes are not executable liquidity.

```bash
cd /Users/sarahlambertson/Desktop/tradehub-monday-readiness
npm run desk:live
```

Open **http://127.0.0.1:4190/?desk=live**. Port 4190 is loopback-only and strict; if it is already occupied by the desk, use the running instance rather than starting a second one. A fresh pre-open launcher session is recommended for the regular trading day.

Remaining acceptance boundary: Sunday cannot establish Monday live latency, advance availability or execution liquidity. If Today remains empty after qualifying trading begins or source times stop advancing, treat current context as unavailable/stale and use the dashboard only for explicitly dated research.
