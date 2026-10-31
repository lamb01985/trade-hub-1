# Schwab debug actions

## Overview

Conditional inspection endpoints for session identity and raw filled orders.

## Interface

- `[action].js` default GET handler dispatches `/api/schwab/debug/whoami` and `/orders-raw`.
- Orders query accepts `accountHash`, `from`, `to`, `status`, `maxResults`; defaults to the current UTC day, FILLED, 250 results.
- [Shared Schwab/sync helpers](../../_lib/EGM.md) resolve session/account access and errors.

## Invariants

- All routes return 503 unless `DEBUG_PASSTHROUGH_SECRET` is configured. Once enabled, a matching debug header selects operator configuration; otherwise any valid signed Schwab session cookie is accepted without that header.
- Whoami reveals the resolved session identifier. Orders-raw returns account hash and unredacted execution data; enabling the flag expands the account-data inspection surface.
- Only GET is accepted; successful responses explicitly disable caching.

## Side Effects

- Reads caller identity and configured operator session, fetches raw Schwab orders and may refresh/save OAuth tokens through shared helpers.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.
