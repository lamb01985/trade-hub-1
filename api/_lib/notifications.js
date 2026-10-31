import crypto from 'node:crypto'
import { AccessError, jsonBody, requireOrigin, reserve, sendFailure } from './access.js'
import { providerOperator } from './providerAccess.js'

function validate(channel, body) {
  const allowed = channel === 'email' ? ['subject', 'html', 'text'] : ['message', 'parseMode']
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) throw new AccessError(400, 'invalid_notification')
  const text = (name, max, required) => {
    const value = body[name]
    if ((!required && value === undefined) || typeof value === 'string' && value.length <= max && (!required || value.trim().length)) return value
    throw new AccessError(400, 'invalid_notification')
  }
  if (channel === 'email') {
    const subject = text('subject', 200, true), html = text('html', 20000, true), optional = text('text', 10000, false)
    return { subject, html, ...(optional ? { text: optional } : {}) }
  }
  const message = text('message', 4096, true)
  const parseMode = body.parseMode === undefined ? 'Markdown' : body.parseMode
  if (!['Markdown', 'MarkdownV2', 'HTML'].includes(parseMode)) throw new AccessError(400, 'invalid_notification')
  return { message, parseMode }
}
async function quota(operator, channel, input) {
  const prefix = `th:notification:${channel}:${operator}`
  const now = Date.now()
  if (!await reserve(`${prefix}:minute:${Math.floor(now / 60000)}`, 1, 10, 120)) throw new AccessError(429, 'rate_limited')
  if (!await reserve(`${prefix}:day:${new Date(now).toISOString().slice(0, 10)}`, 1, 200, 172800)) throw new AccessError(429, 'rate_limited')
  const hash = crypto.createHash('sha256').update(JSON.stringify([channel, input])).digest('hex')
  return reserve(`${prefix}:dedup:${hash}`, 1, 1, 30)
}
export async function notificationHandler(channel, req, res) {
  try {
    const operator = await providerOperator(req, res, 'POST')
    requireOrigin(req)
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers?.['content-type'] || ''))) throw new AccessError(415, 'json_required')
    if (req.body === null || req.body === undefined) throw new AccessError(400, 'invalid_notification')
    const input = validate(channel, jsonBody(req, 32768))
    let url, headers, body
    if (channel === 'email') {
      const key = process.env.RESEND_API_KEY, recipient = process.env.NOTIFICATION_EMAIL
      if (!key || !recipient) throw new AccessError(503, 'env_missing')
      url = 'https://api.resend.com/emails'
      headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
      body = { from: process.env.RESEND_FROM || 'Trade Hub <onboarding@resend.dev>', to: recipient, ...input }
    } else {
      const token = process.env.TELEGRAM_BOT_TOKEN, recipient = process.env.TELEGRAM_CHAT_ID
      if (!token || !recipient) throw new AccessError(503, 'env_missing')
      url = `https://api.telegram.org/bot${token}/sendMessage`
      headers = { 'Content-Type': 'application/json' }
      body = { chat_id: recipient, text: input.message, parse_mode: input.parseMode }
    }
    if (!await quota(operator, channel, input)) return res.status(200).json({ ok: true, deduplicated: true })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: controller.signal })
      const data = JSON.parse(await response.text())
      if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data) || !(channel === 'email' ? typeof data.id === 'string' && data.id.trim().length : data.ok === true)) throw new Error()
    } catch { throw new AccessError(502, 'upstream_unavailable') } finally { clearTimeout(timer) }
    res.status(200).json({ ok: true })
  } catch (error) { sendFailure(res, error) }
}
