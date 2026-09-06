# Generadores de estructuras — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once generadores de estructuras —pisos, paredes, cajas, cilindros, cúpulas, techos, rampas y tres operaciones sobre lo existente— invocados arrastrando una región en la escena, con previa antes de escribir.

**Architecture:** `generators.ts` son funciones puras que reciben una caja y devuelven celdas; no escriben en el mundo. Eso da la previa gratis (dibujar lo devuelto sin aplicarlo) y permite que los workstreams 07 y 08 las reutilicen. El gesto no necesita cambios en `gesture.ts`: un arrastre de generador tiene la misma forma que uno de pincel, y es el adaptador el que interpreta los commits como una caja en vez de como celdas pintadas.

**Tech Stack:** TypeScript 5.6, React 18.3, three 0.169, @react-three/fiber 8.18, Zustand 4.5, Playwright 1.48.

**Spec:** [`docs/superpowers/specs/2026-09-06-generadores-design.md`](../specs/2026-09-06-generadores-design.md)

## Global Constraints

- **Las tareas 1-7 no dependen de nada** y se pueden hacer ya. Las tareas 8-12 tocan `src/state/store.ts` y `src/scene/Scene.tsx`, que son del workstream 01: **no empezarlas hasta que `input-model` esté mergeado.**
- **Node no está en el PATH**: `export PATH="/c/nvm4w/nodejs:$PATH"` antes de todo comando. `node -v` → `v24.20.0`.
- **NUNCA correr `npm install` ni `npm ci`.** El `node_modules` es físico y compartido por junctions entre worktrees, y hay agentes trabajando en paralelo. Dos instalaciones concurrentes se prunan mutuamente. Si falta algo, reportar y parar.
- Si `npx` falla con "no se reconoce como un comando", llamar al binario directo: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/playwright/cli.js test --reporter=list`.
- **`tsconfig.json` tiene `include: ["src"]`**: el typecheck **no valida `tests/`**.
- **`noUnusedParameters: true`**: un parámetro declarado y no usado rompe el typecheck. Usar `_` adelante si hay que reservarlo.
- **Lo que necesita navegador corre en el worktree del orquestador**, no en uno hijo: el `vite preview` de 4173 sirve el `dist/` de un solo worktree.
- **El código es sólo en inglés**: identificadores, tipos, comentarios. **Comentarios de 20 palabras o menos**, sólo para lo que el código no dice solo.
- **Los textos de interfaz siguen en español.**
- **Tope duro de 500.000 celdas** por generación.
- **Determinismo**: mismos parámetros, mismas celdas, en el mismo orden. Sin `Math.random`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/voxel/generators.ts` | **Nuevo.** Los once generadores y sus helpers. Puro: sin React, sin three, sin store. |
| `src/state/history.ts` | **Modificado.** Presupuesto de deltas además de profundidad. |
| `src/state/store.ts` | **Modificado.** `applyCellsRaw` sin espejo, y el estado del generador activo. |
| `src/scene/Scene.tsx` | **Modificado.** El adaptador interpreta el arrastre como una caja. |
| `src/scene/GeneratorPreview.tsx` | **Nuevo.** Malla única de previa sobre un `World` temporal. |
| `src/ui/GeneratorPanel.tsx` | **Nuevo.** Números, parámetros, conteo y confirmación. |
| `tests/generators.spec.ts` | **Nuevo.** Unitarios de los once, sin navegador. |

`generators.ts` es un solo archivo a propósito: los once comparten los mismos tres helpers (recorte, `shell`, prueba elíptica) y separarlos los duplicaría o forzaría un módulo de utilidades que nadie más usa.

---

## Task 1: Base del módulo y el primer generador

Fija el contrato que usan los otros diez: recorte a la grilla contando, tope de celdas, y forma del resultado.

**Files:**
- Create: `src/voxel/generators.ts`
- Test: `tests/generators.spec.ts`

**Interfaces:**
- Consumes: `Dims`, `BlockId` de `src/types.ts`.
- Produces: `Vec3`, `Box`, `CellWrite`, `GeneratorResult`, `MAX_CELLS`, `floorRect(box, dims, id)`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/generators.spec.ts
import { expect, test } from '@playwright/test'
import { floorRect, MAX_CELLS, type Box } from '../src/voxel/generators'

const DIMS = { x: 32, y: 24, z: 32 }
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box =>
  ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })

test('un piso de 20x20 son 400 celdas, todas en la misma altura', () => {
  const r = floorRect(box(2, 5, 2, 21, 5, 21), DIMS, 'minecraft:stone')

  expect(r.cells.length).toBe(400)
  expect(r.outside).toBe(0)
  expect(r.capped).toBe(false)
  expect(new Set(r.cells.map((c) => c.p.y))).toEqual(new Set([5]))
  expect(r.cells.every((c) => c.id === 'minecraft:stone')).toBe(true)
})

test('lo que cae fuera de la grilla se cuenta, no se emite', () => {
  const r = floorRect(box(30, 0, 30, 35, 0, 35), DIMS, 'minecraft:stone')

  expect(r.cells.length).toBe(4)
  expect(r.outside).toBe(32)
  expect(r.cells.every((c) => c.p.x < 32 && c.p.z < 32)).toBe(true)
})

test('el mismo pedido dos veces da exactamente el mismo array', () => {
  const a = floorRect(box(0, 0, 0, 9, 0, 9), DIMS, 'minecraft:stone')
  const b = floorRect(box(0, 0, 0, 9, 0, 9), DIMS, 'minecraft:stone')
  expect(a.cells).toEqual(b.cells)
})

test('el tope corta y lo marca', () => {
  const huge = { x: 1024, y: 1024, z: 1024 }
  const r = floorRect(box(0, 0, 0, 1000, 0, 1000), huge, 'minecraft:stone')

  expect(r.capped).toBe(true)
  expect(r.cells.length).toBeLessThanOrEqual(MAX_CELLS)
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/playwright/cli.js test tests/generators.spec.ts --reporter=list
```

Esperado: `Cannot find module '../src/voxel/generators'` y `No tests found`. Ese es el fallo correcto: un import ESM roto tumba la recolección del archivo entero, no da una lista de rojos.

- [ ] **Step 3: Implementar**

```ts
// src/voxel/generators.ts
import type { BlockId, Dims } from '../types'

export type Vec3 = { x: number; y: number; z: number }
/** Caja inclusiva en ambos extremos. */
export type Box = { min: Vec3; max: Vec3 }
export type CellWrite = { p: Vec3; id: BlockId | undefined }

export type GeneratorResult = {
  cells: CellWrite[]
  /** Celdas que cayeron fuera de la grilla. */
  outside: number
  /** El resultado está incompleto porque se alcanzó el tope. */
  capped: boolean
}

/** Una región de 256³ son 16,7 M de celdas y no entra en memoria. */
export const MAX_CELLS = 500_000

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

export function floorRect(b: Box, dims: Dims, id: BlockId): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(b)
  const e = new Emitter(dims)
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) e.put(x, y0, z, id)
  }
  return e.done()
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/playwright/cli.js test tests/generators.spec.ts --reporter=list
```

Esperado: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/voxel/generators.ts tests/generators.spec.ts
git commit -m "feat(voxel): generator base with grid clipping and cell cap"
```

---

## Task 2: Caja, y el `shell` compartido

**Files:**
- Modify: `src/voxel/generators.ts`, `tests/generators.spec.ts`

**Interfaces:**
- Produces: `shell(test)`, `boxFill(box, dims, id, hollow)`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/generators.spec.ts
import { boxFill } from '../src/voxel/generators'

test('una caja maciza de 5x5x5 son 125 celdas', () => {
  const r = boxFill(box(0, 0, 0, 4, 4, 4), DIMS, 'minecraft:stone', false)
  expect(r.cells.length).toBe(125)
})

test('una caja hueca de 5x5x5 son 98 celdas', () => {
  const r = boxFill(box(0, 0, 0, 4, 4, 4), DIMS, 'minecraft:stone', true)
  expect(r.cells.length).toBe(98)
})

test('la caja hueca es subconjunto estricto de la maciza', () => {
  const key = (c: { p: Vec3 }) => `${c.p.x},${c.p.y},${c.p.z}`
  const solid = new Set(boxFill(box(0, 0, 0, 4, 4, 4), DIMS, 'minecraft:stone', false).cells.map(key))
  const hollowCells = boxFill(box(0, 0, 0, 4, 4, 4), DIMS, 'minecraft:stone', true).cells

  expect(hollowCells.every((c) => solid.has(key(c)))).toBe(true)
  expect(hollowCells.length).toBeLessThan(solid.size)
})

test('una caja de un bloque de espesor es igual hueca que maciza', () => {
  const solid = boxFill(box(0, 0, 0, 4, 0, 4), DIMS, 'minecraft:stone', false)
  const hollowR = boxFill(box(0, 0, 0, 4, 0, 4), DIMS, 'minecraft:stone', true)
  expect(hollowR.cells.length).toBe(solid.cells.length)
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/playwright/cli.js test tests/generators.spec.ts --reporter=list
```

- [ ] **Step 3: Implementar**

```ts
type Test3 = (x: number, y: number, z: number) => boolean

/** Una celda es cáscara si pasa la prueba y algún vecino de las 6 caras no. */
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

export function boxFill(b: Box, dims: Dims, id: BlockId, hollow: boolean): GeneratorResult {
  const { x0, x1, y0, y1, z0, z1 } = norm(b)
  const solid: Test3 = (x, y, z) =>
    x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1
  return emitBox(b, dims, id, hollow ? shell(solid) : solid)
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Esperado: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/voxel/generators.ts tests/generators.spec.ts
git commit -m "feat(voxel): box generator and shared shell helper"
```

---

## Task 3: Cilindro, cúpula y esfera

**Files:**
- Modify: `src/voxel/generators.ts`, `tests/generators.spec.ts`

**Interfaces:**
- Produces: `cylinder(box, dims, id, hollow)`, `ellipsoid(box, dims, id, hollow, halfOnly)`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/generators.spec.ts
import { cylinder, ellipsoid } from '../src/voxel/generators'

test('un cilindro no se sale de su caja', () => {
  const r = cylinder(box(0, 0, 0, 10, 3, 10), DIMS, 'minecraft:stone', false)
  expect(r.cells.every((c) =>
    c.p.x >= 0 && c.p.x <= 10 && c.p.y >= 0 && c.p.y <= 3 && c.p.z >= 0 && c.p.z <= 10,
  )).toBe(true)
})

test('un cilindro es redondo: las esquinas de la caja quedan afuera', () => {
  const r = cylinder(box(0, 0, 0, 10, 0, 10), DIMS, 'minecraft:stone', false)
  const key = (x: number, z: number) => `${x},0,${z}`
  const got = new Set(r.cells.map((c) => key(c.p.x, c.p.z)))

  expect(got.has(key(5, 5))).toBe(true)   // el centro
  expect(got.has(key(0, 0))).toBe(false)  // las cuatro esquinas
  expect(got.has(key(10, 0))).toBe(false)
  expect(got.has(key(0, 10))).toBe(false)
  expect(got.has(key(10, 10))).toBe(false)
})

test('el cilindro hueco es subconjunto del macizo', () => {
  const key = (c: { p: Vec3 }) => `${c.p.x},${c.p.y},${c.p.z}`
  const solid = new Set(cylinder(box(0, 0, 0, 10, 4, 10), DIMS, 'minecraft:stone', false).cells.map(key))
  const hollowCells = cylinder(box(0, 0, 0, 10, 4, 10), DIMS, 'minecraft:stone', true).cells

  expect(hollowCells.every((c) => solid.has(key(c)))).toBe(true)
  expect(hollowCells.length).toBeLessThan(solid.size)
})

test('la cúpula no tiene celdas por debajo de su base', () => {
  const r = ellipsoid(box(0, 10, 0, 16, 26, 16), DIMS, 'minecraft:stone', false, true)
  expect(r.cells.length).toBeGreaterThan(0)
  expect(r.cells.every((c) => c.p.y >= 18)).toBe(true)
})

test('una caja alargada da una elipse, no un círculo recortado', () => {
  const r = cylinder(box(0, 0, 0, 20, 0, 6), DIMS, 'minecraft:stone', false)
  const xs = r.cells.map((c) => c.p.x)
  const zs = r.cells.map((c) => c.p.z)
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...zs) - Math.min(...zs))
})
```

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

```ts
/**
 * Mide desde el centro de la celda, no desde su esquina: sin el medio bloque
 * los círculos chicos salen con protuberancias.
 */
const inEllipse = (dx: number, dz: number, rx: number, rz: number) => {
  const ax = dx / (rx + 0.5)
  const az = dz / (rz + 0.5)
  return ax * ax + az * az <= 1
}

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
```

- [ ] **Step 4: Correr y verificar que pasan**

Esperado: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add src/voxel/generators.ts tests/generators.spec.ts
git commit -m "feat(voxel): cylinder and ellipsoid with half-block centered test"
```

---

## Task 4: Techos

**Files:**
- Modify: `src/voxel/generators.ts`, `tests/generators.spec.ts`

**Interfaces:**
- Produces: `gableRoof(box, dims, id, pitch, overhang)`, `flatRoof(box, dims, id, overhang)`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/generators.spec.ts
import { flatRoof, gableRoof } from '../src/voxel/generators'

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

test('pendiente 0 da un techo plano', () => {
  const r = gableRoof(box(4, 6, 4, 16, 6, 12), DIMS, 'minecraft:oak_planks', 0, 0)
  expect(new Set(r.cells.map((c) => c.p.y))).toEqual(new Set([6]))
})
```

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

```ts
const expand = (b: Box, by: number): Box => ({
  min: { x: b.min.x - by, y: b.min.y, z: b.min.z - by },
  max: { x: b.max.x + by, y: b.max.y, z: b.max.z + by },
})

export function flatRoof(b: Box, dims: Dims, id: BlockId, overhang: number): GeneratorResult {
  return floorRect(expand(b, overhang), dims, id)
}

export function gableRoof(
  b: Box, dims: Dims, id: BlockId, pitch: number, overhang: number,
): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(expand(b, overhang))
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
```

- [ ] **Step 4: Correr y verificar que pasan**

Esperado: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add src/voxel/generators.ts tests/generators.spec.ts
git commit -m "feat(voxel): gable and flat roof generators"
```

---

## Task 5: Paredes y rampa

**Files:**
- Modify: `src/voxel/generators.ts`, `tests/generators.spec.ts`

**Interfaces:**
- Produces: `walls(box, dims, id, thickness, height)`, `ramp(box, dims, id, step)`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/generators.spec.ts
import { ramp, walls } from '../src/voxel/generators'

test('las paredes son el contorno extruido, con el interior vacío', () => {
  const r = walls(box(0, 0, 0, 9, 0, 9), DIMS, 'minecraft:stone', 1, 3)
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const got = new Set(r.cells.map((c) => key(c.p.x, c.p.y, c.p.z)))

  expect(got.has(key(0, 0, 0))).toBe(true)
  expect(got.has(key(0, 2, 0))).toBe(true)
  expect(got.has(key(5, 1, 5))).toBe(false)   // el centro queda hueco
  expect(got.has(key(0, 3, 0))).toBe(false)   // altura 3 son y = 0,1,2
})

test('un espesor de 2 engorda la pared hacia adentro', () => {
  const uno = walls(box(0, 0, 0, 9, 0, 9), DIMS, 'minecraft:stone', 1, 1)
  const dos = walls(box(0, 0, 0, 9, 0, 9), DIMS, 'minecraft:stone', 2, 1)
  expect(dos.cells.length).toBeGreaterThan(uno.cells.length)
})

test('la rampa sube un escalón cada N bloques', () => {
  const r = ramp(box(0, 0, 0, 9, 0, 2), DIMS, 'minecraft:stone', 2)
  const alturaEn = (x: number) => Math.max(...r.cells.filter((c) => c.p.x === x).map((c) => c.p.y))

  expect(alturaEn(0)).toBe(0)
  expect(alturaEn(2)).toBe(1)
  expect(alturaEn(8)).toBe(4)
})
```

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

```ts
export function walls(
  b: Box, dims: Dims, id: BlockId, thickness: number, height: number,
): GeneratorResult {
  const { x0, x1, y0, z0, z1 } = norm(b)
  const t = Math.max(1, Math.floor(thickness))
  const e = new Emitter(dims)

  for (let y = y0; y < y0 + Math.max(1, height); y++) {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const onEdge =
          x < x0 + t || x > x1 - t || z < z0 + t || z > z1 - t
        if (onEdge) e.put(x, y, z, id)
      }
    }
  }
  return e.done()
}

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
```

- [ ] **Step 4: Correr y verificar que pasan**

Esperado: 20 passed.

- [ ] **Step 5: Commit**

```bash
git add src/voxel/generators.ts tests/generators.spec.ts
git commit -m "feat(voxel): walls and ramp generators"
```

---

## Task 6: Los tres que leen el mundo, y el registro

**Files:**
- Modify: `src/voxel/generators.ts`, `tests/generators.spec.ts`

**Interfaces:**
- Consumes: nada nuevo. Define su propia `WorldView` para no depender de `World`.
- Produces: `WorldView`, `replaceIn(box, dims, view, from, to)`, `hollowOut(box, dims, view)`, `coverSurface(box, dims, view, id)`, `GENERATORS`, `generatorById(id)`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/generators.spec.ts
import { coverSurface, hollowOut, replaceIn, type WorldView } from '../src/voxel/generators'

const viewOf = (filled: Map<string, string>): WorldView => ({
  get: (x, y, z) => filled.get(`${x},${y},${z}`),
})

const solidCube = (n: number, id: string) => {
  const m = new Map<string, string>()
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++)
    m.set(`${x},${y},${z}`, id)
  return m
}

test('reemplazar cambia sólo el material indicado', () => {
  const m = solidCube(3, 'minecraft:stone')
  m.set('1,1,1', 'minecraft:glass')
  const r = replaceIn(box(0, 0, 0, 2, 2, 2), DIMS, viewOf(m), 'minecraft:stone', 'minecraft:oak_planks')

  expect(r.cells.length).toBe(26)
  expect(r.cells.every((c) => c.id === 'minecraft:oak_planks')).toBe(true)
  expect(r.cells.some((c) => c.p.x === 1 && c.p.y === 1 && c.p.z === 1)).toBe(false)
})

test('vaciar saca sólo las celdas con los 6 vecinos llenos', () => {
  const r = hollowOut(box(0, 0, 0, 4, 4, 4), DIMS, viewOf(solidCube(5, 'minecraft:stone')))

  expect(r.cells.length).toBe(27)   // el 3x3x3 interior
  expect(r.cells.every((c) => c.id === undefined)).toBe(true)
})

test('vaciar un cascarón no saca nada', () => {
  const m = new Map<string, string>()
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
    if (x === 1 && y === 1 && z === 1) continue
    m.set(`${x},${y},${z}`, 'minecraft:stone')
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
```

- [ ] **Step 2: Correr y verificar que fallan**

- [ ] **Step 3: Implementar**

```ts
/** Vista mínima del mundo: los generadores no dependen de la clase World. */
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
```

- [ ] **Step 4: Correr y verificar que pasan**

Esperado: 24 passed.

- [ ] **Step 5: Escribir el test del registro, que falla**

Sin un registro, la UI no tiene de dónde sacar los once botones ni sus parámetros.

```ts
// añadir a tests/generators.spec.ts
import { GENERATORS, generatorById } from '../src/voxel/generators'
import { BLOCKS } from '../src/blocks/palette'

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
  const view = { get: () => 'minecraft:stone' as const }
  const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 6, y: 4, z: 6 } }

  for (const g of GENERATORS) {
    const r = g.generate(b, DIMS, { material: 'minecraft:stone', from: 'minecraft:stone' }, view)
    for (const c of r.cells) {
      if (c.id !== undefined) {
        expect(known.has(c.id), `${g.id} produjo un bloque desconocido: ${c.id}`).toBe(true)
      }
    }
  }
})

test('generatorById encuentra y devuelve undefined para lo que no existe', () => {
  expect(generatorById('floor')?.id).toBe('floor')
  expect(generatorById('no-existe')).toBeUndefined()
})
```

- [ ] **Step 6: Implementar el registro**

```ts
export type ParamDef =
  | { key: string; kind: 'block'; label: string; def: BlockId }
  | { key: string; kind: 'bool'; label: string; def: boolean }
  | { key: string; kind: 'int'; label: string; def: number; min: number; max: number }

export type GeneratorParams = Record<string, unknown>

export type GeneratorDef = {
  id: string
  label: string
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
  typeof p[k] === 'number' ? (p[k] as number) : d
const flag = (p: GeneratorParams, k: string, d: boolean) =>
  typeof p[k] === 'boolean' ? (p[k] as boolean) : d

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
      replaceIn(b, d, view!, (p.from as BlockId) ?? 'minecraft:stone', mat(p)) },

  { id: 'hollow', label: 'Vaciar', steps: 1, needsWorld: true, params: [],
    generate: (b, d, _p, view) => hollowOut(b, d, view!) },

  { id: 'cover', label: 'Cubrir', steps: 1, needsWorld: true, params: [material],
    generate: (b, d, p, view) => coverSurface(b, d, view!, mat(p)) },
]

export const generatorById = (id: string): GeneratorDef | undefined =>
  GENERATORS.find((g) => g.id === id)
```

- [ ] **Step 7: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/playwright/cli.js test tests/generators.spec.ts --reporter=list
```

Esperado: 28 passed.

- [ ] **Step 8: Commit**

```bash
git add src/voxel/generators.ts tests/generators.spec.ts
git commit -m "feat(voxel): world-reading generators and the generator registry"
```

---

## Task 7: `History` con presupuesto de deltas

Sin esto, una generación de 130 mil celdas × 100 entradas retiene del orden de un gigabyte.

**Files:**
- Modify: `src/state/history.ts`
- Test: `tests/generators.spec.ts`

**Interfaces:**
- Produces: `DELTA_BUDGET`, y el descarte por presupuesto en `History.push`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a tests/generators.spec.ts
import { History, DELTA_BUDGET } from '../src/state/history'

test('el historial descarta entradas viejas al pasarse del presupuesto', () => {
  const h = new History()
  const bulk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: i, prev: undefined, next: 'minecraft:stone' }))

  const per = Math.floor(DELTA_BUDGET / 3)
  h.push(bulk(per))
  h.push(bulk(per))
  h.push(bulk(per))
  expect(h.depth).toBe(3)

  h.push(bulk(per))
  expect(h.depth).toBeLessThan(4)
})
```

- [ ] **Step 2: Correr y verificar que falla**

Esperado: FAIL, `DELTA_BUDGET` no existe.

- [ ] **Step 3: Implementar**

En `src/state/history.ts`:

```ts
/** A generation can push 130k deltas; 100 of those would retain ~1 GB. */
export const DELTA_BUDGET = 2_000_000
```

En la clase, un contador y el descarte dentro de `push`, después del recorte por `DEPTH`:

```ts
  private deltas = 0

  push(deltas: CellDelta[]) {
    if (deltas.length === 0) return
    const futureLost = this.future.length
    this.past.push(deltas)
    this.deltas += deltas.length
    let pruned = this.past.length > DEPTH
    if (pruned) this.deltas -= this.past.shift()!.length

    while (this.past.length > 1 && this.deltas > DELTA_BUDGET) {
      this.deltas -= this.past.shift()!.length
      pruned = true
    }

    this.future.length = 0
    if (pruned || futureLost) rec(EV.historyPruned, pruned ? DEPTH : NaN, futureLost)
  }
```

`undo` y `redo` mueven entradas entre las pilas sin cambiar `this.deltas`; `clear()` lo pone en 0.

- [ ] **Step 4: Correr y verificar que pasa**

Esperado: 25 passed.

- [ ] **Step 5: Verificar que no se rompió el undo**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/playwright/cli.js test tests/editor.spec.ts --reporter=list
```

Esperado: 8 passed. El test 2 ejercita `Ctrl+Z`.

- [ ] **Step 6: Commit**

```bash
git add src/state/history.ts tests/generators.spec.ts
git commit -m "feat(state): bound history by total deltas, not just depth"
```

---

## Task 8: Store — escritura sin espejo y estado del generador

**Depende del workstream 01 mergeado.**

**Files:**
- Modify: `src/state/store.ts`, `src/debug/events.ts`

**Interfaces:**
- Produces: `applyCellsRaw(cells)`, `activeGenerator`, `generatorBox`, `generatorParams`, `setGenerator`, `setGeneratorBox`, `setGeneratorParams`, `commitGenerator`, `cancelGenerator`.

- [ ] **Step 1: Extraer el núcleo de `applyCells`**

`applyCells` y `applyCellsRaw` comparten todo menos el espejo. Extraer:

```ts
  applyCellsRaw: (cells) => {
    const { world } = get()
    const t0 = performance.now()
    world.beginBatch()
    const deltas: CellDelta[] = []
    for (const c of cells) {
      const d = world.set(c.p.x, c.p.y, c.p.z, c.id)
      if (d) deltas.push(d)
    }
    world.endBatch()
    if (deltas.length === 0) {
      rec(EV.noChange, cells.length, str('no-delta'))
      return
    }
    rec(EV.write, cells.length, deltas.length, world.size, 0, performance.now() - t0)
    history.push(deltas)
    set((s) => ({ rev: s.rev + 1, canUndo: history.canUndo, canRedo: history.canRedo }))
  },
```

Los generadores no pasan por el espejo: la región es explícita y duplicarla sorprendería.

- [ ] **Step 2: Estado del generador**

```ts
  activeGenerator: null as string | null,
  generatorBox: null as Box | null,
  generatorParams: {} as Record<string, unknown>,
```

con `setGenerator`, `setGeneratorBox`, `setGeneratorParams`, y:

```ts
  cancelGenerator: () => {
    if (!get().activeGenerator) return
    rec(EV.generator, str(get().activeGenerator!), NaN, NaN, NaN)
    set({ activeGenerator: null, generatorBox: null })
  },
```

- [ ] **Step 3: Declarar el evento**

`EV.generator` ya está declarado en `src/debug/events.ts` como
`def('edit', 'generator', ['$type', 'cells', 'outsideGrid', 'ms'])`. Verificar el
nombre real antes de usarlo; si difiere, usar el que esté.

- [ ] **Step 4: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/debug/events.ts
git commit -m "feat(state): mirror-free writes and generator state"
```

---

## Task 9: `GeneratorPreview.tsx`

**Files:**
- Create: `src/scene/GeneratorPreview.tsx`

- [ ] **Step 1: Malla única, no una por celda**

Una caja de 60×36×60 son 130 mil celdas: una malla por celda haría la previa más cara que la construcción real. Se arma un `World` temporal y se lo pasa por el mesher que ya existe.

```tsx
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { World } from '../voxel/world'
import { buildChunkGeometry } from '../voxel/mesher'
import type { CellWrite } from '../voxel/generators'
import type { Dims } from '../types'

export function GeneratorPreview({ cells, dims, atlas, world }: {
  cells: CellWrite[]
  dims: Dims
  atlas: THREE.Texture
  world: World
}) {
  const ghostMat = useMemo(() => new THREE.MeshLambertMaterial({
    map: atlas, transparent: true, opacity: 0.45, depthWrite: false,
  }), [atlas])

  const amberMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#e2b04a', transparent: true, opacity: 0.5, depthWrite: false,
  }), [])

  const chunks = useMemo(() => {
    const w = new World(dims)
    w.beginBatch()
    for (const c of cells) if (c.id) w.set(c.p.x, c.p.y, c.p.z, c.id)
    w.endBatch()
    return w.nonEmptyChunks().map((ck) => ({ ck, geo: buildChunkGeometry(w, ck) }))
  }, [cells, dims])

  // Ámbar sobre lo que se va a reemplazar: es el aviso que el spec exige antes
  // de confirmar. Una caja por celda ocupada, no por celda de la región.
  const replacing = useMemo(
    () => cells.filter((c) => world.get(c.p.x, c.p.y, c.p.z) !== undefined).slice(0, 4096),
    [cells, world],
  )

  useEffect(() => () => {
    for (const c of chunks) { c.geo.opaque?.dispose(); c.geo.transparent?.dispose() }
  }, [chunks])

  useEffect(() => () => { ghostMat.dispose(); amberMat.dispose() }, [ghostMat, amberMat])

  return (
    <>
      {chunks.map(({ ck, geo }) => geo.opaque && (
        <mesh key={ck} geometry={geo.opaque} material={ghostMat}
          position={[chunkX(ck) * CHUNK, chunkY(ck) * CHUNK, chunkZ(ck) * CHUNK]} />
      ))}
      {replacing.map((c) => (
        <mesh key={`r${c.p.x},${c.p.y},${c.p.z}`} geometry={UNIT_BOX} material={amberMat}
          scale={1.04} position={[c.p.x + 0.5, c.p.y + 0.5, c.p.z + 0.5]} />
      ))}
    </>
  )
}
```

Importar `chunkX`, `chunkY`, `chunkZ` de `../voxel/world`, `CHUNK` de `../types`, y `UNIT_BOX` de `./Overlays` (la geometría única que el workstream 01 dejó para el cursor).

El `slice(0, 4096)` es deliberado: si la región pisa cien mil bloques, dibujar
cien mil cajas ámbar cuesta más que la construcción entera. Cuatro mil ya
comunican "estás por reemplazar mucho", y el número exacto lo dice el panel.

- [ ] **Step 2: Verificar que compila y commitear**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/typescript/bin/tsc --noEmit
git add src/scene/GeneratorPreview.tsx
git commit -m "feat(scene): single-mesh generator preview"
```

---

## Task 10: `GeneratorPanel.tsx`

**Files:**
- Create: `src/ui/GeneratorPanel.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: El panel**

Textos en español. Números de la caja editables, parámetros del generador leídos
de su `params`, conteo, y confirmación bloqueada si `capped`.

```tsx
import { generatorById, type GeneratorResult } from '../voxel/generators'
import { useEditor } from '../state/store'

export function GeneratorPanel({ result, replacing, onConfirm, onCancel }: {
  result: GeneratorResult
  replacing: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const id = useEditor((s) => s.activeGenerator)
  const box = useEditor((s) => s.generatorBox)
  const params = useEditor((s) => s.generatorParams)
  const setBox = useEditor((s) => s.setGeneratorBox)
  const setParams = useEditor((s) => s.setGeneratorParams)
  const dims = useEditor((s) => s.world.dims)
  const def = id ? generatorById(id) : undefined
  if (!def || !box) return null

  const axis = (k: 'x' | 'y' | 'z', end: 'min' | 'max') => (
    <input
      type="number" value={box[end][k]}
      onChange={(e) => setBox({ ...box, [end]: { ...box[end], [k]: Number(e.target.value) } })}
      aria-label={`${end === 'min' ? 'Desde' : 'Hasta'} ${k.toUpperCase()}`}
    />
  )

  return (
    <div className="gen-panel" data-testid="generator-panel">
      <strong>{def.label}</strong>

      <div className="gen-box">
        <span className="hint">Desde</span>{axis('x', 'min')}{axis('y', 'min')}{axis('z', 'min')}
        <span className="hint">Hasta</span>{axis('x', 'max')}{axis('y', 'max')}{axis('z', 'max')}
      </div>

      {def.params.map((p) => (
        <label key={p.key} className="gen-param">
          <span>{p.label}</span>
          {p.kind === 'bool' ? (
            <input type="checkbox"
              checked={Boolean(params[p.key] ?? p.def)}
              onChange={(e) => setParams({ ...params, [p.key]: e.target.checked })} />
          ) : p.kind === 'int' ? (
            <input type="number" min={p.min} max={p.max}
              value={Number(params[p.key] ?? p.def)}
              onChange={(e) => setParams({ ...params, [p.key]: Number(e.target.value) })} />
          ) : (
            <span className="hint">{String(params[p.key] ?? p.def)}</span>
          )}
        </label>
      ))}

      <p className="count">
        {result.cells.length.toLocaleString('es-AR')} bloques
        {replacing > 0 && <> · reemplaza {replacing}</>}
        {result.outside > 0 && <> · {result.outside} fuera de la grilla</>}
      </p>

      {result.capped && (
        <p className="warn" data-testid="generator-too-big">
          La región es demasiado grande. El máximo es 500 mil bloques.
        </p>
      )}

      <div className="row">
        <button
          onClick={() => setBox({ min: { x: 0, y: 0, z: 0 },
                                  max: { x: dims.x - 1, y: dims.y - 1, z: dims.z - 1 } })}
          title="Usar toda la grilla como región"
        >
          Toda la construcción
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={onCancel}>Cancelar</button>
        <button className="primary" onClick={onConfirm} disabled={result.capped}>Confirmar</button>
      </div>
    </div>
  )
}
```

Los parámetros de tipo `block` muestran el bloque activo y se cambian desde la
paleta, que ya está en pantalla: un selector de bloques propio dentro del panel
sería una segunda paleta peor que la que existe.

- [ ] **Step 2: Verificar que compila y commitear**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/typescript/bin/tsc --noEmit
git add src/ui/GeneratorPanel.tsx src/styles.css
git commit -m "feat(ui): generator panel with counts and size guard"
```

---

## Task 11: El adaptador en `Scene.tsx`

**Depende del workstream 01 mergeado.**

**Files:**
- Modify: `src/scene/Scene.tsx`

- [ ] **Step 1: Interpretar el arrastre como caja**

Con un generador activo, el adaptador **no** reenvía `openStroke` / `closeStroke`
al store —el gesto no escribe nada, y abrirlo dejaría una entrada de historial
vacía— y **no** aplica los commits por celda:

```ts
  const genAnchor = useRef<Cell | null>(null)

  const applyOutput = (out: Output) => {
    const s = useEditor.getState()
    const gen = s.activeGenerator

    if (gen) {
      if (out.commit?.length) {
        if (!genAnchor.current) genAnchor.current = out.commit[0]
        const last = out.commit[out.commit.length - 1]
        s.setGeneratorBox({ min: genAnchor.current, max: last })
      }
      if (out.closeStroke || out.aborted) genAnchor.current = null
      if (controls) controls.enabled = out.orbitEnabled
      return
    }
    // …camino normal, sin cambios
  }
```

- [ ] **Step 2: Montar la previa**

```tsx
  {store.activeGenerator && preview && (
    <GeneratorPreview cells={preview.cells} dims={dims} atlas={atlas} />
  )}
```

- [ ] **Step 3: Correr la suite completa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && node node_modules/playwright/cli.js test --reporter=list
```

- [ ] **Step 4: Commit**

```bash
git add src/scene/Scene.tsx
git commit -m "feat(scene): interpret generator drags as a region"
```

---

## Task 12: Integración y verificación

**Files:**
- Modify: `src/ui/ToolPanel.tsx`, `src/App.tsx`, `README.md`
- Create: `tests/generators-ui.spec.ts`

- [ ] **Step 1: Los once botones en el panel de herramientas**

Se generan del registro, no a mano: agregar un generador no debe pedir tocar la UI.

```tsx
import { GENERATORS } from '../voxel/generators'

<div className="gen-list">
  <h3>Generar</h3>
  {GENERATORS.map((g) => (
    <button
      key={g.id}
      className={active === g.id ? 'on' : ''}
      onClick={() => setGenerator(active === g.id ? null : g.id)}
      title={g.steps === 1
        ? `${g.label}. Arrastrá la región y confirmá.`
        : `${g.label}. Arrastrá la base y después la altura.`}
      data-testid={`gen-${g.id}`}
    >
      {g.label}
      <span className="steps">{g.steps}</span>
    </button>
  ))}
</div>
```

El `<span className="steps">` es la señal de cuántos arrastres pide, que el spec
§2.2 exige para compensar que unos generadores pidan uno y otros dos.

- [ ] **Step 2: Tests de navegador**

```ts
// tests/generators-ui.spec.ts
test('la previa no escribe nada hasta confirmar', async ({ page }) => {
  await ready(page)
  const before = await blockCount(page)
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.setGenerator('floor')
    s.setGeneratorBox({ min: { x: 2, y: 0, z: 2 }, max: { x: 11, y: 0, z: 11 } })
  })
  await page.waitForTimeout(300)
  expect(await blockCount(page)).toBe(before)
  await expect(page.getByTestId('generator-panel')).toBeVisible()
})

test('confirmar entra como una sola entrada de historial', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.setGenerator('floor')
    s.setGeneratorBox({ min: { x: 2, y: 0, z: 2 }, max: { x: 11, y: 0, z: 11 } })
    s.commitGenerator()
  })
  await page.waitForTimeout(300)
  expect(await blockCount(page)).toBe(100)

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  expect(await blockCount(page)).toBe(0)
})

test('Escape cancela sin dejar rastro', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.setGenerator('floor')
    s.setGeneratorBox({ min: { x: 2, y: 0, z: 2 }, max: { x: 11, y: 0, z: 11 } })
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  expect(await blockCount(page)).toBe(0)
  await expect(page.getByTestId('generator-panel')).toBeHidden()
})
```

- [ ] **Step 3: Verificación completa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH"
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/playwright/cli.js test --reporter=list
```

- [ ] **Step 4: Actualizar el README**

Sección de generadores: los once, cuántos arrastres pide cada uno, y que todo entra como una sola entrada de historial.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ToolPanel.tsx src/App.tsx tests/generators-ui.spec.ts README.md
git commit -m "feat: wire generators into the tool panel"
```

---

## Notas para quien ejecute

- **Las tareas 1-7 no dependen de nada** y se pueden hacer ya, en paralelo con los workstreams 01 y 02.
- Las tareas 1-6 modifican el mismo archivo: van en serie.
- **Las tareas 8, 11 y 12 esperan a que `input-model` esté mergeado.**
- El nombre de `EV.generator` y sus campos hay que leerlos de `src/debug/events.ts`: el catálogo pasó por una traducción a inglés.
