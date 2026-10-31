export const uiPreviewHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
}
export const uiPreviewOutput = {
  version: 3,
  routes: [
    { src: '/api(?:/.*)?', status: 503, headers: { ...uiPreviewHeaders, 'Cache-Control': 'no-store' } },
    { src: '/(?:\\.env(?:\\..*)?|\\.git(?:/.*)?|\\.vercel(?:/.*)?|.*\\.py)', status: 404 },
    { src: '/.*', headers: uiPreviewHeaders, continue: true },
    { handle: 'filesystem' },
    { src: '/.*', dest: '/index.html' },
  ],
}
