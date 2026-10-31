# TradeHub architecture blueprint

## System Overview

TradeHub is a React 18 single-page personal trading workspace, built with Vite and backed by Vercel filesystem-routed serverless handlers. Browser-local state holds journals, settings, research observations and caches. Upstash Redis holds broker sessions and selected server-side access/budget state. There is no application database migration or independent backend server in this repository.

Two data paths coexist. Legacy trading tools request live market data through the Massive/Polygon proxy and browser WebSocket connection, with REST fallback. Market Intelligence consumes a protected historical report prepared by the sibling `trade-decision-engine` Python application. The Market Map presents supplied regime and daily-feature evidence; Options Positioning presents matched archived contracts by expiration. Neither the map nor deterministic analyst interpretations constitutes a live analytics engine in this checkout.

This bootstrap documents the current local working tree, including changes already present before the bootstrap. It does not establish which changes are deployed. Existing README deployment statements and historical production comparisons were read as documentation, not independently verified against Vercel.

## Interface

- [Frontend](./src/EGM.md): PLAN, TRADE and REVIEW navigation, workspace state and UI.
- [API](./api/EGM.md): Massive proxy/key-return route, optional Schwab OAuth/read paths, protected intelligence delivery, billable AI policy, earnings and notifications.
- [Offline tools](./scripts/EGM.md): deterministic narratives, archive adapters, local review server and browser checks.
- [Data contracts](./contracts/EGM.md): versioned Python input and browser transport schemas with analyst and options extensions.
- `index.html`, `src/main.jsx`, `vite.config.js`, `package.json`: browser entry and build/development configuration.
- `vercel.json`: SPA rewrite excludes `/api/`, leaving API routes to the Vercel runtime.
- `docs/schwab-integration.md` documents the broker protocol. `integration/` and `server/` currently contain no source files. Tests are intentionally excluded from component-contract generation.

## Invariants

- Historical report time, source observation time, retrieval time and current execution readiness are separate concepts. Samples cannot establish current-session trade readiness.
- Options OI is concentration evidence, not directional investor intent. Gamma signs depend on hypothetical inventory assumptions; missing history, missing expirations and incomplete flow remain visible.
- Actual journals, research hypotheses, paper trading and broker observations have distinct semantics and storage. Preserve existing storage keys and provenance.
- Private reports, local review artifacts and secrets stay out of public static assets. `.gitignore`, `.vercelignore` and Vite filesystem deny rules cover the private directories; this does not establish end-to-end production authorization for every API route.
- Existing README files are preserved. This bootstrap writes only `EGM.md` documentation and performs no application edits, environment changes, dependency installation, provider calls or deployment.

## Local development and Vercel

| Mode | What runs | Data and state implications |
| --- | --- | --- |
| `npm run dev` | Vite frontend | No API proxy or Vercel handler emulation is configured. API-dependent features cannot be assumed to work. |
| `npm run preview:local` | Custom loopback Vite middleware on port 4180 | Ephemeral protected historical review, live Massive/broker/billable AI disabled, public Nasdaq earnings enabled. It loads an ignored report from disk. |
| `npm run build` / `npm run preview` | Static build / static preview | A build verifies browser compilation; static preview does not supply serverless APIs. |
| Vercel | Static SPA and `api/` functions | Requires separately configured server credentials, Redis and callback/origin settings. Ignored local reports are not deployed, and local filesystem paths are not a production report service. |

The preview script configures its own process environment when launched; it was inspected but not executed during this bootstrap. Browser localStorage and cookies differ by origin, so local journal/session/cache state is separate from the Vercel site. The README describes main-branch auto-deployment; actual project settings, credentials, entitlements and deployed revision were not inspected.

## Side Effects

Runtime operations can call Massive/Polygon, Nasdaq, Anthropic, Schwab and notification providers, update Redis, create cookies, and persist browser state. Offline preparation reads the sibling engine's archived JSON/SQLite and writes private derived reports. Paper trading and educational estimates are not brokerage execution. See package contracts for route-specific boundaries and incomplete broker synchronization scaffolding.

## Potential problems and documentation gaps

1. **Inconsistent access boundaries.** Protected operator intelligence/AI access and broker sessions coexist with legacy provider and notification handlers. The WebSocket authentication path returns a provider credential to the browser. Complete a route-by-route authentication and credential exposure review before expanding production functionality.
2. **Historical review lacks a production report lifecycle.** Report loading is fixed to an October 26 sample and configured filesystem path; preparation depends on a sibling repository, interpreter and archive. Define versioned report delivery, freshness, lineage, entitlement and error behavior before treating Market Intelligence as a production service.
3. **Parity and operational documentation are incomplete.** Vite, loopback review and Vercel are different runtimes. There is no verified deployment inventory or credential-backed parity result in this bootstrap. A mode matrix, environment-variable reference with names only, endpoint smoke checks and deployment revision tracking would make failures easier to diagnose.
4. **Existing prose has drifted.** `CLAUDE.md` describes older tabs, direct browser Anthropic calls and older credential handling, while code now contains server AI and broker session helpers. Options-entitlement descriptions differ across legacy documents. Keep operational claims tied to code and separately verified account capabilities.
5. **Validation is incomplete by design.** Frozen research scenarios and historical pricing estimates are not held-out performance evidence. Missing OI history, bounded samples, archive matching and permissive nested schema areas need explicit coverage and evaluation policies before stronger conclusions.

## Three recommended improvement areas

1. Unify API access policy and remove unnecessary browser credential exposure; inventory every route, distinguish operator and broker sessions, constrain notification abuse and verify origin/cookie behavior.
2. Build a reproducible, versioned intelligence delivery boundary around the existing Python engine. Preserve per-expiration source identity, missing-data states and timestamp semantics; replace fixed local sample assumptions with an explicit reviewed production lifecycle.
3. Establish reliable local-to-production verification and maintained operational contracts. Cover service availability, freshness, entitlements, API routing, broker read paths and UI unavailable states in each supported mode; reconcile legacy documentation and identify a deployed revision.

These are recommendations, not implemented changes.

## Verification

- Repository test target: `npm test` (`vitest run`). Python adapter checks: `python3 -m unittest discover -s scripts -p 'test_*.py'`, with sibling-engine dependencies where required. Build target: `npm run build`.
- Browser checks and prerequisites are listed in [scripts](./scripts/EGM.md). They can launch browsers, access services or write local artifacts, so they were not run for this documentation-only bootstrap.
- Bootstrap verification reads every generated contract, checks populated Interface/Invariants/Side Effects sections, Markdown fences and relative links, and confirms generated files are documentation only.
- Scouts used bounded source reads (50 KB per directory and at most 300 lines per file). Native worker slots were available for three independent partitions; deeper scouts used inline read-only fallback when capacity was exhausted. This documents architectural contracts rather than claiming a complete security audit or exhaustive review of every implementation branch.

## Coverage

Full-tree discovery excluded hidden/system/generated/dependency directories, ignored private reports and local artifacts, symbolic links, test-only folders and Python bytecode caches. Empty `integration/` and `server/` and prose-only `docs/` do not receive code contracts. The schema-only `contracts/` directory is included as a central public data boundary. Archived source directories are documented as archived rather than silently treated as active implementations.

## Reviewed remediation and first live-data increment

The historical drift findings are preserved as a baseline. Operator authorization, notification protection and canonical stock transport validation are implemented; see [security evidence](docs/security/IMPLEMENTATION-REPORT.md). Authenticated legacy browser key exposure remains. The reviewed M2.0/M2.1 implementation adds a separate authenticated Python-backed, read-only ETF context and shared account admission; see [implementation evidence and activation dependencies](docs/market-data/M2-0-M2-1-IMPLEMENTATION-REPORT.md). Its feed remains unverified until approved deployment evidence; this is not a live-production readiness claim.

## Provider confinement update

The reviewed confinement increment supersedes earlier browser-key statements in this contract. Source ws-auth is now an authenticated410 tombstone that never reads/delivers a provider key. Legacy observations use authenticated shared REST polling with field invalidation and session cancellation. Shared account admission has an independent enforcement flag and separate optional budget-store credentials. Production remains unchanged until explicitly deployed; previously copied keys remain valid until separately revoked. See docs/preview/PROTECTED-PREVIEW-RUNBOOK.md and IMPLEMENTATION-REPORT.md.
