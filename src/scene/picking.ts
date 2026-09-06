import type { Cell, Mods } from './gesture'
import type { Dims, Tool } from '../types'

/** `plate` and `slice` are planes without thickness: nothing sits behind them. */
export type HitKind = 'block' | 'plate' | 'slice'

export type Hit = {
  kind: HitKind
  point: { x: number; y: number; z: number }
  normal: { x: number; y: number; z: number }
}

export type Action = 'place' | 'erase' | 'pick' | 'none'

/** A face center falls on halves, so it is not a whole cell. */
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
