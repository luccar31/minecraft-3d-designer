import { useEffect, useMemo, useRef, useState } from 'react'
import {
  boxCells, defaultParams, generatorById, GENERATORS, MAX_CELLS,
  type Box, type CellWrite, type GeneratorParams, type GeneratorResult,
} from '../voxel/generators'
import { useEditor } from '../state/store'
import { blockDef } from '../blocks/palette'
import { EV, rec, str } from '../debug'
import type { BlockId, Dims } from '../types'
import './generator.css'

const clampBox = (b: Box, dims: Dims): Box => {
  const c = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.round(v) || 0))
  return {
    min: { x: c(b.min.x, dims.x), y: c(b.min.y, dims.y), z: c(b.min.z, dims.z) },
    max: { x: c(b.max.x, dims.x), y: c(b.max.y, dims.y), z: c(b.max.z, dims.z) },
  }
}

/** A tenth of the grid, centered: something visible without a drag. */
const startingBox = (dims: Dims): Box => {
  const w = Math.max(1, Math.round(dims.x / 3))
  const d = Math.max(1, Math.round(dims.z / 3))
  const x0 = Math.floor((dims.x - w) / 2)
  const z0 = Math.floor((dims.z - d) / 2)
  return { min: { x: x0, y: 0, z: z0 }, max: { x: x0 + w - 1, y: 0, z: z0 + d - 1 } }
}

const es = (n: number) => n.toLocaleString('es-AR')

export type GeneratorPanelProps = {
  /** Region drawn in the scene; the panel adopts it whenever it changes. */
  box?: Box | null
  onBoxChange?: (b: Box) => void
  /** Live preview: the same cells that Confirmar would write. */
  onPreview?: (r: GeneratorResult | null) => void
  /** Defaults to the store's `applyCells`; see docs/integracion/06-generadores.md. */
  onApply?: (cells: CellWrite[]) => void
  onClose?: () => void
}

export function GeneratorPanel({
  box: boxProp, onBoxChange, onPreview, onApply, onClose,
}: GeneratorPanelProps) {
  const world = useEditor((s) => s.world)
  const rev = useEditor((s) => s.rev)
  const block = useEditor((s) => s.block)
  const mirrorX = useEditor((s) => s.mirrorX)
  const mirrorZ = useEditor((s) => s.mirrorZ)
  const dims = world.dims

  const [genId, setGenId] = useState<string | null>(null)
  const [params, setParams] = useState<GeneratorParams>({})
  const [ownBox, setOwnBox] = useState<Box>(() => startingBox(dims))

  const def = genId ? generatorById(genId) : undefined
  const box = boxProp ?? ownBox

  const setBox = (b: Box) => {
    const c = clampBox(b, dims)
    setOwnBox(c)
    onBoxChange?.(c)
  }

  const pick = (id: string) => {
    if (id === genId) { setGenId(null); return }
    const g = generatorById(id)
    if (!g) return
    rec(EV.button, str(`gen-${id}`), str('generator-panel'))
    setGenId(id)
    setParams({ ...defaultParams(g), material: block })
  }

  // The palette drives the material: changing a block updates the preview
  // without closing the panel.
  useEffect(() => {
    setParams((p) => ('material' in p ? { ...p, material: block } : p))
  }, [block])

  const result = useMemo<GeneratorResult | null>(() => {
    if (!def) return null
    void rev
    return def.generate(box, dims, params, world)
  }, [def, box, dims, params, world, rev])

  const replacing = useMemo(() => {
    if (!result) return 0
    void rev
    let n = 0
    for (const c of result.cells) if (world.get(c.p.x, c.p.y, c.p.z) !== undefined) n++
    return n
  }, [result, world, rev])

  // Through a ref: an inline `onPreview` changes identity every render and
  // would re-emit forever.
  const preview = useRef(onPreview)
  preview.current = onPreview
  const sent = useRef<GeneratorResult | null>(null)

  useEffect(() => {
    if (sent.current === result) return
    sent.current = result
    preview.current?.(result)
  }, [result])

  useEffect(() => () => preview.current?.(null), [])

  const cancel = () => {
    if (genId) rec(EV.generator, str(genId), NaN, NaN, NaN)
    setGenId(null)
    sent.current = null
    preview.current?.(null)
    onClose?.()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const confirm = () => {
    if (!def || !result || result.capped) return
    const t0 = performance.now()
    const apply = onApply ?? useEditor.getState().applyCells
    apply(result.cells)
    rec(EV.generator, str(def.id), result.cells.length, result.outside, performance.now() - t0)
    useEditor.getState().setStatus(
      result.outside > 0
        ? `${def.label}: ${es(result.cells.length)} bloques · ${es(result.outside)} fuera de la grilla`
        : `${def.label}: ${es(result.cells.length)} bloques`,
    )
    sent.current = null
    preview.current?.(null)
    setGenId(null)
    onClose?.()
  }

  const axis = (k: 'x' | 'y' | 'z', end: 'min' | 'max') => (
    <input
      type="number"
      value={box[end][k]}
      min={0}
      max={dims[k] - 1}
      onChange={(e) => setBox({ ...box, [end]: { ...box[end], [k]: Number(e.target.value) } })}
      aria-label={`${end === 'min' ? 'Desde' : 'Hasta'} ${k.toUpperCase()}`}
    />
  )

  return (
    <div className="gen-panel" data-testid="generator-panel">
      <div className="section">
        <h3>Generar</h3>
        <div className="gen-list">
          {GENERATORS.map((g) => (
            <button
              key={g.id}
              className={genId === g.id ? 'on' : ''}
              onClick={() => pick(g.id)}
              title={g.steps === 1
                ? `${g.label}. Marcá la región y confirmá.`
                : `${g.label}. Marcá la base y después la altura.`}
              data-testid={`gen-${g.id}`}
            >
              {g.label}
              <span className="steps">{g.steps}</span>
            </button>
          ))}
        </div>
      </div>

      {!def && (
        <p className="hint">
          Elegí un generador. Nada se escribe hasta confirmar:{' '}
          <span className="kbd">Esc</span> cancela.
        </p>
      )}

      {def && result && (
        <>
          <div className="section">
            <h3>Región ({es(boxCells(box))} celdas)</h3>
            <div className="gen-box">
              <span className="label">Desde</span>
              {axis('x', 'min')}{axis('y', 'min')}{axis('z', 'min')}
              <span className="label">Hasta</span>
              {axis('x', 'max')}{axis('y', 'max')}{axis('z', 'max')}
            </div>
            <button
              className="ghost gen-wide"
              onClick={() => setBox({
                min: { x: 0, y: 0, z: 0 },
                max: { x: dims.x - 1, y: dims.y - 1, z: dims.z - 1 },
              })}
              title="Usar toda la grilla como región"
            >
              Toda la construcción
            </button>
          </div>

          {def.params.length > 0 && (
            <div className="section">
              <h3>Parámetros</h3>
              {def.params.map((p) => (
                <label key={p.key} className="gen-param">
                  <span className="label">{p.label}</span>
                  {p.kind === 'bool' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(params[p.key] ?? p.def)}
                      onChange={(e) => setParams({ ...params, [p.key]: e.target.checked })}
                    />
                  ) : p.kind === 'int' ? (
                    <input
                      type="number"
                      min={p.min}
                      max={p.max}
                      value={Number(params[p.key] ?? p.def)}
                      onChange={(e) => setParams({
                        ...params,
                        [p.key]: Math.max(p.min, Math.min(p.max, Number(e.target.value) || 0)),
                      })}
                    />
                  ) : (
                    <BlockField
                      value={(params[p.key] as BlockId) ?? p.def}
                      active={block}
                      onUse={() => setParams({ ...params, [p.key]: block })}
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <p className="gen-count" data-testid="generator-count">
            <strong>{es(result.cells.length)}</strong> bloques
            {replacing > 0 && <> · reemplaza {es(replacing)}</>}
          </p>

          {result.outside > 0 && (
            <p className="gen-warn" data-testid="generator-outside">
              {es(result.outside)} celdas caen fuera de la grilla y no se van a escribir.
            </p>
          )}

          {(mirrorX || mirrorZ) && (
            <p className="gen-warn">
              El espejo está activo: la región se va a duplicar al confirmar.
            </p>
          )}

          {result.capped && (
            <p className="gen-warn err" data-testid="generator-too-big">
              La región pide {es(boxCells(box))} celdas y el máximo es {es(MAX_CELLS)}.
              Achicala para poder confirmar.
            </p>
          )}

          <div className="row">
            <button onClick={cancel}>Cancelar</button>
            <button
              className="gen-confirm"
              onClick={confirm}
              disabled={result.capped || result.cells.length === 0}
              data-testid="generator-confirm"
            >
              Confirmar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Block params follow the palette; a second block grid inside would be worse. */
function BlockField({ value, active, onUse }: {
  value: BlockId
  active: BlockId
  onUse: () => void
}) {
  const d = blockDef(value)
  return (
    <span className="gen-block">
      <span className="sw" style={{ background: d.color }} />
      <span className="nm">{d.name}</span>
      <button className="ghost" onClick={onUse} disabled={value === active} title={active}>
        Usar el activo
      </button>
    </span>
  )
}
