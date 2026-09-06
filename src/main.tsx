import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { useEditor } from './state/store'
import { buildSchem } from './export/schem'
import { buildGuide } from './export/guide'
import { ErrorBoundary } from './ui/ErrorBoundary'
import * as telemetry from './debug'

// Automation surface for e2e tests and console debugging; exposes nothing
// the UI doesn't already.
declare global {
  interface Window {
    __mcb: {
      store: typeof useEditor
      buildSchem: typeof buildSchem
      buildGuide: typeof buildGuide
      tel: typeof telemetry
    }
  }
}
window.__mcb = { store: useEditor, buildSchem, buildGuide, tel: telemetry }

telemetry.startTelemetry()

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
