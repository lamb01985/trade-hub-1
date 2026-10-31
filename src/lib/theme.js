// Working EdgeIQ identity. Chart libraries need concrete colors, while CSS
// consumes the same values through installTheme(). Keep financial meanings stable.
export const THEME = Object.freeze({ colors: Object.freeze({
  background: '#14232D', surface: '#20353B', accent: '#88C9A8',
  text: '#F2F5F2', secondary: '#B1C4C7', border: '#527078',
  positive: '#88C9A8', caution: '#E3BF78', negative: '#F09C9C',
  brokerSurface: '#245789', blue: '#99BDDF', purple: '#C1ACDF', orange: '#E3B28A',
  positiveSurface: '#233E37', cautionSurface: '#3B3528', negativeSurface: '#3D2B32',
}) })

export function installTheme(root = document.documentElement) {
  for (const [name, value] of Object.entries(THEME.colors)) root.style.setProperty(`--edge-${name}`, value)
  root.style.colorScheme = 'dark'
}
