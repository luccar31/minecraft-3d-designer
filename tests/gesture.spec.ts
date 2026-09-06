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
