export function isLocalServicePreview() {
  return import.meta.env.VITE_LOCAL_SERVICE_PREVIEW === 'true'
}
export const LOCAL_MARKET_LIMITATION = 'Live market services are disabled in this local review. Levels, charts, scanners and sector rotation need a configured server-side market-data connection. The Friday snapshot is available only in Market Intelligence and is not substituted for live data.'
