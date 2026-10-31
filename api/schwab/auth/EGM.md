# Schwab OAuth actions

## Overview

Consolidated OAuth route retaining login, callback, refresh and disconnect URLs.

## Interface

- `[action].js` default handler dispatches `/api/schwab/auth/login`, `/callback`, `/refresh` (GET/POST), `/disconnect` (POST).
- [Shared OAuth/session helpers](../../_lib/EGM.md) store signed sessions, state and tokens.

## Invariants

- Callback requires code/state and the signed session cookie; stored state must match the session. It redirects to `SCHWAB_REDIRECT_AFTER_AUTH` or `/` with success/error query flags.
- Login and callback have no explicit method restriction in their action functions. Refresh permits GET and may refresh/persist tokens; disconnect requires POST but does not apply the operator-origin guard.
- This OAuth session is independent of the intelligence operator login. Secure cookies and registered callback URLs require deployment-aware local testing.

## Side Effects

- Creates cookies and Redis OAuth state, redirects to Schwab, exchanges codes, refreshes/saves/deletes tokens and clears the cookie on disconnect. Disconnect removes local tokens without an explicit upstream revocation request.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.
