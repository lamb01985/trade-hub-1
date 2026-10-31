# AI routes

## Overview

Authenticated Anthropic proxy exposed through a Vercel dynamic action route.

## Interface

- `[action].js` default handler: GET `/api/ai/status`; POST `/api/ai/brief`, `/wheel-ai`, `/eod-coach`, `/short-thesis` with JSON `{prompt,maxTokens?}`; returns `{content,model}`.
- [Shared policy and access](../_lib/EGM.md) provides operator validation, origin enforcement, input bounds and reservations.

## Invariants

- Every route requires the operator session; POST requires the configured origin and JSON content type. Unknown actions are 404; wrong methods are 405.
- Budget is reserved before upstream invocation. A 25-second abort timer bounds the request; failures still consume reservations. Status exposes configuration/model, never the key.
- All four action names use the same generic caller-supplied prompt path; server-side action-specific prompt templates are absent.

## Side Effects

- Sends prompt text to Anthropic, consumes paid usage and Redis reservations, and emits private/no-store responses. Upstream non-429 failures map to 502; unexpected errors map to sanitized 503.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.
