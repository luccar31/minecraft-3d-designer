import * as THREE from 'three'
import { CHUNK, keyX, keyY, keyZ } from '../types'
import { blockDef, isTransparent } from '../blocks/palette'
import { slotOf, slotUV } from '../blocks/atlas'
import { EV, rec } from '../debug'
import type { World, ChunkKey } from './world'
import { chunkX, chunkY, chunkZ } from './world'

type VertSpec = { pos: [number, number, number]; uv: [number, number] }
type FaceSpec = {
  dir: [number, number, number]
  shade: number
  which: 'top' | 'side' | 'bottom'
  verts: [VertSpec, VertSpec, VertSpec, VertSpec]
}

/**
 * The 6 unit-cube faces, counterclockwise from outside. Shading mimics the
 * game; without it a white cube looks flat.
 */
const FACES: FaceSpec[] = [
  {
    dir: [1, 0, 0], shade: 0.8, which: 'side',
    verts: [
      { pos: [1, 0, 1], uv: [0, 0] }, { pos: [1, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] },
    ],
  },
  {
    dir: [-1, 0, 0], shade: 0.8, which: 'side',
    verts: [
      { pos: [0, 0, 0], uv: [0, 0] }, { pos: [0, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 1, 0], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 1, 0], shade: 1.0, which: 'top',
    verts: [
      { pos: [0, 1, 1], uv: [0, 0] }, { pos: [1, 1, 1], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [1, 1] }, { pos: [0, 1, 0], uv: [0, 1] },
    ],
  },
  {
    dir: [0, -1, 0], shade: 0.48, which: 'bottom',
    verts: [
      { pos: [0, 0, 0], uv: [0, 0] }, { pos: [1, 0, 0], uv: [1, 0] },
      { pos: [1, 0, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 0, 1], shade: 0.62, which: 'side',
    verts: [
      { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [1, 1, 1], uv: [1, 1] }, { pos: [0, 1, 1], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 0, -1], shade: 0.62, which: 'side',
    verts: [
      { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [0, 1, 0], uv: [1, 1] }, { pos: [1, 1, 0], uv: [0, 1] },
    ],
  },
]

/**
 * Per-vertex AO offsets: the two side neighbors plus the corner, just
 * outside the face plane.
 */
const AO_OFFSETS: [number, number, number][][][] = FACES.map((face) => {
  const [nx, ny, nz] = face.dir
  const axis = nx !== 0 ? 0 : ny !== 0 ? 1 : 2
  const t1 = axis === 0 ? 1 : 0
  const t2 = axis === 2 ? 1 : 2
  return face.verts.map((v) => {
    const s1 = v.pos[t1] === 1 ? 1 : -1
    const s2 = v.pos[t2] === 1 ? 1 : -1
    const side1: [number, number, number] = [nx, ny, nz]
    const side2: [number, number, number] = [nx, ny, nz]
    const corner: [number, number, number] = [nx, ny, nz]
    side1[t1] += s1
    side2[t2] += s2
    corner[t1] += s1
    corner[t2] += s2
    return [side1, side2, corner]
  })
})

const AO_LEVELS = [0.55, 0.72, 0.86, 1.0]
const UV_INSET = 0.5 / (32 * 16) // half a texel of the atlas

export type ChunkGeometry = {
  opaque: THREE.BufferGeometry | null
  transparent: THREE.BufferGeometry | null
}

type Buffers = {
  pos: number[]
  norm: number[]
  uv: number[]
  col: number[]
  idx: number[]
  n: number
}

const newBuffers = (): Buffers => ({ pos: [], norm: [], uv: [], col: [], idx: [], n: 0 })

function toGeometry(b: Buffers): THREE.BufferGeometry | null {
  if (b.n === 0) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3))
  g.setIndex(b.idx)
  g.computeBoundingSphere()
  return g
}

function faceVisible(self: string, neighbour: string | undefined): boolean {
  if (neighbour === undefined) return true
  if (!isTransparent(neighbour)) return false
  // Same-type glass touching glass merges into a single shell.
  return !isTransparent(self) || self !== neighbour
}

export function buildChunkGeometry(world: World, ck: ChunkKey): ChunkGeometry {
  const t0 = performance.now()
  const cells = world.cellsOf(ck)
  if (!cells || cells.size === 0) return { opaque: null, transparent: null }

  const ox = chunkX(ck) * CHUNK
  const oy = chunkY(ck) * CHUNK
  const oz = chunkZ(ck) * CHUNK

  const opaque = newBuffers()
  const trans = newBuffers()

  const solidAt = (x: number, y: number, z: number): boolean => {
    const b = world.get(x, y, z)
    return b !== undefined && !isTransparent(b)
  }

  for (const key of cells) {
    const x = keyX(key)
    const y = keyY(key)
    const z = keyZ(key)
    const id = world.getByKey(key)!
    const def = blockDef(id)
    const target = def.transparent ? trans : opaque

    for (let f = 0; f < 6; f++) {
      const face = FACES[f]
      const [dx, dy, dz] = face.dir
      const nb = world.get(x + dx, y + dy, z + dz)
      if (!faceVisible(id, nb)) continue

      const spec = def.tex[face.which]
      const { u0, v0, size } = slotUV(slotOf(spec))
      const base = target.n

      const ao: number[] = []
      for (let v = 0; v < 4; v++) {
        const [s1, s2, cr] = AO_OFFSETS[f][v]
        const a = solidAt(x + s1[0], y + s1[1], z + s1[2]) ? 1 : 0
        const b = solidAt(x + s2[0], y + s2[1], z + s2[2]) ? 1 : 0
        const c = solidAt(x + cr[0], y + cr[1], z + cr[2]) ? 1 : 0
        ao.push(a && b ? 0 : 3 - (a + b + c))
      }

      for (let v = 0; v < 4; v++) {
        const vert = face.verts[v]
        target.pos.push(
          x - ox + vert.pos[0],
          y - oy + vert.pos[1],
          z - oz + vert.pos[2],
        )
        target.norm.push(dx, dy, dz)
        target.uv.push(
          u0 + UV_INSET + vert.uv[0] * (size - 2 * UV_INSET),
          v0 + UV_INSET + vert.uv[1] * (size - 2 * UV_INSET),
        )
        const light = face.shade * AO_LEVELS[ao[v]]
        target.col.push(light, light, light)
      }

      // If the default diagonal crosses the AO gradient backwards it shows
      // a fold; flip the triangulation.
      if (ao[0] + ao[2] > ao[1] + ao[3]) {
        target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
      } else {
        target.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base)
      }
      target.n += 4
    }
  }

  // Rebuilding a chunk decides if placing a block feels instant; always
  // measured, not just on failure.
  rec(EV.remesh, ck, cells.size, performance.now() - t0, opaque.n, trans.n)

  return { opaque: toGeometry(opaque), transparent: toGeometry(trans) }
}

let opaqueMat: THREE.MeshLambertMaterial | null = null
let transMat: THREE.MeshLambertMaterial | null = null

export function getMaterials(atlas: THREE.Texture) {
  if (!opaqueMat) {
    opaqueMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true })
  }
  if (!transMat) {
    transMat = new THREE.MeshLambertMaterial({
      map: atlas,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
    })
  }
  return { opaqueMat, transMat }
}
