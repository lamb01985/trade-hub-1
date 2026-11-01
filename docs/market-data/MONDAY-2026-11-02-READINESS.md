# TradeHub Monday readiness — November 2, 2026

Decision: **NO-GO for live trading research until a valid approved server credential and real-time access are verified.** The desk is locally testable and fails explicitly. There is no verified current-session live feed on Sunday.

## Isolation and scope

Branch `fix/tradehub-monday-market-data`, isolated worktree `/Users/sarahlambertson/Desktop/tradehub-monday-readiness`, based on `c80c25d`. The source checkout's modified thesis implementation plan was preserved. Existing EdgeIQ worktrees were not edited. No deployment, merge, trade, broker-account operation, credential change or service activation occurred.

## What works

The dedicated `?desk=live` path mounts a read-only desk rather than legacy automatic setup, broker or AI consumers. The loopback launcher permits only the desk, options snapshot and session read routes. It creates a process-local session with its own `th_desk_operator` cookie; no persistent password is created or modified.

The complete requested equity/ETF watchlist is represented. Trades and bid/ask have independent provider timestamps. VIX maps to `I:VIX`, and ES/NQ stay unavailable without verified futures contracts. The desk separates errors, missing fields, delayed/unverified feed status, previous-session observations and market closure. Labels age once per second; provider snapshots and context refresh once per minute.

Context uses dated prior-session daily OHLC and today's completed minute bars. Premarket, RTH and after-hours summaries stay separate. VWAP uses provider minute VWAP weighted by minute volume. EMA9/20/50 use SMA seeding and only supplied RTH minute closes. Missing provider minutes are not fabricated or filled. The last RTH bar timestamp and bar count qualify all indicator/trend context. Friday bars are not silently imported as Monday intraday data.

Prior highs/lows are reference levels. A manual conditional research plan exposes entry, invalidation/stop, target and reward/risk before costs. No signals, fills or outcomes are invented. Options show contract identity, expiry, strike, bid/ask, spread, volume/OI, quote timestamps/timeframe and available Greeks/IV. OCC identity and response filters are checked. Chains remain bounded to one page with explicit partial-coverage notices.

## Actual access evidence — separate connections

Checked November 1, 2026, 16:35 UTC (final runtime smoke).

| Connection | Result | Meaning |
| --- | --- | --- |
| TradeHub checkout | No local env file or inherited provider configuration | Normal local API cannot obtain market data by itself |
| Existing sibling engine `.env` key, used read-only for diagnostics | Massive rejected stocks, market status, options and indices with HTTP 401 `Unknown API Key`; futures returned 404 with the same error | Invalid credential is not evidence of a plan restriction. This key cannot power the desk |
| Connected Massive app | All ten requested equity/ETF snapshots returned trade and quote fields | This separate connector has data access; its credential is not available to the local app |
| Connected Massive app options | QQQ, SPY, NVDA, AMD and PLTR contract snapshots returned | Quote/trade timeframe was `REAL-TIME`; Friday timestamps still mean historical observations on Sunday. Some contracts omit Greeks/IV |
| Connected Massive app VIX | `NOT_ENTITLED` for `I:VIX` | VIX request is not covered by that connection |
| Connected Massive app ES and NQ snapshots | Both `NOT_ENTITLED` | Futures snapshots are not covered; no usable contract entitlement established |

No account-management endpoint, billing plan name, exchange-agreement signatures or legal subscriber classification was verified. HTTP success alone is not proof of licensing rights. The connector's entitlement cannot be transferred to the server by assumption. No replacement source is used. See [Massive plans](https://massive.com/pricing).

## Exact observations and freshness

The following were retrieved from the connected Massive app, not from the rejected TradeHub server credential:

| Observation | Value | Provider timestamp (UTC) |
| --- | --- | --- |
| QQQ last trade | 692.74 | 2026-10-30 23:59:55.485 |
| QQQ bid / ask | 692.63 / 692.69 | 2026-10-30 23:59:56.824 |
| NVDA last trade | 205.2499 | 2026-10-30 23:59:57.576 |
| NVDA bid / ask | 205.23 / 205.25 | 2026-10-30 23:59:57.465 |
| O:NVDA261102C00205000 bid / ask | 2.20 / 2.24 | 2026-10-30 19:59:59.307 |

These are Friday observations, not Sunday live liquidity. The option is NVDA November 2, 2026 $205 call; observed OI 254 and day volume 33,916. Greeks/IV were present for this contract, with no separate Greek calculation timestamp supplied. OI is a daily reference, not current liquidity.

## Root causes and fixes

1. The historical `preview:local` intentionally blocks market data. Added a separate `desk:live` launcher without changing that preview.
2. TradeHub had no configured key; the available engine key was rejected. Added server-only `MASSIVE_API_KEY` compatibility alongside legacy `POLYGON_API_KEY`; did not replace either value. Updated provider host to `api.massive.com`.
3. Legacy chart synthesized candles from `Date.now()` and an arbitrary last trade. Removed synthetic tick candles; provider aggregates now own OHLC.
4. Legacy context swallows provider errors, drops quote provenance and allows stale automatic setup evaluation. The dedicated desk bypasses those hooks and engine, retaining explicit errors and timestamps. Legacy automatic setup logic is not certified by this assignment.
5. Added symbol/date/OHLCV/order/pagination checks, completed-minute filtering and calendar-aware evidence states. Calendar is explicitly scoped to 2026; later years show unverified status.
6. Options lacked response identity checks and row-level quote age. Added OCC/expiry/type/strike/underlying checks, invalid quote rejection, per-row timestamps and conservative options-session status. Outside standard RTH, options liquidity remains unverified even when an equity extended-hours feed is active; product-specific 16:15/early options sessions are not certified.
7. Fixed the options underlying control to accept text tickers instead of numeric input.
8. Restricted new snapshot proxy paths to explicit watchlist/index filters and isolated the localhost cookie from other TradeHub ports.

## Local startup

```bash
cd /Users/sarahlambertson/Desktop/tradehub-monday-readiness
npm run desk:live
```

Open http://127.0.0.1:4190/?desk=live . Port 4190 is loopback-only and strict. Stop with Control-C. Dependencies currently use a symlink to the source checkout's existing `node_modules`; on a fresh checkout run `npm ci` first.

The launcher reads `.env.local`/`.env` in this worktree, or an explicitly selected **existing approved** server env directory:

```bash
TRADEHUB_SERVER_ENV_DIR=/absolute/path/to/approved/env-directory npm run desk:live
```

It imports only market configuration, never broker or AI credentials. `POLYGON_API_KEY` takes precedence over `MASSIVE_API_KEY`. No valid approved env directory has been identified. The currently running diagnostic instance reads the existing sibling engine directory and displays `PROVIDER_KEY_REJECTED`; do not interpret that instance as live-ready. Starting without a key displays `env_missing`. Do not paste secrets into browser settings or use `VITE_` secrets.

This launcher is the supported local test path for this assignment. Normal production APIs still require their existing operator configuration and session store. No hosted release was performed.

## Verification

- `npm test -- --reporter=dot`: **266 tests passed, 39 files**.
- `npm run build`: passed; existing bundle-size/deprecation warnings remain.
- `git diff --check`: passed.
- Actual server-backed smoke: returned typed `PROVIDER_KEY_REJECTED`, zero substituted prices.
- Connected-app provider smoke: equities, ETFs, options and completed historical bars fetched; VIX/ES/NQ access denial confirmed.
- `node scripts/verify-live-desk.mjs --provider-replay`: passed in isolated Chrome. Actual runtime checks verify anonymous API rejection and blocked broker/AI/notification routes. Test-only Playwright interception then renders captured Massive responses, comparing QQQ/NVDA price, quote timestamps and the NVDA contract bid/ask/identity against the provider response. This is explicitly **test replay**, not successful server live connectivity.
- Regression scenarios cover DST Monday open, weekend closure, holiday/early closure, stale/missing/future timestamps, mismatched instruments, malformed/incomplete bars, unentitled/error responses and options-session closure.
- Independent agent review identified chart timestamp fabrication, stale setup evaluation, missing quote provenance, options identity and new proxy/cookie/session gaps; the dedicated desk addresses or isolates these. Review did not certify licensing or active-session latency.

Ignored `.local/` contains provider evidence, runtime-smoke results and `live-desk-provider-replay.png`. These licensed test observations are not committed, bundled, served as live data or available through API fixture fallback. Replay verification requires those local captures; ordinary runtime never loads them.

## Monday blockers / acceptance gate

1. Supply the path to an existing approved env directory containing a valid server key. No key purchase, rotation or credential modification was authorized or performed.
2. Verify the actual server account's stock/options field entitlement, request budget and signed exchange agreements; personal/professional and redistribution rights remain unverified.
3. Repeat server-backed quote/bar/options and frontend parity checks during Monday's active session. Sunday cannot prove Monday feed latency, availability or current-session indicators. NYSE regular session is scheduled for 09:30–16:00 EST (08:30–15:00 CST).
4. VIX and ES/NQ remain unavailable; the connected account denies these requests. Futures need verified contract identifiers and entitlement, never ETF substitutes.
5. Treat this as a locally testable research aid only. Do not rely on the legacy setup engine's automatic stale-price behavior; use the isolated desk URL.

After a valid approved key, verified rights, and active-session parity checks, equities/options may qualify for a conditional research-only GO. Current recommendation remains **NO-GO for live use**.

Sources: [NYSE calendar](https://www.nyse.com/trade/hours-calendars), [Massive real-time access requirements](https://massive.com/knowledge-base/article/how-quickly-can-i-access-massives-market-date), [Massive stocks](https://www.massive.com/stocks), [Massive market-data terms](https://www.massive.com/legal/market-data-terms-of-service).
