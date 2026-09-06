import { expect, test } from '@playwright/test'
import { initialState, step, type Cell, type Ctx, type Mods } from '../src/scene/gesture'

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
