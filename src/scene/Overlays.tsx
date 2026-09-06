import { useMemo } from 'react'
import * as THREE from 'three'
import type { Axis, BlockId, BoxSel, Dims, Vec3 } from '../types'
import { blockDef } from '../blocks/palette'
import type { World } from '../voxel/world'
import { planeToWorld, worldToPlane } from '../voxel/ops'
import type { Resolution, Vec3f } from './picking'

/**
 * Shared unit geometry. Built once: `new BoxGeometry()` inside a component
 * body leaked one geometry per mouse move.
 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX)
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)

const NO_RAY = () => null

const PLACE_COLOR = '#7ee787'
const ERASE_COLOR = '#ff6b6b'
const PICK_COLOR = '#ffcf4a'

const centerOf = (cell: Vec3): [number, number, number] => [
  cell.x + 0.5,
  cell.y + 0.5,
  cell.z + 0.5,
]

export function Cursor({ cell, color = '#ffffff' }: { cell: Vec3 | null; color?: string }) {
  if (!cell) return null
  return (
    <lineSegments
      geometry={UNIT_EDGES}
      position={centerOf(cell)}
      scale={1.02}
      raycast={NO_RAY}
      renderOrder={3}
    >
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </lineSegments>
  )
}

/** Orients the highlight quad along the pointed face's normal. */
function faceRotation(n: Vec3f): [number, number, number] {
  if (n.y !== 0) return [-Math.PI / 2, 0, 0]
  if (n.x !== 0) return [0, Math.PI / 2, 0]
  return [0, 0, 0]
}

/**
 * What the next click will do, drawn before it happens: ghost block to place,
 * silhouette to erase, and the face the new block leans against.
 */
export function Preview({ res, blockId }: { res: Resolution | null; blockId: BlockId }) {
  const ghostColor = useMemo(() => blockDef(blockId).color, [blockId])
  if (!res || !res.valid || !res.chosen || res.action === 'none') return null

  const pos = centerOf(res.chosen)
  const outline =
    res.action === 'erase' ? ERASE_COLOR : res.action === 'pick' ? PICK_COLOR : PLACE_COLOR

  return (
    <>
      {res.action === 'place' && (
        <mesh geometry={UNIT_BOX} position={pos} scale={0.98} raycast={NO_RAY} renderOrder={2}>
          <meshBasicMaterial color={ghostColor} transparent opacity={0.38} depthWrite={false} />
        </mesh>
      )}

      {res.action === 'erase' && (
        <mesh geometry={UNIT_BOX} position={pos} scale={1.01} raycast={NO_RAY} renderOrder={2}>
          <meshBasicMaterial color={ERASE_COLOR} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}

      {res.action === 'place' && res.face && (
        <mesh
          geometry={UNIT_PLANE}
          position={[
            res.face.center.x + res.face.normal.x * 0.012,
            res.face.center.y + res.face.normal.y * 0.012,
            res.face.center.z + res.face.normal.z * 0.012,
          ]}
          rotation={faceRotation(res.face.normal)}
          raycast={NO_RAY}
          renderOrder={3}
        >
          <meshBasicMaterial
            color={PLACE_COLOR}
            transparent
            opacity={0.28}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      <Cursor cell={res.chosen} color={outline} />
    </>
  )
}

export function GridBounds({ dims }: { dims: Dims }) {
  const geo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.x, dims.y, dims.z)),
    [dims.x, dims.y, dims.z],
  )
  return (
    <lineSegments
      geometry={geo}
      position={[dims.x / 2, dims.y / 2, dims.z / 2]}
      raycast={NO_RAY}
    >
      <lineBasicMaterial color="#3d4756" transparent opacity={0.75} />
    </lineSegments>
  )
}

export function SelectionBox({ sel }: { sel: BoxSel | null }) {
  if (!sel) return null
  const sx = sel.max.x - sel.min.x + 1
  const sy = sel.max.y - sel.min.y + 1
  const sz = sel.max.z - sel.min.z + 1
  const scale: [number, number, number] = [sx, sy, sz]
  return (
    <group position={[sel.min.x + sx / 2, sel.min.y + sy / 2, sel.min.z + sz / 2]}>
      <mesh geometry={UNIT_BOX} scale={scale} raycast={NO_RAY} renderOrder={2}>
        <meshBasicMaterial color="#4ea1ff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <lineSegments geometry={UNIT_EDGES} scale={scale} raycast={NO_RAY} renderOrder={3}>
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
        <mesh
          key={`${p.x}-${p.y}-${p.z}`}
          geometry={UNIT_BOX}
          position={centerOf(p)}
          scale={0.98}
          raycast={NO_RAY}
        >
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
    <mesh
      geometry={UNIT_BOX}
      position={centerOf(p)}
      scale={1.04}
      raycast={NO_RAY}
      renderOrder={3}
    >
      <meshBasicMaterial color="#ffcf4a" transparent opacity={0.5} depthTest={false} />
    </mesh>
  )
}

export { worldToPlane }
