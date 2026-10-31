# Protected-preview preparation completion

Status: local implementation and isolated candidate preparation complete; activation remains blocked. Nothing was deployed, pushed, rotated or changed in production. No provider probe or live preview service was activated. Existing deployments and previously delivered keys are not changed by local code.

## Ready

Long-lived Massive key delivery is removed from the new browser code. The old endpoint is an operator-authenticated410 tombstone, with no key read, credential response or provider call. Shared credential-free REST polling preserves legacy trade/quote callbacks and authenticated REST access, with per-ticker invalidation, response-body deadlines, cancellation, subscription reference counts, entitlement fallback/cache and server Retry-After propagation. Transport labels say REST/source recency unverified rather than real-time WebSocket. Snapshot and last-trade identities are checked; fallback uses documented results.T and NS event time. Missing/invalid observations clear prior values.

Independent MASSIVE_BUDGET_ENFORCED keeps Node/Python account admission active when Unified is disabled. Dedicated budget-store variables allow a common account parent without sharing preview operator sessions. Unknown policy/store/rights fail closed or remain explicitly unavailable/UNKNOWN. No quota was increased or shared policy created.

The protected-preview candidate has fail-closed server mode discovery, a Unified-only UI, a strict alternate Vercel API route inventory, explicit schema/Lua bundling, configuration-only preflight, gated entitlement/API verifiers, a dedicated one-worker Python application and Dockerfile, and a documented stop/rollback procedure. Broker, scanner, notification, AI and historical endpoints are not enabled in this bounded preview. Original functionality/unrelated work remains in the original repositories.

Five independent EGM design stages completed. The final code audit’s two Majors—denied-family polling and missing service-denial verification—were fixed and independently rechecked. The preview verifier does not pass UNKNOWN data or omitted negative-canary checks as successful live verification.

## Test evidence

Final full frontend results: original **197 tests / 27 files**, isolated **156 tests / 19 files**, both builds passed; original Python398 tests passed, no skips; isolated Python376 tests passed, no skips. Python integration runs used temporary local PostgreSQL, not production. Focused Python security/data tests46 passed. Real Redis tests passed100 simultaneous mixed-environment callers, four leases, common total/new limits, duplicate rejection, policy mismatch, expiry and release without refund. Node/Python Lua bytes and protocol fixtures matched. Browser bundle scans found no provider WebSocket URL or ws-auth request path. Synthetic secrets and mocked responses were used in regression tests.

The local runtime image build passed and was never started/pushed. Recorded local OCI manifest: sha256:89d0a57397586074096545afc58ec2e80df844ac8c11f3c5340f610b6c608fff. The approved target architecture and immutable registry artifact remain release steps. Existing Vite/large-bundle/module-format and Starlette/httpx deprecation warnings remain; no test failure is being hidden by those warnings.

## Isolated work

Frontend: preview/egm-protected-live-data in /Users/sarahlambertson/Desktop/tradehub-protected-preview. Python: preview/egm-protected-market-service in /Users/sarahlambertson/Desktop/trade-engine-protected-preview. Candidates are local and uncommitted for review, with no pushes. Mixed files were reconstructed from committed HEAD plus intended hunks; historical research/AI/calendar and frozen strategy edits were excluded. Original source indexes were not changed. Private content was not copied. See ISOLATION-MANIFEST.md for exact inclusion/exclusion and preservation evidence.

## Requires owner action before launch

Vercel metadata access returned403, so deployment account/key association, Options Standard rights and actual deployment recency remain unverified. Only local engine key presence was observed; it was not treated as deployment proof or used for probes. The preview’s operator/service/Redis/account configuration is missing and preflight correctly reports not ready.

Confirm the actual account/rights/quota and producer inventory; choose the dedicated Vercel project, HTTPS Python target and exact app origin; securely provision Preview-only credentials and the authorized common budget policy; enable/verify deployment protection. Then explicitly approve that named preview and bounded checks. Follow PROTECTED-PREVIEW-RUNBOOK.md for commands. Deployed bundling/routing/protection, browser-to-service behavior and negative authentication scenarios remain end-to-end tests, not local-test claims.

Verified-recency registration is still an M2.1 activation dependency. This code deliberately leaves feed recency UNKNOWN. After approved evidence/registration, measure each ETF over a full RTH session under the99% CURRENT quote-pair rule. Do not infer success from a plan name or loosen thresholds. Options analytics, VIX/futures, daily-session semantics and action evaluation remain later increments.

## Rollback and residual risks

Default rollback is preview OFF. Stop only its dedicated service and disable its Unified consumer flag while keeping independent budget enforcement and shared policy intact. Never restore browser-key delivery or flush/refund account records. Preserve journals/databases. Previously copied provider keys remain valid until separately approved revocation/rotation, and unintegrated/external account use remains outside this budget’s control. Production remains unchanged.

Temporary Redis and PostgreSQL test containers were stopped after validation. Existing user development servers were not stopped; no preview live-data service or provider probe was started.
