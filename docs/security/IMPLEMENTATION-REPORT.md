# Security implementation evidence

Implemented on `security/egm-provider-notification-hardening`, October 25, 2026. The existing checkout contains unrelated work; this report is not approval to deploy its entire diff.

## Completed scope

Provider REST/key delivery and both notification handlers now require the existing operator session. Notification delivery additionally checks exact Origin, JSON shape/size, fixed recipients, atomic quotas and deduplication. The REST helper validates canonical paths and per-family query keys independently of its caller, rejects redirects/credential overrides, keeps its timeout through body parsing and redacts echoed credentials. Missing configuration and upstream failures return sanitized errors.

The frontend verifies operator access before mounting market consumers. Session checks run every minute and on focus/visibility restoration with a five-second timeout. Logout/expiry invalidates caches, pending key delivery and sockets across tabs, without removing journals or broker records. Auth-required headers distinguish application login failure from provider entitlement denial. Development memory sessions require explicit development flags and an HTTP loopback origin.

## Test evidence before M2 work

`npm test`: **18 files, 145 tests passed**. Includes 22 handler security regressions, authenticated success, direct-helper traversal/query bypasses, quota/origin/body failures, redaction, timeouts, late-response cancellation, session gate and local API routing. `npm run build`: passed; existing large-bundle and tool deprecation warnings remain. Tests use synthetic secrets and mocked providers, never real notification delivery.

## Remaining credential exposure and release steps

The authenticated legacy WebSocket endpoint still returns the long-lived provider key into browser memory. An authenticated user, injected browser code or compromised extension can copy it. Logout closes application sockets but cannot revoke that copied credential, and server request budgets cannot control its direct external use. This scope prevents anonymous disclosure; it does not provide complete provider credential confinement. New unified REST access does not require browser key delivery.

Before deployment: isolate and review the intended security diff from unrelated work; verify operator hash/ID, exact HTTPS origin and Redis configuration by presence only; decide whether the browser-key risk is acceptable or retire legacy key delivery first. Obtain explicit approval for a protected preview deployment, verify anonymous denial and legitimate signed-in use there, then seek approval for production. Review the historical exposure and decide separately whether secrets require rotation. No deployment, production configuration change or rotation occurred here.

## Post-M2 regression verification

The final TradeHub run passed all 179 tests across24files and the production build after the bounded M2 changes. Original security regressions remain in that full run. No deployment or credential rotation occurred.

## Subsequent provider-confinement increment

The browser-key residual described above is historical for the earlier increment. New reviewed source code retires authenticated key delivery and replaces browser sockets with server REST polling. Existing production and previously copied keys are not changed by local implementation. See ../preview/IMPLEMENTATION-REPORT.md for current confinement, isolation, tests and activation dependencies.
