# Schwab Integration

Read-only Schwab Individual Trader API integration. Built as Vercel serverless
functions. The browser never sees the app secret or any tokens.

## What it gives you

| Feature | UI surface |
|---|---|
| Buying power, cash, liquidation value, positions | Command tab broker card |
| Pattern Day Trader (PDT) count | Header badge + Command card |
| Real-time equity quote | Hook `getQuote(symbol)` (no UI surface yet) |
| Option chain with greeks | Calculator tab "Get Live Ask" button |
| Today's filled orders | Journal tab "Sync from Schwab" button |

There is no order placement. The Stage Order modal copies an OCC symbol to the
clipboard and opens Schwab Trade; you confirm in Schwab manually.

## Environment variables

Required in Vercel (Production + Preview):

| Variable | Source |
|---|---|
| `SCHWAB_APP_KEY` | App registered at developer.schwab.com |
| `SCHWAB_APP_SECRET` | Same app, secret tab |
| `SCHWAB_CALLBACK_URL` | Must exactly match the callback URL registered with Schwab. Example: `https://trade-hub-1.vercel.app/api/schwab/auth/callback` |
| `SCHWAB_REDIRECT_AFTER_AUTH` | Where to send the browser after the OAuth round-trip completes. Typically the SPA root, e.g. `https://trade-hub-1.vercel.app/` |
| `SCHWAB_SESSION_SECRET` | 32-byte hex string. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `KV_REST_API_URL` | From the Vercel Marketplace Upstash Redis integration |
| `KV_REST_API_TOKEN` | From the same integration |

Rotating `SCHWAB_SESSION_SECRET` invalidates every session cookie, forcing all
users to reconnect (a fine outcome for an internal single-operator app).

## First-time auth flow

1. User opens Command tab → Broker card → clicks **Connect Schwab**.
2. SPA navigates to `/api/schwab/auth/login`. The endpoint mints a session id
   if needed, stamps an HttpOnly signed cookie (`th_sess`), writes a CSRF
   `state` row to KV with a 10-min TTL, and 302s to Schwab's authorize URL.
3. User logs into Schwab, picks the linked brokerage account, and approves.
4. Schwab redirects to `SCHWAB_CALLBACK_URL` (our `/api/schwab/auth/callback`)
   with `?code=...&state=...`.
5. The callback verifies the `state` against the KV row bound to the session
   cookie, exchanges the code for tokens, writes them to
   `schwab:tokens:<sessionId>` in KV, and 302s to `SCHWAB_REDIRECT_AFTER_AUTH`
   with `?schwab_connected=1`.
6. The SPA's `useSchwab` hook detects the marker on mount, clears it from the
   URL, and refreshes account state.

If any step fails, the callback redirects to `SCHWAB_REDIRECT_AFTER_AUTH` with
`?schwab_error=<code>`. The hook surfaces this as `lastError`.

## Token lifecycle

- **Access token**: 30 minutes. The shared lib refreshes automatically when
  any endpoint runs and the access token is within 5 minutes of expiry. The
  refreshed token is written back to KV so the next call uses it.
- **Refresh token**: 7 days. There is no way to extend it; the user must
  reconnect every week. Within 24 hours of refresh-token expiry, every
  endpoint response includes `warning: "...reconnect soon."` which the hook
  bubbles up. When the refresh token has actually expired, the next call
  returns 401 + `code: "REFRESH_EXPIRED"`, the hook flips
  `isConnected` to false, and the Command card swaps back to the
  Connect button.

## KV layout

| Key | Value | TTL |
|---|---|---|
| `schwab:state:<random-hex>` | `{ sessionId, createdAt }` | 600 s |
| `schwab:tokens:<sessionId>` | `{ access_token, refresh_token, expires_at, refresh_expires_at, account_hash, account_number }` | 7 days |

`account_hash` is Schwab's per-account opaque identifier required for every
per-account call. It's looked up once after first auth and cached on the
token row so we don't ping `/accountNumbers` repeatedly.

## Endpoints

All endpoints are read-only and check the session cookie first. Errors come
back as `{ error: "human readable", code: "MACHINE_CODE" }` with the matching
HTTP status.

| Method + path | Purpose |
|---|---|
| `GET  /api/schwab/auth/login` | Start OAuth, 302 to Schwab |
| `GET  /api/schwab/auth/callback` | OAuth return, 302 to SPA |
| `POST /api/schwab/auth/refresh` | Manual refresh trigger (also automatic) |
| `POST /api/schwab/auth/disconnect` | Drop tokens, clear session cookie |
| `GET  /api/schwab/account` | Balance, positions, PDT count |
| `GET  /api/schwab/chain?symbol=&expiry=&type=&strike=&strikeCount=` | Option chain with greeks |
| `GET  /api/schwab/quote?symbol=` | Real-time equity quote |
| `GET  /api/schwab/orders` | Today's filled orders |

Behavior shared across endpoints:

- 10-second timeout on every upstream Schwab request
- One retry on 429 with backoff capped at 4 s
- 502 + `code: "UPSTREAM_ERROR"` on any non-2xx upstream other than 429 / 401
- 401 + `code: "TOKEN_REJECTED"` when Schwab refuses the bearer token (forces
  the hook to drop into "not connected" state)

## Common error codes

| Code | Meaning | What the hook does |
|---|---|---|
| `NOT_CONNECTED` | No tokens in KV for this session | `isConnected = false`, no error toast |
| `REFRESH_EXPIRED` | 7-day refresh token aged out | `isConnected = false`, warning surfaced |
| `RATE_LIMITED` | Schwab returned 429 after retry | `lastError` set, UI button stays clickable |
| `UPSTREAM_ERROR` | Non-2xx from Schwab | `lastError` set with status |
| `BAD_REQUEST` | Missing query param (eg. symbol) | Caller's bug, surfaced as error |

## Testing

OAuth cannot be exercised against `localhost` because Schwab does not redirect
to non-public callback URLs. Test against the Vercel preview deploy or
production. All non-OAuth endpoints can be tested locally with a session
cookie copied from the browser; the access token will be auto-refreshed when
its KV entry expires.

## Local development without Schwab

`useSchwab` returns `isConnected: false` and no-op handlers when the user
hasn't connected. UI components fall back to their pre-Schwab behavior
(manual entry of ask price, manual journal entries). You can build and test
the rest of the app with no Schwab env vars set.
