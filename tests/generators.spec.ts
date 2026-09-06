/**
 * Unitarios del módulo puro `src/voxel/generators.ts`. Corren sin navegador:
 * el módulo no importa React, ni el store, ni three.
 */

import { expect, test } from '@playwright/test'
import {
  boxFill, coverSurface, cylinder, defaultParams, ellipsoid, flatRoof, floorRect,
  fullFloor, gableRoof, GENERATORS, generatorById, hollowOut, MAX_CELLS, ramp,
  replaceIn, walls, type Box, type Vec3, type WorldView,
} from '../src/voxel/generators'
import { BLOCKS } from '../src/blocks/palette'

const DIMS = { x: 32, y: 24, z: 32 }
const STONE = 'minecraft:stone'

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box =>
  ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })

const key = (c: { p: Vec3 }) => `${c.p.x},${c.p.y},${c.p.z}`

const viewOf = (filled: Map<string, string>): WorldView => ({
  get: (x, y, z) => filled.get(`${x},${y},${z}`),
})

const solidCube = (n: number, id: string) => {
  const m = new Map<string, string>()
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++)
    m.set(`${x},${y},${z}`, id)
  return m
}

/* ── contrato: recorte, tope y determinismo ──────────────────────────────── */

test('un piso de 20x20 son 400 celdas, todas en la misma altura', () => {
  const r = floorRect(box(2, 5, 2, 21, 5, 21), DIMS, STONE)

  expect(r.cells.length).toBe(400)
  expect(r.outside).toBe(0)
  expect(r.capped).toBe(false)
  expect(new Set(r.cells.map((c) => c.p.y))).toEqual(new Set([5]))
  expect(r.cells.every((c) => c.id === STONE)).toBe(true)
})

test('lo que cae fuera de la grilla se cuenta, no se emite', () => {
  const r = floorRect(box(30, 0, 30, 35, 0, 35), DIMS, STONE)

  expect(r.cells.length).toBe(4)
  expect(r.outside).toBe(32)
  expect(r.cells.every((c) => c.p.x < 32 && c.p.z < 32)).toBe(true)
})

test('las coordenadas negativas también se cuentan como fuera', () => {
  const r = floorRect(box(-2, 0, -2, 1, 0, 1), DIMS, STONE)

  expect(r.cells.length).toBe(4)
  expect(r.outside).toBe(12)
  expect(r.cells.every((c) => c.p.x >= 0 && c.p.z >= 0)).toBe(true)
})

test('el mismo pedido dos veces da exactamente el mismo array', () => {
  const a = floorRect(box(0, 0, 0, 9, 0, 9), DIMS, STONE)
  const b = floorRect(box(0, 0, 0, 9, 0, 9), DIMS, STONE)
  expect(a.cells).toEqual(b.cells)
})

test('la caja se normaliza: min y max al revés dan lo mismo', () => {
  const a = floorRect(box(2, 0, 2, 8, 0, 8), DIMS, STONE)
  const b = floorRect(box(8, 0, 8, 2, 0, 2), DIMS, STONE)
  expect(b.cells).toEqual(a.cells)
})

test('el tope corta y lo marca', () => {
  const huge = { x: 1024, y: 1024, z: 1024 }
  const r = floorRect(box(0, 0, 0, 1000, 0, 1000), huge, STONE)

  expect(r.capped).toBe(true)
  expect(r.cells.length).toBeLessThanOrEqual(MAX_CELLS)
})

test('el piso completo cubre la grilla entera sin salirse', () => {
  const r = fullFloor(3, DIMS, STONE)

  expect(r.cells.length).toBe(DIMS.x * DIMS.z)
  expect(r.outside).toBe(0)
  expect(new Set(r.cells.map((c) => c.p.y))).toEqual(new Set([3]))
})

/* ── caja ────────────────────────────────────────────────────────────────── */

test('una caja maciza de 5x5x5 son 125 celdas', () => {
  const r = boxFill(box(0, 0, 0, 4, 4, 4), DIMS, STONE, false)
  expect(r.cells.length).toBe(125)
})

test('una caja hueca de 5x5x5 son 98 celdas', () => {
  const r = boxFill(box(0, 0, 0, 4, 4, 4), DIMS, STONE, true)
  expect(r.cells.length).toBe(98)
})

test('la caja hueca es subconjunto estricto de la maciza', () => {
  const solid = new Set(boxFill(box(0, 0, 0, 4, 4, 4), DIMS, STONE, false).cells.map(key))
  const hollowCells = boxFill(box(0, 0, 0, 4, 4, 4), DIMS, STONE, true).cells

  expect(hollowCells.every((c) => solid.has(key(c)))).toBe(true)
  expect(hollowCells.length).toBeLessThan(solid.size)
})

test('una caja de un bloque de espesor es igual hueca que maciza', () => {
  const solid = boxFill(box(0, 0, 0, 4, 0, 4), DIMS, STONE, false)
  const hollowR = boxFill(box(0, 0, 0, 4, 0, 4), DIMS, STONE, true)
  expect(hollowR.cells.length).toBe(solid.cells.length)
})

test('una caja que se pasa de la grilla recorta y cuenta lo perdido', () => {
  const r = boxFill(box(28, 20, 28, 33, 25, 33), DIMS, STONE, false)

  expect(r.cells.length).toBe(4 * 4 * 4)
  expect(r.outside).toBe(6 * 6 * 6 - 64)
  expect(r.cells.every((c) => c.p.x < 32 && c.p.y < 24 && c.p.z < 32)).toBe(true)
})

/* ── cilindro, cúpula y esfera ───────────────────────────────────────────── */

test('un cilindro no se sale de su caja', () => {
  const r = cylinder(box(0, 0, 0, 10, 3, 10), DIMS, STONE, false)
  expect(r.cells.every((c) =>
    c.p.x >= 0 && c.p.x <= 10 && c.p.y >= 0 && c.p.y <= 3 && c.p.z >= 0 && c.p.z <= 10,
  )).toBe(true)
})

test('un cilindro es redondo: las esquinas de la caja quedan afuera', () => {
  const r = cylinder(box(0, 0, 0, 10, 0, 10), DIMS, STONE, false)
  const at = (x: number, z: number) => `${x},0,${z}`
  const got = new Set(r.cells.map((c) => at(c.p.x, c.p.z)))

  expect(got.has(at(5, 5))).toBe(true)   // el centro
  expect(got.has(at(0, 0))).toBe(false)  // las cuatro esquinas
  expect(got.has(at(10, 0))).toBe(false)
  expect(got.has(at(0, 10))).toBe(false)
  expect(got.has(at(10, 10))).toBe(false)
})

test('el cilindro hueco es subconjunto del macizo', () => {
  const solid = new Set(cylinder(box(0, 0, 0, 10, 4, 10), DIMS, STONE, false).cells.map(key))
  const hollowCells = cylinder(box(0, 0, 0, 10, 4, 10), DIMS, STONE, true).cells

  expect(hollowCells.every((c) => solid.has(key(c)))).toBe(true)
  expect(hollowCells.length).toBeLessThan(solid.size)
})

test('un cilindro que se sale de la grilla cuenta las celdas perdidas', () => {
  const r = cylinder(box(24, 0, 24, 40, 2, 40), DIMS, STONE, false)

  expect(r.outside).toBeGreaterThan(0)
  expect(r.cells.every((c) => c.p.x < 32 && c.p.z < 32)).toBe(true)
})

test('la cúpula no tiene celdas por debajo de su base', () => {
  const r = ellipsoid(box(0, 10, 0, 16, 26, 16), DIMS, STONE, false, true)
  expect(r.cells.length).toBeGreaterThan(0)
  expect(r.cells.every((c) => c.p.y >= 18)).toBe(true)
})

test('la esfera entera sí baja del centro, y la hueca es subconjunto', () => {
  const full = ellipsoid(box(4, 4, 4, 14, 14, 14), DIMS, STONE, false, false)
  const hollowCells = ellipsoid(box(4, 4, 4, 14, 14, 14), DIMS, STONE, true, false).cells
  const solid = new Set(full.cells.map(key))

  expect(full.cells.some((c) => c.p.y < 9)).toBe(true)
  expect(hollowCells.every((c) => solid.has(key(c)))).toBe(true)
  expect(hollowCells.length).toBeLessThan(solid.size)
})

test('una caja alargada da una elipse, no un círculo recortado', () => {
  const r = cylinder(box(0, 0, 0, 20, 0, 6), DIMS, STONE, false)
  const xs = r.cells.map((c) => c.p.x)
  const zs = r.cells.map((c) => c.p.z)
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...zs) - Math.min(...zs))
})

/* ── techos ──────────────────────────────────────────────────────────────── */

test('el techo a dos aguas es más alto en la cumbrera que en el borde', () => {
  // Huella 13x9: X es el eje largo, así que la cumbrera corre sobre X y la
  // altura varía a lo largo de Z. Indexar por X daría una meseta.
  const r = gableRoof(box(4, 6, 4, 16, 6, 12), DIMS, 'minecraft:oak_planks', 1, 0)
  const byZ = new Map<number, number>()
  for (const c of r.cells) byZ.set(c.p.z, Math.max(byZ.get(c.p.z) ?? -1, c.p.y))

  expect(byZ.get(8)!).toBeGreaterThan(byZ.get(4)!)
  expect(byZ.get(4)).toBe(6)
  expect(byZ.get(12)).toBe(6)
})

test('la cumbrera corre sobre el eje largo', () => {
  const wide = gableRoof(box(0, 0, 0, 20, 0, 6), DIMS, 'minecraft:oak_planks', 1, 0)
  const alturasPorZ = new Set(wide.cells.filter((c) => c.p.x === 10).map((c) => c.p.y))
  expect(alturasPorZ.size).toBeGreaterThan(1)
})

test('el alero extiende la huella hacia afuera', () => {
  const sin = flatRoof(box(4, 8, 4, 12, 8, 12), DIMS, 'minecraft:oak_planks', 0)
  const con = flatRoof(box(4, 8, 4, 12, 8, 12), DIMS, 'minecraft:oak_planks', 1)
  expect(con.cells.length).toBeGreaterThan(sin.cells.length)
  expect(Math.min(...con.cells.map((c) => c.p.x))).toBe(3)
})

test('un alero que se pasa del borde se cuenta como fuera', () => {
  const r = flatRoof(box(0, 2, 0, 5, 2, 5), DIMS, 'minecraft:oak_planks', 2)

  expect(r.outside).toBe(10 * 10 - 8 * 8)
  expect(r.cells.every((c) => c.p.x >= 0 && c.p.z >= 0)).toBe(true)
})

test('pendiente 0 da un techo plano', () => {
  const r = gableRoof(box(4, 6, 4, 16, 6, 12), DIMS, 'minecraft:oak_planks', 0, 0)
  expect(new Set(r.cells.map((c) => c.p.y))).toEqual(new Set([6]))
})

/* ── paredes y rampa ─────────────────────────────────────────────────────── */

test('las paredes son el contorno extruido, con el interior vacío', () => {
  const r = walls(box(0, 0, 0, 9, 0, 9), DIMS, STONE, 1, 3)
  const at = (x: number, y: number, z: number) => `${x},${y},${z}`
  const got = new Set(r.cells.map((c) => at(c.p.x, c.p.y, c.p.z)))

  expect(got.has(at(0, 0, 0))).toBe(true)
  expect(got.has(at(0, 2, 0))).toBe(true)
  expect(got.has(at(5, 1, 5))).toBe(false)   // el centro queda hueco
  expect(got.has(at(0, 3, 0))).toBe(false)   // altura 3 son y = 0,1,2
})

test('un espesor de 2 engorda la pared hacia adentro', () => {
  const uno = walls(box(0, 0, 0, 9, 0, 9), DIMS, STONE, 1, 1)
  const dos = walls(box(0, 0, 0, 9, 0, 9), DIMS, STONE, 2, 1)
  expect(dos.cells.length).toBeGreaterThan(uno.cells.length)
})

test('paredes más altas que la grilla cuentan lo que sobra', () => {
  const r = walls(box(0, 0, 0, 5, 0, 5), DIMS, STONE, 1, 30)

  expect(r.outside).toBe(6 * 20)  // seis capas de 20 celdas de contorno
  expect(r.cells.every((c) => c.p.y < DIMS.y)).toBe(true)
})

test('la rampa sube un escalón cada N bloques', () => {
  const r = ramp(box(0, 0, 0, 9, 0, 2), DIMS, STONE, 2)
  const alturaEn = (x: number) => Math.max(...r.cells.filter((c) => c.p.x === x).map((c) => c.p.y))

  expect(alturaEn(0)).toBe(0)
  expect(alturaEn(2)).toBe(1)
  expect(alturaEn(8)).toBe(4)
})

/* ── los tres que leen el mundo ──────────────────────────────────────────── */

test('reemplazar cambia sólo el material indicado', () => {
  const m = solidCube(3, STONE)
  m.set('1,1,1', 'minecraft:glass')
  const r = replaceIn(box(0, 0, 0, 2, 2, 2), DIMS, viewOf(m), STONE, 'minecraft:oak_planks')

  expect(r.cells.length).toBe(26)
  expect(r.cells.every((c) => c.id === 'minecraft:oak_planks')).toBe(true)
  expect(r.cells.some((c) => c.p.x === 1 && c.p.y === 1 && c.p.z === 1)).toBe(false)
})

test('vaciar saca sólo las celdas con los 6 vecinos llenos', () => {
  const r = hollowOut(box(0, 0, 0, 4, 4, 4), DIMS, viewOf(solidCube(5, STONE)))

  expect(r.cells.length).toBe(27)   // el 3x3x3 interior
  expect(r.cells.every((c) => c.id === undefined)).toBe(true)
})

test('vaciar un cascarón no saca nada', () => {
  const m = new Map<string, string>()
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    if (x === 1 && y === 1 && z === 1) continue
    m.set(`${x},${y},${z}`, STONE)
  }
  const r = hollowOut(box(0, 0, 0, 2, 2, 2), DIMS, viewOf(m))
  expect(r.cells.length).toBe(0)
})

test('cubrir agrega una capa sobre las caras expuestas', () => {
  const m = new Map<string, string>([['5,5,5', 'minecraft:dirt']])
  const r = coverSurface(box(4, 4, 4, 6, 6, 6), DIMS, viewOf(m), 'minecraft:grass_block')

  expect(r.cells.length).toBe(6)
  expect(r.cells.every((c) => c.id === 'minecraft:grass_block')).toBe(true)
})

test('cubrir contra el borde de la grilla cuenta las caras perdidas', () => {
  const m = new Map<string, string>([['0,0,0', 'minecraft:dirt']])
  const r = coverSurface(box(0, 0, 0, 1, 1, 1), DIMS, viewOf(m), 'minecraft:snow_block')

  expect(r.cells.length).toBe(3)  // las tres caras hacia adentro de la grilla
  expect(r.outside).toBe(3)       // las tres hacia afuera
})

/* ── registro ────────────────────────────────────────────────────────────── */

test('el registro tiene los once generadores, con ids únicos', () => {
  expect(GENERATORS.length).toBe(11)
  expect(new Set(GENERATORS.map((g) => g.id)).size).toBe(11)
  expect(GENERATORS.every((g) => g.steps === 1 || g.steps === 2)).toBe(true)
  expect(GENERATORS.every((g) => g.label.length > 0)).toBe(true)
})

test('sólo los tres que operan sobre lo existente leen el mundo', () => {
  const readers = GENERATORS.filter((g) => g.needsWorld).map((g) => g.id).sort()
  expect(readers).toEqual(['cover', 'hollow', 'replace'])
})

test('cada generador produce bloques que existen en la paleta', () => {
  const known = new Set(BLOCKS.map((b) => b.id))
  const view: WorldView = { get: () => STONE }
  const b = box(0, 0, 0, 6, 4, 6)

  for (const g of GENERATORS) {
    const r = g.generate(b, DIMS, { material: STONE, from: STONE }, view)
    for (const c of r.cells) {
      if (c.id !== undefined) {
        expect(known.has(c.id), `${g.id} produjo un bloque desconocido: ${c.id}`).toBe(true)
      }
    }
  }
})

test('todo el registro es determinista y respeta el tope', () => {
  const view: WorldView = { get: () => STONE }
  const b = box(0, 0, 0, 6, 4, 6)

  for (const g of GENERATORS) {
    const p = defaultParams(g)
    const a = g.generate(b, DIMS, p, view)
    const c = g.generate(b, DIMS, p, view)
    expect(a.cells, g.id).toEqual(c.cells)
    expect(a.cells.length, g.id).toBeLessThanOrEqual(MAX_CELLS)
    expect(a.capped, g.id).toBe(false)
  }
})

test('ningún generador emite celdas fuera de la grilla', () => {
  const view: WorldView = { get: () => STONE }
  // Caja pegada al borde: todo lo que se pase tiene que ir a `outside`.
  const b = box(26, 18, 26, 34, 26, 34)

  for (const g of GENERATORS) {
    const r = g.generate(b, DIMS, defaultParams(g), view)
    const bad = r.cells.filter((c) =>
      c.p.x < 0 || c.p.y < 0 || c.p.z < 0 ||
      c.p.x >= DIMS.x || c.p.y >= DIMS.y || c.p.z >= DIMS.z)
    expect(bad, `${g.id} emitió celdas fuera`).toEqual([])
  }
})

test('un generador que lee el mundo sin vista no explota', () => {
  const g = generatorById('cover')!
  const r = g.generate(box(0, 0, 0, 4, 4, 4), DIMS, defaultParams(g))
  expect(r.cells.length).toBe(0)
})

test('generatorById encuentra y devuelve undefined para lo que no existe', () => {
  expect(generatorById('floor')?.id).toBe('floor')
  expect(generatorById('no-existe')).toBeUndefined()
})

test('defaultParams devuelve un valor por cada parámetro declarado', () => {
  for (const g of GENERATORS) {
    const p = defaultParams(g)
    expect(Object.keys(p).sort(), g.id).toEqual(g.params.map((d) => d.key).sort())
  }
})

/* ── pendientes de la pasada de cableado en serie ────────────────────────── */

// Ver docs/integracion/06-generadores.md: necesita `applyCellsRaw` y el estado
// del generador en `src/state/store.ts`, que este workstream no posee.
test.fixme('confirmar un piso de 64x64 entra como una sola entrada de historial', () => {})

// Ver docs/integracion/06-generadores.md: presupuesto de deltas en
// `src/state/history.ts`, archivo de otro workstream.
test.fixme('el historial descarta entradas viejas al pasarse del presupuesto', () => {})

// Ver docs/integracion/06-generadores.md: monta el panel en `src/App.tsx` y la
// previa en `src/scene/Scene.tsx`.
test.fixme('la previa se ve antes de confirmar y Esc la cancela sin escribir', () => {})
