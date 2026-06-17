// /api/ai/[action]
//
// Server-side proxy for Anthropic Messages API calls. The browser never
// sees the Anthropic key. The model string is read from env at request
// time so bumping models is a Vercel env edit, not a redeploy.
//
// Env vars (server only):
//   ANTHROPIC_API_KEY   required, set as Sensitive in Vercel
//   ANTHROPIC_MODEL     optional, defaults to claude-sonnet-4-6
//
// Routes (dynamic segment, all four AI features in one Vercel function
// so we stay under the Hobby 12-function limit):
//
//   POST /api/ai/brief          PrepTab AI brief generator
//   POST /api/ai/wheel-ai       WheelScanner setup-quality thesis
//   POST /api/ai/eod-coach      Journal end-of-day coach
//   POST /api/ai/short-thesis   ShortThesis put-thesis generator
//
// All four take the same body shape: { prompt: string, maxTokens?: number }
// and return: { content, model } on success
//             { error, status, type, message, model } on failure
//
// Errors are explicit on purpose: status code (Anthropic's, or 5xx for
// missing config) plus the upstream error type and message. A future
// failure surfaces in both the Vercel function logs and the client
// banner instead of dropping silently. Logs are tagged with the action
// name so per-call-site failures are greppable in Vercel logs.

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS_CAP = 4000

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'object') return req.body
  try { return JSON.parse(req.body) } catch { return {} }
}

async function callAnthropic({ prompt, maxTokens, model, apiKey }) {
  const upstream = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const text = await upstream.text()
  let parsed = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }
  return { status: upstream.status, ok: upstream.ok, data: parsed }
}

// One generic handler serves every Anthropic-backed action. The action
// name is only used to tag console logs so failures are greppable by call
// site (ai/brief vs ai/wheel-ai etc) in Vercel function logs.
async function handleAnthropicCall(req, res, actionName) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  const { prompt, maxTokens } = parseBody(req)
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'missing_prompt', message: 'Request body must include a non-empty prompt string.' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error(`[ai/${actionName}] ANTHROPIC_API_KEY is not set on the server`)
    res.status(500).json({
      error: 'anthropic_key_missing',
      message: 'ANTHROPIC_API_KEY is not set on the server. Set it in Vercel project env vars and redeploy.',
    })
    return
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
  const tokens = Number.isFinite(maxTokens) && maxTokens > 0
    ? Math.min(maxTokens, MAX_TOKENS_CAP)
    : 900

  try {
    const { status, ok, data } = await callAnthropic({ prompt, maxTokens: tokens, model, apiKey })
    if (!ok) {
      const upstreamMessage = data?.error?.message
        || (typeof data === 'string' ? data.slice(0, 500) : 'Unknown Anthropic error')
      const upstreamType = data?.error?.type || null
      // eslint-disable-next-line no-console
      console.error(`[ai/${actionName}] Anthropic API error:`, {
        status, model, type: upstreamType, message: upstreamMessage,
      })
      res.status(status).json({
        error: 'anthropic_api_error',
        status,
        type: upstreamType,
        message: upstreamMessage,
        model,
      })
      return
    }
    const content = data?.content?.[0]?.text || ''
    res.status(200).json({ content, model })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[ai/${actionName}] handler exception:`, err?.message, err?.stack)
    res.status(500).json({
      error: 'handler_error',
      message: err?.message || 'unknown failure',
    })
  }
}

const ROUTES = {
  brief: (req, res) => handleAnthropicCall(req, res, 'brief'),
  'wheel-ai': (req, res) => handleAnthropicCall(req, res, 'wheel-ai'),
  'eod-coach': (req, res) => handleAnthropicCall(req, res, 'eod-coach'),
  'short-thesis': (req, res) => handleAnthropicCall(req, res, 'short-thesis'),
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase()
  const route = ROUTES[action]
  if (!route) {
    res.status(404).json({ error: 'unknown_action', action, available: Object.keys(ROUTES) })
    return
  }
  await route(req, res)
}
