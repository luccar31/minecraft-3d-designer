import { EV, recObj } from '../debug'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null; info: string }

/**
 * Sin esto, cualquier excepción durante el render deja la pantalla en negro y
 * sin pista de qué pasó — especialmente al embeber la app en un iframe, donde
 * la consola del host no ve los errores de adentro.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? '' })
    // Sin esto, el único registro que el usuario puede exportar era justamente
    // el que no contenía el crash.
    recObj(EV.excepcion, {
      donde: 'ErrorBoundary',
      mensaje: error.message,
      stack: error.stack?.slice(0, 1200),
      componentes: info.componentStack?.slice(0, 1200),
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

/** ¿Hay WebGL utilizable? El editor 3D no tiene sentido sin esto. */
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
