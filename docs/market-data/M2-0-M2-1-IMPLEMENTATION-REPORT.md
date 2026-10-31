# M2.0 / M2.1 implementation evidence

This increment implements the reviewed read-only three-ETF boundary. It does not activate a verified live feed, change production configuration or approve deployment. The security prerequisite passed first: 145 tests and the production build, recorded in [security evidence](../security/IMPLEMENTATION-REPORT.md).

## Implemented

- Operator-authenticated `/api/market/{capabilities,snapshot,bars}` routes forward only validated requests to the configured Python service. A dedicated server bearer token and exact audience authenticate that internal boundary. Browser cookies/Authorization, destination URLs and provider credentials are never forwarded from the browser to the service.
- A closed versioned schema and cross-runtime fixtures validate canonical ETF identity, source, per-field timestamps, adjustment evidence, quality, coverage and sanitized errors. Only QQQ, SPY and IWM snapshots and bounded one-minute RTH bars are enabled resources. Daily bars, options, intelligence, VIX and futures price endpoints remain unavailable.
- Python owns explicit NS/MS conversion, pinned XNYS calendars, completed-bar windows, missing intervals, quote-pair freshness, coalescing and priority within the new service queue. Source timestamps stay separate from response time. Future clocks, missing quotes, wrong tickers, crossed prices and unverified recency cannot become CURRENT. Existing strategy/freshness rules are preserved.
- One Redis-time rolling account budget admits every integrated Node/Python provider HTTP attempt when Unified is enabled. New requests preserve configured legacy room; all roles share the parent limit and four leases. Retries/pages reserve independently; release never refunds consumed attempts. Missing store, missing policy or mismatched policy prevents provider access.
- Unified mode is an explicit read-only view with source/profile/time/freshness/coverage evidence. It unmounts legacy coach, setup evaluation, Wheel and scanner consumers. Ticker switches clear old state, obsolete requests cannot overwrite selection, authentication expiry unmounts access, and displayed quality ages even during network stalls. Legacy mode remains available.

## Verification

Final integration results: `npm test` **24 files / 179 tests passed**; `npm run build` passed; Python `pytest -q` with isolated PostgreSQL **393 passed, none skipped**, one existing Starlette/httpx deprecation warning. The initial database-free run passed 382 and skipped 11; rerunning against temporary local PostgreSQL exercised all 11 successfully. Both repositories pass `git diff --check`. The shared Node/Python malformed-admission fixtures and four synthetic Python response fixtures pass cross-runtime validation. Build/tool deprecation and large-bundle warnings remain. The isolated real-Redis harness is `node scripts/verify-market-budget-redis.mjs` with Redis bound only to `127.0.0.1:56379`. It passed after final code changes. It compares Node/Python Lua bytes and exercises 100 concurrent callers across three simulated environments, four-lease admission, account/new limits, duplicate attempts, policy mismatch, expired reservations and release without refund. It deletes only its uniquely named test keys. These tests do not prove provider entitlements or market-session reliability.

The fresh EGM implementation audit is in [implementation review](./M2-IMPLEMENTATION-REVIEW.md). Its concrete findings were resolved before final integration checks.

## Remaining activation dependencies

1. Verify the actual deployment account, Options Standard rights and field recency. Connector observations and public plan names do not verify the server credential. The first-phase feed classifier deliberately remains UNKNOWN until an approved deployment-probe integration establishes trustworthy recency; no configuration flag upgrades it to REAL_TIME.
2. Approve service hosting and protected configuration: service URL/token/profile, provider key, Redis and the common account scope, total quota N and measured legacy reserve R. Provision the protected Redis policy separately. No real values or shared policy were created by this implementation. All participating environments/producers for the same actual account must use this parent. A five-request default cannot support a three-ETF ten-second cadence.
3. Compare pinned calendar fixtures and timestamp mappings against authoritative schedules and an approved deployment sample before activation. Run bounded authenticated checks through the actual profile, then sample each ETF every ten server-clock seconds over a full RTH session. Each must reach the reviewed 99% CURRENT quote-pair gate, including outages/startup. Offline tests cannot satisfy it.
4. Review Vercel function bundling of the JSON schema/Lua files and service reachability in an explicitly approved protected preview. Local SSR and build checks do not prove deployed tracing, network or cookie behavior.

Legacy authenticated WebSocket key delivery remains outside enforceable server REST budgets and can expose a long-lived provider key to browser code. External users of the same Massive account are also outside this application's enforcement. See the security report before release.

## Next increment

First complete a bounded M2.1 activation/evidence increment: deployment-profile probes, verified recency registration, measured quota/reserve and regular-session acceptance evidence. Then specify M2.2's Market Map/sector consumer migration and daily-session semantics. Do not enable options positioning, IV/Wheel, futures or actionable intelligence as part of this first increment.

## Checkout boundaries

TradeHub remains on `security/egm-provider-notification-hardening`. Necessary sibling Python work is on newly created `feature/egm-m2-live-data`, retaining its existing uncommitted work. No commits or pushes were made; both checkouts contain pre-existing unrelated changes that must be separated before release. Calendar and pinned dependencies were installed only into the existing local Python virtual environment for offline tests. Temporary Redis/PostgreSQL used synthetic data and credentials; production services/settings were untouched.

## Subsequent provider-confinement increment

The browser-key residual described above is historical for the earlier increment. New reviewed source code retires authenticated key delivery and replaces browser sockets with server REST polling. Existing production and previously copied keys are not changed by local implementation. See ../preview/IMPLEMENTATION-REPORT.md for current confinement, isolation, tests and activation dependencies.
