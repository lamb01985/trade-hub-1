export const FEATURE_KEYS = ['company_research','compare','market_data','broker_read','ai','events','journal_read','journal_write','manual_calculator','admin_writes','execution']
export const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
export const validUtc = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,19)===value.slice(0,19)
export function assertAppCapabilities(value) {
  const preview=typeof __EDGEIQ_BUILD_PROFILE__!=='undefined'&&__EDGEIQ_BUILD_PROFILE__==='request-app'
  const profile=preview?'EDGEIQ_RESEARCH_PREVIEW':'EDGEIQ_LOCAL_RESEARCH',mode=preview?'RESEARCH_PREVIEW':'LOCAL_RESEARCH'
  if (!exactKeys(value,['schema_version','profile','mode','features']) || value.schema_version !== 'edgeiq-app-capabilities-v1' || value.profile !== profile || value.mode !== mode || !exactKeys(value.features,FEATURE_KEYS) || FEATURE_KEYS.some(key=>typeof value.features[key]!=='boolean') || value.features.execution) throw new Error('INVALID_APP_CAPABILITIES')
  if (FEATURE_KEYS.filter(key=>!['company_research','journal_read','manual_calculator'].includes(key)).some(key=>value.features[key])) throw new Error('INVALID_APP_CAPABILITIES')
  return value
}
export function assertOperatorSession(value) {
  if (!exactKeys(value,['schema_version','authenticated','csrf_token','expires_at']) || value.schema_version!=='operator-session-v1' || typeof value.authenticated!=='boolean') throw new Error('INVALID_OPERATOR_SESSION')
  if (value.authenticated ? !/^[a-f0-9]{64}$/.test(value.csrf_token || '') || !validUtc(value.expires_at) || Date.parse(value.expires_at)<=Date.now() : value.csrf_token!==null || value.expires_at!==null) throw new Error('INVALID_OPERATOR_SESSION')
  return value
}
