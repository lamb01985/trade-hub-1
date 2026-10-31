# Massive / Polygon transport routes

## Overview

Authenticated legacy stock REST and direct browser WebSocket access. The new unified market-data layer is separate.

## Interface

- GET `/api/polygon/proxy?path=...` requires the operator session, validates exact stock paths and per-family query keys, and injects the server key last.
- GET `/api/polygon/ws-auth` requires the operator session and returns HTTP410 STREAMING_CREDENTIAL_DELIVERY_RETIRED; it never reads or returns a provider key.
- Both routes apply private/no-store responses and atomic per-operator limits: REST 1,200/minute; key reads 10/minute.

## Invariants

The transport helper repeats canonical path/query validation, refuses redirects, bounds attempts through body parsing, and redacts literal/encoded provider credentials from valid JSON. Missing configuration is 503; malformed upstream output is sanitized 502. Anonymous, expired and wrong-operator requests perform no upstream work. Application authentication failures carry `X-TradeHub-Auth-Required`; provider entitlement denials do not.

## Remaining risk

Older deployed versions may still deliver the long-lived provider key; the new code retires that delivery. Session expiry clears application state and closes sockets, but cannot revoke a copied key or enforce provider budgets on direct outside requests. Retiring this route requires a separately approved migration/relay and consideration of credential rotation.

## Verification

`tests/security-regressions.test.js`, `tests/market-auth-client.test.js`, `src/lib/massiveStream.test.js` and `tests/operator-gate.test.jsx` cover these boundaries with synthetic credentials. See [completion evidence](../../docs/security/IMPLEMENTATION-REPORT.md).

## Provider confinement update

The reviewed confinement increment supersedes earlier browser-key statements in this contract. Source ws-auth is now an authenticated410 tombstone that never reads/delivers a provider key. Legacy observations use authenticated shared REST polling with field invalidation and session cancellation. Shared account admission has an independent enforcement flag and separate optional budget-store credentials. Production remains unchanged until explicitly deployed; previously copied keys remain valid until separately revoked. See docs/preview/PROTECTED-PREVIEW-RUNBOOK.md and IMPLEMENTATION-REPORT.md.
