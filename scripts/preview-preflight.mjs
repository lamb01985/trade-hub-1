// Process environment only. No dotenv import, secrets printed, network or writes.
import { pathToFileURL } from 'node:url'
import { serviceConfiguration } from '../api/_lib/marketDataGateway.js'
export function previewPreflight(env = process.env) {
  const checks = {}
  const present = key => !!env[key]
  checks.preview_environment = env.TRADEHUB_DEPLOYMENT_STAGE === 'preview' && (!env.VERCEL_ENV || env.VERCEL_ENV === 'preview')
  checks.preview_only = env.TRADEHUB_PREVIEW_ONLY === 'true'
  checks.independent_budget = env.MASSIVE_BUDGET_ENFORCED === 'true'
  checks.unified_enabled = env.MARKET_DATA_UNIFIED_ENABLED === 'true'
  checks.no_historical_review_build = env.VITE_LOCAL_SERVICE_PREVIEW !== 'true'
  checks.no_local_auth = !['TRADEHUB_LOCAL_AUTH','TRADEHUB_LOCAL_PREVIEW'].some(k => env[k] === 'true')
  checks.operator = present('TRADEHUB_OPERATOR_ID') && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.TRADEHUB_OPERATOR_PASSWORD_HASH || '')
  try { const origin = new URL(env.TRADEHUB_APP_ORIGIN); checks.https_app_origin = origin.protocol === 'https:' && origin.origin === env.TRADEHUB_APP_ORIGIN && !origin.username && !origin.password } catch { checks.https_app_origin = false }
  try { const url = new URL(env.KV_REST_API_URL); checks.private_session_store = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && present('KV_REST_API_TOKEN') } catch { checks.private_session_store = false }
  try { checks.explicit_shared_budget_store = present('MASSIVE_BUDGET_REDIS_REST_TOKEN') && new URL(env.MASSIVE_BUDGET_REDIS_REST_URL).origin !== new URL(env.KV_REST_API_URL).origin } catch { checks.explicit_shared_budget_store = false }
  checks.deployment_account_attested = env.MARKET_DATA_ACCOUNT_VERIFIED === 'true'
  checks.entitlements_reviewed = env.MARKET_DATA_RIGHTS_VERIFIED === 'true'
  checks.three_etf_minimum_budget = Number(env.MASSIVE_REQUESTS_PER_MINUTE) - Number(env.MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE) >= 21
  checks.quota_verified = present('MASSIVE_REQUESTS_PER_MINUTE') && Number(env.MASSIVE_REQUESTS_PER_MINUTE) > 0
  checks.protection_attested = env.PREVIEW_DEPLOYMENT_PROTECTION_VERIFIED === 'true'
  checks.no_browser_secret_variables = !Object.keys(env).some(k => k.startsWith('VITE_') && /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k) && env[k])
  try { const config = serviceConfiguration(env); checks.market_service = config.url.protocol === 'https:' } catch { checks.market_service = false }
  return { ready_for_approved_preview: Object.values(checks).every(Boolean), checks, live_recency_verified: false, note: 'Configuration checks and owner attestations are not proof of live source recency or deployed protection. No network calls performed.' }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = previewPreflight()
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ready_for_approved_preview ? 0 : 1
}
