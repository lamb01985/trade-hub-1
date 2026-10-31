# Preview candidate isolation

Two new worktrees were created from committed HEAD, without stashing/resetting/cleaning or changing either original index. No original files were removed. Private env files, source reports/data, node_modules and .venv were not copied into the release content. Ignored local dependency symlinks are test conveniences only and are excluded from Vercel/Docker uploads.

| Repository | Original retained | Isolated candidate |
| --- | --- | --- |
| Frontend | security/egm-provider-notification-hardening at trade-hub-1 | preview/egm-protected-live-data at tradehub-protected-preview |
| Python | feature/egm-m2-live-data at trade-decision-engine | preview/egm-protected-market-service at trade-engine-protected-preview |

These candidates remain local, uncommitted and unpushed for review. They are preview-only, not a production release. Original README files and unrelated uncommitted changes remain in their original checkouts. Source hash checks found no missing originals and no unexpected changes outside the reviewed implementation scope. Original indexes had no staged changes and remain untouched.

## Mixed-file reconstruction

Frontend App.jsx was reconstructed from committed HEAD plus only the reviewed Unified/Legacy mode boundary. Unrelated historical intelligence/research panels and AI changes were not copied. Command.jsx retains committed behavior with only credential-free transport labels. The candidate intelligence handler supplies only operator login/logout/session, with no private-report dependency. README preserves the committed introduction and adds the preview entry; the expanded original README is preserved in the original checkout. Package metadata retains required security/M2 test dependencies, excludes unrelated Playwright tooling and pins Node22 for server JSON imports. Original package files remain untouched by this reconstruction.

The candidate excludes baseline broker/AI/calendar handlers from this bounded preview; those files remain untouched in the original checkout. Normal authenticated legacy polling is regression tested in both codebases, but the deployed preview deliberately exposes only auth, market, proxy and key-tombstone routes. It must not be substituted wholesale for production.

Python retains committed frozen strategy/rule/versioning files. Unrelated edits to SETUP_RULES.md, app/engines/setups.py, app/parameters.py, app/versioning.py, the legacy frontend and historical report routes/data remain only in the original checkout. The candidate uses dedicated app.market_data.preview_app instead of importing source main.py changes. New market-data code, pinned calendar dependencies, confinement budget changes and their tests are included.

## Reviewed copied frontend paths

- .gitignore
- .vercelignore
- api/_lib/access.js
- api/_lib/marketDataAdmission.lua
- api/_lib/marketDataBudget.js
- api/_lib/marketDataGateway.js
- api/_lib/notifications.js
- api/_lib/polygon.js
- api/_lib/providerAccess.js
- api/market/[resource].js
- api/notify-email.js
- api/notify-telegram.js
- api/polygon/proxy.js
- api/polygon/ws-auth.js
- api/preview-denied.js
- config/vercel.preview.json
- contracts/market-data-envelope-v1.schema.json
- docs/market-data/EGM-REVIEW.md
- docs/market-data/INVENTORY-AND-ENTITLEMENTS.md
- docs/market-data/M2-0-M2-1-IMPLEMENTATION-ADDENDUM.md
- docs/market-data/M2-0-M2-1-IMPLEMENTATION-REPORT.md
- docs/market-data/M2-IMPLEMENTATION-REVIEW.md
- docs/market-data/MILESTONE-2-LIVE-MARKET-DATA-SPEC.md
- docs/preview/PROVIDER-CONFINEMENT-SPEC.md
- docs/preview/comprehension_report.md
- docs/preview/critic_report.md
- docs/preview/implementation_readiness_report.md
- docs/preview/intermediate_zoom_out_report.md
- docs/preview/zoom_out_report.md
- docs/security/IMPLEMENTATION-REPORT.md
- docs/security/SECURITY-REMEDIATION-SPEC.md
- docs/security/comprehension_report.md
- docs/security/critic_report.md
- docs/security/zoom_out_report.md
- package-lock.json
- package.json
- scripts/preview-preflight.mjs
- scripts/verify-market-budget-redis.mjs
- scripts/verify-protected-preview.mjs
- scripts/vite-api.mjs
- src/components/OperatorGate.jsx
- src/components/UnifiedMarketContext.jsx
- src/components/intelligence/OperatorAccess.jsx
- src/hooks/useBot.js
- src/hooks/useLiveData.js
- src/hooks/useLiveDataMulti.js
- src/hooks/useMarketData.js
- src/hooks/useMarketData.test.jsx
- src/lib/conditionEvaluators.js
- src/lib/marketDataContract.js
- src/lib/marketDataContract.test.js
- src/lib/massive.js
- src/lib/massiveStream.test.js
- src/lib/providerPolling.js
- src/lib/setupEngine.js
- src/main.jsx
- tests/fixtures/market-budget-protocol.json
- tests/fixtures/market-data-python.json
- tests/local-api.test.js
- tests/market-auth-client.test.js
- tests/market-data-budget.test.js
- tests/market-data-contract.test.js
- tests/market-data-gateway.test.js
- tests/market-data-ui.test.jsx
- tests/operator-gate.test.jsx
- tests/preview-mode.test.jsx
- tests/preview-security.test.js
- tests/security-regressions.test.js
- vite.config.js

Additional final files: tests/preview-verifier.test.js; docs/preview release evidence/runbook/audits and preview EGM contracts.

## Excluded baseline API paths in the preview candidate

- api/calendar-earnings.js
- api/_lib/tradeSync.js
- api/_lib/schwab.js
- api/ai/[action].js
- api/schwab/orders.js
- api/schwab/sync.js
- api/schwab/[resource].js
- api/schwab/auth/[action].js
- api/schwab/debug/[action].js

## Reviewed copied Python paths

- Dockerfile.preview
- REALTIME_DATA.md
- app/config.py
- app/market_data/admission.lua
- app/market_data/api.py
- app/market_data/budget.py
- app/market_data/capabilities.py
- app/market_data/instruments.py
- app/market_data/massive.py
- app/market_data/preview_app.py
- app/market_data/preview_probe.py
- app/market_data/quality.py
- app/market_data/service.py
- app/market_data/sessions.py
- requirements.txt
- tests/fixtures/market-budget-protocol.json
- tests/test_market_data_live.py
- tests/test_preview_security.py

Final preservation verification: zero missing originals, zero unexpected modifications outside reviewed implementation/documentation files, original source indexes unchanged. Candidate indexes use intent-to-add solely so `git diff` includes new review files; no commits or pushes. Frontend candidate diff80files; Python candidate25files at completion.
