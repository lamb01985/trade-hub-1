# Intelligence session and report routes

## Overview

Dynamic action route for operator sessions and the licensed report sample.

## Interface

- `[action].js` default handler: GET `/api/intelligence/session`; POST `/login` with JSON password; POST `/logout`; GET `/latest`.
- [Access/report helpers](../_lib/EGM.md) own the cookie, TTL state, password verification and report adapter boundary.

## Invariants

- Session checks convert only 401/403 to `{authenticated:false}`; store failures remain failures.
- Latest requires operator authentication and reserves at most 30 reads/operator/minute. Login/logout enforce the configured origin.
- Latest delegates to the date-pinned filesystem sample loader, so report publication and runtime file availability are separate operational requirements.

## Side Effects

- Creates/deletes operator session state and cookies, reserves rate-limit state, reads report JSON from configured disk storage and returns private/no-store data.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.
