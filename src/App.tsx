import { useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { PalettePanel } from './ui/PalettePanel'
import { ToolPanel } from './ui/ToolPanel'
import { TopBar } from './ui/TopBar'
import { DesignsPanel } from './ui/DesignsPanel'
import { GuideView } from './ui/GuideView'
import { useEditor } from './state/store'
import { hasWebGL } from './ui/ErrorBoundary'
import { worldToPlane } from './voxel/ops'
import type { Tool } from './types'

const TOOL_KEYS: Record<string, Tool> = {
  b: 'brush', e: 'eraser', i: 'picker', l: 'line', r: 'rect', f: 'fill', s: 'select',
}

const WEBGL = hasWebGL()

export default function App() {
  const [designsOpen, setDesignsOpen] = useState(false)
  const view = useEditor((s) => s.view)
  const status = useEditor((s) => s.status)
  const meta = useEditor((s) => s.meta)
  const rev = useEditor((s) => s.rev)
  const world = useEditor((s) => s.world)
  const showGrid = useEditor((s) => s.showGrid)

  useEffect(() => {
    useEditor.getState().refreshDesigns()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const s = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        s.saveCurrent()
        return
      }
      if (mod && e.key.toLowerCase() === 'c') { s.copySelection(false); return }
      if (mod && e.key.toLowerCase() === 'x') { s.copySelection(true); return }
      if (mod && e.key.toLowerCase() === 'v') {
        if (s.clipboard && s.hover) s.pasteAt(worldToPlane(s.sliceAxis, s.hover))
        return
      }
      if (e.key === 'Escape') {
        s.cancelAnchor()
        s.clearSelection()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selection) { e.preventDefault(); s.deleteSelection() }
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (s.sliceView !== 'off') { e.preventDefault(); s.setSliceIndex(s.sliceIndex + 1) }
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        if (s.sliceView !== 'off') { e.preventDefault(); s.setSliceIndex(s.sliceIndex - 1) }
        return
      }
      if (mod) return

      const k = e.key.toLowerCase()
      if (TOOL_KEYS[k]) { s.setTool(TOOL_KEYS[k]); return }
      if (k === 'g') s.toggle('showGrid')
      if (k === 'c') s.requestFit()
      if (k === 'x') s.toggle('mirrorX')
      if (k === 'z') s.toggle('mirrorZ')
      if (k === '1') s.setSliceView('off')
      if (k === '2') s.setSliceView('below')
      if (k === '3') s.setSliceView('isolate')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const blockCount = (() => {
    void rev
    return world.size
  })()

  return (
    <div className="app">
      <TopBar onOpenDesigns={() => setDesignsOpen(true)} />

      {view === 'edit' ? (
        <div className="main">
          <PalettePanel />
          <div className="viewport">
            {WEBGL ? (
              <Scene />
            ) : (
              <div className="boot-error">
                <h1>Este navegador no tiene WebGL</h1>
                <p className="hint">
                  El editor 3D necesita WebGL. Probá con Chrome, Edge o Firefox actualizados,
                  o activá la aceleración por hardware. La vista de guía sí funciona.
                </p>
                <button onClick={() => useEditor.getState().setView('guide')}>Ver la guía</button>
              </div>
            )}
            <div className="view-tools">
              <button onClick={() => useEditor.getState().requestFit()} title="Encuadrar la construcción (C)">
                Centrar
              </button>
              <button
                className={showGrid ? 'on' : ''}
                onClick={() => useEditor.getState().toggle('showGrid')}
                title="Mostrar u ocultar la grilla (G)"
              >
                Grilla
              </button>
            </div>
          </div>
          <ToolPanel />
        </div>
      ) : (
        <GuideView />
      )}

      <footer className="status">
        <span>
          Grilla {meta.dims.x}×{meta.dims.y}×{meta.dims.z}
        </span>
        <span data-testid="block-count">{blockCount} bloques</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span>
          <span className="kbd">click</span> colocar ·{' '}
          <span className="kbd">shift+click</span> borrar ·{' '}
          <span className="kbd">alt+click</span> cuentagotas ·{' '}
          <span className="kbd">arrastrar</span> pintar ·{' '}
          <span className="kbd">rueda</span> zoom
        </span>
        {status && <span className="msg">{status}</span>}
      </footer>

      {designsOpen && <DesignsPanel onClose={() => setDesignsOpen(false)} />}
    </div>
  )
}
