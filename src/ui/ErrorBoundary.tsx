import { EV, recObj } from '../debug'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null; info: string }

/**
 * Without this, a render exception blanks the screen silently — especially
 * bad when embedded in an iframe.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? '' })
    // Without this, the only log a user could export was exactly the one
    // missing the crash.
    recObj(EV.exception, {
      where: 'ErrorBoundary',
      message: error.message,
      stack: error.stack?.slice(0, 1200),
      componentStack: info.componentStack?.slice(0, 1200),
    })
    console.error('[MC Blueprint]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="boot-error">
        <h1>La app no pudo arrancar</h1>
        <p className="hint">
          Copiá este detalle si querés reportarlo. Probá recargar; si persiste, puede
          faltar soporte de WebGL en este navegador.
        </p>
        <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        {this.state.info && <pre>{this.state.info}</pre>}
        <button onClick={() => location.reload()}>Recargar</button>
      </div>
    )
  }
}

/** Is WebGL usable? The 3D editor is meaningless without it. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(
      c.getContext('webgl2') ||
        c.getContext('webgl') ||
        c.getContext('experimental-webgl'),
    )
  } catch {
    return false
  }
}
