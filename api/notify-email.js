// Vercel serverless function. Sends a transactional email via Resend.
// Configure via env vars in the Vercel dashboard:
//   RESEND_API_KEY       a Resend API key
//   NOTIFICATION_EMAIL   the recipient address
//   RESEND_FROM          optional sender (defaults to Resend's onboarding addr)
//
// Request body:
//   { subject: string, html: string, text?: string }
//
// Response: 200 + Resend's JSON on success, 4xx/5xx on failure.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { subject, html, text } = req.body || {}
  if (!subject || !html) {
    res.status(400).json({ error: 'Missing required field: subject and html' })
    return
  }
  const apiKey = process.env.RESEND_API_KEY
  const recipient = process.env.NOTIFICATION_EMAIL
  const from = process.env.RESEND_FROM || 'Trade Hub <onboarding@resend.dev>'
  if (!apiKey || !recipient) {
    res.status(500).json({ error: 'Email not configured: set RESEND_API_KEY and NOTIFICATION_EMAIL env vars in Vercel.' })
    return
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipient, subject, html, text }),
    })
    const data = await r.json().catch(() => ({}))
    res.status(r.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Email send failed' })
  }
}
