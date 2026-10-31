// Permanently retired. Provider credentials must never be delivered to browsers,
// including callers with cookies or Origin headers. Do not read provider config.
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('CDN-Cache-Control', 'no-store')
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.status(410).json({ error: 'PROVIDER_CREDENTIAL_DELIVERY_RETIRED' })
}
