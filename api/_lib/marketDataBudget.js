import { readFileSync } from 'node:fs'
import { Redis } from '@upstash/redis'
export const POLICY_VERSION = 'market-data-budget-v1'
export const ADMISSION_LUA = readFileSync(new URL('./marketDataAdmission.lua', import.meta.url), 'utf8')
const denied = reason => ({ granted: false, lease_id: null, retry_after_seconds: 1, reason })
export function budgetConfiguration(env = process.env) {
  const scope = env.MASSIVE_ACCOUNT_BUDGET_SCOPE
  const n = env.MASSIVE_REQUESTS_PER_MINUTE ?? '5'
  const r = env.MASSIVE_LEGACY_RESERVED_REQUESTS_PER_MINUTE
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(scope || '') || !/^[1-9][0-9]*$/.test(n) || !Number.isSafeInteger(Number(n)) || !/^(0|[1-9][0-9]*)$/.test(r || '') || Number(r)>=Number(n)) throw new Error('BUDGET_UNCONFIGURED')
  return { scope, n: Number(n), r: Number(r) }
}
function store(env) {
  const url = env.MASSIVE_BUDGET_REDIS_REST_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.MASSIVE_BUDGET_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token || !url.startsWith('https://')) throw new Error('BUDGET_UNCONFIGURED')
  return new Redis({ url, token })
}
export function createMarketDataBudget(env = process.env, client = null) {
  return {
    async admit(account_scope, attempt_id, role, timeout_ms) {
      try {
        const { scope, n, r } = budgetConfiguration(env)
        if (scope !== account_scope || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt_id) || !['new','legacy'].includes(role) || timeout_ms !== (role === 'new' ? 10000 : 20000)) return denied('INVALID_ADMISSION')
        const base = `md:{${scope}}:`
        const result = await (client || store(env)).eval(ADMISSION_LUA, ['policy','attempts','new_attempts','leases'].map(k => base+k), [n,r,POLICY_VERSION,attempt_id,role,timeout_ms])
        if (!Array.isArray(result) || result.length !== 4 || ![0,1].includes(result[0]) || !Number.isInteger(result[2]) || Number(result[2])<0 || (Number(result[0])===1 && result[1]!==attempt_id)) return denied('BUDGET_UNAVAILABLE')
        return { granted: Number(result[0])===1, lease_id: Number(result[0])===1 ? result[1] : null, retry_after_seconds: Number(result[2]), reason: result[3] }
      } catch { return denied('BUDGET_UNAVAILABLE') }
    },
    async release(account_scope, lease_id) {
      try {
        const {scope} = budgetConfiguration(env)
        if (scope !== account_scope || typeof lease_id !== 'string') return false
        await (client || store(env)).zrem(`md:{${scope}}:leases`,lease_id)
        return true
      } catch { return false }
    },
  }
}
export async function admit(...args) { return createMarketDataBudget().admit(...args) }
export async function release(...args) { return createMarketDataBudget().release(...args) }
