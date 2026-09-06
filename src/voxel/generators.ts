/**
 * Structure generators. Pure on purpose: no React, no store, no three — the
 * preview, the templates (ws07) and the AI planner (ws08) all reuse them.
 */

import type { BlockId, Dims, Vec3 } from '../types'

export type { Vec3 }

/** Inclusive on both ends. */
export type Box = { min: Vec3; max: Vec3 }

/** One write. `id === undefined` erases. */
export type CellWrite = { p: Vec3; id: BlockId | undefined }

export type GeneratorResult = {
  cells: CellWrite[]
  /** Cells that fell outside the grid; reported instead of dropped in silence. */
  outside: number
  /** Result is incomplete because MAX_CELLS was hit. */
  capped: boolean
}

/** A 256³ region is 16.7 M cells and does not fit in memory. */
export const MAX_CELLS = 500_000

/* ── emitter ─────────────────────────────────────────────────────────────── */

class Emitter {
  readonly cells: CellWrite[] = []
  outside = 0
  capped = false

  constructor(private readonly dims: Dims) {}

  put(x: number, y: number, z: number, id: BlockId | undefined): void {
    if (this.capped) return
    if (x < 0 || y < 0 || z < 0 || x >= this.dims.x || y >= this.dims.y || z >= this.dims.z) {
      this.outside++
      return
    }
    if (this.cells.length >= MAX_CELLS) {
      this.capped = true
      return
    }
    this.cells.push({ p: { x, y, z }, id })
  }

  done(): GeneratorResult {
    return { cells: this.cells, outside: this.outside, capped: this.capped }
  }
}

const norm = (b: Box) => ({
  x0: Math.min(b.min.x, b.max.x), x1: Math.max(b.min.x, b.max.x),
  y0: Math.min(b.min.y, b.max.y), y1: Math.max(b.min.y, b.max.y),
  z0: Math.min(b.min.z, b.max.z), z1: Math.max(b.min.z, b.max.z),
})

const expand = (b: Box, by: number): Box => ({
  min: { x: b.min.x - by, y: b.min.y, z: b.min.z - by },
  max: { x: b.max.x + by, y: b.max.y, z: b.max.z + by },
})

/** Cells of a box, in x → y → z order. Determinism lives here. */
export const boxCells = (b: Box): number =>
  (Math.abs(b.max.x - b.min.x) + 1) *
  (Math.abs(b.max.y - b.min.y) + 1) *
  (Math.abs(b.max.z - b.min.z) + 1)

type Test3 = (x: number, y: number, z: number) => boolean

/** A cell is shell if it passes the test and one of its 6 neighbors does not. */
export const shell = (test: Test3): Test3 =>
  (x, y, z) =>
    test(x, y, z) && (
      !test(x + 1, y, z) || !test(x - 1, y, z) ||
      !test(x, y + 1, z) || !test(x, y - 1, z) ||
      !test(x, y, z + 1) || !test(x, y, z - 1)
    )

function emitBox(b: Box, dims: Dims, id: BlockId, test: Test3): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const e = new Emitter(dims)
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        if (test(x, y, z)) e.put(x, y, z, id)
  return e.done()
}

/* ── floors ──────────────────────────────────────────────────────────────── */

/** One horizontal layer at the box's lowest y. */
export function floorRect(b: Box, dims: Dims, id: BlockId): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(b)
  const e = new Emitter(dims)
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) e.put(x, y0, z, id)
  }
  return e.done()
}

/** The whole layer at height `y`. */
export function fullFloor(y: number, dims: Dims, id: BlockId): GeneratorResult {
  return floorRect(
    { min: { x: 0, y, z: 0 }, max: { x: dims.x - 1, y, z: dims.z - 1 } },
    dims,
    id,
  )
}

/* ── volumes ─────────────────────────────────────────────────────────────── */

export function boxFill(b: Box, dims: Dims, id: BlockId, hollow: boolean): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const solid: Test3 = (x, y, z) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1
  return emitBox(b, dims, id, hollow ? shell(solid) : solid)
}

/**
 * Measured from the cell's center, not its corner: without the half block
 * small circles come out with bumps.
 */
const inEllipse = (dx: number, dz: number, rx: number, rz: number) => {
  const ax = dx / (rx + 0.5)
  const az = dz / (rz + 0.5)
  return ax * ax + az * az <= 1
}

/** A radius per axis, so a square box gives a circle and a long one an ellipse. */
export function cylinder(b: Box, dims: Dims, id: BlockId, hollow: boolean): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const rx = (x1 - x0) / 2
  const rz = (z1 - z0) / 2
  const solid: Test3 = (x, y, z) =>
    y >= y0 && y <= y1 && inEllipse(x - cx, z - cz, rx, rz)
  return emitBox(b, dims, id, hollow ? shell(solid) : solid)
}

/** `halfOnly` keeps the top half: that is the dome. */
export function ellipsoid(
  b: Box, dims: Dims, id: BlockId, hollow: boolean, halfOnly: boolean,
): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, rz = (z1 - z0) / 2
  const solid: Test3 = (x, y, z) => {
    if (halfOnly && y < cy) return false
    const ax = (x - cx) / (rx + 0.5)
    const ay = (y - cy) / (ry + 0.5)
    const az = (z - cz) / (rz + 0.5)
    return ax * ax + ay * ay + az * az <= 1
  }
  return emitBox(b, dims, id, hollow ? shell(solid) : solid)
}

/* ── walls and ramps ─────────────────────────────────────────────────────── */

/** The extruded outline: four walls, hollow inside. */
export function walls(
  b: Box, dims: Dims, id: BlockId, thickness: number, height: number,
): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(b)
  const t = Math.max(1, Math.floor(thickness))
  const e = new Emitter(dims)

  for (let y = y0; y < y0 + Math.max(1, Math.floor(height)); y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const onEdge = x < x0 + t || x > x1 - t || z < z0 + t || z > z1 - t
        if (onEdge) e.put(x, y, z, id)
      }
    }
  }
  return e.done()
}

/** Rises one step every `step` blocks along X. */
export function ramp(b: Box, dims: Dims, id: BlockId, step: number): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(b)
  const s = Math.max(1, Math.floor(step))
  const e = new Emitter(dims)

  for (let x = x0; x <= x1; x++) {
    const rise = Math.floor((x - x0) / s)
    for (let z = z0; z <= z1; z++) e.put(x, y0 + rise, z, id)
  }
  return e.done()
}

/* ── roofs ───────────────────────────────────────────────────────────────── */

export function flatRoof(b: Box, dims: Dims, id: BlockId, overhang: number): GeneratorResult {
  return floorRect(expand(b, Math.max(0, Math.floor(overhang))), dims, id)
}

/**
 * The ridge runs along the long axis. The overhang widens the footprint
 * before the slope is computed, so the roof sticks out past the walls.
 */
export function gableRoof(
  b: Box, dims: Dims, id: BlockId, pitch: number, overhang: number,
): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(expand(b, Math.max(0, Math.floor(overhang))))
  const alongX = x1 - x0 >= z1 - z0
  const span = alongX ? z1 - z0 : x1 - x0
  const half = span / 2
  const e = new Emitter(dims)

  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const across = alongX ? z - z0 : x - x0
      const rise = Math.max(0, Math.round((half - Math.abs(across - half)) * pitch))
      e.put(x, y0 + rise, z, id)
    }
  }
  return e.done()
}

/* ── operations on what is already built ─────────────────────────────────── */

/** Minimal read-only view: generators never depend on the World class. */
export type WorldView = {
  get(x: number, y: number, z: number): BlockId | undefined
}

export function replaceIn(
  b: Box, dims: Dims, view: WorldView, from: BlockId, to: BlockId,
): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const e = new Emitter(dims)
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        if (view.get(x, y, z) === from) e.put(x, y, z, to)
  return e.done()
}

/** The shell test inverted: removes cells whose 6 neighbors are all filled. */
export function hollowOut(b: Box, dims: Dims, view: WorldView): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const filled = (x: number, y: number, z: number) => view.get(x, y, z) !== undefined
  const e = new Emitter(dims)

  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        if (
          filled(x, y, z) &&
          filled(x + 1, y, z) && filled(x - 1, y, z) &&
          filled(x, y + 1, z) && filled(x, y - 1, z) &&
          filled(x, y, z + 1) && filled(x, y, z - 1)
        ) e.put(x, y, z, undefined)
  return e.done()
}

const FACES: Vec3[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
]

/** Grass over dirt, snow over a roof: one layer on every exposed face. */
export function coverSurface(
  b: Box, dims: Dims, view: WorldView, id: BlockId,
): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const e = new Emitter(dims)
  const seen = new Set<string>()

  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        if (view.get(x, y, z) === undefined) continue
        for (const f of FACES) {
          const nx = x + f.x, ny = y + f.y, nz = z + f.z
          if (view.get(nx, ny, nz) !== undefined) continue
          const k = `${nx},${ny},${nz}`
          if (seen.has(k)) continue
          seen.add(k)
          e.put(nx, ny, nz, id)
        }
      }
  return e.done()
}

/* ── registry ────────────────────────────────────────────────────────────── */

export type ParamDef =
  | { key: string; kind: 'block'; label: string; def: BlockId }
  | { key: string; kind: 'bool'; label: string; def: boolean }
  | { key: string; kind: 'int'; label: string; def: number; min: number; max: number }

export type GeneratorParams = Record<string, unknown>

export type GeneratorDef = {
  id: string
  label: string
  /** 1 = footprint only. 2 = footprint and height. */
  steps: 1 | 2
  needsWorld: boolean
  params: ParamDef[]
  generate(b: Box, dims: Dims, p: GeneratorParams, view?: WorldView): GeneratorResult
}

const material: ParamDef =
  { key: 'material', kind: 'block', label: 'Material', def: 'minecraft:stone' }
const hollowParam: ParamDef =
  { key: 'hollow', kind: 'bool', label: 'Hueco', def: false }

const mat = (p: GeneratorParams) => (p.material as BlockId) ?? 'minecraft:stone'
const num = (p: GeneratorParams, k: string, d: number) =>
  typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : d
const flag = (p: GeneratorParams, k: string, d: boolean) =>
  typeof p[k] === 'boolean' ? (p[k] as boolean) : d

const EMPTY_VIEW: WorldView = { get: () => undefined }

export const GENERATORS: GeneratorDef[] = [
  { id: 'floor', label: 'Piso', steps: 1, needsWorld: false, params: [material],
    generate: (b, d, p) => floorRect(b, d, mat(p)) },

  { id: 'walls', label: 'Paredes', steps: 2, needsWorld: false,
    params: [material,
      { key: 'thickness', kind: 'int', label: 'Espesor', def: 1, min: 1, max: 8 },
      { key: 'height', kind: 'int', label: 'Altura', def: 4, min: 1, max: 256 }],
    generate: (b, d, p) => walls(b, d, mat(p), num(p, 'thickness', 1), num(p, 'height', 4)) },

  { id: 'box', label: 'Caja', steps: 2, needsWorld: false, params: [material, hollowParam],
    generate: (b, d, p) => boxFill(b, d, mat(p), flag(p, 'hollow', false)) },

  { id: 'cylinder', label: 'Cilindro', steps: 2, needsWorld: false, params: [material, hollowParam],
    generate: (b, d, p) => cylinder(b, d, mat(p), flag(p, 'hollow', false)) },

  { id: 'dome', label: 'Cúpula', steps: 2, needsWorld: false,
    params: [material, hollowParam,
      { key: 'half', kind: 'bool', label: 'Media esfera', def: true }],
    generate: (b, d, p) =>
      ellipsoid(b, d, mat(p), flag(p, 'hollow', false), flag(p, 'half', true)) },

  { id: 'gable', label: 'Techo a dos aguas', steps: 2, needsWorld: false,
    params: [material,
      { key: 'pitch', kind: 'int', label: 'Pendiente', def: 1, min: 0, max: 4 },
      { key: 'overhang', kind: 'int', label: 'Alero', def: 1, min: 0, max: 8 }],
    generate: (b, d, p) =>
      gableRoof(b, d, mat(p), num(p, 'pitch', 1), num(p, 'overhang', 1)) },

  { id: 'flatRoof', label: 'Techo plano', steps: 1, needsWorld: false,
    params: [material,
      { key: 'overhang', kind: 'int', label: 'Alero', def: 1, min: 0, max: 8 }],
    generate: (b, d, p) => flatRoof(b, d, mat(p), num(p, 'overhang', 1)) },

  { id: 'ramp', label: 'Rampa', steps: 2, needsWorld: false,
    params: [material,
      { key: 'step', kind: 'int', label: 'Escalón', def: 1, min: 1, max: 8 }],
    generate: (b, d, p) => ramp(b, d, mat(p), num(p, 'step', 1)) },

  { id: 'replace', label: 'Reemplazar', steps: 1, needsWorld: true,
    params: [
      { key: 'from', kind: 'block', label: 'Cambiar', def: 'minecraft:stone' },
      { key: 'material', kind: 'block', label: 'Por', def: 'minecraft:oak_planks' }],
    generate: (b, d, p, view) =>
      replaceIn(b, d, view ?? EMPTY_VIEW, (p.from as BlockId) ?? 'minecraft:stone', mat(p)) },

  { id: 'hollow', label: 'Vaciar', steps: 1, needsWorld: true, params: [],
    generate: (b, d, _p, view) => hollowOut(b, d, view ?? EMPTY_VIEW) },

  { id: 'cover', label: 'Cubrir', steps: 1, needsWorld: true, params: [material],
    generate: (b, d, p, view) => coverSurface(b, d, view ?? EMPTY_VIEW, mat(p)) },
]

export const generatorById = (id: string): GeneratorDef | undefined =>
  GENERATORS.find((g) => g.id === id)

/** Defaults of a generator's params, ready to be edited by the panel. */
export const defaultParams = (g: GeneratorDef): GeneratorParams => {
  const out: GeneratorParams = {}
  for (const p of g.params) out[p.key] = p.def
  return out
}
