import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Axis, BlockId, BoxSel, Dims, Vec3 } from '../types'
import { blockDef } from '../blocks/palette'
import { slotOf, slotUV } from '../blocks/atlas'
import type { Resolution } from './picking'
import type { World } from '../voxel/world'
import { planeToWorld, worldToPlane } from '../voxel/ops'

/**
 * Built once and reused by scaling. These used to be rebuilt on every mouse
 * move and never disposed, leaking GPU memory for as long as the tab lived.
 */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX)

export function Cursor({ cell, color = '#ffffff' }: { cell: Vec3 | null; color?: string }) {
  if (!cell) return null
  return (
    <lineSegments
      geometry={UNIT_EDGES}
      position={[cell.x + 0.5, cell.y + 0.5, cell.z + 0.5]}
      scale={1.02}
      renderOrder={3}
    >
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </lineSegments>
  )
}

/** Orients the face quad along the hit normal. */
function faceRotation(n: { x: number; y: number; z: number }): [number, number, number] {
  if (n.y !== 0) return [-Math.PI / 2, 0, 0]
  if (n.x !== 0) return [0, Math.PI / 2, 0]
  return [0, 0, 0]
}

/** BoxGeometry face order: +x, -x, +y, -y, +z, -z. */
const FACE_ORDER = ['side', 'side', 'top', 'bottom', 'side', 'side'] as const

/** Remaps the unit box onto the active block's atlas tiles. */
function useGhostGeometry(blockId: BlockId): THREE.BufferGeometry {
  const geo = useMemo(() => {
    const g = UNIT_BOX.clone()
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    const tex = blockDef(blockId).tex
    for (let f = 0; f < FACE_ORDER.length; f++) {
      const { u0, v0, size } = slotUV(slotOf(tex[FACE_ORDER[f]]))
      for (let i = f * 4; i < f * 4 + 4; i++) {
        uv.setXY(i, u0 + uv.getX(i) * size, v0 + uv.getY(i) * size)
      }
    }
    uv.needsUpdate = true
    return g
  }, [blockId])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

/**
 * Placement preview: ghost block, supporting face and erase tint. Reads the
 * same `Resolution` the edit will use, so preview and edit cannot disagree.
 */
export function Preview({ res, blockId, atlas }: {
  res: Resolution | null
  blockId: BlockId
  atlas: THREE.Texture
}) {
  const ghostGeo = useGhostGeometry(blockId)
  const ghostMat = useMemo(
    () => new THREE.MeshLambertMaterial({
      map: atlas, transparent: true, opacity: 0.45, depthWrite: false,
    }),
    [atlas],
  )
  const faceMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.28,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    [],
  )
  const eraseMat = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: '#ff6b6b', transparent: true, opacity: 0.4, depthWrite: false,
    }),
    [],
  )

  useEffect(() => () => {
    ghostMat.dispose()
    faceMat.dispose()
    eraseMat.dispose()
  }, [ghostMat, faceMat, eraseMat])

  if (!res || !res.valid || !res.chosen || res.action === 'none') return null
  const c = res.chosen
  const at: [number, number, number] = [c.x + 0.5, c.y + 0.5, c.z + 0.5]

  return (
    <>
      {res.action === 'place' && (
        <mesh geometry={ghostGeo} material={ghostMat} position={at} raycast={() => null} />
      )}
      {res.action === 'erase' && (
        <mesh
          geometry={UNIT_BOX}
          material={eraseMat}
          position={at}
          scale={1.02}
          raycast={() => null}
        />
      )}
      {res.action === 'place' && res.face && (
        <mesh
          geometry={UNIT_PLANE}
          material={faceMat}
          position={[
            res.face.center.x + res.face.normal.x * 0.01,
            res.face.center.y + res.face.normal.y * 0.01,
            res.face.center.z + res.face.normal.z * 0.01,
          ]}
          rotation={faceRotation(res.face.normal)}
          raycast={() => null}
        />
      )}
    </>
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
      <mesh geometry={UNIT_BOX} scale={[sx, sy, sz]} renderOrder={2}>
        <meshBasicMaterial color="#4ea1ff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <lineSegments geometry={UNIT_EDGES} scale={[sx, sy, sz]} renderOrder={3}>
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
          scale={0.98}
          position={[p.x + 0.5, p.y + 0.5, p.z + 0.5]}
          raycast={() => null}
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
      scale={1.04}
      position={[p.x + 0.5, p.y + 0.5, p.z + 0.5]}
      raycast={() => null}
      renderOrder={3}
    >
      <meshBasicMaterial color="#ffcf4a" transparent opacity={0.5} depthTest={false} />
    </mesh>
  )
}

export { worldToPlane }
