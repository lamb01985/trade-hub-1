import { AccessError, reserve } from './access.js'

export const AI_MAX_PROMPT_BYTES = 32000
export const AI_MAX_OUTPUT_TOKENS = 4000
export const AI_MAX_REQUESTS_PER_MINUTE = 3
export const AI_TIMEOUT_MS = 25000
const MODEL = 'claude-sonnet-4-6'
// Conservative full-price rates, USD per million tokens. No cache discount assumed.
const INPUT_PRICE = 3
const OUTPUT_PRICE = 15
const MAX_DAILY_BUDGET_USD = 10
export function aiConfiguration() {
  const budget = Number(process.env.AI_DAILY_BUDGET_USD)
  return { configured: Boolean(process.env.ANTHROPIC_API_KEY), enabled: process.env.AI_ENABLE_BILLING === 'true' && Boolean(process.env.ANTHROPIC_API_KEY) && Number.isFinite(budget) && budget > 0 && budget <= MAX_DAILY_BUDGET_USD && (!process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL === MODEL), model: MODEL, budget }
}
export function validateAiInput(body) {
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || Buffer.byteLength(body.prompt) > AI_MAX_PROMPT_BYTES) throw new AccessError(400, 'invalid_prompt')
  const maxTokens = body.maxTokens ?? 900
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > AI_MAX_OUTPUT_TOKENS) throw new AccessError(400, 'invalid_token_limit')
  return { prompt: body.prompt, maxTokens }
}
export async function reserveAiBudget(operator, prompt, maxTokens, now = new Date()) {
  const config = aiConfiguration()
  if (!config.enabled) throw new AccessError(503, 'ai_not_enabled')
  const minute = Math.floor(now.getTime() / 60000)
  if (!await reserve(`th:ai:minute:${operator}:${minute}`, 1, AI_MAX_REQUESTS_PER_MINUTE, 120)) throw new AccessError(429, 'ai_rate_limited')
  // UTF-8 bytes upper-bound text tokens; include conservative message overhead.
  const microDollars = Math.ceil((Buffer.byteLength(prompt) + 1024) * INPUT_PRICE + maxTokens * OUTPUT_PRICE)
  if (!await reserve(`th:ai:spend:${now.toISOString().slice(0, 10)}`, microDollars, Math.floor(config.budget * 1000000), 172800)) throw new AccessError(429, 'ai_daily_budget_exhausted')
  // Reservations are never refunded, including failures and unknown upstream outcomes.
  return config
}
