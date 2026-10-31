# TradeHub EGM drift report and remediation plan

Date: 2026-10-25. Scope: the current local TradeHub working tree and all 20 newly generated `EGM.md` contracts. This report uses the filename requested by the user in place of EGM's default dated report filename. Existing application edits predate this review and are not assumed to be deployed.

The highest priorities are protecting provider credentials and notification endpoints, preventing stale or wrong-symbol prices from driving trading tools, and repairing Massive request isolation. The intelligence report is intentionally historical; turning it into a current production service requires a separate delivery design.

## How to read the findings

- **Confirmed defect:** the code contains a fault or missing security check. An isolated reproduction is identified where performed. This does not establish that the same code is publicly deployed or that an account has been abused.
- **Confirmed limitation:** an intentionally incomplete or sample-only feature. These often match the new as-built contracts and are not evidence of subsequent architectural drift.
- **Suspected runtime problem:** code establishes a plausible failure path, but deployment, provider behavior or concurrent execution must be tested before claiming it occurs.
- **Documentation drift:** a contract contradicts the implementation or omits a consequential behavior. Because these contracts were just generated from the code, many serious issues are accurately documented existing risks rather than new drift.
- **High severity:** credential exposure, unauthorized external usage, incorrect instrument data or loss of journal accuracy. **Medium:** important correctness, availability or incomplete-integration issue. **Low:** documentation error without a directly established user-facing failure.
- Findings are grouped under their primary contract. Cross-references avoid counting the same defect twice. An unqualified “No drift detected” means no additional discrepancy was found in the inspected interfaces and focused implementation paths; it is not an exhaustive audit certification.

## EGM.md

- **R1: Local review cannot establish Vercel readiness. High priority; suspected runtime availability problem, with confirmed configuration differences.**
  - Affected files: [reports.js](./api/_lib/reports.js), [local-preview.mjs](./scripts/local-preview.mjs), [vite.config.js](./vite.config.js), [vercel.json](./vercel.json), [.vercelignore](./.vercelignore), [package.json](./package.json).
  - Evidence: `reports.js:7-14` requires a configured filesystem report; `.vercelignore:1-2` excludes local reports/artifacts. `local-preview.mjs:11-18,42-57` supplies an ephemeral local session and custom route middleware, disabling provider/broker routes. Vite has no API proxy, while Vercel uses native API routes. The contract describes this difference, but there is no checked-in production report publication mechanism.
  - User impact: a successful local historical review or unit suite cannot establish production login, report delivery, Redis, OAuth, provider access or paid AI availability. Production intelligence may return 503 if its report file is absent. Actual Vercel failure is unverified.
  - Remediation: define supported modes and their required services, names-only configuration inventory, report delivery source and revision identity. Run controlled staging checks with sanitized outputs after a specification is reviewed. Do not copy local fixtures or credentials into public assets.
  - Runtime evidence still needed: deployed revision, route responses without response-body secrets, filesystem availability, cookie/origin configuration, Redis access, provider entitlements and OAuth callback behavior. No production request was made in this review.
- Root security and data-quality concerns are already acknowledged in this contract. Their detailed evidence appears below; they should not be presented as newly introduced changes.

## api/EGM.md

- **S2: Public handlers can spend provider resources and send operator notifications. High; confirmed missing access controls, conditional on reachable/configured deployment.**
  - Affected files: [notify-email.js](./api/notify-email.js), [notify-telegram.js](./api/notify-telegram.js), [proxy.js](./api/polygon/proxy.js).
  - Evidence: email lines 12-34 and Telegram lines 11-31 check method/body/configuration and send externally without caller authentication, request quotas or origin validation. Proxy lines 10-28 likewise forwards allowed market-data requests without operator authentication or quotas. Fixed notification destinations do not authorize the sender.
  - User impact: unsolicited messages, notification noise, provider quota/usage consumption and availability loss. This review did not send a notification or verify public exposure.
  - Remediation: establish a shared route policy, authenticate operator-only requests, validate mutation origins, impose body/rate limits and notification deduplication, and apply provider usage limits. Origin checks alone do not authenticate non-browser callers.
  - Contract relationship: accurately documented existing risk; not a new divergence from the API contract.

## api/_lib/EGM.md

- **R2: Broker token refresh and journal persistence can race. Medium; suspected runtime failure, confirmed missing concurrency safeguards.**
  - Affected files: [schwab.js](./api/_lib/schwab.js), [tradeSync.js](./api/_lib/tradeSync.js), [sync.js](./api/schwab/sync.js).
  - Evidence: `schwab.js:250-277` loads, refreshes and saves tokens without a shared refresh lock; `consumeOAuthState:126-130` uses separate get/delete operations. `tradeSync.js:69-75` writes fills, trades and success metadata separately, and sync lines 98-100 perform an unlocked load/merge/write. Failure metadata also updates `lastSyncAt` at `tradeSync.js:79-85`.
  - User impact: simultaneous requests could overwrite newer tokens; future active sync could lose updates or expose inconsistent records. Provider refresh-token rotation and actual concurrency determine the observed failure. The sync adapter currently prevents the normal successful ingestion path, so the journal race is a readiness blocker rather than a demonstrated current data-loss incident.
  - Remediation: atomic state consumption, a per-session refresh lock with re-read, versioned atomic sync persistence and separate attempted/successful sync timestamps. Use deterministic concurrent and partial-write tests with mocked Redis before provider testing.
  - Contract relationship: recorded existing limitation; the bootstrap did not inspect all Schwab helper bodies, so this pass checked the previously uninspected tail too.
- **D2: The shared-services contract overstates when broker reconnect changes session identity. Low; confirmed documentation drift.**
  - Affected files: [shared-services contract](./api/_lib/EGM.md), [schwab.js](./api/_lib/schwab.js), [OAuth actions](./api/schwab/auth/[action].js).
  - Evidence: the contract says reconnecting creates a new session. `ensureSessionId:112-117` actually reuses a valid signed cookie; OAuth login calls that helper at auth line 41. A new identity is created when no valid session cookie exists, such as after disconnect or expiry.
  - User impact: operators could unnecessarily change cron configuration, or miss the cases where a new session really does require alignment.
  - Remediation: document reuse versus replacement explicitly and define a stable operator-to-broker-session binding before enabling cron sync. Do not expose session identifiers in routine diagnostics.

## api/ai/EGM.md

- No drift detected. Provider model availability and real billing behavior remain untested runtime prerequisites under R1; no model, price or entitlement claim was verified externally.

## api/intelligence/EGM.md

- **I1: “Latest” is permanently bound to one historical report. Medium; confirmed sample limitation and production feature gap.**
  - Affected files: [reports.js](./api/_lib/reports.js), [reportContract.js](./src/lib/reportContract.js), [prepare-local-sample.py](./scripts/prepare-local-sample.py), [MarketIntelligence.jsx](./src/components/intelligence/MarketIntelligence.jsx), [AnalystBrief.jsx](./src/components/intelligence/AnalystBrief.jsx).
  - Evidence: the loader rejects any report date other than `2026-10-26` at line 12. The adapter labels every report as the October 26/Friday October 23 sample at lines 30-36. Preparation fixes the source date and completed-session archive date at lines 11,18,48. UI copy and readiness at `MarketIntelligence.jsx:28,34,67` and `AnalystBrief.jsx:15-20,36` are also sample-specific.
  - User impact: Refresh retrieves the same historical evidence; changing only an environment path cannot enable rolling market intelligence. Missing OI history, limited expirations and incomplete flow cannot be repaired by UI refresh. The current code explicitly labels the sample, so this is not evidence that it secretly serves it as live data.
  - Remediation: preserve an explicit historical mode; specify a separate versioned current-report lifecycle with report identity, source session, publication, freshness and failure states. Derive date labels from validated provenance. Do not remove historical readiness blocks until current evidence is available and tested.
  - Contract relationship: consistent with the current sample contract; an unimplemented future capability rather than accidental drift.

## api/polygon/EGM.md

- **S1: WebSocket authentication discloses the server provider key to an anonymous caller. High; confirmed defect, reproduced with a synthetic key.**
  - Affected files: [ws-auth.js](./api/polygon/ws-auth.js), [massive.js](./src/lib/massive.js).
  - Evidence: `ws-auth.js:19-26` returns `{apiKey}` after checking only GET. `massive.js:578-592` fetches and uses it for browser authentication. An isolated no-cookie request returned 200 with the mock value; no real key was accessed or printed.
  - User impact: if this version is reachable and configured, an unauthenticated caller can obtain the provider credential and use it outside TradeHub. Browser memory storage does not prevent that exposure. Actual public deployment and provider usage were not inspected.
  - Remediation: first require operator authentication, restrict responses to no-store and bound access; then replace browser key delivery with controlled server polling or a reviewed streaming relay if provider keys must remain server-side. Following exposure confirmation, rotate affected credentials through a separately authorized operational change. Authentication alone still exposes the key to an authenticated browser.
  - Contract relationship: correctly records an unsafe existing design.
- **S3: The path allowlist validates a different path from the one sent upstream. High; confirmed policy bypass, reproduced without network access.**
  - Affected files: [polygon.js](./api/_lib/polygon.js), [proxy.js](./api/polygon/proxy.js).
  - Evidence: `isAllowedPath:34-42` accepts a raw prefix; `polygonFetch:60` subsequently normalizes it with `new URL`. A synthetic path beginning `/v2/aggs/ticker/` and containing parent-directory segments passed validation and normalized to the explicitly blocked `/v3/snapshot/options/QQQ` endpoint. Also, lines 61-63 assign the server key before copying arbitrary caller parameters, allowing caller `apiKey` override.
  - User impact: callers can escape the documented stocks-only path restriction and cause unintended upstream requests. Provider entitlements may still reject those requests. This is not an established arbitrary-host SSRF: the tested bypass stayed on the fixed provider host. Caller-key override is a separate integrity issue, not evidence that the server key was leaked through REST.
  - Remediation: parse and canonicalize once, reject traversal/encoded separators/query fragments as appropriate, verify exact normalized routes and fixed origin, allowlist parameters, and reject reserved credential parameters. Test literal and encoded traversal plus valid routes.
  - Contract relationship: contradicts the stated stocks-only invariant; the contract acknowledges key override but misses canonicalization bypass.

## api/schwab/EGM.md

- **B2: The new execution-level sync pipeline is incomplete. Medium; confirmed integration limitation.**
  - Affected files: [sync.js](./api/schwab/sync.js), [Schwab adapter](./src/lib/tradeAggregator/adapters/schwab.js), [thinkorswim adapter](./src/lib/tradeAggregator/adapters/thinkOrSwim.js), [Journal.jsx](./src/components/Journal.jsx).
  - Evidence: sync lines 46-54 construct placeholder input rather than fetching executions; all adapter exports throw. Journal lines 252-253 instead use the older `getOrdersToday()` / `ordersToTrades()` path. Thus the broken execution adapter does not mean every existing journal import is absent.
  - User impact: the new sync cannot ingest fills, while the legacy path has separate accuracy defects in B1. Future sync also assigns the entire `getAccountHandle()` result to `accountHash` at line 47, although that helper returns `{hash,number,warning}` at `schwab.js:329-342`; real fetching must select `.hash`.
  - Remediation: specify an execution-level source using redacted sample shapes; map every partial fill and leg, choose an account explicitly, validate dates/body, preserve stable identifiers and pagination, and keep sync visibly unavailable until mapping is implemented. Do not silently fall back to an empty import.
  - Contract relationship: scaffolding is documented; the helper return-shape mismatch and coexistence with the legacy UI path need explicit implementation coverage.
- **B3: Failed order reads display a reassuring zero day-trade count. Medium; confirmed error-to-zero defect and misleading UI.**
  - Affected files: [resource handler](./api/schwab/[resource].js), [useSchwab.js](./src/hooks/useSchwab.js), [Command.jsx](./src/components/Command.jsx), [App.jsx](./src/App.jsx).
  - Evidence: resource lines 99-111 initialize `dayTrades=0` and swallow order-fetch failure. Hook line 183 also defaults missing counts to zero. Command line 640 displays `remaining 3` from that count; App lines 564-568 labels it PDT. The calculation only matches option buy/sell legs in a single UTC-day query of at most 250 orders.
  - User impact: unavailable or incomplete evidence appears as a successful low count. It is not a reliable account-rule clearance signal.
  - Remediation: return unknown/error with coverage metadata, display an explicitly limited session estimate, and avoid “remaining” permission language unless an authoritative, fully specified account rule service supports it. Keep account-provided status separate.
  - Contract relationship: the server contract acknowledges an estimate and swallowed errors, but the UI presentation undermines that limitation.

## api/schwab/auth/EGM.md

- **R3: Broker mutation protection is weaker than operator API protection. Medium; confirmed guard inconsistency, suspected cross-site/runtime impact.**
  - Affected files: [OAuth actions](./api/schwab/auth/[action].js), [sync.js](./api/schwab/sync.js), [schwab.js](./api/_lib/schwab.js).
  - Evidence: auth lines 76-100 permit refresh through GET and disconnect through POST without origin checks; sync POST likewise lacks an origin/CSRF guard. Schwab cookies are `SameSite=Lax`, while operator mutations enforce an exact origin. Refresh can change stored tokens. Authentication still requires a signed broker session; this is not an anonymous broker-account takeover finding.
  - User impact: unwanted session mutation or resource use may be possible under particular cookie/site/request conditions. SameSite reduces some cross-site requests; no browser exploit was established.
  - Remediation: specify allowed methods, origin/CSRF checks for browser mutations and a separate authenticated cron policy. Preserve the OAuth callback's state validation. Test actual cross-site and same-site sibling-origin cases before assigning exploitability.
  - Contract relationship: accurately describes the weaker guard model; targeted runtime testing remains necessary.

## api/schwab/debug/EGM.md

- No additional drift detected. The documented conditional raw-account inspection surface remains a production configuration check under R1. Enabling the flag accepts a valid broker cookie as an alternative to the debug header; it must not be interpreted as requiring both. Actual flag configuration was not read.

## contracts/EGM.md

- **I2: Schema validity does not enforce report identity or the complete render contract. Medium; confirmed validation gap, mismatched identity reproduced.**
  - Affected files: [reportContract.js](./src/lib/reportContract.js), [options workspace schema](./contracts/options-workspace-v1.schema.json), [Python schema](./contracts/python-market-intelligence-v1.schema.json), [transport schema](./contracts/tradehub-intelligence-v1.schema.json), [OptionsIntelligence.jsx](./src/components/intelligence/OptionsIntelligence.jsx).
  - Evidence: adapter lines 33-34 copy optional presentations; `parseReport:22-24` only runs schema validation. A synthetic parent dated October 26 accepted an options workspace with a different report ID and October 27 date. Several nested objects are unconstrained; for example `liquidity` is merely an object while `OptionsIntelligence.jsx:57` calls `data.liquidity.rules?.map(...)`. A supplied non-array `rules` can therefore reach an array-only rendering operation. There is no cross-object equality, timestamp ordering or symbol consistency validation.
  - User impact: a structurally accepted report can mix evidence across sessions or fail during rendering. No actual stored report corruption was inspected.
  - Remediation: enforce report ID/date/symbol agreement, permitted timestamp relationships and required nested shapes before serving/rendering. Reject incompatible derived presentations rather than mixing them. Add negative fixtures for mismatched reports, malformed nested fields and future/stale observations.
  - Contract relationship: the schema contract acknowledges uneven validation, but does not define the semantic checks needed by the architecture's provenance invariant.

## scripts/EGM.md

- **I3: Report preparation is tied to a sibling checkout and can silently omit options output. Medium; confirmed portability and completeness limitation.**
  - Affected files: [prepare-local-sample.py](./scripts/prepare-local-sample.py), [options_workspace.py](./scripts/options_workspace.py).
  - Evidence: preparation lines 11,42,60-63 require a particular sibling report/database/interpreter layout. If the interpreter is absent, the options subprocess is skipped and preparation still writes a report. The adapter imports sibling implementation modules through `sys.path` at lines 12-15. No engine revision is pinned by this interface.
  - User impact: another developer or CI can generate a nominal report without the requested positioning workspace, or get different results from a changed sibling engine. This dependency cannot be assumed present on Vercel.
  - Remediation: specify explicit inputs and engine-version provenance, validate adapter compatibility, fail with a clear missing-options status or require an explicit partial-output choice, and publish a prepared artifact through the report-delivery boundary. Do not port the analytics into browser code as a shortcut.
  - Contract relationship: sibling dependency is recorded, but silently optional generation needs a defined completeness contract.

## src/EGM.md

- **D1: Two contracts incorrectly describe separate underlying market streams. Low; confirmed documentation drift.**
  - Affected files: [src/EGM.md](./src/EGM.md), [hooks contract](./src/hooks/EGM.md), [massive.js](./src/lib/massive.js), [App.jsx](./src/App.jsx).
  - Evidence: the frontend contract refers to “separate subscriptions” and the hooks contract says separate instances “remain separate subscriptions.” App does instantiate multiple hooks, but `massive.js:673-747` maintains one shared hub with ticker reference counts. Hooks still perform their own REST context work.
  - User impact: a maintainer could diagnose connection limits incorrectly or duplicate a streaming fix already present. Cross-tab/device sharing is not provided by this module-level hub.
  - Remediation: correct the contracts to distinguish shared WebSocket transport, logical subscribers, duplicated REST refreshes and separate browser contexts. No connection-limit assumption about the current provider account was verified.

## src/components/EGM.md

- **M6: The sector heat map can mark failed coverage as freshly updated. Medium; confirmed misleading status path.**
  - Affected files: [sectors.js](./src/lib/sectors.js), [Calendar.jsx](./src/components/Calendar.jsx).
  - Evidence: `sectors.js:78-83` turns every fetch failure into null/empty input; lines 122-123 produce zero/partial scores and lines 238-251 still return rows with `fetchedAt=Date.now()`. Calendar lines 291-293 saves that result as a successful snapshot. Lines 323-325 display a time-only “Updated” label and assert Friday-close data on weekends without checking source session. The heat-map header does not represent source observation time.
  - User impact: a disabled or failed feed can look like a recently refreshed neutral market; old cached evidence may be labeled Friday close irrespective of its actual date.
  - Remediation: track source session/timestamps separately from attempted retrieval, surface unavailable/partial coverage prominently, retain last successful data distinctly, and derive date labels from verified observations. Also use explicit market timezone/calendar for refresh scheduling instead of host-local hours at Calendar lines 303-308.
  - Contract relationship: partial flags are documented at the library boundary, but the UI's successful-update semantics are an uncovered discrepancy.
- B1 and B3 below/above also affect journal and broker UI, which were only inventoried during bootstrap.

## src/components/intelligence/EGM.md

- No additional drift detected beyond I1 and I2. Their affected views and remediations are recorded above. Historical labeling is not itself a defect; the gaps concern current-report capability and validation before presentation.

## src/hooks/EGM.md

- **M2: A previous ticker's REST price can overwrite the selected ticker. High; confirmed defect, reproduced with synthetic hook dependencies.**
  - Affected files: [useLiveData.js](./src/hooks/useLiveData.js), [Command.jsx](./src/components/Command.jsx).
  - Evidence: `useLiveData.js:181-193` cancels the polling interval but not an in-flight `getLastTrade(ticker)`; completion calls `setPrice` without checking ticker identity. Price/bid/ask state is not reset on ticker change. A deferred QQQ poll resolved after switching the hook to SPY and set SPY's returned scalar price. Command lines 107-110 display that scalar under the current ticker.
  - User impact: prices and risk context can be shown under the wrong instrument. The separate `dataTicker` guard protects REST context, not this price path.
  - Remediation: bind quotes to symbol and source timestamp, discard old-generation responses, clear or explicitly mark prior quotes on ticker change, and make consumers require matching quote identity. Add an out-of-order ticker-switch regression test.
  - Contract relationship: reveals a hole outside the contract's narrower claim that asynchronous context is guarded.
- **M3: Historical or stale data can reach coach/setup evaluation without a freshness gate. High; confirmed missing propagation; a real stale-data GO signal was not reproduced.**
  - Affected files: [useLiveDataMulti.js](./src/hooks/useLiveDataMulti.js), [useLiveData.js](./src/hooks/useLiveData.js), [useBot.js](./src/hooks/useBot.js), [bot.js](./src/lib/bot.js), [conditionEvaluators.js](./src/lib/conditionEvaluators.js), [App.jsx](./src/App.jsx).
  - Evidence: multi-hook lines 179-221 substitute prior-session bars and mark `isHistoricalFallback`; streamed trade/quote handlers at lines 102-113 discard source timestamps. `getLastTrade` also returns price only. Coach lines 240-265 gate only on non-null price and omit historical/freshness fields from context. `buildSnapshot:101-146` likewise does not carry them into setup evaluation; App lines 265-280 evaluates those snapshots. The coach engine has no source freshness field to enforce.
  - User impact: a retained price and historical indicators can appear eligible for current analysis. This concerns legacy live coach/setup tools, not the explicitly blocked historical analyst checklist.
  - Remediation: define a common symbol/session/time/quality envelope, propagate it through calculations, block new actionable signals on stale/missing/historical current-session evidence, and keep last-known positions visible with explicit stale status. Test disconnects, frozen streams, closed sessions and historical fallback.
  - Contract relationship: violates the intended downstream provenance/freshness invariant by dropping its enforcement data.
- **M5: Removed watchlist tickers can return after an in-flight context load. Medium; confirmed missing lifecycle guard, timing-dependent symptom.**
  - Affected file: [useLiveDataMulti.js](./src/hooks/useLiveDataMulti.js).
  - Evidence: lines 147-161 remove unwanted data, but the old asynchronous map writes `[ticker]` unconditionally at lines 205-225. Clearing its refresh interval does not cancel the pending map. Per-ticker failures at lines 227-229 are swallowed.
  - User impact: removed rows or obsolete context can reappear; load/error indicators need not represent the current watchlist. Final visual behavior depends on consumers and request ordering.
  - Remediation: use request generations and current membership checks, abort obsolete loads, keep per-symbol quality/errors, and test removal while a deferred request is pending.
  - Contract relationship: already recorded as a known boundary; no fix exists merely because documentation now names it.

## src/hooks/_archive/EGM.md

- No drift detected in the archived hook's declared interface and archived-engine import. No active-feature implementation work is recommended for this archive.

## src/lib/EGM.md

- **M1: A single entitlement denial disables unrelated Massive endpoints for the session. High; confirmed defect, reproduced with mocked fetch.**
  - Affected file: [massive.js](./src/lib/massive.js).
  - Evidence: `endpointPattern:37-45` uses the URL pathname, while `buildUrl:226-232` puts the upstream path in a query parameter on the common `/api/polygon/proxy` pathname. A 403 records that common pattern at lines 131-135; lines 114-123 reject later requests before fetch. One mocked fundamentals 403 prevented a subsequent last-trade request from reaching the mocked network. `clearMassiveCache:220-222` clears only successful responses, leaving this denial set intact.
  - User impact: one unsupported feature can blank prices, levels, scans and other unrelated services until module/session reset. It can also misclassify an authorization failure as a permanent entitlement denial.
  - Remediation: key availability by normalized upstream endpoint/capability, distinguish app authorization from provider entitlement, make recovery/reset explicit, and test denial of one feature while stock prices remain available.
  - Contract relationship: known defect described in the contract, now reproduced rather than merely inferred.
- **M4: Requested long history is capped at 50 ascending daily bars. Medium; confirmed integration defect; exact provider truncation response untested.**
  - Affected files: [massive.js](./src/lib/massive.js), [App.jsx](./src/App.jsx), [conditionEvaluators.js](./src/lib/conditionEvaluators.js).
  - Evidence: `getDayBars:275-281` always requests `sort=asc,limit=50` and does not follow pagination. `getHistoricalBars:542-545` treats its days argument as calendar days. App lines 234-251 requests 252 days for EMA/52-week context; `buildSnapshot:108,120-121` computes EMA200 and fields named `wk52High/Low` from whatever closes arrive.
  - User impact: EMA200 can remain unavailable and a short slice can be labeled a 52-week range. Whether a particular provider response returns exactly 50 bars still requires testing, but the request cannot establish the intended full history.
  - Remediation: define requested coverage in trading sessions, retrieve/paginate enough observations, validate first/last dates and count, and suppress mislabeled metrics until complete. Test the request boundary and insufficient-history states.
  - Contract relationship: bootstrap documented exports but did not capture this consequential history-coverage shortcut.
- **M7: WebSocket cleanup can be undone by pending authentication. Medium; confirmed lifecycle defect, reproduced with mocked WebSocket.**
  - Affected file: [massive.js](./src/lib/massive.js).
  - Evidence: `connect:573-589` awaits key delivery and then creates a socket without rechecking `intentionalClose`; `disconnect:657-661` can run during that await. The isolated probe disconnected before auth resolved and still observed a new socket afterward.
  - User impact: unmounted consumers can leave an orphan connection and callbacks, possibly interfering with reconnect behavior. Actual provider connection-limit effects require runtime verification.
  - Remediation: cancel key retrieval or use a connection generation, recheck lifecycle state after every await, handle CONNECTING state, and test disconnect/reconnect during deferred authentication.
  - Contract relationship: implementation omission beyond the bootstrap's sampled streaming bodies.
- **B1: Legacy broker journal import loses repeated option executions. High; confirmed defect, synthetic repeated-round-trip case reproduced.**
  - Affected files: [schwabClient.js](./src/lib/schwabClient.js), [orders.js](./api/schwab/orders.js), [Journal.jsx](./src/components/Journal.jsx).
  - Evidence: client lines 55-75 keep only one buy and one sell per option symbol, overwriting earlier records. Two synthetic round trips returned one journal record. Dedupe uses one order ID at lines 51-53,83; order sanitization uses order price or the first execution price at `orders.js:22-30`, rather than preserving all executions and leg prices.
  - User impact: repeated trades, scale-ins, partial fills and multi-leg orders can yield missing trades or incorrect journal P&L. This is the existing Journal path, independent of the new throwing adapters in B2.
  - Remediation: preserve execution IDs, leg identity, quantity, direction and actual per-execution price; aggregate only after normalization. Add repeated-symbol, partial-fill, short-option, spread and repeated-import tests before migrating existing journals. Keep manual journal records intact.
  - Contract relationship: previously indexed helper behavior lacked an accuracy contract; the bootstrap's incomplete-sync summary alone did not reveal this active-path defect.
- **B4: Trade IDs change when identical fills are aggregated twice. Medium; confirmed defect, reproduced without external services.**
  - Affected files: [tradeAggregator.js](./src/lib/tradeAggregator.js), [tradeSyncCore.js](./src/lib/tradeSyncCore.js), [tradeAggregator.test.js](./src/lib/tradeAggregator.test.js), [tradeSyncCore.test.js](./src/lib/tradeSyncCore.test.js).
  - Evidence: aggregator lines 32-35 use a module-global incrementing counter for IDs. Calling `aggregateFills` twice with identical fills yielded different IDs. Sync lines 65-67 aggregates before and after merging; its comments at lines 21-23 promise deterministic full-history reconstruction. Existing tests reset counters and do not establish stable IDs across repeated production calls.
  - User impact: future sync can replace identities for unchanged trades, breaking stable selection, references or attached metadata. The new sync remains blocked by B2, so those downstream runtime effects are not established incidents.
  - Remediation: derive IDs from stable execution identity and a documented trade-grouping policy; test repeated and reordered ingestion without resetting module state. Specify how corrections affect identity.
  - Contract relationship: consequential statefulness is omitted from the library contract and contradicts the implementation's own determinism claim.
- **C1: Session and economic calendars expire or assume fixed patterns. Medium; confirmed hardcoded/incomplete model; actual event-date errors unverified.**
  - Affected files: [constants.js](./src/constants.js), [calendar.js](./src/lib/calendar.js), [massive.js](./src/lib/massive.js).
  - Evidence: constants lines 57-80 only define 2026 holidays; `getSession:116-127` always assumes 16:00 ET close. `nextSessionDayName:133-151` accepts an injected date but reads the real clock for minutes. Calendar lines 60-91 contain fixed 2026 FOMC/one-off events and lines 118-150 synthesize claims/NFP from weekdays without an authoritative exception feed. This review did not compare any date with official schedules.
  - User impact: unsupported years, early closes and shifted releases can be treated as ordinary sessions/events; simulated-clock behavior can be inconsistent. Do not interpret generated dates as verified releases.
  - Remediation: use a maintained session schedule with early-close/coverage states, one injected clock and explicit timezone, and verified economic-event sources or conspicuous estimated labels. Verify schedules separately rather than copying more hardcoded dates into multiple files.
  - Contract relationship: 2026-only scope is acknowledged in the frontend contract; economic-source completeness and early-close effects need fuller contracts.

## src/lib/_archive/EGM.md

- No drift detected in the declared archive interface. The previously uninspected persistence tail reads/writes its declared browser key; it is not a recommended active implementation target.

## src/lib/tradeAggregator/EGM.md

- No drift detected. This directory groups adapters; the executable aggregator is the sibling `tradeAggregator.js` file addressed by B4.

## src/lib/tradeAggregator/adapters/EGM.md

- No additional drift detected. Throwing adapters are the confirmed limitation B2. Their documented normalized shape does not establish working broker ingestion.

## Prioritized remediation plan

Implement these as small, separately reviewed changes. Each increment should have a short concepts brief, a specification with failure behavior and acceptance cases, Goldfish review, implementation, tests, updated EGM contracts and a focused drift check. This report is the input to that process, not an approved implementation specification.

1. **Protect paid services and credentials first: S1, S2, S3.**
   Define which callers may use each route and what can leave the server. Specify operator authentication, notification limits, canonical route validation, reserved parameters and a safe replacement for provider-key delivery. First acceptance cases: anonymous access cannot obtain a key or send a message; traversal never changes the allowed route; valid stock requests still work. Start with mocked handlers and synthetic secrets. A later credential rotation or production change requires its own authorized operational step. Main files: `api/polygon/*`, `api/_lib/polygon.js`, notification handlers and shared access policy.
2. **Make displayed prices and signals trustworthy: M1, M2, M3, M5, M7.**
   Split this into transport-isolation and data-provenance specifications. Repair unrelated-endpoint suppression and lifecycle races, then require matching symbol, session, source time and freshness through hooks, coach and setup snapshots. Acceptance cases: one fundamentals denial does not stop prices; old responses cannot update a new ticker; disconnect cannot create a later socket; stale/fallback evidence cannot trigger a new actionable signal. Avoid a broad UI rewrite. Main files: `massive.js`, live-data hooks, `useBot.js`, `bot.js`, snapshot/setup consumers.
3. **Define adequate market coverage and honest labels: M4, M6, C1.**
   Specify minimum history for each indicator, verified source dates for sector maps, unavailable/partial status and supported calendar coverage. Acceptance cases: insufficient history cannot produce a field labeled 52-week; failed refresh never becomes fresh neutral coverage; date labels follow source observations; unsupported dates are explicit. Calendar-source verification is a separate evidence task. Main files: historical REST helpers, indicators/snapshots, `sectors.js`, Calendar and session helpers.
4. **Design historical and current intelligence delivery separately: I1, I2, I3, R1.**
   Keep historical mode available. Specify engine/version provenance, report and presentation identity, freshness policy, schema semantics, artifact storage, publication and failure behavior before selecting production infrastructure. Acceptance cases: mismatched report/date/symbol inputs are rejected; missing options preparation is explicit; labels work for multiple sessions; a missing report returns a clear unavailable state. Then test delivery in a controlled production-like runtime. Main files: contracts, `reportContract.js`, report loader, preparation scripts and intelligence views.
5. **Repair broker import accuracy before enabling the new sync: B1, B2, B3, B4, R2, R3.**
   Use separate specifications for execution normalization, stable trade accounting/persistence, and broker-session safety. Resolve source shape with redacted fixtures, retain each fill/leg, preserve identity, make writes atomic and errors visible. Acceptance cases: two same-symbol round trips survive; partial fills and short positions reconcile; repeated imports are stable; concurrent sync cannot lose fills; failed account reads show unknown; disconnect failure remains visible. Migrate existing journal records only under an explicit preservation plan. Do not enable the scaffold as a quick substitute for the legacy importer.
6. **Close deployment and documentation gaps: R1, D1, D2 and all changed boundaries.**
   Document a mode matrix for plain Vite, local historical review and Vercel, with names-only configuration, supported features and revision identity. Correct shared-socket wording and older operational prose. Define staging smoke checks for authentication, no-store data, API routing, Redis, source freshness and entitlement failures. Local success must not satisfy hosted acceptance criteria. A deployment decision follows successful review and explicit authorization; this plan performs none.

For each increment, use `/egm-brainstorm` to agree the problem and boundaries, `/egm-draft` to write the specification section by section, and `/egm-review` with the affected EGM contracts and source files as the explicit reading list. Resolve review findings before implementation, then run relevant regression tests and `/egm-drift-report` against the updated contracts. Preserve the installed workflows' human readiness/section gates and fresh-context reviewer requirement. No brainstorming/review pipeline or implementation has been started by this report.

## Verification and limits

- Read all 20 EGM contracts sequentially and inspected the corresponding referenced entry points and prioritized implementation paths, including streaming and broker helper bodies excluded by bootstrap sampling. Unrelated large component/library implementations were not exhaustively audited.
- `npm test`: **14 files, 100 tests passed**. Existing test-runner deprecation warnings were emitted. Passing tests did not cover the new failure probes below or establish Vercel/provider readiness.
- An external temporary harness loaded actual source into isolated Node VM modules with synthetic dependencies. Eight probes reproduced: anonymous mock-key return, path-normalization allowlist bypass, global 403 suppression, socket creation after disconnect, mismatched report identity/date acceptance, collapsed repeated option trades, unstable aggregate IDs, and old-ticker REST price completion. The hook probe uses a minimal lifecycle shim, not a real-browser rendering test.
- The harness used synthetic keys, an isolated mock environment and mocked network/storage dependencies. No real credential, private report, broker account, Redis account or environment file was opened. No provider request, notification send or production endpoint probe was performed. The harness is outside the repository at `/private/tmp/tradehub-drift-probes.mjs` and is not application code or a committed regression suite.
- Production exposure, actual entitlements, source-report contents, provider schedule correctness, OAuth behavior and concurrent Redis outcomes remain unverified. Severity describes conditional impact of the local implementation, not a claim that production has been compromised.
- This review created only this report inside the project. Existing EGM contracts, README files and application code were preserved. No dependency installation, credential/configuration change, commit or deployment was performed.
