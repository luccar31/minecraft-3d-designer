import { create } from 'zustand'
import { World } from '../voxel/world'
import { History } from './history'
import {
  floodFill, linePoints, mirrorTargets, planeDims, planeToWorld,
  rectPoints, sliceExtent, worldToPlane, type UV,
} from '../voxel/ops'
import { DEFAULT_BLOCK } from '../blocks/palette'
import { EV, rec, recObj, registerSnapshotSource, str } from '../debug'
import { deserializeDesign, serializeDesign } from '../storage/codec'
import { activeStore } from '../storage'
import type {
  Axis, BlockId, BoxSel, CellDelta, DesignMeta, DesignSummary, Dims,
  SliceView, StoredDesign, Tool, Vec3,
} from '../types'
import { MAX_AXIS } from '../types'

export type Clip = { w: number; h: number; cells: { du: number; dv: number; id: BlockId }[] }

const AREA_TOOLS: Tool[] = ['line', 'rect', 'fill', 'select']

const newMeta = (dims: Dims, name = 'Diseño sin título'): DesignMeta => ({
  id: crypto.randomUUID(),
  name,
  description: '',
  dims,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const DEFAULT_DIMS: Dims = { x: 32, y: 24, z: 32 }

const history = new History()
let strokeDeltas: CellDelta[] = []
let stroking = false

type Cell = { p: Vec3; id: BlockId | undefined }

export type EditorState = {
  world: World
  meta: DesignMeta
  /** Se incrementa en cada edición; lo consumen los paneles derivados. */
  rev: number

  tool: Tool
  block: BlockId
  sliceAxis: Axis
  sliceIndex: number
  sliceView: SliceView
  mirrorX: boolean
  mirrorZ: boolean
  rectFilled: boolean
  showGrid: boolean

  anchor: UV | null
  selection: BoxSel | null
  clipboard: Clip | null
  hover: Vec3 | null

  canUndo: boolean
  canRedo: boolean

  view: 'edit' | 'guide'
  /** Se incrementa para pedirle a la cámara que encuadre la construcción. */
  fitRequest: number
  status: string | null
  busy: boolean
  designs: DesignSummary[]
  storageMode: 'local' | 'cloud'

  setTool: (t: Tool) => void
  setBlock: (b: BlockId) => void
  setSliceAxis: (a: Axis) => void
  setSliceIndex: (i: number) => void
  setSliceView: (v: SliceView) => void
  setHover: (p: Vec3 | null) => void
  toggle: (k: 'mirrorX' | 'mirrorZ' | 'rectFilled' | 'showGrid') => void
  setView: (v: 'edit' | 'guide') => void
  setStatus: (s: string | null) => void
  requestFit: () => void

  beginStroke: () => void
  endStroke: () => void
  applyCells: (cells: Cell[]) => void
  paintAt: (p: Vec3, erase: boolean) => void
  pickAt: (p: Vec3) => void
  planeAction: (uv: UV, erase: boolean) => void
  cancelAnchor: () => void

  undo: () => void
  redo: () => void

  copySelection: (cut: boolean) => void
  pasteAt: (uv: UV) => void
  clearSelection: () => void
  deleteSelection: () => void

  newDesign: (dims?: Dims, name?: string) => void
  rename: (name: string, description?: string) => void
  resize: (dims: Dims) => void
  clearAll: () => void

  refreshDesigns: () => Promise<void>
  saveCurrent: () => Promise<void>
  openDesign: (id: string) => Promise<void>
  deleteDesign: (id: string) => Promise<void>
  loadStored: (sd: StoredDesign) => void
  toStored: () => StoredDesign
  syncStorageMode: () => void
}

export const useEditor = create<EditorState>((set, get) => ({
  world: new World(DEFAULT_DIMS),
  meta: newMeta(DEFAULT_DIMS),
  rev: 0,

  tool: 'brush',
  block: DEFAULT_BLOCK,
  sliceAxis: 'y',
  sliceIndex: 0,
  sliceView: 'off',
  mirrorX: false,
  mirrorZ: false,
  rectFilled: false,
  showGrid: true,

  anchor: null,
  selection: null,
  clipboard: null,
  hover: null,

  canUndo: false,
  canRedo: false,

  view: 'edit',
  fitRequest: 0,
  status: null,
  busy: false,
  designs: [],
  storageMode: activeStore().mode,

  /* ── modo y herramientas ─────────────────────────────────────────────── */

  setTool: (t) => {
    const s = get()
    // Regla: las herramientas de área siempre operan sobre un plano. Elegir una
    // en modo 3D libre entra en modo capa en la altura que se esté mirando.
    if (AREA_TOOLS.includes(t) && s.sliceView === 'off') {
      const y = s.hover ? s.hover.y : s.sliceIndex
      rec(EV.herramienta, str(s.tool), str(t), 1)
      set({ tool: t, sliceView: 'below', sliceIndex: y, anchor: null })
      return
    }
    rec(EV.herramienta, str(s.tool), str(t), 0)
    set({ tool: t, anchor: null })
  },

  setBlock: (block) => {
    rec(EV.bloque, str(get().block), str(block))
    set({ block })
  },

  setSliceAxis: (a) => {
    const s = get()
    const max = sliceExtent(a, s.world.dims) - 1
    rec(EV.ejeCapa, str(s.sliceAxis), str(a))
    set({ sliceAxis: a, sliceIndex: Math.min(s.sliceIndex, max), anchor: null, selection: null })
  },

  setSliceIndex: (i) => {
    const s = get()
    const max = sliceExtent(s.sliceAxis, s.world.dims) - 1
    const idx = Math.max(0, Math.min(max, i))
    if (idx !== s.sliceIndex) rec(EV.capa, s.sliceIndex, idx, str(s.sliceAxis), idx !== i ? 1 : 0)
    set({ sliceIndex: idx, anchor: null })
  },

  setSliceView: (v) => {
    rec(EV.modoCapa, str(get().sliceView), str(v))
    set({ sliceView: v, anchor: null, selection: v === 'off' ? null : get().selection })
  },
  setHover: (hover) => set({ hover }),
  toggle: (k) => {
    rec(EV.toggle, str(k), get()[k] ? 0 : 1)
    set({ [k]: !get()[k] } as Partial<EditorState>)
  },
  setView: (view) => {
    rec(EV.vista, str(get().view), str(view))
    set({ view })
  },
  setStatus: (status) => {
    if (status) rec(EV.estado, str(status.slice(0, 80)))
    set({ status })
  },
  requestFit: () => {
    rec(EV.camaraEncuadre, NaN, NaN, get().world.size)
    set((s) => ({ fitRequest: s.fitRequest + 1 }))
  },

  /* ── edición ─────────────────────────────────────────────────────────── */

  beginStroke: () => {
    // Si ya estábamos en un trazo, el `pointerup` anterior se perdió: los
    // deltas acumulados se irían sin entrar al historial. Queda registrado.
    if (stroking) {
      rec(EV.trazoHuerfano, strokeDeltas.length)
      if (strokeDeltas.length) {
        history.push(strokeDeltas)
        set({ canUndo: history.canUndo, canRedo: history.canRedo })
      }
    }
    stroking = true
    strokeDeltas = []
    rec(EV.trazoInicio, str(get().tool))
  },

  endStroke: () => {
    stroking = false
    if (strokeDeltas.length) history.push(strokeDeltas)
    rec(EV.trazoFin, strokeDeltas.length)
    strokeDeltas = []
    set({ canUndo: history.canUndo, canRedo: history.canRedo })
  },

  applyCells: (cells) => {
    const { world, mirrorX, mirrorZ } = get()
    const t0 = performance.now()
    world.beginBatch()
    const deltas: CellDelta[] = []
    for (const c of cells) {
      for (const t of mirrorTargets(c.p, world.dims, mirrorX, mirrorZ)) {
        const d = world.set(t.x, t.y, t.z, c.id)
        if (d) deltas.push(d)
      }
    }
    world.endBatch()
    if (deltas.length === 0) {
      rec(EV.sinCambio, cells.length, str('sin-delta'))
      return
    }
    if (mirrorX || mirrorZ) rec(EV.espejo, cells.length, deltas.length)
    rec(
      EV.escritura,
      cells.length, deltas.length, world.size, stroking ? 1 : 0,
      performance.now() - t0,
    )
    if (stroking) strokeDeltas.push(...deltas)
    else history.push(deltas)
    set((s) => ({ rev: s.rev + 1, canUndo: history.canUndo, canRedo: history.canRedo }))
  },

  paintAt: (p, erase) => {
    const { block, applyCells } = get()
    applyCells([{ p, id: erase ? undefined : block }])
  },

  pickAt: (p) => {
    const id = get().world.get(p.x, p.y, p.z)
    rec(EV.pintar, p.x, p.y, p.z, id ? str(id) : str('vacio'), NaN)
    if (id) set({ block: id, tool: 'brush' })
    else rec(EV.sinCambio, 1, str('cuentagotas-en-vacio'))
  },

  /** Click dentro del slice activo. Resuelve la herramienta en curso. */
  planeAction: (uv, erase) => {
    const s = get()
    rec(
      EV.accionPlano,
      str(s.tool), uv.u, uv.v, erase ? 1 : 0, s.sliceIndex, str(s.sliceAxis),
    )
    const slice = { axis: s.sliceAxis, index: s.sliceIndex }
    const pd = planeDims(s.sliceAxis, s.world.dims)
    const at = (u: number, v: number) => {
      const w = planeToWorld(slice, u, v)
      return s.world.get(w.x, w.y, w.z)
    }
    const emit = (pts: UV[], id: BlockId | undefined) =>
      s.applyCells(pts.map((q) => ({ p: planeToWorld(slice, q.u, q.v), id })))

    switch (s.tool) {
      case 'brush':
        emit([uv], erase ? undefined : s.block)
        break
      case 'eraser':
        emit([uv], undefined)
        break
      case 'picker': {
        const w = planeToWorld(slice, uv.u, uv.v)
        s.pickAt(w)
        break
      }
      case 'line':
        if (!s.anchor) set({ anchor: uv })
        else {
          emit(linePoints(s.anchor.u, s.anchor.v, uv.u, uv.v), erase ? undefined : s.block)
          set({ anchor: null })
        }
        break
      case 'rect':
        if (!s.anchor) set({ anchor: uv })
        else {
          emit(rectPoints(s.anchor.u, s.anchor.v, uv.u, uv.v, s.rectFilled), erase ? undefined : s.block)
          set({ anchor: null })
        }
        break
      case 'fill':
        emit(floodFill(at, uv, pd.u, pd.v), erase ? undefined : s.block)
        break
      case 'select':
        if (!s.anchor) set({ anchor: uv, selection: null })
        else {
          const a = planeToWorld(slice, Math.min(s.anchor.u, uv.u), Math.min(s.anchor.v, uv.v))
          const b = planeToWorld(slice, Math.max(s.anchor.u, uv.u), Math.max(s.anchor.v, uv.v))
          rec(EV.seleccion, Math.abs(b.x - a.x) + 1, Math.abs(b.z - a.z) + 1, NaN)
          set({
            anchor: null,
            selection: {
              min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
              max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
            },
          })
        }
        break
    }
  },

  cancelAnchor: () => set({ anchor: null }),

  undo: () => {
    const ok = history.undo(get().world)
    rec(EV.deshacer, ok ? 1 : 0, get().world.size)
    if (ok) {
      set((s) => ({ rev: s.rev + 1, canUndo: history.canUndo, canRedo: history.canRedo }))
    }
  },

  redo: () => {
    const ok = history.redo(get().world)
    rec(EV.rehacer, ok ? 1 : 0, get().world.size)
    if (ok) {
      set((s) => ({ rev: s.rev + 1, canUndo: history.canUndo, canRedo: history.canRedo }))
    }
  },

  /* ── portapapeles ────────────────────────────────────────────────────── */

  copySelection: (cut) => {
    const s = get()
    const sel = s.selection
    if (!sel) return
    const axis = s.sliceAxis
    const a = worldToPlane(axis, sel.min)
    const b = worldToPlane(axis, sel.max)
    const cells: Clip['cells'] = []
    const toRemove: Cell[] = []
    for (let u = a.u; u <= b.u; u++) {
      for (let v = a.v; v <= b.v; v++) {
        const w = planeToWorld({ axis, index: s.sliceIndex }, u, v)
        const id = s.world.get(w.x, w.y, w.z)
        if (id) {
          cells.push({ du: u - a.u, dv: v - a.v, id })
          if (cut) toRemove.push({ p: w, id: undefined })
        }
      }
    }
    set({ clipboard: { w: b.u - a.u + 1, h: b.v - a.v + 1, cells } })
    rec(EV.copiar, cells.length, cut ? 1 : 0)
    if (cut && toRemove.length) s.applyCells(toRemove)
    s.setStatus(`${cells.length} bloques ${cut ? 'cortados' : 'copiados'}`)
  },

  pasteAt: (uv) => {
    const s = get()
    if (!s.clipboard) {
      rec(EV.fallo, str('pegar-sin-portapapeles'))
      return
    }
    rec(EV.pegar, uv.u, uv.v, s.clipboard.cells.length)
    const slice = { axis: s.sliceAxis, index: s.sliceIndex }
    s.applyCells(
      s.clipboard.cells.map((c) => ({
        p: planeToWorld(slice, uv.u + c.du, uv.v + c.dv),
        id: c.id,
      })),
    )
  },

  clearSelection: () => set({ selection: null, anchor: null }),

  deleteSelection: () => {
    const s = get()
    if (!s.selection) {
      rec(EV.fallo, str('borrar-sin-seleccion'))
      return
    }
    const cells: Cell[] = []
    for (let x = s.selection.min.x; x <= s.selection.max.x; x++)
      for (let y = s.selection.min.y; y <= s.selection.max.y; y++)
        for (let z = s.selection.min.z; z <= s.selection.max.z; z++)
          if (s.world.get(x, y, z)) cells.push({ p: { x, y, z }, id: undefined })
    s.applyCells(cells)
  },

  /* ── documento ───────────────────────────────────────────────────────── */

  newDesign: (dims = DEFAULT_DIMS, name) => {
    const d: Dims = {
      x: Math.max(1, Math.min(MAX_AXIS, dims.x)),
      y: Math.max(1, Math.min(MAX_AXIS, dims.y)),
      z: Math.max(1, Math.min(MAX_AXIS, dims.z)),
    }
    history.clear('diseno-nuevo')
    const world = new World(d)
    rec(EV.disenoNuevo, d.x, d.y, d.z)
    set({
      world,
      meta: newMeta(d, name),
      rev: get().rev + 1,
      sliceIndex: 0,
      anchor: null,
      selection: null,
      canUndo: false,
      canRedo: false,
      view: 'edit',
      fitRequest: get().fitRequest + 1,
      status: 'Diseño nuevo',
    })
  },

  rename: (name, description) =>
    set((s) => ({ meta: { ...s.meta, name, description: description ?? s.meta.description } })),

  resize: (dims) => {
    const d: Dims = {
      x: Math.max(1, Math.min(MAX_AXIS, dims.x)),
      y: Math.max(1, Math.min(MAX_AXIS, dims.y)),
      z: Math.max(1, Math.min(MAX_AXIS, dims.z)),
    }
    const s = get()
    const antes = s.world.size
    s.world.resize(d)
    rec(EV.disenoRedimensionado, d.x, d.y, d.z, antes - s.world.size)
    history.clear('redimensionar')
    set({
      meta: { ...s.meta, dims: d },
      rev: s.rev + 1,
      sliceIndex: Math.min(s.sliceIndex, sliceExtent(s.sliceAxis, d) - 1),
      canUndo: false,
      canRedo: false,
      selection: null,
      status: `Grilla redimensionada a ${d.x}×${d.y}×${d.z}`,
    })
  },

  clearAll: () => {
    const s = get()
    const cells: Cell[] = [...s.world.voxels.keys()].map((k) => ({
      p: { x: (k >>> 20) & 1023, y: (k >>> 10) & 1023, z: k & 1023 },
      id: undefined,
    }))
    s.applyCells(cells)
  },

  /* ── persistencia ────────────────────────────────────────────────────── */

  syncStorageMode: () => set({ storageMode: activeStore().mode }),

  refreshDesigns: async () => {
    try {
      const designs = await activeStore().list()
      set({ designs, storageMode: activeStore().mode })
    } catch (e) {
      recObj(EV.fallo, { donde: 'refreshDesigns', mensaje: (e as Error).message })
      set({ status: `No se pudo listar: ${(e as Error).message}` })
    }
  },

  toStored: () => serializeDesign(get().meta, get().world),

  saveCurrent: async () => {
    const s = get()
    set({ busy: true })
    try {
      const t0 = performance.now()
      const sd = serializeDesign(s.meta, s.world)
      await activeStore().save(sd)
      rec(EV.disenoGuardado, sd.blockCount, sd.data.length, performance.now() - t0)
      set({ meta: { ...s.meta, updatedAt: sd.updatedAt }, status: `Guardado: ${sd.name}` })
      await get().refreshDesigns()
    } catch (e) {
      recObj(EV.fallo, { donde: 'saveCurrent', mensaje: (e as Error).message })
      set({ status: `Error al guardar: ${(e as Error).message}` })
    } finally {
      set({ busy: false })
    }
  },

  openDesign: async (id) => {
    set({ busy: true })
    try {
      const sd = await activeStore().load(id)
      if (!sd) throw new Error('No encontrado')
      get().loadStored(sd)
      set({ status: `Abierto: ${sd.name}` })
    } catch (e) {
      recObj(EV.fallo, { donde: 'openDesign', mensaje: (e as Error).message })
      set({ status: `Error al abrir: ${(e as Error).message}` })
    } finally {
      set({ busy: false })
    }
  },

  deleteDesign: async (id) => {
    try {
      await activeStore().remove(id)
      rec(EV.disenoBorrado)
      await get().refreshDesigns()
      set({ status: 'Diseño borrado' })
    } catch (e) {
      recObj(EV.fallo, { donde: 'deleteDesign', mensaje: (e as Error).message })
      set({ status: `Error al borrar: ${(e as Error).message}` })
    }
  },

  loadStored: (sd) => {
    const t0 = performance.now()
    let meta, entries
    try {
      ;({ meta, entries } = deserializeDesign(sd))
    } catch (e) {
      recObj(EV.fallo, { donde: 'loadStored/deserialize', id: sd.id, mensaje: (e as Error).message })
      set({ status: `Diseño ilegible: ${(e as Error).message}` })
      return
    }
    const world = new World(meta.dims)
    world.replaceAll(entries, meta.dims)
    rec(
      EV.disenoCargado,
      sd.blockCount, meta.dims.x, meta.dims.y, meta.dims.z,
      performance.now() - t0,
    )
    history.clear('abrir-diseno')
    set({
      world,
      meta,
      rev: get().rev + 1,
      sliceIndex: 0,
      anchor: null,
      selection: null,
      canUndo: false,
      canRedo: false,
      view: 'edit',
      fitRequest: get().fitRequest + 1,
    })
  },
}))

/* ── telemetría: lector de estado para los snapshots ─────────────────────── */

registerSnapshotSource(() => {
  const s = useEditor.getState()
  return {
    herramienta: s.tool,
    bloque: s.block,
    modoCapa: s.sliceView,
    eje: s.sliceAxis,
    capa: s.sliceIndex,
    espejoX: s.mirrorX,
    espejoZ: s.mirrorZ,
    rectRelleno: s.rectFilled,
    grilla: s.showGrid,
    vista: s.view,
    bloques: s.world.size,
    chunks: s.world.nonEmptyChunks().length,
    dims: s.world.dims,
    limites: s.world.bounds(),
    haySeleccion: Boolean(s.selection),
    hayPortapapeles: Boolean(s.clipboard),
    hover: s.hover,
    anclaje: s.anchor,
    puedeDeshacer: s.canUndo,
    puedeRehacer: s.canRedo,
    rev: s.rev,
    almacenamiento: s.storageMode,
    disenos: s.designs.length,
  }
})
