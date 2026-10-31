import { requireOperator, requireOrigin, privateResponse, sendFailure, jsonBody, AccessError } from '../_lib/access.js'
import { aiConfiguration, validateAiInput, reserveAiBudget, AI_TIMEOUT_MS, AI_MAX_PROMPT_BYTES } from '../_lib/aiPolicy.js'

const ACTIONS = new Set(['brief', 'wheel-ai', 'eod-coach', 'short-thesis'])
export default async function handler(req, res) {
  privateResponse(res)
  try {
    const operator = await requireOperator(req)
    const action = String(req.query?.action || '')
    if (action === 'status' && req.method === 'GET') {
      const { configured, enabled, model } = aiConfiguration()
      return res.status(200).json({ configured, enabled, model })
    }
    if (!ACTIONS.has(action)) throw new AccessError(404, 'unknown_action')
    if (req.method !== 'POST') throw new AccessError(405, 'method_not_allowed')
    requireOrigin(req)
    const { prompt, maxTokens } = validateAiInput(jsonBody(req, AI_MAX_PROMPT_BYTES + 4096))
    const { model } = await reserveAiBudget(operator, prompt, maxTokens)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!upstream.ok) throw new AccessError(upstream.status === 429 ? 429 : 502, 'ai_upstream_unavailable')
      const data = await upstream.json()
      return res.status(200).json({ content: (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n'), model })
    } finally { clearTimeout(timer) }
  } catch (error) { sendFailure(res, error) }
}
