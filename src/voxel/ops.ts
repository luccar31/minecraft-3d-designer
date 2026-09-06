import { EV, rec, str } from '../debug'
import type { Axis, BlockId, Dims, Slice, Vec3 } from '../types'

export type UV = { u: number; v: number }

/**
 * `v` always points "up on screen" in vertical slices — matches how you'd
 * draw a wall by hand.
 */
export function planeDims(axis: Axis, dims: Dims): { u: number; v: number } {
  switch (axis) {
    case 'y': return { u: dims.x, v: dims.z }
    case 'x': return { u: dims.z, v: dims.y }
    case 'z': return { u: dims.x, v: dims.y }
  }
}

export function planeToWorld(slice: Slice, u: number, v: number): Vec3 {
  switch (slice.axis) {
    case 'y': return { x: u, y: slice.index, z: v }
    case 'x': return { x: slice.index, y: v, z: u }
    case 'z': return { x: u, y: v, z: slice.index }
  }
}

export function worldToPlane(axis: Axis, p: Vec3): UV {
  switch (axis) {
    case 'y': return { u: p.x, v: p.z }
    case 'x': return { u: p.z, v: p.y }
    case 'z': return { u: p.x, v: p.y }
  }
}

export function sliceIndexOf(axis: Axis, p: Vec3): number {
  return axis === 'x' ? p.x : axis === 'y' ? p.y : p.z
}

export function sliceExtent(axis: Axis, dims: Dims): number {
  return axis === 'x' ? dims.x : axis === 'y' ? dims.y : dims.z
}

/* ── drawing on the plane ──────────────────────────────────────────────── */

/** Integer Bresenham line. */
export function linePoints(u0: number, v0: number, u1: number, v1: number): UV[] {
  const out: UV[] = []
  let x = u0, y = v0
  const dx = Math.abs(u1 - u0)
  const dy = -Math.abs(v1 - v0)
  const sx = u0 < u1 ? 1 : -1
  const sy = v0 < v1 ? 1 : -1
  let err = dx + dy
  // Hard cap: without it, a NaN endpoint loops forever and hangs the tab
  // with no event logged.
  const cap = dx + Math.abs(dy) + 2
  for (let i = 0; ; i++) {
    if (i > cap) {
      rec(EV.limitReached, str('linePoints'), cap)
      break
    }
    out.push({ u: x, v: y })
    if (x === u1 && y === v1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
  return out
}

export function rectPoints(u0: number, v0: number, u1: number, v1: number, filled: boolean): UV[] {
  const uMin = Math.min(u0, u1), uMax = Math.max(u0, u1)
  const vMin = Math.min(v0, v1), vMax = Math.max(v0, v1)
  const out: UV[] = []
  const cells = (uMax - uMin + 1) * (vMax - vMin + 1)
  if (cells > 65536) rec(EV.limitReached, str('rectPoints'), cells)
  for (let u = uMin; u <= uMax; u++) {
    for (let v = vMin; v <= vMax; v++) {
      const edge = u === uMin || u === uMax || v === vMin || v === vMax
      if (filled || edge) out.push({ u, v })
    }
  }
  return out
}

/** 4-connected fill within the slice, capped so it can't hang the thread. */
export function floodFill(
  at: (u: number, v: number) => BlockId | undefined,
  start: UV,
  uMax: number,
  vMax: number,
  limit = 40000,
): UV[] {
  const targetId = at(start.u, start.v)
  const seen = new Set<number>()
  const out: UV[] = []
  const stack: UV[] = [start]
  const enc = (u: number, v: number) => u * 4096 + v

  while (stack.length && out.length < limit) {
    const p = stack.pop()!
    if (p.u < 0 || p.v < 0 || p.u >= uMax || p.v >= vMax) continue
    const e = enc(p.u, p.v)
    if (seen.has(e)) continue
    if (at(p.u, p.v) !== targetId) continue
    seen.add(e)
    out.push(p)
    stack.push({ u: p.u + 1, v: p.v }, { u: p.u - 1, v: p.v }, { u: p.u, v: p.v + 1 }, { u: p.u, v: p.v - 1 })
  }
  // Hitting the cap leaves the fill incomplete; previously there was no way
  // to know it happened.
  if (out.length >= limit) rec(EV.limitReached, str('floodFill'), limit)
  return out
}

/* ── symmetry ──────────────────────────────────────────────────────────── */

/** Target cells for a write with active mirrors (1, 2, or 4). */
export function mirrorTargets(p: Vec3, dims: Dims, mx: boolean, mz: boolean): Vec3[] {
  const xs = mx ? [p.x, dims.x - 1 - p.x] : [p.x]
  const zs = mz ? [p.z, dims.z - 1 - p.z] : [p.z]
  const out: Vec3[] = []
  const seen = new Set<number>()
  for (const x of xs) {
    for (const z of zs) {
      const k = x * 1000000 + p.y * 1000 + z
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ x, y: p.y, z })
    }
  }
  return out
}
