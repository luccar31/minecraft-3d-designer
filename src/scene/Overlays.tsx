import { useMemo } from 'react'
import * as THREE from 'three'
import type { Axis, BoxSel, Dims, Vec3 } from '../types'
import { blockDef } from '../blocks/palette'
import type { World } from '../voxel/world'
import { planeToWorld, worldToPlane } from '../voxel/ops'

export function Cursor({ cell, color = '#ffffff' }: { cell: Vec3 | null; color?: string }) {
  if (!cell) return null
  return (
    <lineSegments position={[cell.x + 0.5, cell.y + 0.5, cell.z + 0.5]} renderOrder={3}>
      <edgesGeometry args={[new THREE.BoxGeometry(1.02, 1.02, 1.02)]} />
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </lineSegments>
  )
}

export function GridBounds({ dims }: { dims: Dims }) {
  const geo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.x, dims.y, dims.z)),
    [dims.x, dims.y, dims.z],
  )
  return (
    <lineSegments geometry={geo} position={[dims.x / 2, dims.y / 2, dims.z / 2]}>
      <lineBasicMaterial color="#3d4756" transparent opacity={0.75} />
    </lineSegments>
  )
}

export function SelectionBox({ sel }: { sel: BoxSel | null }) {
  if (!sel) return null
  const sx = sel.max.x - sel.min.x + 1
  const sy = sel.max.y - sel.min.y + 1
  const sz = sel.max.z - sel.min.z + 1
  return (
    <group position={[sel.min.x + sx / 2, sel.min.y + sy / 2, sel.min.z + sz / 2]}>
      <mesh renderOrder={2}>
        <boxGeometry args={[sx, sy, sz]} />
        <meshBasicMaterial color="#4ea1ff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <lineSegments renderOrder={3}>
        <edgesGeometry args={[new THREE.BoxGeometry(sx, sy, sz)]} />
        <lineBasicMaterial color="#4ea1ff" depthTest={false} />
      </lineSegments>
    </group>
  )
}

/**
 * The only clickable object in slice mode: makes interaction 2D, letting
 * you paint empty cells without support.
 */
export function SlicePlane({
  axis, index, dims, onDown, onMove, onLeave,
}: {
  axis: Axis
  index: number
  dims: Dims
  onDown: (e: any) => void
  onMove: (e: any) => void
  onLeave: () => void
}) {
  const { position, rotation, size } = useMemo(() => {
    switch (axis) {
      case 'y':
        return {
          position: [dims.x / 2, index + 0.5, dims.z / 2] as [number, number, number],
          rotation: [-Math.PI / 2, 0, 0] as [number, number, number],
          size: [dims.x, dims.z] as [number, number],
        }
      case 'x':
        return {
          position: [index + 0.5, dims.y / 2, dims.z / 2] as [number, number, number],
          rotation: [0, Math.PI / 2, 0] as [number, number, number],
          size: [dims.z, dims.y] as [number, number],
        }
      case 'z':
        return {
          position: [dims.x / 2, dims.y / 2, index + 0.5] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          size: [dims.x, dims.y] as [number, number],
        }
    }
  }, [axis, index, dims.x, dims.y, dims.z])

  return (
    <mesh
      name="slice-plane"
      position={position}
      rotation={rotation}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerOut={onLeave}
      renderOrder={0}
    >
      <planeGeometry args={size} />
      <meshBasicMaterial
        color="#7fb4ff"
        transparent
        opacity={0.07}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

/**
 * Alignment reference: without it, editing an isolated layer means drawing
 * blind.
 */
export function GhostSlice({
  world, axis, index, dims,
}: {
  world: World
  axis: Axis
  index: number
  dims: Dims
}) {
  const cells = useMemo(() => {
    if (index <= 0) return []
    const out: { p: Vec3; color: string }[] = []
    const uMax = axis === 'y' ? dims.x : axis === 'x' ? dims.z : dims.x
    const vMax = axis === 'y' ? dims.z : dims.y
    for (let u = 0; u < uMax; u++) {
      for (let v = 0; v < vMax; v++) {
        const w = planeToWorld({ axis, index: index - 1 }, u, v)
        const id = world.get(w.x, w.y, w.z)
        if (id) out.push({ p: w, color: blockDef(id).color })
      }
    }
    return out
    // Ghost only changes when the layer changes, not during edits, so it
    // excludes `rev`.
  }, [world, axis, index, dims.x, dims.y, dims.z])

  if (cells.length === 0) return null

  return (
    <group>
      {cells.map(({ p, color }) => (
        <mesh key={`${p.x}-${p.y}-${p.z}`} position={[p.x + 0.5, p.y + 0.5, p.z + 0.5]} raycast={() => null}>
          <boxGeometry args={[0.98, 0.98, 0.98]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export function AnchorMarker({
  anchor, axis, index,
}: {
  anchor: { u: number; v: number } | null
  axis: Axis
  index: number
}) {
  if (!anchor) return null
  const p = planeToWorld({ axis, index }, anchor.u, anchor.v)
  return (
    <mesh position={[p.x + 0.5, p.y + 0.5, p.z + 0.5]} raycast={() => null} renderOrder={3}>
      <boxGeometry args={[1.04, 1.04, 1.04]} />
      <meshBasicMaterial color="#ffcf4a" transparent opacity={0.5} depthTest={false} />
    </mesh>
  )
}

export { worldToPlane }
