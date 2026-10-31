# Operator-only provider and notification access

Status: reviewed and approved by the user; implemented and tested. See [implementation evidence](./IMPLEMENTATION-REPORT.md). Branch: `security/egm-provider-notification-hardening`.

## Problem and scope

The [drift report](../../EGM-DRIFT-REPORT.md) reproduces anonymous provider-key disclosure (S1), unauthenticated provider/notification use (S2), and a raw-prefix allowlist bypass (S3). An untrusted caller can currently obtain the market-data key, consume upstream requests or send messages to the operator. URL normalization can turn an apparently allowed path into a blocked options route.

This increment closes those entry points without changing production configuration, rotating credentials or deploying. Existing uncommitted work is preserved on the current branch; the branch is not a clean release artifact. Authentication uses the existing operator password/session service, independently of Schwab login. Broker API security and market-data freshness improvements remain separate milestones.

## Requirements and success criteria

1. Anonymous, malformed, expired and wrong-operator sessions cannot retrieve provider keys, request proxied market data or send email/Telegram. Failure paths perform no provider call and disclose no credential. Missing session returns 401; unauthorized session returns 403; access-store failure returns 503. Protected responses are private/no-store and vary on Cookie.
2. Existing authenticated REST queries and direct browser WebSocket authentication remain operational. The latter still reveals the long-lived provider key to an authenticated browser; this is an explicit residual risk, not a server-only credential claim. A relay/polling replacement is deferred.
3. Notification POSTs additionally require the exact configured Origin, JSON input, bounded text fields and shared atomic quotas. Provider errors are sanitized; no raw provider response or token-bearing URL is returned. Recipients remain server configured.
4. The proxy permits only the exact stock routes used by `src/lib/massive.js`, validates the same canonical URL it sends, rejects credential/query override, refuses redirects and handles malformed/non-JSON provider output without echoing arbitrary content.
5. The frontend offers operator login before mounting market-data consumers. Logout/session-expiry unmounts those consumers. Authentication failures never become persistent provider-entitlement failures. Existing browser journals and broker state are not migrated or deleted.
6. Regression tests reproduce the three original vulnerabilities, prove authenticated success, and exercise expired sessions, store failure, limits, malformed inputs and provider failures using synthetic secrets and mocked services. The existing suite and browser build must pass.

## Access design and boundaries

The normative Review clarifications below refine quota timing, input normalization, failure envelopes and local-mode setup for this section and the path/notification sections. All historical-preview/review references mean the existing `npm run preview:local` runtime, owned by `scripts/local-preview.mjs` and its `TRADEHUB_LOCAL_PREVIEW=true` flag; ordinary Vite owns `TRADEHUB_LOCAL_AUTH=true`.

Reuse `api/_lib/access.js`: `requireOperator`, `requireOrigin`, `privateResponse`, `reserve`, `jsonBody`, `AccessError`, `sendFailure`. No second password or broker-session shortcut is introduced. Protect both Polygon handlers and both notification handlers. Validate supported method before auth; validate input after auth; reserve quotas after input/config validation and before external effects. All responses get private/no-store headers before branching.

Provider quotas are per operator: REST 1,200 requests per fixed minute and WebSocket key reads 10/minute. Notifications are limited per operator and channel to 10/minute and 200/UTC day. Use Redis-backed atomic `reserve` in hosted mode; failure is closed with sanitized 503 and no network. Rate-limited requests return 429 with Retry-After. These bounds protect accidental bursts, not stolen authenticated-browser keys used directly at the provider.

For notifications, derive a SHA-256 deduplication key from normalized channel/input; an atomic one-send/30-second reservation suppresses identical repeats across instances. A duplicate returns 200 `{ok:true,deduplicated:true}` without sending. Quotas may count duplicates and failed sends conservatively; reservations are not refunded, and a failed/unknown send can suppress a retry for 30 seconds. Existing client fire-and-forget behavior remains compatible.

No new hosted authentication defaults: deployment still needs operator hash/ID, exact HTTPS app origin and Redis. Ordinary loopback Vite may set a development-only `TRADEHUB_LOCAL_AUTH` process flag; local in-memory sessions/non-Secure cookies require NODE_ENV=development, an explicit local flag and a configured HTTP loopback origin. Password and operator ID are still required. The historical preview retains its existing auto-session and disabled provider/broker behavior. Neither development mode is enabled in a production NODE_ENV. No real credential files are created by this work.

## Path and query policy

Upstream origin is exactly `https://api.polygon.io`. Accept ASCII route values only, length at most 512, no `%`, backslash, whitespace, `?`, `#`, repeated slash or `.`/`..` path segment. Reject before URL normalization; after parsing require equal pathname, fixed origin, empty search/hash and no username/password. This blocks literal, encoded and double-encoded traversal at the already query-decoded handler boundary. Never concatenate unvalidated paths in a shared fetch helper.

Ticker segments match `[A-Za-z0-9][A-Za-z0-9._:-]{0,31}`; dates match YYYY-MM-DD and must round-trip as real dates. Routes:

- `/v2/last/trade/{ticker}`
- `/v2/aggs/ticker/{ticker}/prev`
- `/v2/aggs/ticker/{ticker}/range/{positive integer}/{minute|hour|day|week|month}/{date}/{date}`
- `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`
- `/v2/snapshot/locale/us/markets/stocks/{gainers|losers}`
- `/v2/reference/news`, `/v3/reference/tickers/{ticker}`, `/v3/reference/short-interest`, `/vX/reference/financials`

Query allowlists by route family: aggregates `adjusted,sort,limit`; snapshots `include_otc`; news `ticker,limit,order,sort`; ticker details no extra query; short interest `ticker.eq,limit,order`; financials `ticker,timeframe,limit,order`. Reserved keys including case variants of apiKey, path, URL, headers, method and credentials fail rather than overriding server configuration. Reject arrays/objects, unknown keys, strings over 256 and invalid values. Limit integer 1..50000; sort/order asc/desc except news sort `published_utc`; booleans true/false; timeframe quarterly/annual/trailing; ticker values use the same ticker grammar. Aggregate multiplier 1..1000 and from<=to. Inject the server key last after validation and set `redirect:error`.

Bound provider fetches by the existing 10-second attempt timeout and one 429 retry. Keep the timeout active through body consumption. Parse provider JSON, preserve its HTTP status for valid provider JSON, and strip credential material if the provider echoes it. Do not return raw non-JSON, upstream exception messages or request URLs. Shared helpers revalidate paths/queries even when called directly. Provider missing key returns sanitized `env_missing`; input policy failures are 400; malformed upstream/timeout failures are 502.

## Notification input and delivery

Email accepts only subject (nonempty string <=200), html (nonempty <=20000), optional text (string <=10000). Telegram accepts message (nonempty string <=4096) and parseMode Markdown/MarkdownV2/HTML, default Markdown. Reject arrays, null/non-object bodies, unknown fields, invalid types and blank required fields. Overall JSON body <=32768 UTF-8 bytes. User-supplied recipient/from/URL cannot change server configuration.

Keep HTML email and Telegram formatting for authenticated operator functionality. This increment does not turn those into an arbitrary public messaging service. Apply a 10-second timeout covering response consumption and `redirect:error`, do not retry sends, and return only `{ok:true}` on provider success. Provider rejection, invalid upstream JSON, timeout or fetch error is sanitized 502, with no raw provider error or delivery details. Missing provider configuration is 503 before reservation/send.

## Frontend compatibility

Create `src/components/OperatorGate.jsx` around App in `src/main.jsx`. It verifies `/api/intelligence/session` before mounting App, reuses `OperatorAccess`, and provides a retry state for service failure. On login it rechecks the server; on `tradehub-operator-logout` or `tradehub-operator-expired` it unmounts App and shows login. Root gate uses cancellation/generation protection against stale session-check completions. The gate does not delete localStorage. Sign out is available from the authenticated gate and uses the existing logout endpoint; failure remains visible rather than pretending logout succeeded.

Auth failures returned by `sendFailure` set `X-TradeHub-Auth-Required:true`. `massive.js` checks that header before provider entitlement handling, dispatches expiry and stops that request without retries or permanent-denial recording. Fix endpoint pattern extraction to use the proxy's `path` parameter so one true provider 403 does not poison unrelated routes. Clear cached responses and denied endpoints on operator logout/expiry so data cannot be reused across sessions. Increment a shared session generation on those events: capture it at request start and reject stale requests/results before fetch, after every await/retry, before denial recording and before cache writes. Old-session success or 403 must not repopulate cleared state or dispatch a new-session expiry event. WebSocket auth failures handle the same header/event. Guard against creating a socket after async authentication was cancelled; do not persist keys. Root unmount closes the shared stream. Already-delivered keys cannot be revoked by application logout; authenticated credential exposure remains a deployment risk.

## Alternatives and risks

- Origin-only checks do not authenticate scripts and are rejected as the primary protection.
- Broker sessions do not identify an authorized TradeHub operator and are not reused.
- A streaming relay would remove browser key delivery but adds persistent transport, provider-usage and hosting decisions. This narrowly scoped increment authenticates key delivery and records the residual risk instead of claiming full credential confinement.
- A whole new identity provider is unnecessary for this single-operator app; existing password/hash, cookies, store and quotas are reused.
- The application-wide gate changes previously anonymous access to local-only tools; records remain intact and authenticated tools remain available. Access-store availability becomes a dependency for provider access. Deployment must configure the existing authentication service before enabling the branch.
- In-flight upstream requests cannot be recalled after logout; authentication is checked per new request. Multiple quota reservations are individually atomic, not a single transaction; conservative quota consumption on later failures is accepted.

## Review clarifications

These are normative refinements to the access, path, notification and frontend contracts above. While authenticated, the gate verifies the session every 60 seconds and on focus/visible restoration, with a five-second request timeout. Invalid session or verification failure unmounts consumers and clears market state; service failure offers retry. Detection is bounded by 65 seconds while the browser schedules timers; throttled/suspended tabs verify immediately when active again. A timestamp/nonce-only `th-operator-logout` localStorage signal propagates logout/expiry to other tabs; it contains no credentials. Storage events invalidate without rebroadcast; same-window events still handle the originating tab. Test expiry with an open socket/no REST work and cross-tab logout. The server remains authoritative per request, and delivered provider credentials cannot be revoked this way.

Minute bucket = floor(epoch milliseconds/60000), retained for 120 seconds. Daily bucket = UTC YYYY-MM-DD, retained for 172800 seconds. All quota rejection uses Retry-After:60, including daily rejection (it is a retry hint, not a promise that the daily budget resets in 60 seconds). Notification reservation order is minute, day, dedup; no refunds. Dedup input is JSON.stringify of channel plus an object in fixed field order: email subject,html,text; Telegram message,parseMode. Preserve supplied text exactly; trim only to test required nonblank content. Omitted/empty optional email text is omitted from the canonical object; omitted parseMode becomes Markdown. Dedup expires 30 seconds after first reservation and counts as a successful suppressed request.

Last-trade and ticker-details routes allow no query keys. All permitted query fields are optional; supplied values must be nonempty strings, including direct shared-helper calls. Null, undefined, arrays, numbers and booleans are rejected if explicitly present. Integers use decimal digits without a sign, leading zeros or exponents. Date validity, order and exact parameter bounds apply before network access. Empty optional query fields must be omitted by callers, not forwarded.

Missing provider key returns 503 env_missing. Upstream non-JSON, empty/bodyless status including 204, malformed JSON, redirect or timeout returns 502 upstream_unavailable; valid JSON preserves upstream HTTP status. Credential redaction recursively visits object keys, values and arrays and replaces literal and URL-encoded configured provider-key occurrences with [REDACTED]. No upstream exception message is included. Notification success additionally requires a JSON object with nonempty string id (Resend) or ok:true (Telegram); all other shapes are 502. Only safe application success/failure envelopes leave notification handlers.

Ordinary Vite sets TRADEHUB_LOCAL_AUTH=true in its process after verifying configured bind host is 127.0.0.1, localhost or ::1 and port is valid. Its default origin is http://{bound host}:{port}, with IPv6 brackets. A supplied TRADEHUB_APP_ORIGIN must equal that origin or startup fails with a names-only configuration error. No password/ID is generated. The access helper permits local memory/non-Secure cookies only when NODE_ENV=development, either local flag equals the exact string true, and configured origin is a bare HTTP loopback origin (no credentials/path/query/hash). An invalid origin disables local mode; production NODE_ENV always disables it. Vercel runtime skips the Vite adapter, and historical review keeps its existing process configuration.

## Detailed Implementation Plan

1. Modify `api/_lib/access.js` only for bounded loopback local-mode detection and the auth-required response header. Preserve existing hosted login/hash/session semantics. Add `api/_lib/providerAccess.js` for shared method/auth/quota checks; constants: REST 1200/minute, ws-auth 10/minute.
2. Replace prefix validation in `api/_lib/polygon.js` with exact-route parsing and route-family parameter validation; enforce again inside `polygonFetch`, inject key last, reject redirects, bound/read/parse JSON, sanitize echoed key material and errors. Update `api/polygon/proxy.js` and `ws-auth.js` with shared auth, private headers and sanitized failures. Keep authenticated ws-auth `{apiKey}` response shape.
3. Add `api/_lib/notifications.js` for validation, quotas, dedupe and delivery; replace both notification handlers with thin channel wrappers. Reuse access helpers; server-recipient-only; no provider output passthrough.
4. Add the root operator gate, update sign-in explanation, and adjust Massive auth-error handling/cache isolation and cancellation as specified. These changes are necessary to preserve authenticated functionality when legacy market routes become private. No broker implementation or report analytics changes.
5. Complete `scripts/vite-api.mjs` development configuration with process-only local auth/origin defaults, without creating credentials. Update local API tests for newly protected endpoints. Historical preview must continue owning its own middleware; native Vercel runtime still owns hosted routing.
6. Add `tests/security-regressions.test.js` for real login/session-backed handler regression tests, shared-helper bypasses, static/encoded traversal, reserved parameters and allowed routes; use mocked fetch/Redis and synthetic passwords/keys. Extend stream/client tests and add gate lifecycle tests, including delayed response after logout. Do not call real providers or send notifications.
7. Run targeted security/client/gate/local API tests, `npm test`, `npm run build`, and whitespace/link checks. Save review findings, resolution evidence and final test counts. Update affected EGM contracts and README operational instructions; preserve the drift report as a dated baseline. No commit, push, deployment, credential rotation or production configuration change is part of this increment.

## Acceptance matrix

| Case | Required result |
| --- | --- |
| Anonymous/expired/wrong operator on all four protected handlers | 401/403, private/no-store, no provider call, no key |
| Access store fails | sanitized 503, no provider call |
| Signed-in valid stock routes and queries | provider JSON/status preserved, fixed host, server key last |
| Literal/encoded/double-encoded traversal, prefix suffixes, query/hash, caller key | 400 before fetch, no user input echo |
| Direct helper call with bypass path | rejected before fetch |
| Redirect/non-JSON/error echoing credential | safe failure/redaction, no credential in output |
| Notification absent/wrong origin, malformed/oversized/type-invalid body | 403/400/413/415, no send |
| Signed-in valid email/Telegram | fixed configured recipient and one mocked send |
| Rate exceeded/identical repeat/store failure | 429/deduplicated 200/503, no extra send |
| Logout/expiry during gate or socket authentication | app unmounted; stale check cannot remount; pending auth cannot create socket |
| Provider denial versus app auth denial | endpoint-local permanent denial versus reauthentication; no cross-endpoint poisoning |
| Local ordinary dev/historical review/production NODE_ENV | explicit login/retained historical auto-session/no development auth bypass |

## Release boundary

After tests pass, prepare an exact diff that excludes unrelated dirty-worktree changes. Before any deployment, verify operator/Redis/origin configuration by presence only, review browser-key residual exposure and choose whether it is acceptable or requires relay work first. Obtain explicit approval for a protected preview deployment, test anonymous denial and authenticated flows there with sanitized evidence, then obtain approval before production deployment or credential rotation. Do not assume this checkout or existing main-branch auto-deploy configuration is safe to push.
