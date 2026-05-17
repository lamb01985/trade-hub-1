// Refreshes a Schwab access token using a refresh token.
// Body: { refresh_token, app_key, app_secret }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { refresh_token, app_key, app_secret } = req.body || {}

  if (!refresh_token || !app_key || !app_secret) {
    res.status(400).json({ error: 'Missing required field — need refresh_token, app_key, app_secret' })
    return
  }

  const basic = Buffer.from(`${app_key}:${app_secret}`).toString('base64')

  try {
    const tokenRes = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      }).toString(),
    })

    const text = await tokenRes.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!tokenRes.ok) {
      res.status(tokenRes.status).json({ error: 'Token refresh failed', status: tokenRes.status, details: data })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
    })
  } catch (err) {
    res.status(500).json({ error: 'Token refresh threw', message: err.message })
  }
}
