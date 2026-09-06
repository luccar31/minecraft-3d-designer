import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as THREE from 'three'
import { CHUNK } from '../types'
import { buildChunkGeometry } from '../voxel/mesher'
import { chunkX, chunkY, chunkZ, type ChunkKey, type World } from '../voxel/world'

const MESH_RAYCAST = THREE.Mesh.prototype.raycast
const NO_RAYCAST = () => null

function ChunkMesh({
  world, ck, opaqueMat, transMat, pickable,
}: {
  world: World
  ck: ChunkKey
  opaqueMat: THREE.Material
  transMat: THREE.Material
  pickable: boolean
}) {
  const subscribe = useMemo(() => world.subscribeChunk(ck), [world, ck])
  const getSnapshot = useMemo(() => () => world.getChunkVersion(ck), [world, ck])
  const version = useSyncExternalStore(subscribe, getSnapshot)

  const geo = useMemo(
    () => buildChunkGeometry(world, ck),
    // `version` is the real dependency: geometry rebuilds only when this
    // chunk gets marked dirty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, ck, version],
  )

  useEffect(
    () => () => {
      geo.opaque?.dispose()
      geo.transparent?.dispose()
    },
    [geo],
  )

  const pos: [number, number, number] = [chunkX(ck) * CHUNK, chunkY(ck) * CHUNK, chunkZ(ck) * CHUNK]
  // Always a function: `raycast={undefined}` writes an own property that
  // shadows Mesh.prototype.raycast, and every later pick throws.
  const raycast = pickable ? MESH_RAYCAST : NO_RAYCAST

  return (
    <group position={pos}>
      {geo.opaque && (
        <mesh geometry={geo.opaque} material={opaqueMat} raycast={raycast} castShadow receiveShadow />
      )}
      {geo.transparent && (
        <mesh
          geometry={geo.transparent}
          material={transMat}
          raycast={raycast}
          renderOrder={1}
        />
      )}
    </group>
  )
}

export function Chunks({
  world, opaqueMat, transMat, pickable,
}: {
  world: World
  opaqueMat: THREE.Material
  transMat: THREE.Material
  pickable: boolean
}) {
  const structVersion = useSyncExternalStore(world.subscribeStructure, world.getStructureVersion)
  const keys = useMemo(
    () => world.nonEmptyChunks(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, structVersion],
  )

  return (
    <>
      {keys.map((ck) => (
        <ChunkMesh
          key={ck}
          world={world}
          ck={ck}
          opaqueMat={opaqueMat}
          transMat={transMat}
          pickable={pickable}
        />
      ))}
    </>
  )
}
