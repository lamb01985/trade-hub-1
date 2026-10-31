# API shared services

## Overview

Server-only access, AI policy, market-data, licensed-report, OAuth and trade-sync helpers consumed by API handlers.

## Interface

- `access.js`: `AccessError`, `stateGet/Set/Delete`, `reserve`, `privateResponse`, `requireOrigin`, `requireOperator`, `login`, `logout`, `sendFailure`, `jsonBody`.
- `aiPolicy.js`: AI limit constants, `aiConfiguration`, `validateAiInput`, `reserveAiBudget`.
- `polygon.js`: `isAllowedPath`, `requireApiKey`, `polygonFetch`; exact canonical stock path/query allowlist, response credential redaction and server-key injection.
- `reports.js`: `loadSample()` adapts a configured JSON report through `/src/lib/reportContract.js`.
- `schwab.js`: signed-session cookie helpers, OAuth state/token persistence, authorization URL/code exchange, `getValidTokens`, and `schwabFetch`; handlers also consume its account/error wrappers.
- `tradeSync.js`: `operatorSessionId`, `ensureOperatorTokens`, stored fill/trade/meta loaders, `persistSyncResult`, `recordSyncError`, `resolveSyncCaller`.

## Invariants

- Operator authentication uses `th_operator`, hashed session keys, an eight-hour session and global 10-attempt/15-minute login cap. Mutation origins must exactly match `TRADEHUB_APP_ORIGIN`; nonlocal origin must use HTTPS.
- Only `NODE_ENV=development`, an explicit local preview/auth flag and a bare HTTP loopback app origin enable access-state memory storage and an operator cookie without Secure. Hosted access state requires Upstash; Schwab/sync helpers independently use Redis even in that local mode.
- AI requires explicit billing enablement, configured key, pinned `claude-sonnet-4-6` model and positive daily budget at most $10. Prompt/output limits are 32,000 UTF-8 bytes/4,000 tokens; three requests/minute. Spend reservations are global per UTC day and never refunded.
- Report loading accepts at most 8 MiB and only `report_date=2026-10-26`; `latest` therefore serves a pinned sample, not a rolling report. The configured file must be available in the server runtime; a local filesystem path alone does not establish Vercel availability.
- Schwab uses separate signed `th_sess` cookies (Secure, HttpOnly, SameSite=Lax), ten-minute state rows, seven-day token storage and refresh within five minutes of access expiry. Operator login does not authorize Schwab routes.
- Trade-sync records are keyed by Schwab session; cron bearer authorization selects `OPERATOR_SESSION_ID`. Reconnecting creates a new session and requires operator configuration alignment.
- Scouting read at most 300 lines/file and below 50 KB for this directory. The tail of `schwab.js` was outside that limit; account/error helper details are inferred only from handler call sites, not fully verified here.

## Side Effects

- Access controls mutate Redis or process-memory TTL entries, set cookies and private-cache headers; production reservations use atomic Redis Lua.
- Calls Anthropic indirectly through handlers, Polygon REST directly, and Schwab OAuth/data services. Polygon REST retries one 429 after 500 ms with a 10-second timeout per attempt.
- Reads the explicitly configured report file from disk. This bootstrap did not open report data or credentials.
- Saves OAuth states and plaintext token objects in Redis; state consumption uses separate get/delete operations. Token refresh is not protected by a cross-request lock in the sampled implementation.
- Persists fills/trades/meta through separate concurrent writes without a transaction or TTL; partial writes and concurrent sync races are possible.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.

## Unified ETF boundary

`marketDataGateway.js` validates exact resource/query contracts, requires operator access, sends only the configured service bearer/audience and validates closed envelopes before returning JSON. `marketDataBudget.js` and `marketDataAdmission.lua` share an atomic Redis-time rolling account parent with Python. Unified-enabled legacy `polygonFetch` reserves each retry independently. Missing policy/store fails closed; server REST admission cannot control copied browser WebSocket keys. The Lua file and JSON schema must be included in any future function bundle and verified in an approved preview.

## Provider confinement update

The reviewed confinement increment supersedes earlier browser-key statements in this contract. Source ws-auth is now an authenticated410 tombstone that never reads/delivers a provider key. Legacy observations use authenticated shared REST polling with field invalidation and session cancellation. Shared account admission has an independent enforcement flag and separate optional budget-store credentials. Production remains unchanged until explicitly deployed; previously copied keys remain valid until separately revoked. See docs/preview/PROTECTED-PREVIEW-RUNBOOK.md and IMPLEMENTATION-REPORT.md.
