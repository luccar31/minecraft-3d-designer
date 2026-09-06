import { expect, test } from '@playwright/test'
import { initialState, step, type Cell, type Ctx, type Input, type Mods } from '../src/scene/gesture'
import { resolveCell, type Hit } from '../src/scene/picking'
import { spaceDown, spaceUp } from '../src/scene/modeKeys'

const NO_MODS: Mods = { shift: false, alt: false, ctrl: false, meta: false }
const BUILD: Ctx = { mode: 'build', dragTool: true }
const NAVIGATE: Ctx = { mode: 'navigate', dragTool: true }
const CLICK_TOOL: Ctx = { mode: 'build', dragTool: false }

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

test('en pending la órbita está apagada, y sigue apagada bajo el umbral', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), BUILD)
  expect(a.state.phase).toBe('pending')
  expect(a.out.orbitEnabled).toBe(false)

  const b = step(a.state, { kind: 'move', x: 102, y: 101, cell: { x: 1, y: 0, z: 1 } }, BUILD)
  expect(b.state.phase).toBe('pending')
  expect(b.out.orbitEnabled).toBe(false)

  const c = step(b.state, { kind: 'up', x: 102, y: 101 }, BUILD)
  expect(c.out.orbitEnabled).toBe(true)
})

test('con herramienta de click, cruzar el umbral vuelve a habilitar la órbita', () => {
  const a = step(initialState, downAt(100, 100, { x: 1, y: 0, z: 1 }), CLICK_TOOL)
  expect(a.out.orbitEnabled).toBe(false)

  const b = step(a.state, { kind: 'move', x: 130, y: 100, cell: { x: 4, y: 0, z: 1 } }, CLICK_TOOL)
  expect(b.state.phase).toBe('navigating')
  expect(b.out.orbitEnabled).toBe(true)
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
