// Working EdgeIQ identity. Chart libraries need concrete colors, while CSS
// consumes the same values through installTheme(). Keep financial meanings stable.
export const THEME = Object.freeze({ colors: Object.freeze({
  background: '#111315', surface: '#191C1F', accent: '#99C9AC',
  text: '#F1F3F2', secondary: '#ADB5BC', border: '#30363B',
  positive: '#99C9AC', caution: '#E3BF78', negative: '#F09C9C',
  brokerSurface: '#245789', blue: '#99BDDF', purple: '#C1ACDF', orange: '#E3B28A',
  positiveSurface: '#202E27', cautionSurface: '#302B22', negativeSurface: '#302326',
}), radius: Object.freeze({ small: 5, medium: 8, large: 12 }), spacing: Object.freeze({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }), typography: Object.freeze({ sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", mono: "'SFMono-Regular', Consolas, monospace" }) })

export function installTheme(root = document.documentElement) {
  for (const [name, value] of Object.entries(THEME.colors)) root.style.setProperty(`--edge-${name}`, value)
  for (const [name, value] of Object.entries(THEME.typography)) root.style.setProperty(`--edge-font-${name}`, value)
  for (const [name, value] of Object.entries(THEME.radius)) root.style.setProperty(`--edge-radius-${name}`, `${value}px`)
  root.style.colorScheme = 'dark'
}
