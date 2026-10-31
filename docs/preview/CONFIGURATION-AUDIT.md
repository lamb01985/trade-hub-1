# Preview configuration and account evidence

Inspection reads presence/metadata only. No secret values are included here.

| Evidence | Result |
| --- | --- |
| TradeHub local env files / linked Vercel project | Neither present |
| Local engine MASSIVE_API_KEY | Present in ignored local environment; value not displayed or copied |
| Key belongs to actual deployment account | Unverified; owner confirmation absent |
| Vercel project/environment metadata via existing CLI login | Read-only request returned HTTP 403; no environment secrets decrypted |
| Operator ID/hash/origin, service URL/token/profile, Redis and account-budget configuration in local checkouts | Missing |
| Deployment Options Standard entitlement and field recency | Unverified; connector observations/public plan names do not establish it |
| Actual provider probes during this task | None; the unproven local key was not used |
| Preview / production activation | None; production settings and credentials unchanged |

## Required private configuration

Frontend gateway: TRADEHUB_DEPLOYMENT_STAGE=preview, TRADEHUB_PREVIEW_ONLY=true, MARKET_DATA_UNIFIED_ENABLED=true, MASSIVE_BUDGET_ENFORCED=true. Configure a distinct preview TRADEHUB_OPERATOR_ID, TRADEHUB_OPERATOR_PASSWORD_HASH, exact HTTPS TRADEHUB_APP_ORIGIN and private-session KV_REST_API_URL/TOKEN. Never enable local auth/review flags in hosted preview. The gateway needs MARKET_DATA_SERVICE_URL (HTTPS), dedicated MARKET_DATA_SERVICE_TOKEN (at least32 random bytes), MARKET_DATA_DEPLOYMENT_PROFILE, explicit MASSIVE_BUDGET_REDIS_REST_URL/TOKEN, MASSIVE_ACCOUNT_BUDGET_SCOPE, verified MASSIVE_REQUESTS_PER_MINUTE and MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE. Its legacy proxy uses server-only POLYGON_API_KEY; no provider key is a browser variable.

Python service: same dedicated service URL/token/profile/account-budget parent, MASSIVE_API_KEY, MARKET_DATA_UNIFIED_ENABLED=true, MASSIVE_BUDGET_ENFORCED=true and TRADEHUB_DEPLOYMENT_STAGE=preview. One worker only; preview_app mounts no legacy analysis, broker, scanner or notification services. Supply secrets at runtime, never in image build args, source, CLI arguments or VITE variables.

The budget-store variables separate account admission from private operator state. All integrated users of the same actual Massive account must use the same parent and policy, while auth/session stores remain separate. Unknown or unmetered production/external use is not made safe by creating another scope. Inventory it and resolve admission/coexistence before activation; do not claim a strict account-wide guarantee over unintegrated traffic.

Preflight additionally requires owner attestations MARKET_DATA_ACCOUNT_VERIFIED=true, MARKET_DATA_RIGHTS_VERIFIED=true and PREVIEW_DEPLOYMENT_PROTECTION_VERIFIED=true. These are gates, not evidence or REAL_TIME promotion. It requires at least21 new attempts/minute beyond the legacy reserve for the three-ETF snapshot/minute cadence; that is only a capacity lower bound, not a reliability guarantee. Do not raise quotas beyond the actual subscription.

## Evidence still required

Restore authorized read-only access to the intended Vercel project or inspect its Preview environment in the dashboard; identify the actual account/key association without sharing key values. Confirm stock bid/ask, trade, minute-bar recency and Options Standard reference/chain rights, request limits and display/storage rights in that account. Then approve bounded deployment-profile probes. The prepared Python probe has a configuration-only default and an explicit read gate; it emits only sanitized access/field metadata, not raw licensed observations or credentials.

The M2 feed classifier deliberately remains UNKNOWN. Approved verified-recency registration is still a separate M2.1 activation dependency. A protected read-only preview can display UNKNOWN honestly; it cannot be called conforming live intelligence or pass the99% CURRENT gate until that work and full-session evidence exist.
