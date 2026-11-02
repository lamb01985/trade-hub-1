// Working EdgeIQ identity. Chart libraries need concrete colors, while CSS
// consumes the same values through installTheme(). Keep financial meanings stable.
export const THEME = Object.freeze({ colors: Object.freeze({
  background: '#0e0e0e', surface: '#191919', accent: '#D1FF79',
  text: '#F1F3F2', secondary: '#ADB5BC', border: '#2c2c2c',
  positive: '#D1FF79', caution: '#FFD166', negative: '#FF4D4D',
  brokerSurface: '#245789', blue: '#60A5FA', purple: '#C084FC', orange: '#F97316',
  positiveSurface: '#202E27', cautionSurface: '#302B22', negativeSurface: '#302326',
}), radius: Object.freeze({ small: 5, medium: 8, large: 12 }), spacing: Object.freeze({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }), typography: Object.freeze({ sans: "'IBM Plex Sans', sans-serif", mono: "'DM Mono', monospace" }) })

export function installTheme(root = document.documentElement) {
  for (const [name, value] of Object.entries(THEME.colors)) root.style.setProperty(`--edge-${name}`, value)
  for (const [name, value] of Object.entries(THEME.typography)) root.style.setProperty(`--edge-font-${name}`, value)
  for (const [name, value] of Object.entries(THEME.radius)) root.style.setProperty(`--edge-radius-${name}`, `${value}px`)
  root.style.colorScheme = 'dark'
}
