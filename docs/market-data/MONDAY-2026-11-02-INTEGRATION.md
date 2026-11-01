# Monday trading workstation integration

The owner-configured Massive key now authenticates successfully. The integrated workstation is available locally at **http://127.0.0.1:4190/?desk=live**. The ignored `.env.local` was preserved; the provider/browser verifier checks its file hash before and after its run without logging the hash or credential.

## Implementation

- Reuses the existing `WorkspaceShell`, chart, options contracts, UI primitives, indicator functions and floor-pivot / level-map calculations. This is a focused integration, not a replacement platform or deployment.
- `marketEvidence.js` remains the canonical stock/ETF normalization and bar-calculation layer. `useDeskMarketData` manages cancellable polling and forwards the server results to the existing components; it does not calculate a second price or indicator stream. Existing options normalization/identity checks remain in `optionSnapshot.js`.
- The supported desk URL mounts this adapter rather than competing legacy hooks, automatic setup evaluation, AI or broker consumers. Generic workspace-shell defaults remain intact for other interface modes.
- Three focused navigation entries: **Trading Desk**, **Options Intelligence**, **Data Health**. Raw normalized evidence and access limits are secondary. No provider credential is sent to the browser.
- QQQ, SPY, NVDA, AMD, IWM, MU, PLTR, TSLA, ORCL and CRWV are selectable. The primary screen has last trade, session change and percentage, dated change baseline/prior close, separate bid/ask, spread, observed session and source-age labels.
- Daily change is last trade minus the prior regular close for the snapshot's **observed date**, with percentage relative to that close. It is unavailable if trade and snapshot dates do not match. On Sunday, Friday's observed change is compared with Thursday's close. Separately, current-session structure uses Friday's completed high/low/close. Both reference dates remain visible.
- Today's bars never fall back to an earlier date. **Last completed session** explicitly requests historical review and displays its date and historical status. This permits useful weekend review without presenting Friday as Sunday or Monday data.
- Chart candles come only from validated provider aggregates. The existing chart has a research-only presentation without conviction scores, action recommendations, automatic signals or synthetic current candles. Its axis and crosshair use Central Time. Responsive chart sizing follows its container, including sidebar / viewport changes.
- Previous-day and premarket extremes are observed references. Floor pivots are calculated from the dated prior H/L/C; formulas are available beside the level table. RTH VWAP weights provider minute VWAP by volume. EMA9/20/50 use completed RTH closes with SMA seeding. Missing feed minutes are not fabricated.
- Bullish/bearish scenarios are explicitly discretionary, unevaluated hypotheses. Boundaries use the higher of prior/premarket highs or lower of prior/premarket lows. A five-minute close and subsequent retest are conditional descriptions; invalidation crosses back through the same boundary. Next references use only supplied/calculated levels. A separate manual reward/risk form does not infer stop distances, fills or performance.
- Options reuse the existing snapshot endpoint and OCC validation. Expiry, strike, call/put, observed bid/ask, spread, volume, OI, IV, delta/gamma/theta/vega, source timestamp and freshness are shown when supplied. The underlying follows the selected instrument; missing fields remain unavailable. Closed/stale options quotes are explicitly recorded, never represented as executable prices. One-page chain coverage remains explicit.

## Provider-backed verification

The final verifier uses the **actual local server and its approved key**, not the earlier connected-app connection or replay fixtures.

| Symbol | Last observed trade | Bid / ask | Trade time, UTC |
| --- | --- | --- | --- |
| QQQ | 692.74 | 692.63 / 692.69 | October 30, 23:59:55.485 |
| SPY | 755.72 | 757.00 / 757.18 | October 31, 00:00:00.004 |
| NVDA | 205.2499 | 205.23 / 205.25 | October 30, 23:59:57.576 |
| AMD | 508.2186 | 508.40 / 508.70 | October 30, 23:59:53.183 |

SPY's UTC date rolls over, but its Eastern observed date is October 30. These are Friday observations, correctly labeled **Market closed · recorded** on Sunday. The UI values, independent trade/quote timestamps, prior-close baseline and calculated daily changes were compared with direct Massive responses.

The authenticated server returns all ten requested equity/ETF snapshots. NVDA November 2 $205 call (`O:NVDA261102C00205000`) was checked against the exact options response displayed by the browser; bid/ask, contract identity and closed-session status match. The server key also supports QQQ, SPY, AMD and PLTR option snapshot access. Individual contracts can omit IV or Greeks, especially deep ITM samples; a successful snapshot does not prove all fields for every contract.

Completed-session QQQ review loads October 30 minute bars and Thursday October 29 reference levels. It contains 390 RTH minute bars, with observed minute VWAP about 693.0436, EMA9 about 690.2777, EMA20 about 689.6399 and EMA50 about 688.3653. These are **historical calculations**, not Monday values.

Tests include:

- Raw provider → normalized API → browser parity for QQQ/SPY/NVDA/AMD.
- Actual authenticated options rendering; priority-underlying snapshot access.
- Sunday closure and empty current-day bars, followed by explicit completed-session review.
- A separate test-only browser context with Monday's clock and stale source timestamps; no recent/live label is shown.
- A separate simulated provider failure clears prices rather than retaining a misleading current observation.
- Wrong-symbol and late-response rejection, dated daily-change baselines, no silent historical fallback, calendar boundaries and options identity checks.
- Anonymous API denial, blocked broker/AI/notification routes, desktop/mobile rendering and unchanged local configuration.

**Results:** 275 tests passed across 41 files; production build and `git diff --check` passed. Actual-provider/browser smoke passed on November 1 at 20:09 UTC.

Run `npm test`, `npm run build`, and `node scripts/verify-live-desk.mjs`. The latter is intentionally a **closed-market readiness check**: exact provider/browser matching and Sunday-empty assertions are anchored to this weekend. An active-session check must account for source timestamps advancing between separate requests.

Ignored local artifacts: `.local/workstation-verification.json`, `trading-workstation-desktop.png`, `trading-workstation-options.png`, and `trading-workstation-mobile.png`. Provider captures are never imported into runtime or served as fallback data.

## Startup and use

```bash
cd /Users/sarahlambertson/Desktop/tradehub-monday-readiness
npm run desk:live
```

Open **http://127.0.0.1:4190/?desk=live**. The existing server on port 4190 can pick up these source changes through Vite; no restart or credential edit is required for this integration. If stopped, the command above reads the owner's worktree `.env.local`. No need to point it at the sibling engine's old environment.

Select a watchlist symbol. Use **Today** for the current calendar session or **Last completed session** for explicit historical review. Open **Options Intelligence**, select a priority underlying and filter expiry/strike before loading. Use **Data Health** for timestamps, unavailable fields and provider status.

Snapshots poll every 30 seconds after completion; bars every 60 seconds. Failed refreshes clear their corresponding data; rate-limit failures back off. The frontend ages source timestamps every second and cancels obsolete requests when the symbol/session changes. This is a polling research desk, not a streaming execution terminal. The local launcher continues to block broker, AI and notification routes.

## Monday recommendation

**GO for local research and session preparation.** Provider connectivity and closed-market correctness are verified. On Monday, confirm that Today receives November 2 bars and source timestamps advance, and that the desired options quote is recent before using its liquidity as research evidence. Sunday cannot prove Monday feed latency or availability.

VIX remains `NOT_ENTITLED` on the current server account. ES/NQ remain unavailable without verified futures contract entitlements; ETF prices are never substituted. Stock snapshot delay is unverified where the endpoint supplies no timeframe. Exchange/subscriber licensing is not inferred from HTTP success. No trades, deployment, merge, plan purchase or credential changes were performed.
