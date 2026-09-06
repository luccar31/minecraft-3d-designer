# Táctil y responsive — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el editor completo sea usable en celular y tablet: gestos táctiles que alimentan la misma máquina de estados del escritorio, y un layout que se reorganiza en tres cortes sin duplicar componentes.

**Architecture:** `touch.ts` traduce dedos a las mismas entradas que consume `gesture.ts` del workstream 01 — no hay una segunda máquina de estados. El layout lo decide CSS; JS sólo maneja lo que CSS no puede expresar (qué hoja está abierta, los umbrales del gesto). `PalettePanel` y `ToolPanel` son los mismos componentes en los tres cortes, montados dentro de un `<Sheet>` cuando corresponde.

**Tech Stack:** TypeScript 5.6, React 18.3, three 0.169, @react-three/fiber 8.18, Zustand 4.5, Playwright 1.48.

**Spec:** [`docs/superpowers/specs/2026-09-06-tactil-responsive-design.md`](../specs/2026-09-06-tactil-responsive-design.md)

## Global Constraints

- **Depende del workstream 01.** No empezar hasta que `input-model` esté mergeado: las tareas 9 y 10 modifican `Scene.tsx` y `App.tsx`, que son de 01.
- **La interfaz `Input` se lee del `gesture.ts` ya mergeado**, no de este plan. Si difiere de lo que acá se muestra, manda el código.
- **Node no está en el PATH.** Todo comando node/npm/npx va precedido de `export PATH="/c/nvm4w/nodejs:$PATH"`. Verificar con `node -v` → `v24.20.0`.
- **El código es sólo en inglés**: identificadores, tipos, funciones, comentarios.
- **Comentarios de 20 palabras o menos**, y sólo para lo que el código no dice solo.
- **Los textos de interfaz siguen en español.**
- **Ningún gesto táctil puede introducir latencia en el tap.** Es la regla que eliminó el doble tap; aplica a cualquier gesto que se proponga después.
- **Umbrales**: 10 px en touch y lápiz, 4 px con mouse, elegidos por `pointerType`.
- **Long-press**: 400 ms, con 10 px de tolerancia de movimiento.
- **Blancos táctiles**: 44 × 44 px como mínimo.
- **`dpr` con techo de 1.5** cuando el puntero es grueso.
- No cambiar `data-testid` existentes ni las claves de `window.__mcb`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/scene/touch.ts` | **Nuevo.** Traduce punteros táctiles a entradas de `gesture.ts`. Puro: sin React, sin three, sin temporizadores propios. |
| `src/ui/Sheet.tsx` | **Nuevo.** Hoja inferior arrastrable, en portal. |
| `src/ui/BottomBar.tsx` | **Nuevo.** Barra fija de celular. |
| `src/ui/LayerStepper.tsx` | **Nuevo.** Control vertical de capa, al borde del viewport. |
| `src/ui/FirstTouchSheet.tsx` | **Nuevo.** Elección de primer uso. |
| `src/ui/responsive.css` | **Nuevo.** Los tres cortes, áreas seguras, blancos táctiles. |
| `src/state/store.ts` | **Modificado.** Agrega `sheet` y `setSheet`. |
| `src/scene/Scene.tsx` | **Modificado.** Cablea `touch.ts` y aplica el techo de `dpr`. |
| `src/App.tsx` | **Modificado.** Monta la barra, las hojas y el stepper. |
| `src/ui/GuideView.tsx` | **Modificado.** Un paso por pantalla en celular. |
| `tests/touch.spec.ts` | **Nuevo.** Unitarios de `touch.ts`, sin navegador. |
| `tests/responsive.spec.ts` | **Nuevo.** Layout, scroll horizontal y tamaño de blancos. |

**Por qué `touch.ts` no usa `setTimeout`.** El long-press se expresa con una entrada `tick` que el adaptador manda desde un temporizador. Así el módulo queda puro y el test avanza el tiempo pasando `now`, sin esperas reales ni tests lentos.

---

## Task 1: `touch.ts` — tap y arrastre

**Files:**
- Create: `src/scene/touch.ts`
- Test: `tests/touch.spec.ts`

**Interfaces:**
- Consumes: `Cell`, `Mods`, `Input` de `src/scene/gesture.ts`.
- Produces: `TouchEvent`, `TouchOutput`, `TouchState`, `initialTouchState`, `touchStep(state, event) → { state, out }`, `TOUCH_THRESHOLD_PX`, `LONG_PRESS_MS`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// tests/touch.spec.ts
import { expect, test } from '@playwright/test'
import { initialTouchState, touchStep, type TouchEvent } from '../src/scene/touch'
import type { Mods } from '../src/scene/gesture'

const NO_MODS: Mods = { shift: false, alt: false, ctrl: false, meta: false }

const down = (id: number, x: number, y: number, now: number, hasBlock = true): TouchEvent =>
  ({ kind: 'down', id, x, y, pointerType: 'touch', cell: { x: 1, y: 0, z: 1 },
     hasBlock, mods: NO_MODS, now })

test('un tap emite down y up, sin cancel', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  expect(a.out.inputs.map((i) => i.kind)).toEqual(['down'])

  const b = touchStep(a.state, { kind: 'up', id: 1, x: 100, y: 100, now: 120 })
  expect(b.out.inputs.map((i) => i.kind)).toEqual(['up'])
  expect(b.state.primary).toBeNull()
})

test('moverse 6 px no supera el umbral táctil', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'move', id: 1, x: 104, y: 104, cell: { x: 2, y: 0, z: 1 }, now: 50 })

  expect(b.out.inputs.map((i) => i.kind)).toEqual(['move'])
  expect(b.state.movedBeyondSlop).toBe(false)
})

test('moverse 15 px sí lo supera', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'move', id: 1, x: 115, y: 100, cell: { x: 3, y: 0, z: 1 }, now: 50 })

  expect(b.state.movedBeyondSlop).toBe(true)
})

test('los eventos de un puntero que no es el primario se ignoran', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'move', id: 9, x: 300, y: 300, cell: null, now: 50 })
  expect(b.out.inputs).toEqual([])
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/touch.spec.ts --reporter=list
```

Esperado: FAIL, `Cannot find module '../src/scene/touch'`.

- [ ] **Step 3: Implementar**

```ts
// src/scene/touch.ts
import type { Cell, Input, Mods } from './gesture'

export const TOUCH_THRESHOLD_PX = 10
export const LONG_PRESS_MS = 400
export const LONG_PRESS_SLOP_PX = 10

export type TouchEvent =
  | { kind: 'down'; id: number; x: number; y: number; pointerType: string
      cell: Cell | null; hasBlock: boolean; mods: Mods; now: number }
  | { kind: 'move'; id: number; x: number; y: number; cell: Cell | null; now: number }
  | { kind: 'up'; id: number; x: number; y: number; now: number }
  | { kind: 'cancel'; id: number; now: number }
  | { kind: 'tick'; now: number }

export type TouchOutput = {
  inputs: Input[]
  /** Celda sobre la que pedir el cuentagotas. */
  pickAt?: Cell
  vibrateMs?: number
}

export type TouchState = {
  active: number[]
  primary: number | null
  startX: number
  startY: number
  startedAt: number
  lastCell: Cell | null
  movedBeyondSlop: boolean
  longPressFired: boolean
  /** Tras un segundo dedo, no se vuelve a dibujar hasta levantar todo. */
  suspended: boolean
}

export const initialTouchState: TouchState = {
  active: [],
  primary: null,
  startX: 0,
  startY: 0,
  startedAt: 0,
  lastCell: null,
  movedBeyondSlop: false,
  longPressFired: false,
  suspended: false,
}

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by)

export function touchStep(
  state: TouchState,
  ev: TouchEvent,
): { state: TouchState; out: TouchOutput } {
  const none: TouchOutput = { inputs: [] }

  if (ev.kind === 'down') {
    return {
      state: {
        active: [ev.id],
        primary: ev.id,
        startX: ev.x,
        startY: ev.y,
        startedAt: ev.now,
        lastCell: ev.cell,
        movedBeyondSlop: false,
        longPressFired: false,
        suspended: false,
      },
      out: {
        inputs: [{
          kind: 'down', pointerId: ev.id, pointerType: ev.pointerType, button: 0,
          x: ev.x, y: ev.y, cell: ev.cell, mods: ev.mods,
        }],
      },
    }
  }

  if (ev.kind === 'move') {
    if (ev.id !== state.primary || state.suspended) return { state, out: none }
    const moved =
      state.movedBeyondSlop ||
      dist(ev.x, ev.y, state.startX, state.startY) > TOUCH_THRESHOLD_PX
    return {
      state: { ...state, movedBeyondSlop: moved, lastCell: ev.cell },
      out: { inputs: [{ kind: 'move', x: ev.x, y: ev.y, cell: ev.cell }] },
    }
  }

  if (ev.kind === 'up') {
    if (ev.id !== state.primary) {
      return { state: { ...state, active: state.active.filter((i) => i !== ev.id) }, out: none }
    }
    const emit = !state.suspended && !state.longPressFired
    return {
      state: initialTouchState,
      out: { inputs: emit ? [{ kind: 'up', x: ev.x, y: ev.y }] : [] },
    }
  }

  return { state, out: none }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/touch.spec.ts --reporter=list
```

Esperado: 4 passed.

- [ ] **Step 5: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/scene/touch.ts tests/touch.spec.ts
git commit -m "feat(scene): touch pointer translation for tap and drag"
```

---

## Task 2: `touch.ts` — long-press como cuentagotas

**Files:**
- Modify: `src/scene/touch.ts`
- Test: `tests/touch.spec.ts`

**Interfaces:**
- Produces: manejo de `{ kind: 'tick' }` y del campo `pickAt` en `TouchOutput`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/touch.spec.ts
test('mantener 400 ms pide cuentagotas y cancela el gesto', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'tick', now: 410 })

  expect(b.out.pickAt).toEqual({ x: 1, y: 0, z: 1 })
  expect(b.out.inputs.map((i) => i.kind)).toEqual(['cancel'])
  expect(b.out.vibrateMs).toBeGreaterThan(0)
  expect(b.state.longPressFired).toBe(true)
})

test('tras el cuentagotas, soltar no coloca nada', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'tick', now: 410 })
  const c = touchStep(b.state, { kind: 'up', id: 1, x: 100, y: 100, now: 500 })

  expect(c.out.inputs).toEqual([])
})

test('no se dispara antes de los 400 ms', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'tick', now: 390 })
  expect(b.out.pickAt).toBeUndefined()
})

test('moverse cancela el long-press', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'move', id: 1, x: 120, y: 100, cell: { x: 3, y: 0, z: 1 }, now: 100 })
  const c = touchStep(b.state, { kind: 'tick', now: 500 })

  expect(c.out.pickAt).toBeUndefined()
})

test('sobre una celda vacía no hay nada que tomar', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0, false))
  const b = touchStep(a.state, { kind: 'tick', now: 410 })

  expect(b.out.pickAt).toBeUndefined()
  expect(b.out.inputs).toEqual([])
})

test('sólo se dispara una vez', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'tick', now: 410 })
  const c = touchStep(b.state, { kind: 'tick', now: 900 })

  expect(c.out.pickAt).toBeUndefined()
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/touch.spec.ts --reporter=list
```

Esperado: 6 nuevos FAIL.

- [ ] **Step 3: Implementar**

Añadir el campo `hasBlock` al estado (`initialTouchState` con `hasBlock: false`, y el `down` lo guarda), y la rama de `tick` antes del `return` final:

```ts
  if (ev.kind === 'tick') {
    const ready =
      state.primary !== null &&
      !state.suspended &&
      !state.longPressFired &&
      !state.movedBeyondSlop &&
      state.hasBlock &&
      state.lastCell !== null &&
      ev.now - state.startedAt >= LONG_PRESS_MS

    if (!ready) return { state, out: none }
    return {
      state: { ...state, longPressFired: true },
      out: {
        inputs: [{ kind: 'cancel' }],
        pickAt: state.lastCell!,
        vibrateMs: 15,
      },
    }
  }
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/touch.spec.ts --reporter=list
```

Esperado: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/touch.ts tests/touch.spec.ts
git commit -m "feat(scene): long press picks the block under the finger"
```

---

## Task 3: `touch.ts` — dos dedos

La parte con más aristas. Todo lo que sale mal en táctil sale mal acá.

**Files:**
- Modify: `src/scene/touch.ts`
- Test: `tests/touch.spec.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// añadir a tests/touch.spec.ts
test('un segundo dedo mientras se pinta aborta el gesto', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'move', id: 1, x: 130, y: 100, cell: { x: 4, y: 0, z: 1 }, now: 60 })
  const c = touchStep(b.state, down(2, 200, 200, 80))

  expect(c.out.inputs.map((i) => i.kind)).toEqual(['cancel'])
  expect(c.state.suspended).toBe(true)
})

test('estando suspendido, mover no emite nada', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, down(2, 200, 200, 40))
  const c = touchStep(b.state, { kind: 'move', id: 1, x: 160, y: 140, cell: { x: 7, y: 0, z: 3 }, now: 80 })

  expect(c.out.inputs).toEqual([])
})

test('levantar un dedo de dos NO reanuda la pintura', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, down(2, 200, 200, 40))
  const c = touchStep(b.state, { kind: 'up', id: 2, x: 200, y: 200, now: 300 })
  const d = touchStep(c.state, { kind: 'move', id: 1, x: 160, y: 140, cell: { x: 7, y: 0, z: 3 }, now: 340 })

  expect(c.state.suspended).toBe(true)
  expect(d.out.inputs).toEqual([])
})

test('levantar todos los dedos limpia la suspensión', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, down(2, 200, 200, 40))
  const c = touchStep(b.state, { kind: 'up', id: 2, x: 200, y: 200, now: 300 })
  const d = touchStep(c.state, { kind: 'up', id: 1, x: 100, y: 100, now: 320 })

  expect(d.state.suspended).toBe(false)
  expect(d.state.primary).toBeNull()
  expect(d.out.inputs).toEqual([])
})

test('INVARIANTE: dos dedos nunca producen una entrada de dibujo', () => {
  const secuencia: TouchEvent[] = [
    down(1, 100, 100, 0),
    down(2, 200, 200, 20),
    { kind: 'move', id: 1, x: 140, y: 130, cell: { x: 5, y: 0, z: 3 }, now: 40 },
    { kind: 'move', id: 2, x: 240, y: 230, cell: { x: 9, y: 0, z: 7 }, now: 60 },
    { kind: 'tick', now: 500 },
    { kind: 'up', id: 1, x: 140, y: 130, now: 600 },
    { kind: 'up', id: 2, x: 240, y: 230, now: 620 },
  ]

  let s = initialTouchState
  const kinds: string[] = []
  for (const ev of secuencia) {
    const r = touchStep(s, ev)
    for (const i of r.out.inputs) kinds.push(i.kind)
    expect(r.out.pickAt).toBeUndefined()
    s = r.state
  }
  // Sólo el down inicial y su cancel: nada de move ni up de dibujo.
  expect(kinds).toEqual(['down', 'cancel'])
})

test('el long-press no se dispara con dos dedos apoyados', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, down(2, 200, 200, 20))
  const c = touchStep(b.state, { kind: 'tick', now: 500 })

  expect(c.out.pickAt).toBeUndefined()
})

test('cancel del sistema limpia el estado', () => {
  const a = touchStep(initialTouchState, down(1, 100, 100, 0))
  const b = touchStep(a.state, { kind: 'cancel', id: 1, now: 100 })

  expect(b.out.inputs.map((i) => i.kind)).toEqual(['cancel'])
  expect(b.state.primary).toBeNull()
})
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/touch.spec.ts --reporter=list
```

Esperado: 7 nuevos FAIL.

- [ ] **Step 3: Implementar**

Reemplazar la rama de `down` para contemplar el segundo dedo:

```ts
  if (ev.kind === 'down') {
    if (state.primary !== null) {
      // Segundo dedo: el gesto pasa a la cámara y no vuelve hasta levantar todo.
      const wasDrawing = !state.suspended && !state.longPressFired
      return {
        state: {
          ...state,
          active: [...state.active, ev.id],
          suspended: true,
        },
        out: { inputs: wasDrawing ? [{ kind: 'cancel' }] : [] },
      }
    }
    return {
      state: {
        active: [ev.id],
        primary: ev.id,
        startX: ev.x,
        startY: ev.y,
        startedAt: ev.now,
        lastCell: ev.cell,
        hasBlock: ev.hasBlock,
        movedBeyondSlop: false,
        longPressFired: false,
        suspended: false,
      },
      out: {
        inputs: [{
          kind: 'down', pointerId: ev.id, pointerType: ev.pointerType, button: 0,
          x: ev.x, y: ev.y, cell: ev.cell, mods: ev.mods,
        }],
      },
    }
  }
```

Reemplazar la rama de `up`:

```ts
  if (ev.kind === 'up') {
    const active = state.active.filter((i) => i !== ev.id)
    if (active.length > 0) {
      return { state: { ...state, active }, out: none }
    }
    const emit = ev.id === state.primary && !state.suspended && !state.longPressFired
    return {
      state: initialTouchState,
      out: { inputs: emit ? [{ kind: 'up', x: ev.x, y: ev.y }] : [] },
    }
  }
```

Y añadir la rama de `cancel`:

```ts
  if (ev.kind === 'cancel') {
    const wasDrawing = state.primary !== null && !state.suspended && !state.longPressFired
    return {
      state: initialTouchState,
      out: { inputs: wasDrawing ? [{ kind: 'cancel' }] : [] },
    }
  }
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/touch.spec.ts --reporter=list
```

Esperado: 17 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/touch.ts tests/touch.spec.ts
git commit -m "feat(scene): two fingers hand the gesture to the camera"
```

---

## Task 4: Estado de hoja en el store

**Files:**
- Modify: `src/state/store.ts`, `src/debug/events.ts`

**Interfaces:**
- Produces: `EditorState.sheet: SheetId`, `EditorState.setSheet(s: SheetId): void`.

- [ ] **Step 1: Añadir el tipo y el campo**

En `src/types.ts`:

```ts
export type SheetId = 'none' | 'palette' | 'tools' | 'designs' | 'guide-steps' | 'materials'
```

En `src/state/store.ts`, en `EditorState`, junto a `mode`:

```ts
  sheet: SheetId
```

y en las acciones:

```ts
  setSheet: (s: SheetId) => void
```

- [ ] **Step 2: Valor inicial y acción**

```ts
  sheet: 'none',
```

```ts
  setSheet: (sheet) => {
    if (get().sheet === sheet) return
    rec(EV.sheet, str(get().sheet), str(sheet))
    set({ sheet })
  },
```

- [ ] **Step 3: Declarar el evento**

En `src/debug/events.ts`, junto a `panel`:

```ts
  sheet: def('view', 'sheet', ['$from', '$to'], LEVEL.ACTIONS),
```

- [ ] **Step 4: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/state/store.ts src/debug/events.ts
git commit -m "feat(state): track which bottom sheet is open"
```

---

## Task 5: `Sheet.tsx`

**Files:**
- Create: `src/ui/Sheet.tsx`
- Modify: `src/ui/responsive.css` (se crea en la Task 8; si todavía no existe, crear el archivo con sólo esta sección)

**Interfaces:**
- Produces: `<Sheet id={SheetId} title={string}>{children}</Sheet>`.

- [ ] **Step 1: Escribir el componente**

```tsx
// src/ui/Sheet.tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../state/store'
import type { SheetId } from '../types'

const DISMISS_RATIO = 0.25

export function Sheet({ id, title, children }: {
  id: SheetId
  title: string
  children: React.ReactNode
}) {
  const open = useEditor((s) => s.sheet === id)
  const setSheet = useEditor((s) => s.setSheet)
  const [dragY, setDragY] = useState(0)
  const startY = useRef(0)
  const height = useRef(0)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet('none')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setSheet])

  useEffect(() => {
    if (!open) setDragY(0)
  }, [open])

  if (!open) return null

  const onDown = (e: React.PointerEvent) => {
    startY.current = e.clientY
    height.current = (e.currentTarget.parentElement as HTMLElement).offsetHeight
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    setDragY(Math.max(0, e.clientY - startY.current))
  }
  const onUp = () => {
    if (dragY > height.current * DISMISS_RATIO) setSheet('none')
    setDragY(0)
  }

  return createPortal(
    <div className="sheet-backdrop" onClick={() => setSheet('none')}>
      <section
        className="sheet"
        role="dialog"
        aria-label={title}
        style={{ transform: `translateY(${dragY}px)` }}
        // La hoja captura sus punteros: el canvas nunca ve un toque que empezó acá.
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header
          className="sheet-grip"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <span className="grip" />
          <strong>{title}</strong>
          <button onClick={() => setSheet('none')} aria-label="Cerrar">✕</button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Estilos**

```css
/* src/ui/responsive.css */

.sheet-backdrop {
  position: fixed; inset: 0; z-index: 50;
  background: #0007; display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; max-height: 85dvh; min-height: 50dvh;
  display: flex; flex-direction: column;
  background: var(--panel); border-top: 1px solid var(--line);
  border-radius: 14px 14px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
  touch-action: none;
}
.sheet-grip {
  display: flex; align-items: center; gap: 10px; padding: 8px 14px 10px;
  border-bottom: 1px solid var(--line); cursor: grab;
}
.sheet-grip .grip {
  position: absolute; left: 50%; top: 6px; translate: -50% 0;
  width: 36px; height: 4px; border-radius: 2px; background: var(--line);
}
.sheet-grip button { margin-left: auto; min-width: 44px; min-height: 44px; }
.sheet-body { overflow: auto; flex: 1; padding: 10px 12px; }
```

- [ ] **Step 3: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/Sheet.tsx src/ui/responsive.css
git commit -m "feat(ui): draggable bottom sheet"
```

---

## Task 6: `BottomBar.tsx` y `LayerStepper.tsx`

**Files:**
- Create: `src/ui/BottomBar.tsx`, `src/ui/LayerStepper.tsx`
- Modify: `src/ui/responsive.css`

- [ ] **Step 1: `BottomBar`**

```tsx
// src/ui/BottomBar.tsx
import { useEditor } from '../state/store'
import { blockDef } from '../blocks/palette'
import { blockThumbnail } from '../blocks/atlas'
import { ModeIndicator } from './ModeIndicator'

export function BottomBar({ onOverflow }: { onOverflow: () => void }) {
  const block = useEditor((s) => s.block)
  const tool = useEditor((s) => s.tool)
  const canUndo = useEditor((s) => s.canUndo)
  const setSheet = useEditor((s) => s.setSheet)
  const undo = useEditor((s) => s.undo)

  return (
    <nav className="bottom-bar" data-testid="bottom-bar">
      <ModeIndicator />
      <button onClick={() => setSheet('palette')} title="Elegir bloque" data-testid="bb-block">
        <img src={blockThumbnail(block)} alt="" width={22} height={22} />
        <span>{blockDef(block).name}</span>
      </button>
      <button onClick={() => setSheet('tools')} title="Herramientas" data-testid="bb-tools">
        {TOOL_ICON[tool]}
      </button>
      <button onClick={undo} disabled={!canUndo} title="Deshacer" data-testid="bb-undo">↶</button>
      <button onClick={onOverflow} title="Más opciones" data-testid="bb-more">⋯</button>
    </nav>
  )
}

const TOOL_ICON: Record<string, string> = {
  brush: '✏️', eraser: '🧽', picker: '💧', line: '╱',
  rect: '▭', fill: '🪣', select: '⬚',
}
```

- [ ] **Step 2: `LayerStepper`**

```tsx
// src/ui/LayerStepper.tsx
import { useEditor } from '../state/store'

export function LayerStepper() {
  const sliceView = useEditor((s) => s.sliceView)
  const index = useEditor((s) => s.sliceIndex)
  const setIndex = useEditor((s) => s.setSliceIndex)
  if (sliceView === 'off') return null

  return (
    <div className="layer-stepper" data-testid="layer-stepper">
      <button onClick={() => setIndex(index + 1)} aria-label="Subir una capa">▲</button>
      <span>y {index}</span>
      <button onClick={() => setIndex(index - 1)} aria-label="Bajar una capa">▼</button>
    </div>
  )
}
```

- [ ] **Step 3: Estilos**

```css
.bottom-bar {
  display: none;
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
  gap: 6px; padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
  background: var(--panel); border-top: 1px solid var(--line);
}
.bottom-bar button {
  min-width: 44px; min-height: 44px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
}
.bottom-bar [data-testid="bb-block"] { flex: 1; overflow: hidden; }
.bottom-bar [data-testid="bb-block"] span {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px;
}

.layer-stepper {
  position: absolute; right: 10px; top: 50%; translate: 0 -50%; z-index: 20;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: #0009; border: 1px solid var(--line); border-radius: 10px; padding: 4px;
}
.layer-stepper button { min-width: 44px; min-height: 44px; background: transparent; border: 0; }
.layer-stepper span {
  font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted);
}
```

- [ ] **Step 4: Verificar que compila**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/BottomBar.tsx src/ui/LayerStepper.tsx src/ui/responsive.css
git commit -m "feat(ui): mobile bottom bar and layer stepper"
```

---

## Task 7: `FirstTouchSheet.tsx`

**Files:**
- Create: `src/ui/FirstTouchSheet.tsx`
- Modify: `src/ui/responsive.css`, `src/debug/events.ts`

- [ ] **Step 1: El componente**

Muestra en vez de contar: cada opción lleva un diagrama SVG del gesto.

```tsx
// src/ui/FirstTouchSheet.tsx
import { useState } from 'react'
import { useEditor } from '../state/store'
import { EV, rec, str } from '../debug'

const KEY = 'mcb.touch.mode'

export function shouldAskTouchMode(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.matchMedia?.('(pointer: coarse)').matches) return false
  try {
    return localStorage.getItem(KEY) === null
  } catch {
    return false
  }
}

export function FirstTouchSheet({ onDone }: { onDone: () => void }) {
  const [choice, setChoice] = useState<'layer' | 'free'>('layer')
  const setSliceView = useEditor((s) => s.setSliceView)

  const confirm = () => {
    try { localStorage.setItem(KEY, choice) } catch { /* modo privado */ }
    rec(EV.touchModeChosen, str(choice))
    setSliceView(choice === 'layer' ? 'isolate' : 'off')
    onDone()
  }

  return (
    <div className="first-touch" role="dialog" aria-label="Cómo querés dibujar">
      <h2>¿Cómo querés dibujar?</h2>
      <div className="ft-options">
        <button
          className={choice === 'layer' ? 'on' : ''}
          onClick={() => setChoice('layer')}
          data-testid="ft-layer"
        >
          <LayerDiagram />
          <strong>Capa por capa</strong>
          <span>Pintás sobre un plano, como en papel cuadriculado.</span>
        </button>
        <button
          className={choice === 'free' ? 'on' : ''}
          onClick={() => setChoice('free')}
          data-testid="ft-free"
        >
          <FreeDiagram />
          <strong>3D libre</strong>
          <span>Apoyás bloques contra las caras de otros.</span>
        </button>
      </div>
      <p className="hint">Podés cambiarlo cuando quieras.</p>
      <button className="primary" onClick={confirm} data-testid="ft-start">Empezar</button>
    </div>
  )
}
```

- [ ] **Step 1b: Los dos diagramas**

En el mismo archivo. SVG inline, sin dependencias ni imágenes. `prefers-reduced-motion` corta la animación.

```tsx
const DOT = 'var(--accent)'

function LayerDiagram() {
  return (
    <svg viewBox="0 0 90 70" width="90" height="70" aria-hidden="true">
      <path d="M10 46 L45 28 L80 46 L45 64 Z" fill="#ffffff14" stroke="var(--line)" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${22 + i * 12} ${46 + i * 0} L${45 + i * 12} ${34}`}
          stroke="var(--line)" strokeWidth="0.6" opacity=".5" />
      ))}
      <circle r="5" fill={DOT}>
        <animateMotion dur="2.4s" repeatCount="indefinite"
          path="M24 46 L45 36 L66 46 L45 56 Z" />
      </circle>
    </svg>
  )
}

function FreeDiagram() {
  return (
    <svg viewBox="0 0 90 70" width="90" height="70" aria-hidden="true">
      <path d="M30 40 L45 32 L60 40 L60 54 L45 62 L30 54 Z"
        fill="#ffffff14" stroke="var(--line)" />
      <path d="M30 40 L45 48 L60 40 M45 48 L45 62" stroke="var(--line)" strokeWidth="0.8" />
      <circle cx="45" cy="24" r="5" fill={DOT}>
        <animateTransform attributeName="transform" type="rotate"
          from="0 45 44" to="360 45 44" dur="3.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}
```

```css
@media (prefers-reduced-motion: reduce) {
  .ft-options svg * { animation: none !important; }
  .ft-options animateMotion, .ft-options animateTransform { display: none; }
}
```

- [ ] **Step 2: Declarar el evento**

```ts
  touchModeChosen: def('view', 'touch-mode-chosen', ['$choice'], LEVEL.ACTIONS),
```

- [ ] **Step 3: Verificar que compila y commitear**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npm run typecheck
git add src/ui/FirstTouchSheet.tsx src/ui/responsive.css src/debug/events.ts
git commit -m "feat(ui): first-run drawing mode choice for touch"
```

---

## Task 8: `responsive.css` — los tres cortes

**Files:**
- Modify: `src/ui/responsive.css`, `src/styles.css`

- [ ] **Step 1: Los cortes**

```css
/* ── ≥1024: las tres columnas actuales, sin cambios ──────────────────────── */

/* ── 600–1023: viewport a todo el ancho, paneles en hojas ────────────────── */
@media (max-width: 1023px) {
  .main { grid-template-columns: 1fr; }
  .main > .side { display: none; }
}

/* ── <600: además, barra inferior ────────────────────────────────────────── */
@media (max-width: 599px) {
  .bottom-bar { display: flex; }
  .viewport { padding-bottom: 56px; }
  .status { display: none; }
}

/* ── entrada gruesa: blancos grandes, sin depender del ancho ─────────────── */
@media (pointer: coarse) {
  button, .chip, input, select { min-height: 44px; min-width: 44px; }
  .blocks button { min-width: 44px; min-height: 44px; }
  canvas { touch-action: none; }
  /* Sin puntero no hay hover: el estado tiene que verse sin él. */
  .chip.on, button.on { outline: 1px solid var(--accent); }
}
```

- [ ] **Step 1b: Colapsar la barra superior por debajo de 900 px**

```css
@media (max-width: 899px) {
  .topbar .secondary { display: none; }
  .topbar .overflow { display: inline-flex; }
  .topbar input[type="text"] { max-width: 140px; }
}
@media (min-width: 900px) {
  .topbar .overflow { display: none; }
}
```

En `TopBar.tsx`, agrupar Guardar, Diseños, Exportar JSON, Exportar .schem e
Importar dentro de un `<div className="secondary">`, y añadir junto a ellos un
botón `<button className="overflow" onClick={() => setSheet('designs')}>⋯</button>`.

`TopBar.tsx` no pertenece a ningún otro workstream activo: se puede tocar acá.

- [ ] **Step 2: Importar desde `styles.css`**

Al final de `src/styles.css`:

```css
@import './ui/responsive.css';
```

Nota: en CSS los `@import` van **al principio** del archivo para ser válidos. Si Vite se queja, moverlo arriba de todo o importarlo desde `main.tsx`.

- [ ] **Step 3: Verificar el build**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx vite build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/responsive.css src/styles.css
git commit -m "feat(ui): three responsive breakpoints and coarse-pointer targets"
```

---

## Task 9: Cablear `touch.ts` en `Scene.tsx` y limitar `dpr`

**Files:**
- Modify: `src/scene/Scene.tsx`

- [ ] **Step 1: Limitar `dpr` con puntero grueso**

```tsx
const COARSE = typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches

// Un celular de 390 px con DPR 3 son ~1,3 M de píxeles por frame.
<Canvas dpr={COARSE ? [1, 1.5] : [1, 2]} ... />
```

- [ ] **Step 2: Alimentar la máquina desde `touch.ts`**

En el `useEffect` de listeners de 01, desviar los eventos de `pointerType === 'touch'` por `touchStep` antes de `feed`:

```ts
  const touch = useRef(initialTouchState)

  const feedTouch = useCallback((ev: TouchEvent) => {
    const { state, out } = touchStep(touch.current, ev)
    touch.current = state
    for (const input of out.inputs) feed(input)
    if (out.pickAt) useEditor.getState().pickAt(out.pickAt)
    if (out.vibrateMs) navigator.vibrate?.(out.vibrateMs)
    rec(EV.gestureTouch, str(ev.kind), state.active.length, NaN)
  }, [feed])
```

- [ ] **Step 3: El temporizador del long-press**

```ts
  useEffect(() => {
    const id = window.setInterval(() => {
      if (touch.current.primary !== null) feedTouch({ kind: 'tick', now: performance.now() })
    }, 50)
    return () => clearInterval(id)
  }, [feedTouch])
```

50 ms da como máximo 50 ms de retraso sobre los 400, imperceptible, y evita un `setTimeout` por gesto.

- [ ] **Step 4: Configurar los gestos táctiles de OrbitControls**

Sin esto, un dedo rota la cámara compitiendo con el dibujo. Quién manda lo decide
el `enabled` que ya controla la máquina de 01; esto sólo fija qué hace cada
cantidad de dedos cuando la cámara tiene el control.

```tsx
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
```

- [ ] **Step 5: Correr toda la suite**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test --reporter=list
```

Esperado: todo verde, incluidos los 8 de `editor.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/Scene.tsx
git commit -m "feat(scene): route touch pointers through the touch layer"
```

---

## Task 10: Shell móvil en `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Montar barra, stepper y hojas**

```tsx
import { BottomBar } from './ui/BottomBar'
import { LayerStepper } from './ui/LayerStepper'
import { Sheet } from './ui/Sheet'
import { FirstTouchSheet, shouldAskTouchMode } from './ui/FirstTouchSheet'
```

Dentro del `viewport`, junto a `CoordReadout`:

```tsx
  <LayerStepper />
```

Y al final del árbol:

```tsx
  <BottomBar onOverflow={() => setSheet('designs')} />
  <Sheet id="palette" title="Bloques"><PalettePanel /></Sheet>
  <Sheet id="tools" title="Herramientas"><ToolPanel /></Sheet>
  {askTouch && <FirstTouchSheet onDone={() => setAskTouch(false)} />}
```

`askTouch` es `useState(shouldAskTouchMode)`.

**`PalettePanel` y `ToolPanel` siguen montados también en las columnas.** CSS los oculta por debajo de 1024 px; no se duplican componentes ni estado.

- [ ] **Step 2: `Esc` cierra la hoja antes que la selección**

En el manejador de teclado, antes de la rama de `Escape` existente:

```ts
      if (e.key === 'Escape' && s.sheet !== 'none') {
        s.setSheet('none')
        return
      }
```

- [ ] **Step 3: Correr la suite y commitear**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test --reporter=list
git add src/App.tsx
git commit -m "feat: mount mobile shell with bottom bar and sheets"
```

---

## Task 11: La guía en celular

**Files:**
- Modify: `src/ui/GuideView.tsx`, `src/ui/responsive.css`

- [ ] **Step 1: Un paso por pantalla**

Por debajo de 600 px la tira de pasos y la lista de materiales pasan a hojas, el
SVG de la capa se escala al ancho completo y el encabezado queda fijo.

En `GuideView`, envolver la tira y los materiales:

```tsx
  const compact = useMediaQuery('(max-width: 599px)')
  const setSheet = useEditor((s) => s.setSheet)
```

```tsx
  {compact ? (
    <header className="guide-sticky">
      <button onClick={() => setSheet('guide-steps')} data-testid="guide-jump">
        Paso {i + 1} de {guide.steps.length} · capa y = {step.fromY}
      </button>
      <button onClick={() => setSheet('materials')}>Materiales</button>
    </header>
  ) : (
    <div className="steps-strip">{/* la tira actual, sin cambios */}</div>
  )}
```

`useMediaQuery` es un hook chico en `src/ui/useMediaQuery.ts`:

```ts
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const mql = typeof window !== 'undefined' ? window.matchMedia(query) : null
  return useSyncExternalStore(
    (cb) => {
      mql?.addEventListener('change', cb)
      return () => mql?.removeEventListener('change', cb)
    },
    () => mql?.matches ?? false,
    () => false,
  )
}
```

`useSyncExternalStore` y no `useState` + efecto: evita el parpadeo del primer render, que es el problema del enfoque por JS que el spec descartó.

Y el SVG a ancho completo:

```css
@media (max-width: 599px) {
  .guide .canvas-wrap { padding: 0; }
  .guide .canvas-wrap svg { width: 100%; height: auto; }
  .guide-sticky {
    position: sticky; top: 0; z-index: 5; display: flex; gap: 8px;
    padding: 8px 0; background: var(--bg);
  }
  .guide-cols { flex-direction: column; }
}
```

- [ ] **Step 2: Deslizamiento lateral**

```ts
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const EDGE_PX = 24

  const onDown = (e: React.PointerEvent) => {
    // La franja del borde es del gesto "atrás" del sistema: no competir.
    if (e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX) return
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: React.PointerEvent) => {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) < 60 || Math.abs(e.clientY - s.y) > 40) return
    setI((v) => Math.max(0, Math.min(guide.steps.length - 1, v + (dx < 0 ? 1 : -1))))
  }
```

- [ ] **Step 3: Correr la suite y commitear**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test --reporter=list
git add src/ui/GuideView.tsx src/ui/responsive.css
git commit -m "feat(ui): one step per screen guide on phones"
```

---

## Task 12: Tests de layout y verificación final

**Files:**
- Create: `tests/responsive.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Escribir los tests**

```ts
// tests/responsive.spec.ts
import { expect, test, type Page } from '@playwright/test'

const ready = async (page: Page) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__mcb))
  await page.waitForTimeout(400)
}

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('muestra la barra inferior y oculta las columnas', async ({ page }) => {
    await ready(page)
    await expect(page.getByTestId('bottom-bar')).toBeVisible()
    await expect(page.locator('.main > .side').first()).toBeHidden()
  })

  test('no hay scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await ready(page)
    const overflow = await page.evaluate(
      () => document.body.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('la hoja de bloques abre y deja ver el viewport', async ({ page }) => {
    await ready(page)
    await page.getByTestId('bb-block').click()
    await expect(page.locator('.sheet')).toBeVisible()
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('todos los controles llegan a 44 px', async ({ page }) => {
    await ready(page)
    const small = await page.evaluate(() => {
      const out: string[] = []
      for (const el of document.querySelectorAll('button, input, select, a')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.width < 44 || r.height < 44) {
          out.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      }
      return out
    })
    expect(small, `controles chicos: ${small.join(' · ')}`).toEqual([])
  })
})

test.describe('escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('conserva las tres columnas y no muestra la barra', async ({ page }) => {
    await ready(page)
    await expect(page.locator('.main > .side').first()).toBeVisible()
    await expect(page.getByTestId('bottom-bar')).toBeHidden()
  })
})
```

- [ ] **Step 2: Correr y arreglar lo que salte**

```bash
export PATH="/c/nvm4w/nodejs:$PATH" && npx playwright test tests/responsive.spec.ts --reporter=list
```

El test de 44 px probablemente falle la primera vez y liste los controles chicos. Eso es el punto: la lista dice exactamente qué agrandar.

- [ ] **Step 3: Verificación completa**

```bash
export PATH="/c/nvm4w/nodejs:$PATH"
npm run typecheck
npx vite build
npx playwright test --reporter=list
```

- [ ] **Step 4: Actualizar el README**

Añadir una sección de controles táctiles: tap coloca, arrastrar pinta, mantener toma el bloque, dos dedos mueven la cámara, y la goma se elige de la barra.

- [ ] **Step 5: Verificación manual en un aparato real**

La emulación no reproduce el pulgar. En un celular de verdad:

1. La barra inferior no queda debajo de la barra de gestos del sistema.
2. Un tap coloca exactamente un bloque.
3. Mantener toma el bloque y vibra; soltar después no coloca nada.
4. Dos dedos mueven la cámara y no escriben nada.
5. Levantar un dedo de dos no reanuda la pintura.
6. La hoja se arrastra y se cierra, y arrastrarla no pinta.
7. Deslizar en la guía cambia de paso; desde el borde, no.
8. El editor se mantiene fluido con una construcción mediana.

- [ ] **Step 6: Commit**

```bash
git add tests/responsive.spec.ts README.md
git commit -m "test: responsive layout, touch targets and horizontal overflow"
```

---

## Notas para quien ejecute

- **No empezar antes de que `input-model` esté mergeado.** Las tareas 9, 10 y 11 modifican archivos de 01.
- **La interfaz `Input` se lee del `gesture.ts` real.** Si difiere de lo que muestra este plan, manda el código y hay que ajustar `touch.ts`.
- Las tareas 1-3 modifican el mismo archivo: van en serie. Las 4-8 son independientes entre sí.
- El test de 44 px va a fallar la primera vez. No es un bug del test.
