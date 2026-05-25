// Vercel serverless function. POSTs a message to Telegram's sendMessage API.
// Configure via env vars in the Vercel dashboard:
//   TELEGRAM_BOT_TOKEN  the bot token from @BotFather
//   TELEGRAM_CHAT_ID    the chat id to send into (your own user id works)
//
// Request body:
//   { message: string, parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' }
//
// Response: 200 + Telegram's JSON on success, 4xx/5xx on failure.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { message, parseMode = 'Markdown' } = req.body || {}
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing required field: message' })
    return
  }
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    res.status(500).json({ error: 'Telegram not configured: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars in Vercel.' })
    return
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: parseMode }),
    })
    const data = await r.json().catch(() => ({}))
    res.status(r.status).json(data)
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Telegram send failed' })
  }
}
