# API subsystem

## Overview

Vercel-style serverless HTTP handlers and shared services for market data, broker connectivity, AI, notifications and licensed intelligence.

## Interface

- `calendar-earnings.js`: public GET `/api/calendar-earnings?date=YYYY-MM-DD` proxies the Nasdaq earnings calendar.
- `notify-email.js`: POST `{subject,html,text?}` sends Resend email to the server-configured recipient.
- `notify-telegram.js`: POST `{message,parseMode?}` sends Telegram text to the server-configured chat.
- [Shared services](./_lib/EGM.md), [AI](./ai/EGM.md), [intelligence/authenticated reports](./intelligence/EGM.md), [Massive / Polygon](./polygon/EGM.md), [Schwab](./schwab/EGM.md).

## Invariants

- Calendar requires a real round-trippable ISO calendar date, accepts only GET, and distinguishes null rows (empty) from invalid upstream shapes. Its upstream timeout is eight seconds.
- Notifications require operator-authenticated POST, exact configured Origin, bounded JSON and fixed server recipients. Atomic per-channel limits are 10/minute and 200/UTC day; identical normalized payloads deduplicate for 30 seconds.
- Operator sessions protect provider/notification routes; Schwab OAuth sessions remain a separate access boundary. Local preview and hosted handlers must be checked separately; Vite alone is not evidence that API routes are served.
- Never place provider credentials or licensed report contents in static/public assets. Environment configuration is referenced by name only in these contracts.

## Side Effects

- Calendar calls Nasdaq and caches successful responses publicly for one hour with one-day stale revalidation. Notifications send real external messages through Resend/Telegram and may incur account usage.
- Child handlers can call Anthropic, Polygon and Schwab, mutate Redis/cookies and read a configured private report file; see their contracts for exact boundaries.

## Verification

From the repository root, run `npm test` (configured as `vitest run`). This is the project test command, not evidence that every route or external integration has coverage. Documentation-only bootstrap did not invoke providers or send notifications.
