import { THEME } from '../lib/theme.js'
import { Component } from 'react'
import { RED, MONO, BORDER } from '../constants.js'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Tab crashed:', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div style={{ background: THEME.colors.negativeSurface, border: `1px solid ${RED}44`, borderRadius: 5, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: RED, letterSpacing: '0.06em' }}>
            {this.props.label || 'This tab'} crashed
          </div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: THEME.colors.negative, lineHeight: 1.6 }}>
            The rest of the app is still usable — switch tabs to keep working.
          </div>
          <pre style={{ background: THEME.colors.background, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '10px 12px', fontSize: 10, color: THEME.colors.negative, fontFamily: MONO, overflow: 'auto', whiteSpace: 'pre-wrap', maxHeight: 220, margin: 0 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={this.reset} style={{ alignSelf: 'flex-start', background: 'transparent', border: `1px solid ${RED}66`, color: RED, fontFamily: MONO, fontSize: 10, padding: '6px 14px', borderRadius: 3, cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
