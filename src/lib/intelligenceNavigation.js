export const INTELLIGENCE_VIEWS = [
  { id: 'rotation', label: 'Sector Rotation' },
  { id: 'analyst', label: 'Analyst Brief' },
  { id: 'training', label: 'Training Mode' },
  { id: 'map', label: 'Market Map' },
  { id: 'options', label: 'Options Positioning' },
  { id: 'intraday', label: 'Intraday Playbook' },
  { id: 'swing', label: 'Swing Playbook' },
]
export function intelligenceFromSearch(search) {
  const value = new URLSearchParams(search).get('intelligence')
  return INTELLIGENCE_VIEWS.some(v => v.id === value) ? value : null
}
