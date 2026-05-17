// Initiates the Schwab OAuth flow. Takes app_key from query string and
// 302-redirects the browser to Schwab's authorize page. The redirect_uri
// must exactly match the one registered with Schwab.

export default function handler(req, res) {
  const appKey = req.query?.app_key
  const redirectUri = req.query?.redirect_uri || 'https://trade-hub-1.vercel.app/callback'

  if (!appKey) {
    res.status(400).json({ error: 'Missing app_key query parameter' })
    return
  }

  const url = 'https://api.schwabapi.com/v1/oauth/authorize'
    + '?client_id=' + encodeURIComponent(appKey)
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&response_type=code'
    + '&scope=api'

  res.setHeader('Cache-Control', 'no-store')
  res.redirect(302, url)
}
