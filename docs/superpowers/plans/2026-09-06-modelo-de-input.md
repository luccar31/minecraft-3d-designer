# Modelo de input del editor 3D — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el manejo de gesto del editor 3D por un modelo modal `build` / `navigate` con una máquina de estados pura y testeable, corrigiendo los ocho defectos de control diagnosticados con telemetría.

**Architecture:** La lógica del gesto sale de `Scene.tsx` a un módulo puro (`gesture.ts`) que no importa React, three ni la telemetría: recibe entradas y devuelve qué hacer. La resolución de celda sale a `picking.ts` como única fuente de verdad, consumida tanto por el hover como por la edición. `Scene.tsx` queda como adaptador delgado. Al ser puros, los dos módulos se testean desde Node con el Playwright ya instalado.

**Tech Stack:** TypeScript 5.6, React 18.3, three 0.169, @react-three/fiber 8.18, @react-three/drei 9.122 (OrbitControls de `three-stdlib`), Zustand 4.5, Playwright 1.48.

**Spec:** [`docs/superpowers/specs/2026-09-06-modelo-de-input-design.md`](../specs/2026-09-06-modelo-de-input-design.md)

## Global Constraints

- **Node no está en el PATH.** Todo comando de `node` / `npm` / `npx` va precedido de `export PATH="/c/nvm4w/nodejs:$PATH"`. Verificar con `node -v` → `v24.20.0`.
- **El código es sólo en inglés**: identificadores, tipos, nombres de función, comentarios.
- **Comentarios de 20 palabras o menos**, y sólo para lo que el código no dice por sí mismo — el porqué de una decisión, nunca el qué de una línea.
- **Los textos de interfaz siguen en español.** Botones, labels, mensajes, `title`, `aria-label`.
- **No cambiar `data-testid` existentes**: `block-count`, `view-guide`, `guide-step`, `scene-canvas`. Los tests dependen de ellos.
- **No cambiar las claves de `window.__mcb`**: `store`, `buildSchem`, `buildGuide`, `tel`.
- **La telemetría ya existe** en `src/debug/`. Los nombres exactos de eventos y campos se leen de `src/debug/events.ts`; no inventar nombres nuevos sin declararlos ahí primero.
- **Umbrales**: 4 px con mouse o lápiz, 10 px con touch.
- **En la fase `pending` la órbita va DESHABILITADA.** OrbitControls engancha sus listeners directo al canvas y no pasa por el sistema de eventos de R3F, así que `stopPropagation()` no lo frena: si se deja habilitada, la cámara deriva durante los 4–10 px previos a clasificar el gesto. Se rehabilita sólo en la transición a `navigating` y al salir por `up` o por `abort()`.
- **`Space` transitorio**: 250 ms.
- **Modo inicial**: `build`, siempre. No persiste entre sesiones.
- Al terminar cada tarea, `npm run typecheck` tiene que pasar. Al terminar las tareas 8 en adelante, los 8 tests de `tests/editor.spec.ts` tienen que seguir verdes.

## Trampas del entorno

Descubiertas ejecutando las tareas 1-6. No son opcionales.

- **`tsconfig.json` tiene `include: ["src"]`**, así que `npm run typecheck` **no valida `tests/`**. Un error de tipos en un spec sólo aparece cuando corre Playwright. No confundir "typecheck verde" con "los tests compilan".
- **`noUnusedParameters: true`**: un parámetro declarado y no usado rompe el typecheck. Si una tarea deja un parámetro para tareas posteriores, va con `_` adelante y se renombra cuando se use.
- **Playwright levanta `webServer` en TODA corrida**, incluso la de tests puros de Node, y un worktree recién creado no tiene `dist/`. Solución: dejar **un solo `vite preview` en 127.0.0.1:4173** y que `reuseExistingServer: true` lo reutilice desde todos los worktrees. Eso además elimina el choque de puerto entre worktrees.
- **`node_modules/.bin` desaparece de forma intermitente** (el repo vive en OneDrive y hay varios agentes trabajando). Si `npx` o `npm run <script>` fallan con "no se reconoce como un comando", llamar al binario directo: `node node_modules/typescript/bin/tsc --noEmit` y `node node_modules/playwright/cli.js test`.
- **Las cuentas de "N nuevos FAIL" de este plan no son confiables.** Están mal en varias tareas: algunos tests ya pasan por el passthrough de la tarea anterior, y un import de un módulo inexistente hace fallar la recolección del archivo entero (`Cannot find module` + `No tests found`), no una lista de N rojos. Verificar que el test **falle por el motivo correcto**, no que la cuenta coincida.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/scene/gesture.ts` | **Nuevo.** Máquina de estados del gesto. Función pura `step(state, input, ctx)`. Sin React, sin three, sin I/O. |
| `src/scene/picking.ts` | **Nuevo.** `resolveCell()`: convierte un impacto de raycast en la celda a tocar. Pura. |
| `src/scene/modeKeys.ts` | **Nuevo.** `nextMode()`: resuelve toque vs. mantener de `Space`. Pura. |
| `src/scene/Scene.tsx` | **Reescrito.** Adaptador: eventos de R3F → máquina → store. |
| `src/scene/Overlays.tsx` | **Reescrito.** Fantasma, cara resaltada, cursor. Arregla la fuga de geometría. |
| `src/ui/ModeIndicator.tsx` | **Nuevo.** Botón e indicador del modo activo. |
| `src/ui/CoordReadout.tsx` | **Nuevo.** Lectura de coordenadas del viewport. |
| `src/state/store.ts` | **Modificado.** Agrega `mode` y `setMode`. |
| `tests/gesture.spec.ts` | **Nuevo.** Unitarios de las tres funciones puras. Sin navegador. |
| `tests/input.spec.ts` | **Nuevo.** Integración en navegador real. |

Las tres funciones puras van en archivos separados porque tienen ciclos de test distintos y responsabilidades distintas: una decide *qué fase*, otra *qué celda*, otra *qué modo*. Juntarlas produciría el archivo enredado que estamos desarmando.

---

## Task 1: Tipos y camino del click en `gesture.ts`

**Files:**
- Create: `src/scene/gesture.ts`
- Test: `tests/gesture.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `Mode`, `Phase`, `Mods`, `Cell`, `Input`, `Output`, `Ctx`, `GestureState`, `initialState`, `step(state, input, ctx) → { state, out }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/gesture.spec.ts
import { expect, test } from '@playwright/test'
import { initialState, step, type Ctx, type Mods } from '../src/scene/gesture'

const NO_MODS: Mods = { shift: false, alt: false, ctrl: false, meta: false }
const BUILD: Ctx = { mode: 'build', dragTool: true }

test('un down seguido de up sin movimiento es un click y commitea una celda', () => {
  const down = step(initialState, {
    kind: 'down', pointerId: 1, pointerType: 'mouse', button: 0,
    x: 100, y: 100, cell: { x: 5, y: 0, z: 5 }, mods: NO_MODS,
  }, BUILD)

  expect(down.state.phase).toBe('pending')
  expect(down.out.capture).toBe(1)
  expect(down.out.commit).toBeUndefined()

  const up = step(down.state, { kind: 'up', x: 100, y: 100 }, BUILD)

  expect(up.state.phase).toBe('idle')
  expect(up.out.classified).toBe('click')
  expect(up.out.commit).toEqual([{ x: 5, y: 0, z: 5 }])
  expect(up.out.orbitEnabled).toBe(true)
  expect(up.out.release).toBe(1)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: FAIL, `Cannot find module '../src/scene/gesture'`.

- [ ] **Step 3: Escribir la implementación mínima**

```ts
// src/scene/gesture.ts

export type Mode = 'build' | 'navigate'
export type Phase = 'idle' | 'pending' | 'painting' | 'navigating'

export type Cell = { x: number; y: number; z: number }
export type Mods = { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

export type Input =
  | { kind: 'down'; pointerId: number; pointerType: string; button: number
      x: number; y: number; cell: Cell | null; mods: Mods }
  | { kind: 'move'; x: number; y: number; cell: Cell | null }
  | { kind: 'up'; x: number; y: number }
  | { kind: 'cancel' | 'lostCapture' | 'blur' | 'unmount' }

export type Output = {
  phase: Phase
  orbitEnabled: boolean
  capture?: number
  release?: number
  openStroke?: boolean
  closeStroke?: boolean
  commit?: Cell[]
  classified?: 'click' | 'drag' | 'camera'
  aborted?: 'cancel' | 'lostCapture' | 'blur' | 'unmount'
}

/** `dragTool` distingue pincel y goma del resto: sólo ellas pintan arrastrando. */
export type Ctx = { mode: Mode; dragTool: boolean }

export type GestureState = {
  phase: Phase
  pointerId: number | null
  pointerType: string
  startX: number
  startY: number
  candidate: Cell | null
  lastKey: string
}

export const initialState: GestureState = {
  phase: 'idle',
  pointerId: null,
  pointerType: 'mouse',
  startX: 0,
  startY: 0,
  candidate: null,
  lastKey: '',
}

const idle = (): GestureState => ({ ...initialState })

export function step(
  state: GestureState,
  input: Input,
  ctx: Ctx,
): { state: GestureState; out: Output } {
  if (input.kind === 'down') {
    return {
      state: {
        phase: 'pending',
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        startX: input.x,
        startY: input.y,
        candidate: input.cell,
        lastKey: '',
      },
      out: { phase: 'pending', orbitEnabled: true, capture: input.pointerId },
    }
  }

  if (input.kind === 'up' && state.phase === 'pending') {
    return {
      state: idle(),
      out: {
        phase: 'idle',
        orbitEnabled: true,
        release: state.pointerId ?? undefined,
        classified: 'click',
        commit: state.candidate ? [state.candidate] : [],
      },
    }
  }

  return { state, out: { phase: state.phase, orbitEnabled: true } }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: PASS, 1 passed.

- [ ] **Step 5: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

Esperado: sin salida de error.

- [ ] **Step 6: Commit**

```bash
git add src/scene/gesture.ts tests/gesture.spec.ts
git commit -m "feat(scene): gesture state machine skeleton with click path"
```

---

## Task 2: Umbral y transición a `painting`

**Files:**
- Modify: `src/scene/gesture.ts`
- Test: `tests/gesture.spec.ts`

**Interfaces:**
- Consumes: `step`, `initialState`, `Ctx` de Task 1.
- Produces: constantes `MOUSE_THRESHOLD_PX = 4`, `TOUCH_THRESHOLD_PX = 10`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/gesture.spec.ts
const downAt = (x: number, y: number, cell: Cell | null, pointerType = 'mouse') => ({
  kind: 'down' as const, pointerId: 1, pointerType, button: 0, x, y, cell, mods: NO_MODS,
})

test('moverse menos que el umbral sigue siendo un click', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
  const b = step(a.state, { kind: 'move', x: 102, y: 101, cell: { x: 2, y: 0, z: 1 } }, BUILD)

  expect(b.state.phase).toBe('pending')
  expect(b.out.commit).toBeUndefined()

  const c = step(b.state, { kind: 'up', x: 102, y: 101 }, BUILD)
  expect(c.out.classified).toBe('click')
  expect(c.out.commit).toEqual([{ x: 1, y: 0, z: 1 }])
})

test('cruzar el umbral abre el trazo y commitea la celda candidata', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
  const b = step(a.state, { kind: 'move', x: 106, y: 100, cell: { x: 2, y: 0, z: 1 } }, BUILD)

  expect(b.state.phase).toBe('painting')
  expect(b.out.openStroke).toBe(true)
  expect(b.out.orbitEnabled).toBe(false)
  expect(b.out.commit).toEqual([{ x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }])
})

test('pintando, sólo commitea cuando la celda cambia', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
  const b = step(a.state, { kind: 'move', x: 110, y: 100, cell: { x: 2, y: 0, z: 1 } }, BUILD)
  const c = step(b.state, { kind: 'move', x: 111, y: 100, cell: { x: 2, y: 0, z: 1 } }, BUILD)
  const d = step(c.state, { kind: 'move', x: 118, y: 100, cell: { x: 3, y: 0, z: 1 } }, BUILD)

  expect(c.out.commit).toBeUndefined()
  expect(d.out.commit).toEqual([{ x: 3, y: 0, z: 1 }])
})

test('con touch el umbral es de 10 px', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }, 'touch'), BUILD)
  const b = step(a.state, { kind: 'move', x: 106, y: 100, cell: { x: 2, y: 0, z: 1 } }, BUILD)
  expect(b.state.phase).toBe('pending')

  const c = step(b.state, { kind: 'move', x: 112, y: 100, cell: { x: 3, y: 0, z: 1 } }, BUILD)
  expect(c.state.phase).toBe('painting')
})

test('soltar mientras se pinta cierra el trazo y restaura la órbita', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
  const b = step(a.state, { kind: 'move', x: 110, y: 100, cell: { x: 2, y: 0, z: 1 } }, BUILD)
  const c = step(b.state, { kind: 'up', x: 110, y: 100 }, BUILD)

  expect(c.state.phase).toBe('idle')
  expect(c.out.closeStroke).toBe(true)
  expect(c.out.orbitEnabled).toBe(true)
  expect(c.out.classified).toBe('drag')
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 5 nuevos FAIL, 1 PASS.

- [ ] **Step 3: Implementar**

Añadir a `src/scene/gesture.ts`, y reemplazar el `step` de Task 1:

```ts
export const MOUSE_THRESHOLD_PX = 4
export const TOUCH_THRESHOLD_PX = 10

const thresholdFor = (pointerType: string) =>
  pointerType === 'touch' ? TOUCH_THRESHOLD_PX : MOUSE_THRESHOLD_PX

const keyOf = (c: Cell | null) => (c ? `${c.x},${c.y},${c.z}` : '')

export function step(
  state: GestureState,
  input: Input,
  ctx: Ctx,
): { state: GestureState; out: Output } {
  if (input.kind === 'down') {
    return {
      state: {
        phase: 'pending',
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        startX: input.x,
        startY: input.y,
        candidate: input.cell,
        lastKey: '',
      },
      out: { phase: 'pending', orbitEnabled: true, capture: input.pointerId },
    }
  }

  if (input.kind === 'move' && state.phase === 'pending') {
    const dx = input.x - state.startX
    const dy = input.y - state.startY
    if (Math.hypot(dx, dy) <= thresholdFor(state.pointerType)) {
      return { state, out: { phase: 'pending', orbitEnabled: true } }
    }
    const commit: Cell[] = []
    if (state.candidate) commit.push(state.candidate)
    if (input.cell && keyOf(input.cell) !== keyOf(state.candidate)) commit.push(input.cell)
    return {
      state: { ...state, phase: 'painting', lastKey: keyOf(input.cell ?? state.candidate) },
      out: {
        phase: 'painting', orbitEnabled: false, openStroke: true,
        classified: 'drag', commit,
      },
    }
  }

  if (input.kind === 'move' && state.phase === 'painting') {
    const key = keyOf(input.cell)
    if (!input.cell || key === state.lastKey) {
      return { state, out: { phase: 'painting', orbitEnabled: false } }
    }
    return {
      state: { ...state, lastKey: key },
      out: { phase: 'painting', orbitEnabled: false, commit: [input.cell] },
    }
  }

  if (input.kind === 'up' && state.phase === 'pending') {
    return {
      state: idle(),
      out: {
        phase: 'idle', orbitEnabled: true, release: state.pointerId ?? undefined,
        classified: 'click', commit: state.candidate ? [state.candidate] : [],
      },
    }
  }

  if (input.kind === 'up' && state.phase === 'painting') {
    return {
      state: idle(),
      out: {
        phase: 'idle', orbitEnabled: true, release: state.pointerId ?? undefined,
        closeStroke: true, classified: 'drag',
      },
    }
  }

  return { state, out: { phase: state.phase, orbitEnabled: state.phase !== 'painting' } }
}
```

Nota: `ctx` todavía no se usa; entra en Task 4. Dejarlo en la firma para no romper las llamadas.

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/gesture.ts tests/gesture.spec.ts
git commit -m "feat(scene): click/drag threshold and painting phase"
```

---

## Task 3: `abort()` y los cuatro caminos de cancelación

Este es el defecto que deja la app trabada hasta recargar. Los cuatro eventos tienen que salir por **una sola** función.

**Files:**
- Modify: `src/scene/gesture.ts`
- Test: `tests/gesture.spec.ts`

**Interfaces:**
- Consumes: todo lo de Tasks 1–2.
- Produces: `out.aborted` con el motivo.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/gesture.spec.ts
const ABORTS = ['cancel', 'lostCapture', 'blur', 'unmount'] as const

for (const kind of ABORTS) {
  test(`${kind} durante el pintado restaura la órbita y cierra el trazo`, () => {
    const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
    const b = step(a.state, { kind: 'move', x: 110, y: 100, cell: { x: 2, y: 0, z: 1 } }, BUILD)
    const c = step(b.state, { kind }, BUILD)

    expect(c.state.phase).toBe('idle')
    expect(c.out.orbitEnabled).toBe(true)
    expect(c.out.closeStroke).toBe(true)
    expect(c.out.release).toBe(1)
    expect(c.out.aborted).toBe(kind)
    expect(c.out.commit).toBeUndefined()
  })

  test(`${kind} en pending no deja trazo abierto`, () => {
    const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
    const b = step(a.state, { kind }, BUILD)

    expect(b.state.phase).toBe('idle')
    expect(b.out.orbitEnabled).toBe(true)
    expect(b.out.closeStroke).toBeUndefined()
    expect(b.out.aborted).toBe(kind)
  })
}

test('abortar dos veces seguidas es inocuo', () => {
  const a = step(initialState, downAt(100, 100, null), BUILD)
  const b = step(a.state, { kind: 'cancel' }, BUILD)
  const c = step(b.state, { kind: 'cancel' }, BUILD)

  expect(c.state.phase).toBe('idle')
  expect(c.out.orbitEnabled).toBe(true)
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 9 nuevos FAIL.

- [ ] **Step 3: Implementar**

Insertar al principio de `step`, antes de la rama de `down`:

```ts
  if (
    input.kind === 'cancel' || input.kind === 'lostCapture' ||
    input.kind === 'blur' || input.kind === 'unmount'
  ) {
    // Único camino de salida. Antes eran cuatro y tres dejaban la órbita muerta.
    return {
      state: idle(),
      out: {
        phase: 'idle',
        orbitEnabled: true,
        release: state.pointerId ?? undefined,
        closeStroke: state.phase === 'painting' ? true : undefined,
        aborted: input.kind,
      },
    }
  }
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 15 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/gesture.ts tests/gesture.spec.ts
git commit -m "feat(scene): single abort path for cancel, lost capture, blur and unmount"
```

---

## Task 4: Modo `navigate`, botón del medio y herramientas de click

Acá entra `ctx`. El invariante de esta tarea es el más importante del plan.

**Files:**
- Modify: `src/scene/gesture.ts`
- Test: `tests/gesture.spec.ts`

**Interfaces:**
- Consumes: `Ctx { mode, dragTool }`.
- Produces: fase `navigating`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/gesture.spec.ts
const NAVIGATE: Ctx = { mode: 'navigate', dragTool: true }
const CLICK_TOOL: Ctx = { mode: 'build', dragTool: false }

test('INVARIANTE: en modo navigate ninguna entrada produce una escritura', () => {
  const secuencia: Input[] = [
    { kind: 'down', pointerId: 1, pointerType: 'mouse', button: 0,
      x: 100, y: 100, cell: { x: 1, y: 0, z: 1 }, mods: NO_MODS },
    { kind: 'move', x: 140, y: 130, cell: { x: 4, y: 0, z: 3 } },
    { kind: 'move', x: 180, y: 160, cell: { x: 8, y: 0, z: 6 } },
    { kind: 'up', x: 180, y: 160 },
  ]

  let s = initialState
  for (const input of secuencia) {
    const r = step(s, input, NAVIGATE)
    expect(r.out.commit ?? []).toEqual([])
    expect(r.out.openStroke).toBeUndefined()
    s = r.state
  }
  expect(s.phase).toBe('idle')
})

test('en modo navigate el down va directo a navigating y no captura', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), NAVIGATE)
  expect(a.state.phase).toBe('navigating')
  expect(a.out.orbitEnabled).toBe(true)
  expect(a.out.capture).toBeUndefined()
})

test('el botón del medio navega aunque el modo sea build', () => {
  const a = step(initialState, { ...downAt(100, 100, { x: 1, y: 0, z: 1 }), button: 1 }, BUILD)
  expect(a.state.phase).toBe('navigating')
  expect(a.out.commit).toBeUndefined()
})

test('en build, un down sobre nada va a la cámara', () => {
  const a = step(initialState, downAt(100, 100, null), BUILD)
  expect(a.state.phase).toBe('navigating')
})

test('con una herramienta de click, arrastrar navega en vez de pintar', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), CLICK_TOOL)
  expect(a.state.phase).toBe('pending')

  const b = step(a.state, { kind: 'move', x: 130, y: 100, cell: { x: 4, y: 0, z: 1 } }, CLICK_TOOL)
  expect(b.state.phase).toBe('navigating')
  expect(b.out.commit).toBeUndefined()
  expect(b.out.openStroke).toBeUndefined()
})

test('con una herramienta de click, un click sí commitea', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), CLICK_TOOL)
  const b = step(a.state, { kind: 'up', x: 100, y: 100 }, CLICK_TOOL)
  expect(b.out.commit).toEqual([{ x: 1, y: 0, z: 1 }])
})

test('soltar tras navegar vuelve a idle sin escribir', () => {
  const a = step(initialState, downAt(100, 100, null), BUILD)
  const b = step(a.state, { kind: 'up', x: 100, y: 100 }, BUILD)
  expect(b.state.phase).toBe('idle')
  expect(b.out.commit).toBeUndefined()
  expect(b.out.classified).toBe('camera')
})
```

Añadir `import type { Input } from '../src/scene/gesture'` al bloque de imports del archivo de test.

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 7 nuevos FAIL.

- [ ] **Step 3: Implementar**

Reemplazar la rama de `down` por:

```ts
  if (input.kind === 'down') {
    const toCamera =
      ctx.mode === 'navigate' || input.button !== 0 || input.cell === null
    if (toCamera) {
      return {
        state: { ...idle(), phase: 'navigating', pointerId: input.pointerId,
                 pointerType: input.pointerType, startX: input.x, startY: input.y },
        out: { phase: 'navigating', orbitEnabled: true },
      }
    }
    return {
      state: {
        phase: 'pending', pointerId: input.pointerId, pointerType: input.pointerType,
        startX: input.x, startY: input.y, candidate: input.cell, lastKey: '',
      },
      out: { phase: 'pending', orbitEnabled: true, capture: input.pointerId },
    }
  }
```

En la rama de `move` sobre `pending`, después del chequeo de umbral, insertar antes de construir el commit:

```ts
    if (!ctx.dragTool) {
      // Línea, rectángulo, relleno, selección y cuentagotas no pintan arrastrando.
      return {
        state: { ...state, phase: 'navigating' },
        out: { phase: 'navigating', orbitEnabled: true, release: state.pointerId ?? undefined },
      }
    }
```

Añadir la rama de `up` sobre `navigating`, antes del `return` final:

```ts
  if (input.kind === 'up' && state.phase === 'navigating') {
    return {
      state: idle(),
      out: { phase: 'idle', orbitEnabled: true, classified: 'camera' },
    }
  }
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 22 passed.

- [ ] **Step 5: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/scene/gesture.ts tests/gesture.spec.ts
git commit -m "feat(scene): navigate mode, middle button and click-only tools"
```

---

## Task 5: `picking.ts` — resolución de celda

Cierra los defectos 3 (el cursor miente) y 4 (la goma apunta a `y = -1`).

**Files:**
- Create: `src/scene/picking.ts`
- Test: `tests/gesture.spec.ts`

**Interfaces:**
- Consumes: `Cell`, `Mods` de `gesture.ts`.
- Produces: `HitKind`, `Hit`, `Resolution`, `resolveCell(hit, mods, tool, dims) → Resolution`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/gesture.spec.ts
import { resolveCell, type Hit } from '../src/scene/picking'

const DIMS = { x: 16, y: 12, z: 16 }
const hitOn = (kind: Hit['kind'], point: [number, number, number],
               normal: [number, number, number]): Hit =>
  ({ kind, point: { x: point[0], y: point[1], z: point[2] },
     normal: { x: normal[0], y: normal[1], z: normal[2] } })

test('sobre la cara superior de un bloque, colocar va arriba', () => {
  const r = resolveCell(hitOn('block', [7.5, 2, 7.5], [0, 1, 0]), NO_MODS, 'brush', DIMS)
  expect(r.target).toEqual({ x: 7, y: 1, z: 7 })
  expect(r.placement).toEqual({ x: 7, y: 2, z: 7 })
  expect(r.chosen).toEqual({ x: 7, y: 2, z: 7 })
  expect(r.action).toBe('place')
  expect(r.valid).toBe(true)
})

test('sobre el build plate no hay bloque objetivo', () => {
  const r = resolveCell(hitOn('plate', [4.5, 0, 8.5], [0, 1, 0]), NO_MODS, 'brush', DIMS)
  expect(r.target).toBeNull()
  expect(r.placement).toEqual({ x: 4, y: 0, z: 8 })
  expect(r.chosen).toEqual({ x: 4, y: 0, z: 8 })
})

test('la goma sobre el build plate no tiene nada que borrar', () => {
  const r = resolveCell(hitOn('plate', [4.5, 0, 8.5], [0, 1, 0]), NO_MODS, 'eraser', DIMS)
  expect(r.target).toBeNull()
  expect(r.chosen).toBeNull()
  expect(r.action).toBe('none')
  expect(r.valid).toBe(false)
})

test('shift convierte colocar en borrar sobre el bloque apuntado', () => {
  const mods = { ...NO_MODS, shift: true }
  const r = resolveCell(hitOn('block', [7.5, 2, 7.5], [0, 1, 0]), mods, 'brush', DIMS)
  expect(r.action).toBe('erase')
  expect(r.chosen).toEqual({ x: 7, y: 1, z: 7 })
})

test('alt es cuentagotas sobre el bloque apuntado', () => {
  const mods = { ...NO_MODS, alt: true }
  const r = resolveCell(hitOn('block', [7.5, 2, 7.5], [0, 1, 0]), mods, 'brush', DIMS)
  expect(r.action).toBe('pick')
  expect(r.chosen).toEqual({ x: 7, y: 1, z: 7 })
})

test('colocar fuera de la grilla es inválido', () => {
  const r = resolveCell(hitOn('block', [7.5, 12, 7.5], [0, 1, 0]), NO_MODS, 'brush', DIMS)
  expect(r.placement).toEqual({ x: 7, y: 12, z: 7 })
  expect(r.valid).toBe(false)
})

test('la cara devuelta es la del bloque de apoyo', () => {
  const r = resolveCell(hitOn('block', [7.5, 2, 7.5], [0, 1, 0]), NO_MODS, 'brush', DIMS)
  expect(r.face).not.toBeNull()
  expect(r.face!.normal).toEqual({ x: 0, y: 1, z: 0 })
  expect(r.face!.center).toEqual({ x: 7.5, y: 2, z: 7.5 })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 7 nuevos FAIL, `Cannot find module '../src/scene/picking'`.

- [ ] **Step 3: Implementar**

```ts
// src/scene/picking.ts
import type { Cell, Mods } from './gesture'
import type { Dims, Tool } from '../types'

/** `plate` y `slice` son planos sin espesor: no hay bloque detrás de ellos. */
export type HitKind = 'block' | 'plate' | 'slice'

export type Hit = {
  kind: HitKind
  point: { x: number; y: number; z: number }
  normal: { x: number; y: number; z: number }
}

export type Action = 'place' | 'erase' | 'pick' | 'none'

/** El centro de una cara cae en medios: no es una celda entera. */
export type Vec3f = { x: number; y: number; z: number }

export type Resolution = {
  target: Cell | null
  placement: Cell | null
  chosen: Cell | null
  action: Action
  face: { center: Vec3f; normal: Vec3f } | null
  valid: boolean
}

const EPS = 1e-4

const offsetFloor = (
  p: Hit['point'], n: Hit['normal'], sign: number,
): Cell => ({
  x: Math.floor(p.x + sign * n.x * 0.5 + (sign > 0 ? EPS : -EPS) * n.x),
  y: Math.floor(p.y + sign * n.y * 0.5 + (sign > 0 ? EPS : -EPS) * n.y),
  z: Math.floor(p.z + sign * n.z * 0.5 + (sign > 0 ? EPS : -EPS) * n.z),
})

const inBounds = (c: Cell, d: Dims) =>
  c.x >= 0 && c.y >= 0 && c.z >= 0 && c.x < d.x && c.y < d.y && c.z < d.z

export function resolveCell(
  hit: Hit,
  mods: Mods,
  tool: Tool,
  dims: Dims,
): Resolution {
  const target = hit.kind === 'block' ? offsetFloor(hit.point, hit.normal, -1) : null
  const placement = offsetFloor(hit.point, hit.normal, 1)

  let action: Action =
    mods.alt || tool === 'picker' ? 'pick'
      : mods.shift || tool === 'eraser' ? 'erase'
        : 'place'

  let chosen = action === 'place' ? placement : target
  if (chosen === null) action = 'none'

  const face = target
    ? {
        center: {
          x: target.x + 0.5 + hit.normal.x * 0.5,
          y: target.y + 0.5 + hit.normal.y * 0.5,
          z: target.z + 0.5 + hit.normal.z * 0.5,
        },
        normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      }
    : null

  return {
    target,
    placement,
    chosen,
    action,
    face,
    valid: chosen !== null && inBounds(chosen, dims),
  }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 29 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/picking.ts tests/gesture.spec.ts
git commit -m "feat(scene): single source of truth for cell resolution"
```

---

## Task 6: `modeKeys.ts` — toque vs. mantener

**Files:**
- Create: `src/scene/modeKeys.ts`
- Test: `tests/gesture.spec.ts`

**Interfaces:**
- Consumes: `Mode` de `gesture.ts`.
- Produces: `SpaceState`, `spaceDown(mode, now)`, `spaceUp(state, mode, now, cameraMoved)`, `TRANSIENT_MS = 250`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/gesture.spec.ts
import { spaceDown, spaceUp } from '../src/scene/modeKeys'

test('un toque corto de Space alterna de build a navigate', () => {
  const d = spaceDown('build', 1000)
  expect(d.mode).toBe('navigate')
  const u = spaceUp(d.state, 1100, false)
  expect(u.mode).toBe('navigate')
})

test('un toque corto de Space alterna de navigate a build', () => {
  const d = spaceDown('navigate', 1000)
  expect(d.mode).toBe('navigate')
  const u = spaceUp(d.state, 1100, false)
  expect(u.mode).toBe('build')
})

test('mantener Space y soltar restaura el modo previo', () => {
  const d = spaceDown('build', 1000)
  const u = spaceUp(d.state, 1600, false)
  expect(u.mode).toBe('build')
})

test('mover la cámara mientras se mantiene lo hace transitorio aunque sea rápido', () => {
  const d = spaceDown('build', 1000)
  const u = spaceUp(d.state, 1100, true)
  expect(u.mode).toBe('build')
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 4 nuevos FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/scene/modeKeys.ts
import type { Mode } from './gesture'

export const TRANSIENT_MS = 250

export type SpaceState = { modeAtPress: Mode; pressedAt: number }

export function spaceDown(mode: Mode, now: number): { mode: Mode; state: SpaceState } {
  return {
    mode: mode === 'build' ? 'navigate' : mode,
    state: { modeAtPress: mode, pressedAt: now },
  }
}

/**
 * La ambigüedad se resuelve al soltar: sin `cameraMoved`, orbitar rápido
 * quedaría leído como toque y cambiaría el modo sin que el usuario lo pida.
 */
export function spaceUp(
  state: SpaceState,
  now: number,
  cameraMoved: boolean,
): { mode: Mode } {
  const tap = now - state.pressedAt < TRANSIENT_MS && !cameraMoved
  if (!tap) return { mode: state.modeAtPress }
  return { mode: state.modeAtPress === 'build' ? 'navigate' : 'build' }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/gesture.spec.ts --reporter=list
```

Esperado: 33 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/modeKeys.ts tests/gesture.spec.ts
git commit -m "feat(scene): space tap toggles mode, hold is transient"
```

---

## Task 7: `mode` en el store

**Files:**
- Modify: `src/state/store.ts`

**Interfaces:**
- Consumes: `Mode` de `src/scene/gesture.ts`.
- Produces: `EditorState.mode: Mode`, `EditorState.setMode(m: Mode): void`.

- [ ] **Step 1: Añadir el campo al tipo**

En `src/state/store.ts`, en `export type EditorState`, después de `showGrid: boolean`:

```ts
  mode: Mode
```

Y en el bloque de acciones, después de `setView`:

```ts
  setMode: (m: Mode) => void
```

Importar el tipo arriba:

```ts
import type { Mode } from '../scene/gesture'
```

- [ ] **Step 2: Añadir el valor inicial y la acción**

En el objeto que devuelve `create<EditorState>`, después de `showGrid: true`:

```ts
  mode: 'build',
```

Y junto a `setView`:

```ts
  setMode: (mode) => {
    if (get().mode === mode) return
    rec(EV.mode, str(get().mode), str(mode))
    set({ mode })
  },
```

- [ ] **Step 3: Declarar el evento de telemetría**

En `src/debug/events.ts`, junto a los otros eventos de la categoría de herramienta:

```ts
  mode: def('tool', 'mode', ['$from', '$to'], LEVEL.ACTIONS),
```

Si los nombres de categoría o de nivel difieren, usar los que estén en el archivo: **no inventar**.

- [ ] **Step 4: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/state/store.ts src/debug/events.ts
git commit -m "feat(state): add build/navigate mode to the editor store"
```

---

## Task 8: `Scene.tsx` como adaptador

La tarea grande. Conecta las tres funciones puras con R3F y el store.

**Files:**
- Modify: `src/scene/Scene.tsx`
- Test: `tests/input.spec.ts`

**Interfaces:**
- Consumes: `step`, `initialState`, `resolveCell`, `store.mode`.
- Produces: nada nuevo hacia afuera.

- [ ] **Step 1: Escribir el test de integración que falla**

```ts
// tests/input.spec.ts
import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => Boolean(window.__mcb))
  await page.waitForTimeout(400)
}

async function platform(page: Page) {
  await page.evaluate(() => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Input')
    st().setSliceView('off')
    st().setTool('brush')
    st().setBlock('minecraft:stone')
    const cells = []
    for (let x = 5; x <= 10; x++) for (let z = 5; z <= 10; z++)
      cells.push({ p: { x, y: 0, z }, id: 'minecraft:stone' })
    st().applyCells(cells)
    st().requestFit()
  })
  await page.waitForTimeout(700)
}

const count = (page: Page) =>
  page.evaluate(() => window.__mcb.store.getState().world.size)

test('en modo build, arrastrar sobre la construcción pinta', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBeGreaterThan(before)
})

test('en modo navigate, el mismo arrastre no escribe nada', async ({ page }) => {
  await ready(page)
  await platform(page)
  await page.evaluate(() => window.__mcb.store.getState().setMode('navigate'))
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before)
})

test('un click con temblor coloca exactamente un bloque', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1)
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before + 1)
})

test('el cursor y la edición resuelven a la misma celda', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.mouse.move(cx, cy)
  await page.waitForTimeout(150)
  const hover = await page.evaluate(() => window.__mcb.store.getState().hover)

  await page.mouse.click(cx, cy)
  await page.waitForTimeout(200)

  const escrita = await page.evaluate((h) => {
    const w = window.__mcb.store.getState().world
    return h ? Boolean(w.get(h.x, h.y, h.z)) : false
  }, hover)

  expect(hover).not.toBeNull()
  expect(escrita).toBe(true)
})

test('la goma sobre el piso vacío no apunta debajo de la grilla', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Goma')
    st().setSliceView('off')
    st().setTool('eraser')
    window.__mcb.tel.clear()
  })
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60)
  await page.waitForTimeout(200)

  const bajoGrilla = await page.evaluate(() => {
    const eventos = JSON.parse(window.__mcb.tel.toJSON()).events as
      { ev: string; data?: Record<string, number> }[]
    return eventos.some((e) => e.ev.startsWith('hover') && (e.data?.y ?? 0) < 0)
  })

  expect(bajoGrilla).toBe(false)
  expect(await page.evaluate(() => window.__mcb.store.getState().hover)).toBeNull()
})

test('en navigate, el registro no contiene ninguna escritura durante el gesto', async ({ page }) => {
  await ready(page)
  await platform(page)
  await page.evaluate(() => {
    window.__mcb.store.getState().setMode('navigate')
    window.__mcb.tel.clear()
  })
  const box = (await page.locator('canvas').boundingBox())!

  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  const escrituras = await page.evaluate(() => {
    const eventos = JSON.parse(window.__mcb.tel.toJSON()).events as { ev: string }[]
    return eventos.filter((e) => e.ev === 'write' || e.ev === 'escritura').length
  })
  expect(escrituras).toBe(0)
})
```

El último test es la versión en runtime del invariante de §4.5 del spec: verifica la **secuencia** de eventos, no sólo el estado final. Comparar `world.size` antes y después pasa igual si dos bugs se cancelan.

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/input.spec.ts --reporter=list
```

Esperado: el segundo test FALLA (hoy el modo no existe, `setMode` no está en el store del build viejo — si `setMode` ya existe por Task 7, falla porque el arrastre pinta igual). El tercero FALLA porque el temblor pinta más de un bloque.

- [ ] **Step 3: Reescribir el manejo de gesto en `Scene.tsx`**

Dentro de `Editor()`, reemplazar `applyAtPoint`, `endDrag` y `onDown` por:

```ts
  const gesture = useRef(initialState)
  const canvasEl = gl.domElement

  const hitFrom = useCallback((e: ThreeEvent<PointerEvent>): Hit => {
    const name = e.object.name
    const kind: HitKind =
      name === 'build-plate' ? 'plate' : name === 'slice-plane' ? 'slice' : 'block'
    const n = worldNormal(e)
    return { kind, point: { x: e.point.x, y: e.point.y, z: e.point.z },
             normal: { x: n.x, y: n.y, z: n.z } }
  }, [])

  const modsOf = (e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) =>
    ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey })

  const ctxNow = (): Ctx => {
    const s = useEditor.getState()
    return { mode: s.mode, dragTool: s.tool === 'brush' || s.tool === 'eraser' }
  }

  const apply = useCallback((out: Output) => {
    const s = useEditor.getState()
    if (controls) controls.enabled = out.orbitEnabled
    if (out.capture !== undefined) {
      try {
        canvasEl.setPointerCapture(out.capture)
        rec(EV.pointerCapture, out.capture, 1)
      } catch {
        rec(EV.pointerCapture, out.capture, 0)
      }
    }
    if (out.release !== undefined) {
      try { canvasEl.releasePointerCapture(out.release) } catch { /* ya liberado */ }
    }
    if (out.openStroke) s.beginStroke()
    if (out.commit?.length) {
      const r = pendingRes.current
      const erase = r?.action === 'erase'
      // En modo capa manda `planeAction`: es lo que implementa los anclajes de
      // línea, rectángulo y selección, y el flood de relleno.
      if (s.sliceView !== 'off') {
        for (const c of out.commit) s.planeAction(worldToPlane(s.sliceAxis, c), erase)
      } else if (r?.action === 'pick') {
        s.pickAt(out.commit[0])
      } else {
        s.applyCells(out.commit.map((c) => ({ p: c, id: erase ? undefined : s.block })))
      }
    }
    if (out.closeStroke) s.endStroke()
    if (out.classified) rec(EV.gestureClassified, str(out.classified), NaN, NaN)
    if (out.aborted) rec(EV.gestureAborted, str(out.aborted), NaN)
  }, [controls, canvasEl])
```

**Por qué esta rama no es opcional.** Sin ella, `line`, `rect`, `fill` y `select` dejan de funcionar: los tres primeros necesitan los anclajes de dos clicks y el flood, que viven en `planeAction`. Y `setTool('line')` **fuerza** el modo capa, así que la herramienta se elige y no hace nada.

**Y `tests/editor.spec.ts` no puede atrapar esto**: sus tests de modo capa llaman a `planeAction` directamente en vez de clickear el canvas. Por eso la Task 8 tiene que agregar un test que clickee de verdad en modo capa:

```ts
test('en modo capa, un click dibuja en la celda de la capa activa', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 16, y: 12, z: 16 }, 'Capa')
    s.setSliceView('isolate')
    s.setSliceIndex(3)
    s.setTool('brush')
  })
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)

  const ys = await page.evaluate(() => {
    const w = window.__mcb.store.getState().world
    return [...w.voxels.keys()].map((k) => (k >>> 10) & 1023)
  })
  expect(ys.length).toBeGreaterThan(0)
  expect(new Set(ys)).toEqual(new Set([3]))
})

  const feed = useCallback((input: Input) => {
    const { state, out } = step(gesture.current, input, ctxNow())
    gesture.current = state
    apply(out)
  }, [apply])
```

Donde `pendingRes` es un `useRef<Resolution | null>(null)` que guarda la última resolución, y se actualiza en `onDown` y en cada `move`.

`onDown` pasa a:

```ts
  const onDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    touchClock()
    e.stopPropagation()
    const s = useEditor.getState()
    const res = resolveCell(hitFrom(e), modsOf(e), s.tool, s.world.dims)
    pendingRes.current = res
    beginGesture()
    rec(EV.pointerDown, str(e.pointerType || 'mouse'), e.clientX, e.clientY,
        e.button, packMods(e), e.intersections?.length ?? NaN)
    feed({
      kind: 'down', pointerId: e.pointerId, pointerType: e.pointerType || 'mouse',
      button: e.button, x: e.clientX, y: e.clientY,
      cell: res.valid ? res.chosen : null, mods: modsOf(e),
    })
  }, [feed, hitFrom])
```

**Durante el arrastre no hay raycast contra la escena**: el puntero está capturado y los eventos vienen de `window`, no de R3F. La celda sale de intersectar el rayo con el plano congelado en el `pointerdown`, igual que hoy. `cellFromDragPlane` reusa `resolveCell` con un impacto sintético, para que el arrastre y el click resuelvan por el mismo camino:

```ts
  const dragPlane = useRef<THREE.Plane | null>(null)
  const dragNormal = useRef(new THREE.Vector3(0, 1, 0))
  const pendingRes = useRef<Resolution | null>(null)
  const lastHit = useRef<Hit | null>(null)

  const cellFromDragPlane = useCallback((p: THREE.Vector3): Cell | null => {
    const s = useEditor.getState()
    const n = dragNormal.current
    const hit: Hit = {
      kind: 'block',
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: n.x, y: n.y, z: n.z },
    }
    const res = resolveCell(hit, dragMods.current, s.tool, s.world.dims)
    pendingRes.current = res
    return res.valid ? res.chosen : null
  }, [])
```

`dragMods` es un `useRef<Mods>` congelado en el `pointerdown`: soltar `Shift` a mitad de arrastre no debe cambiar la acción en curso.

En `onDown`, antes de llamar a `feed`, congelar el plano:

```ts
    dragNormal.current.set(res.face?.normal.x ?? 0, res.face?.normal.y ?? 1, res.face?.normal.z ?? 0)
    dragPlane.current = new THREE.Plane().setFromNormalAndCoplanarPoint(dragNormal.current, e.point)
    dragMods.current = modsOf(e)
    lastHit.current = hitFrom(e)
```

Los listeners de ventana se registran **una vez** en un `useEffect`, no dentro de `onDown` — así dejan de acumularse:

```ts
  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      touchClock()
      if (gesture.current.phase === 'idle') return
      const p = rayPointOnDragPlane(ev)
      const cell = p ? cellFromDragPlane(p) : null
      feed({ kind: 'move', x: ev.clientX, y: ev.clientY, cell })
    }
    const onUp = (ev: PointerEvent) => {
      touchClock()
      feed({ kind: 'up', x: ev.clientX, y: ev.clientY })
      endGesture()
    }
    const onCancel = () => { feed({ kind: 'cancel' }); endGesture() }
    const onLost = () => { feed({ kind: 'lostCapture' }); endGesture() }
    const onBlur = () => { feed({ kind: 'blur' }); endGesture() }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
    canvasEl.addEventListener('lostpointercapture', onLost)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      canvasEl.removeEventListener('lostpointercapture', onLost)
      feed({ kind: 'unmount' })
    }
  }, [feed, canvasEl, rayPointOnDragPlane])
```

- [ ] **Step 4: Nombrar las mallas para que `hitFrom` las distinga**

**Este paso y el anterior son mutuamente dependientes: van juntos en el mismo commit.** Sin los nombres, `hitFrom` clasifica todo como `block` y revive el defecto 4 (`y = -1`) en vez de corregirlo.

En el `<mesh>` del build plate agregar `name="build-plate"`. En `SlicePlane` (en `Overlays.tsx`) agregar `name="slice-plane"` a su `<mesh>`. Sin esto, `resolveCell` trata el plano como bloque y vuelve el bug de `y = -1`.

- [ ] **Step 5: Remapear los botones del mouse**

En el `<OrbitControls>`, agregar:

```tsx
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.PAN,
        }}
```

- [ ] **Step 6: Correr los tests nuevos**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/input.spec.ts --reporter=list
```

Esperado: 3 passed.

- [ ] **Step 7: Correr TODA la suite**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test --reporter=list
```

Esperado: los 8 de `editor.spec.ts` + los de `gesture.spec.ts` + 3 de `input.spec.ts`, todos verdes. Si `editor.spec.ts` falla, es una regresión real: arreglar antes de commitear.

- [ ] **Step 8: Commit**

```bash
git add src/scene/Scene.tsx src/scene/Overlays.tsx tests/input.spec.ts
git commit -m "feat(scene): drive pointer input through the pure state machine"
```

---

## Task 9: Previa visual en `Overlays.tsx`

**Files:**
- Modify: `src/scene/Overlays.tsx`
- Modify: `src/scene/Scene.tsx` (pasar la resolución al overlay)

**Interfaces:**
- Consumes: `Resolution` de `picking.ts`.
- Produces: `<Preview resolution={...} block={...} atlas={...} />`.

- [ ] **Step 1: Extraer la geometría y el material a constantes de módulo**

Hoy `Cursor` y `SelectionBox` hacen `new THREE.BoxGeometry(...)` en el cuerpo del componente, en cada render, sin `dispose()`. Es una fuga de GPU proporcional al tiempo de uso.

```ts
// arriba de Overlays.tsx
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
```

`Cursor` y `SelectionBox` pasan a usar `UNIT_BOX` con `scale`, en lugar de crear geometría nueva.

- [ ] **Step 2: Escribir el componente de previa**

```tsx
export function Preview({ res, blockId, atlas }: {
  res: Resolution | null
  blockId: string
  atlas: THREE.Texture
}) {
  const ghostMat = useMemo(() => new THREE.MeshLambertMaterial({
    map: atlas, transparent: true, opacity: 0.45, depthWrite: false,
  }), [atlas])
  const faceMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.28,
    depthWrite: false, side: THREE.DoubleSide,
  }), [])
  const eraseMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff6b6b', transparent: true, opacity: 0.4, depthWrite: false,
  }), [])

  useEffect(() => () => {
    ghostMat.dispose(); faceMat.dispose(); eraseMat.dispose()
  }, [ghostMat, faceMat, eraseMat])

  if (!res || !res.valid || res.action === 'none') return null

  return (
    <>
      {res.action === 'place' && res.chosen && (
        <mesh geometry={UNIT_BOX} material={ghostMat}
          position={[res.chosen.x + 0.5, res.chosen.y + 0.5, res.chosen.z + 0.5]} />
      )}
      {res.action === 'erase' && res.chosen && (
        <mesh geometry={UNIT_BOX} material={eraseMat} scale={1.02}
          position={[res.chosen.x + 0.5, res.chosen.y + 0.5, res.chosen.z + 0.5]} />
      )}
      {res.face && res.action === 'place' && (
        <mesh geometry={UNIT_PLANE} material={faceMat}
          position={[res.face.center.x + res.face.normal.x * 0.01,
                     res.face.center.y + res.face.normal.y * 0.01,
                     res.face.center.z + res.face.normal.z * 0.01]}
          rotation={faceRotation(res.face.normal)} />
      )}
    </>
  )
}

/** Orienta el quad del resaltado según la normal de la cara. */
function faceRotation(n: { x: number; y: number; z: number }): [number, number, number] {
  if (n.y !== 0) return [-Math.PI / 2, 0, 0]
  if (n.x !== 0) return [0, Math.PI / 2, 0]
  return [0, 0, 0]
}
```

- [ ] **Step 3: Guardar la resolución del hover en un ref y pasarla**

En `Scene.tsx`, `onHover` pasa a llamar `stopPropagation()` y a guardar la resolución:

```ts
  const onHover = useCallback((e: ThreeEvent<PointerEvent>) => {
    touchClock()
    e.stopPropagation()   // sin esto gana la intersección más lejana
    const s = useEditor.getState()
    const res = resolveCell(hitFrom(e), modsOf(e), s.tool, s.world.dims)
    pendingRes.current = res
    setPreview(res)
    s.setHover(res.chosen)
  }, [hitFrom])
```

`setPreview` es un `useState<Resolution | null>(null)` en `Editor`.

- [ ] **Step 4: Recalcular la previa cuando cambian los modificadores**

```ts
  useEffect(() => {
    const recompute = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' && e.key !== 'Alt') return
      const last = lastHit.current
      if (!last) return
      const s = useEditor.getState()
      const res = resolveCell(last, { shift: e.shiftKey, alt: e.altKey,
                                      ctrl: e.ctrlKey, meta: e.metaKey },
                              s.tool, s.world.dims)
      pendingRes.current = res
      setPreview(res)
    }
    window.addEventListener('keydown', recompute)
    window.addEventListener('keyup', recompute)
    return () => {
      window.removeEventListener('keydown', recompute)
      window.removeEventListener('keyup', recompute)
    }
  }, [])
```

`lastHit` es un `useRef<Hit | null>(null)` que `onHover` actualiza. Sin esto, apretar `Shift` sin mover el mouse deja el cursor desactualizado, que es el defecto 5.

- [ ] **Step 4b: Limpiar el cursor al salir de la geometría**

Defecto 7: hoy el cursor queda flotando en el vacío después de orbitar, porque nadie borra `hover`. `clearHover` tiene que limpiar las tres cosas:

```ts
  const clearHover = useCallback(() => {
    rec(EV.hoverNone)
    lastHit.current = null
    pendingRes.current = null
    setPreview(null)
    useEditor.getState().setHover(null)
  }, [])
```

Y hay que llamarlo también desde `onPointerMissed` del `<Canvas>`, no sólo desde `onPointerOut`: al orbitar, el puntero puede dejar la geometría sin que dispare `pointerout`.

- [ ] **Step 5: Correr toda la suite**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test --reporter=list
```

Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/scene/Overlays.tsx src/scene/Scene.tsx
git commit -m "feat(scene): ghost block preview, face highlight and live modifiers"
```

---

## Task 10: `ModeIndicator` y `CoordReadout`

Componentes listos, todavía sin cablear.

**Files:**
- Create: `src/ui/ModeIndicator.tsx`, `src/ui/CoordReadout.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `store.mode`, `store.setMode`, `store.hover`.
- Produces: dos componentes sin props.

- [ ] **Step 1: Escribir `ModeIndicator`**

```tsx
// src/ui/ModeIndicator.tsx
import { useEditor } from '../state/store'

export function ModeIndicator() {
  const mode = useEditor((s) => s.mode)
  const setMode = useEditor((s) => s.setMode)
  const build = mode === 'build'

  return (
    <button
      className={`mode-indicator ${build ? 'build' : 'navigate'}`}
      onClick={() => setMode(build ? 'navigate' : 'build')}
      title={build
        ? 'Modo Construir: el arrastre pinta. Espacio para navegar.'
        : 'Modo Navegar: el arrastre mueve la cámara. Espacio para construir.'}
      aria-pressed={!build}
      data-testid="mode-indicator"
    >
      {build ? '✏️ Construir' : '🖐 Navegar'}
    </button>
  )
}
```

- [ ] **Step 2: Escribir `CoordReadout`**

```tsx
// src/ui/CoordReadout.tsx
import { useEditor } from '../state/store'

export function CoordReadout() {
  const hover = useEditor((s) => s.hover)
  const sliceIndex = useEditor((s) => s.sliceIndex)
  if (!hover) return null
  return (
    <div className="coord-readout" data-testid="coord-readout">
      x {hover.x} · y {hover.y} · z {hover.z} · capa {sliceIndex}
    </div>
  )
}
```

- [ ] **Step 3: Añadir los estilos y el cursor**

```css
/* ── modo de interacción ─────────────────────────────────────────────────── */

.mode-indicator { font-weight: 600; }
.mode-indicator.navigate { background: var(--accent-dim); border-color: var(--accent); }

.viewport { position: relative; }
.viewport.navigate::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  border: 2px solid var(--accent); border-radius: 4px; opacity: .55;
}
.viewport.build canvas { cursor: crosshair; }
.viewport.navigate canvas { cursor: grab; }
.viewport.navigate canvas:active { cursor: grabbing; }

.coord-readout {
  position: absolute; left: 10px; bottom: 10px; pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  color: var(--muted); background: #0009; border: 1px solid var(--line);
  border-radius: 6px; padding: 3px 8px;
}
```

- [ ] **Step 4: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/ModeIndicator.tsx src/ui/CoordReadout.tsx src/styles.css
git commit -m "feat(ui): mode indicator and coordinate readout components"
```

---

## Task 11: Radio mínimo al encuadrar

Defecto 8: con pocos bloques, `Centrar` mete la cámara dentro del bloque.

**Files:**
- Modify: `src/scene/Scene.tsx`
- Test: `tests/input.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// añadir a tests/input.spec.ts
test('encuadrar con un solo bloque no mete la cámara adentro', async ({ page }) => {
  await ready(page)
  const dist = await page.evaluate(async () => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Uno')
    st().paintAt({ x: 8, y: 0, z: 8 }, false)
    st().requestFit()
    await new Promise((r) => setTimeout(r, 600))
    const log = window.__mcb.tel.toJSON()
    const eventos = JSON.parse(log).events as { ev: string; data?: Record<string, number> }[]
    const pose = eventos.filter((e) => e.ev === 'camera.pose').pop()
    if (!pose?.data) return null
    const dx = pose.data.x - 8.5, dy = pose.data.y - 0.5, dz = pose.data.z - 8.5
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  })
  expect(dist).not.toBeNull()
  expect(dist!).toBeGreaterThan(6)
})
```

Si el nombre del evento `camera.pose` difiere en `src/debug/events.ts`, usar el que esté.

- [ ] **Step 2: Correr y verificar que falla**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/input.spec.ts --reporter=list
```

- [ ] **Step 3: Implementar**

En `ViewFitter`, reemplazar:

```ts
    const radius = max.clone().sub(min).length() / 2 || 8
```

por:

```ts
    // Con una construcción muy chica el radio tiende a cero y la cámara
    // termina dentro del bloque.
    const MIN_RADIUS = 4
    const radius = Math.max(MIN_RADIUS, max.clone().sub(min).length() / 2)
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/input.spec.ts --reporter=list
```

- [ ] **Step 5: Commit**

```bash
git add src/scene/Scene.tsx tests/input.spec.ts
git commit -m "fix(scene): clamp minimum fit radius so the camera stays outside"
```

---

## Task 12: Integración y documentación

Cierra el workstream. **Esta tarea sí toca los archivos compartidos**, en serie, y desbloquea los workstreams 02–09.

**Files:**
- Modify: `src/App.tsx`, `README.md`, `SPEC.md`

- [ ] **Step 1: Cablear el indicador y la lectura de coordenadas**

En `src/App.tsx`, importar los dos componentes y montarlos:

```tsx
import { ModeIndicator } from './ui/ModeIndicator'
import { CoordReadout } from './ui/CoordReadout'
```

En el `<div className="viewport">`, añadir la clase del modo y los componentes:

```tsx
const mode = useEditor((s) => s.mode)
...
<div className={`viewport ${mode}`}>
  {WEBGL ? <Scene /> : ...}
  <CoordReadout />
  <div className="view-tools">
    <ModeIndicator />
    <button onClick={...}>Centrar</button>
    <button ...>Grilla</button>
  </div>
</div>
```

- [ ] **Step 2: Cablear `Space` en el manejador de teclado**

En el `useEffect` de `keydown` de `App.tsx`, antes de `if (mod) return`:

```ts
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        const r = spaceDown(s.mode, performance.now())
        spaceRef.current = r.state
        s.setMode(r.mode)
        return
      }
```

Y añadir un listener de `keyup` en el mismo efecto:

```ts
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceRef.current) return
      const r = spaceUp(spaceRef.current, performance.now(), cameraMovedRef.current)
      spaceRef.current = null
      cameraMovedRef.current = false
      useEditor.getState().setMode(r.mode)
    }
    window.addEventListener('keyup', onKeyUp)
```

De dónde sale `cameraMovedWhileHeld`: el único que sabe si la cámara se movió es el `onStart` de OrbitControls, que vive en `Scene.tsx`, mientras el manejador de teclado vive en `App.tsx`. El spec §9 dice que el store gana **sólo** `mode` y `setMode`, así que no va ahí. Va en un módulo de cinco líneas, `src/scene/cameraActivity.ts`:

```ts
let moved = false
export const markCameraMoved = () => { moved = true }
export const consumeCameraMoved = () => { const m = moved; moved = false; return m }
```

`Scene.tsx` llama a `markCameraMoved` desde `onStart`; el `keyup` de `App.tsx` llama a `consumeCameraMoved()`. Estado transitorio de cámara, fuera del store del documento.

- [ ] **Step 3: Actualizar el README**

En la tabla de controles (líneas 68–69), reemplazar:

```markdown
| Orbitar | Arrastrar sobre el vacío |
| Paneo | Arrastrar con el botón derecho |
```

por:

```markdown
| Cambiar de modo | `Espacio` (un toque alterna, mantenerlo es transitorio) |
| Orbitar | Modo Navegar, o botón del medio, o arrastrar sobre el vacío |
| Paneo | Arrastrar con el botón derecho |
```

Y añadir al párrafo de atajos: `Espacio` cambia entre Construir y Navegar.

- [ ] **Step 4: Actualizar SPEC.md**

En la sección 4 (Interacción), documentar el modelo modal y el umbral click/arrastre. Es la sección que hoy describe el comportamiento viejo.

- [ ] **Step 5: Verificación completa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH"
npm run typecheck
npx vite build
npx playwright test --reporter=list
```

Esperado: typecheck limpio, build OK, **todos** los tests verdes.

- [ ] **Step 6: Verificación manual en el navegador**

Con `npm run dev`, comprobar a ojo:

1. El indicador dice "Construir" al cargar y el cursor es una cruz.
2. Arrastrar sobre la construcción pinta.
3. Un toque de `Espacio` cambia a "Navegar", el borde del viewport se tiñe y el cursor pasa a mano.
4. Ahora el mismo arrastre mueve la cámara y no escribe.
5. Mantener `Espacio`, orbitar y soltar devuelve a "Construir".
6. Con el pincel, apretar `Shift` sin mover el mouse pone el cursor en rojo.
7. La goma sobre el piso vacío no muestra cursor.
8. Empezar un arrastre, salir de la ventana y soltar afuera: al volver, la órbita sigue funcionando.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx README.md SPEC.md
git commit -m "feat: wire build/navigate mode into the app shell and update docs"
```

---

## Notas para quien ejecute

- **`main.tsx` renderiza bajo `React.StrictMode`**: el `useEffect` de listeners de la Task 8 monta, limpia con `feed({ kind: 'unmount' })`, y vuelve a montar en desarrollo. Es inofensivo — abortar desde `idle` ya está fijado como no-op por el test "abortar dos veces seguidas es inocuo" — pero va a aparecer un `gesture.aborted` de más en la telemetría al arrancar. No es un bug.
- **La clave del JSON de telemetría es `events`, no `eventos`.** `toJSON()` emite `{ meta, events }`. Leer `.eventos` devuelve `undefined` y el test revienta en vez de fallar una aserción.

- **Los nombres de la telemetría** (`EV.*`, categorías, campos) se leen de `src/debug/events.ts`. Ese archivo pasó por una traducción a inglés: usar lo que esté, no lo que diga este plan si difiere.
- **No borrar `tests/editor.spec.ts`.** Son la red de seguridad; si alguno se pone rojo, la causa es una regresión real.
- **El orden importa.** Las Tasks 1–7 son puras y se pueden revisar rápido. La Task 8 es donde todo se junta y donde va a aparecer lo que no previmos.
- Después de la Task 12, los workstreams 02–09 de `specs/` quedan desbloqueados.
