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
// Routes (dynamic segment, future-proofed so Journal EOD coach,
// ShortThesis, and WheelScanner can move into this same file as
// additional actions later without adding a Vercel function):
//
//   POST /api/ai/brief
//        body: { prompt: string, maxTokens?: number }
//        returns: { content, model } on success
//                 { error, status, type, message, model } on failure
//
// Errors are explicit on purpose: status code (Anthropic's, or 5xx for
// missing config) plus the upstream error type and message. A future
// failure surfaces in both the Vercel function logs and the client
// banner instead of dropping silently.

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

async function handleBrief(req, res) {
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
    console.error('[ai/brief] ANTHROPIC_API_KEY is not set on the server')
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
      console.error('[ai/brief] Anthropic API error:', {
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
    console.error('[ai/brief] handler exception:', err?.message, err?.stack)
    res.status(500).json({
      error: 'handler_error',
      message: err?.message || 'unknown failure',
    })
  }
}

const ROUTES = {
  brief: handleBrief,
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
