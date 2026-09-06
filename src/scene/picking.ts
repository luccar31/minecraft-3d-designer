/**
 * Single source of truth for "which cell is the pointer on". Cursor and edit
 * both call it, so they can no longer disagree.
 */

import type { Cell, Mods } from './gesture'
import type { Dims, Tool } from '../types'

/** `plate` and `slice` are planes without thickness: no block behind them. */
export type HitKind = 'block' | 'plate' | 'slice'

export type Vec3f = { x: number; y: number; z: number }

export type Hit = {
  kind: HitKind
  point: Vec3f
  normal: Vec3f
}

export type Action = 'place' | 'erase' | 'pick' | 'none'

export type Resolution = {
  target: Cell | null
  placement: Cell | null
  chosen: Cell | null
  action: Action
  face: { center: Vec3f; normal: Vec3f } | null
  valid: boolean
}

const EPS = 1e-4

/** Steps half a cell along the normal, plus an epsilon off the face itself. */
const offsetFloor = (p: Vec3f, n: Vec3f, sign: number): Cell => {
  const bias = sign > 0 ? EPS : -EPS
  return {
    x: Math.floor(p.x + sign * n.x * 0.5 + bias * n.x),
    y: Math.floor(p.y + sign * n.y * 0.5 + bias * n.y),
    z: Math.floor(p.z + sign * n.z * 0.5 + bias * n.z),
  }
}

const cellOf = (p: Vec3f): Cell => ({
  x: Math.floor(p.x),
  y: Math.floor(p.y),
  z: Math.floor(p.z),
})

const inBounds = (c: Cell, d: Dims) =>
  c.x >= 0 && c.y >= 0 && c.z >= 0 && c.x < d.x && c.y < d.y && c.z < d.z

export function resolveCell(hit: Hit, mods: Mods, tool: Tool, dims: Dims): Resolution {
  // The slice plane cuts through the middle of its layer, so its own cell is
  // both what you paint and what you erase.
  const inLayer = hit.kind === 'slice'
  const target = inLayer
    ? cellOf(hit.point)
    : hit.kind === 'block'
      ? offsetFloor(hit.point, hit.normal, -1)
      : null
  const placement = inLayer ? cellOf(hit.point) : offsetFloor(hit.point, hit.normal, 1)

  let action: Action =
    mods.alt || tool === 'picker'
      ? 'pick'
      : mods.shift || tool === 'eraser'
        ? 'erase'
        : 'place'

  const chosen = action === 'place' ? placement : target
  if (chosen === null) action = 'none'

  const face =
    hit.kind === 'block' && target
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
