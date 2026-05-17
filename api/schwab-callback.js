// Exchanges an OAuth authorization code for access + refresh tokens.
// Called by the SPA from /callback once Schwab redirects back with ?code=
// Body: { code, app_key, app_secret, redirect_uri? }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { code, app_key, app_secret, redirect_uri } = req.body || {}
  const redirectUri = redirect_uri || 'https://trade-hub-1.vercel.app/callback'

  if (!code || !app_key || !app_secret) {
    res.status(400).json({ error: 'Missing required field — need code, app_key, app_secret' })
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
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })

    const text = await tokenRes.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!tokenRes.ok) {
      res.status(tokenRes.status).json({ error: 'Token exchange failed', status: tokenRes.status, details: data })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      scope: data.scope,
    })
  } catch (err) {
    res.status(500).json({ error: 'Token exchange threw', message: err.message })
  }
}
