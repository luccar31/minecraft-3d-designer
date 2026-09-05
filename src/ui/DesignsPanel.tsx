import { useEffect, useState } from 'react'
import { useEditor } from '../state/store'
import { AuthPanel } from './AuthPanel'
import { MAX_AXIS } from '../types'

export function DesignsPanel({ onClose }: { onClose: () => void }) {
  const s = useEditor()
  const [dx, setDx] = useState(s.world.dims.x)
  const [dy, setDy] = useState(s.world.dims.y)
  const [dz, setDz] = useState(s.world.dims.z)
  const [newName, setNewName] = useState('Casa nueva')

  useEffect(() => {
    s.refreshDesigns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clampAxis = (n: number) => Math.max(1, Math.min(MAX_AXIS, Math.round(n) || 1))

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Diseños</h2>
        <p className="sub">
          {s.storageMode === 'cloud'
            ? 'Guardados en tu cuenta: los ves desde cualquier dispositivo.'
            : 'Guardados en este navegador. Exportá a JSON para llevarlos a otra máquina.'}
        </p>

        <AuthPanel />

        <div className="section">
          <h3>Nuevo diseño</h3>
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre"
              aria-label="Nombre del diseño nuevo"
            />
          </div>
          <div className="grid3" style={{ marginBottom: 8 }}>
            <label className="label">
              Ancho (X)
              <input type="number" min={1} max={MAX_AXIS} value={dx} onChange={(e) => setDx(Number(e.target.value))} />
            </label>
            <label className="label">
              Alto (Y)
              <input type="number" min={1} max={MAX_AXIS} value={dy} onChange={(e) => setDy(Number(e.target.value))} />
            </label>
            <label className="label">
              Largo (Z)
              <input type="number" min={1} max={MAX_AXIS} value={dz} onChange={(e) => setDz(Number(e.target.value))} />
            </label>
          </div>
          <div className="row">
            <button
              onClick={() => {
                s.newDesign({ x: clampAxis(dx), y: clampAxis(dy), z: clampAxis(dz) }, newName)
                onClose()
              }}
              data-testid="create-design"
            >
              Crear
            </button>
            <button
              className="ghost"
              onClick={() => s.resize({ x: clampAxis(dx), y: clampAxis(dy), z: clampAxis(dz) })}
              title="Cambia el tamaño del diseño actual; lo que quede fuera se descarta"
            >
              Redimensionar el actual
            </button>
          </div>
        </div>

        <div className="section">
          <h3>Guardados ({s.designs.length})</h3>
          {s.designs.length === 0 ? (
            <div className="empty">Todavía no guardaste ningún diseño.</div>
          ) : (
            <div className="dlist">
              {s.designs.map((d) => (
                <div className="ditem" key={d.id}>
                  <div className="grow">
                    <strong>{d.name}</strong>
                    <span className="meta">
                      {d.dims.x}×{d.dims.y}×{d.dims.z} · {d.blockCount} bloques ·{' '}
                      {new Date(d.updatedAt).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await s.openDesign(d.id)
                      onClose()
                    }}
                  >
                    Abrir
                  </button>
                  <button className="danger ghost" onClick={() => s.deleteDesign(d.id)} title="Borrar">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
