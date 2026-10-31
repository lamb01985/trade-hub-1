// This compile-time mode is only published as a protected, static UI preview.
// It is not operator authentication and must never enable any live service.
export const isUiPreview = () => import.meta.env.VITE_EDGEIQ_UI_PREVIEW === 'true'
export function installUiPreviewFence(target = window) {
  if (!isUiPreview()) return
  // Every integration remains explicitly unavailable. No request, token or
  // saved account data is forwarded; the server also publishes zero functions.
  target.fetch = async () => new Response(JSON.stringify({ error: 'ui_preview_service_disabled', message: 'Live integrations are disabled in this protected UI preview.' }), {
    status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
