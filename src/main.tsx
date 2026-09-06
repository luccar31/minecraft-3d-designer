import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { useEditor } from './state/store'
import { buildSchem } from './export/schem'
import { buildGuide } from './export/guide'
import { ErrorBoundary } from './ui/ErrorBoundary'
import * as telemetria from './debug'

// Superficie de automatización: la usan los tests end-to-end y sirve para
// depurar desde la consola. No expone nada que la UI no exponga ya.
declare global {
  interface Window {
    __mcb: {
      store: typeof useEditor
      buildSchem: typeof buildSchem
      buildGuide: typeof buildGuide
      tel: typeof telemetria
    }
  }
}
window.__mcb = { store: useEditor, buildSchem, buildGuide, tel: telemetria }

telemetria.iniciarTelemetria()

const rootEl = document.getElementById('root')

if (!rootEl) {
  document.body.innerHTML =
    '<p style="padding:24px;font:14px system-ui">No se encontró el contenedor #root.</p>'
} else {
  createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
}
