import { useMemo } from 'react'
import { useEditor } from '../state/store'
import { blockDef } from '../blocks/palette'
import { sliceExtent } from '../voxel/ops'
import { stacksLabel } from '../export/guide'
import type { Axis, Tool } from '../types'

const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'brush', icon: '🖌', label: 'Pincel', key: 'B' },
  { id: 'eraser', icon: '🧽', label: 'Goma', key: 'E' },
  { id: 'picker', icon: '💧', label: 'Cuentagotas', key: 'I' },
  { id: 'line', icon: '╱', label: 'Línea (modo capa)', key: 'L' },
  { id: 'rect', icon: '▭', label: 'Rectángulo (modo capa)', key: 'R' },
  { id: 'fill', icon: '🪣', label: 'Relleno (modo capa)', key: 'F' },
  { id: 'select', icon: '⬚', label: 'Selección (modo capa)', key: 'S' },
]

const AXES: { id: Axis; label: string; help: string }[] = [
  { id: 'y', label: 'Y', help: 'Capas horizontales — pisos' },
  { id: 'x', label: 'X', help: 'Cortes verticales este-oeste — paredes' },
  { id: 'z', label: 'Z', help: 'Cortes verticales norte-sur — fachadas' },
]

export function ToolPanel() {
  const s = useEditor()
  const max = sliceExtent(s.sliceAxis, s.world.dims) - 1

  const totals = useMemo(() => {
    const m = s.world.counts()
    return [...m.entries()].sort((a, b) => b[1] - a[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.world, s.rev])

  const totalBlocks = totals.reduce((a, [, n]) => a + n, 0)

  return (
    <div className="side right">
      <div className="section">
        <h3>Herramienta</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={s.tool === t.id ? 'on' : ''}
              title={`${t.label} (${t.key})`}
              onClick={() => s.setTool(t.id)}
              data-tool={t.id}
            >
              {t.icon}
            </button>
          ))}
        </div>
        {s.tool === 'rect' && (
          <div className="toggles" style={{ marginTop: 6 }}>
            <button className={s.rectFilled ? 'on' : ''} onClick={() => s.toggle('rectFilled')}>
              {s.rectFilled ? 'Relleno' : 'Contorno'}
            </button>
          </div>
        )}
        {s.anchor && (
          <p className="hint" style={{ marginTop: 6 }}>
            Ancla puesta. Segundo click para confirmar · <span className="kbd">Esc</span> cancela.
          </p>
        )}
      </div>

      <div className="section">
        <h3>Modo capa</h3>
        <div className="toggles">
          <button className={s.sliceView === 'off' ? 'on' : ''} onClick={() => s.setSliceView('off')}>
            3D
          </button>
          <button className={s.sliceView === 'below' ? 'on' : ''} onClick={() => s.setSliceView('below')}>
            Hasta acá
          </button>
          <button className={s.sliceView === 'isolate' ? 'on' : ''} onClick={() => s.setSliceView('isolate')}>
            Sólo capa
          </button>
        </div>

        {s.sliceView !== 'off' && (
          <>
            <div className="toggles" style={{ marginTop: 7 }}>
              {AXES.map((a) => (
                <button
                  key={a.id}
                  title={a.help}
                  className={s.sliceAxis === a.id ? 'on' : ''}
                  onClick={() => s.setSliceAxis(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="slice-num" data-testid="slice-index">
              {s.sliceAxis} = {s.sliceIndex}
            </div>
            <input
              type="range"
              min={0}
              max={max}
              value={s.sliceIndex}
              onChange={(e) => s.setSliceIndex(Number(e.target.value))}
              aria-label="Índice de capa"
            />
            <div className="row" style={{ marginTop: 5 }}>
              <button className="ghost" onClick={() => s.setSliceIndex(s.sliceIndex - 1)} disabled={s.sliceIndex === 0}>
                ▼
              </button>
              <button className="ghost" onClick={() => s.setSliceIndex(s.sliceIndex + 1)} disabled={s.sliceIndex >= max}>
                ▲
              </button>
              <span className="label">de 0 a {max}</span>
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h3>Simetría</h3>
        <div className="toggles">
          <button className={s.mirrorX ? 'on' : ''} onClick={() => s.toggle('mirrorX')} title="Espejar en X">
            Espejo X
          </button>
          <button className={s.mirrorZ ? 'on' : ''} onClick={() => s.toggle('mirrorZ')} title="Espejar en Z">
            Espejo Z
          </button>
        </div>
      </div>

      {s.sliceView !== 'off' && (
        <div className="section">
          <h3>Selección</h3>
          <div className="toggles">
            <button onClick={() => s.copySelection(false)} disabled={!s.selection}>Copiar</button>
            <button onClick={() => s.copySelection(true)} disabled={!s.selection}>Cortar</button>
            <button className="danger" onClick={() => s.deleteSelection()} disabled={!s.selection}>Borrar</button>
            <button onClick={() => s.clearSelection()} disabled={!s.selection}>Quitar</button>
          </div>
          {s.clipboard && (
            <p className="hint" style={{ marginTop: 6 }}>
              Portapapeles: {s.clipboard.cells.length} bloques ({s.clipboard.w}×{s.clipboard.h}).
              Pegá con <span className="kbd">Ctrl+V</span> sobre la capa.
            </p>
          )}
        </div>
      )}

      <div className="section">
        <h3>Materiales ({totalBlocks})</h3>
        <div className="mats" data-testid="materials">
          {totals.slice(0, 40).map(([id, n]) => {
            const d = blockDef(id)
            return (
              <div className="mat" key={id} title={`${d.name}: ${stacksLabel(n)}`}>
                <span className="sw" style={{ background: d.color }} />
                <span className="nm">{d.name}</span>
                <span className="n">{n}</span>
              </div>
            )
          })}
          {totals.length === 0 && <p className="hint">Todavía no hay bloques.</p>}
        </div>
      </div>
    </div>
  )
}
