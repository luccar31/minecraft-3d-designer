import { CHUNK, packKey, keyX, keyY, keyZ } from '../types'
import type { BlockId, CellDelta, Dims, VoxelKey } from '../types'

export type ChunkKey = number

export const packChunk = (cx: number, cy: number, cz: number): ChunkKey =>
  (cx << 12) | (cy << 6) | cz
export const chunkX = (c: ChunkKey) => (c >>> 12) & 63
export const chunkY = (c: ChunkKey) => (c >>> 6) & 63
export const chunkZ = (c: ChunkKey) => c & 63

const chunkOf = (x: number, y: number, z: number) =>
  packChunk((x / CHUNK) | 0, (y / CHUNK) | 0, (z / CHUNK) | 0)

/**
 * Grilla de voxels sparse con chunks de 16³.
 *
 * Vive FUERA de React a propósito: cada bloque colocado toca un Map mutable y
 * notifica sólo a los chunks afectados. Un store inmutable clonaría la grilla
 * entera en cada click.
 */
export class World {
  dims: Dims
  readonly voxels = new Map<VoxelKey, BlockId>()
  private readonly chunkCells = new Map<ChunkKey, Set<VoxelKey>>()
  private readonly versions = new Map<ChunkKey, number>()
  private readonly chunkSubs = new Map<ChunkKey, Set<() => void>>()
  private readonly structureSubs = new Set<() => void>()
  private structureVersion = 0
  private batching = 0
  private pendingDirty = new Set<ChunkKey>()
  private pendingStructure = false

  constructor(dims: Dims) {
    this.dims = dims
  }

  get size() {
    return this.voxels.size
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && y >= 0 && z >= 0 &&
      x < this.dims.x && y < this.dims.y && z < this.dims.z
    )
  }

  get(x: number, y: number, z: number): BlockId | undefined {
    if (!this.inBounds(x, y, z)) return undefined
    return this.voxels.get(packKey(x, y, z))
  }

  getByKey(k: VoxelKey): BlockId | undefined {
    return this.voxels.get(k)
  }

  /** Escribe una celda. Devuelve el delta, o null si no cambió nada. */
  set(x: number, y: number, z: number, id: BlockId | undefined): CellDelta | null {
    if (!this.inBounds(x, y, z)) return null
    const key = packKey(x, y, z)
    const prev = this.voxels.get(key)
    if (prev === id) return null
    this.writeKey(key, id)
    return { key, prev, next: id }
  }

  private writeKey(key: VoxelKey, id: BlockId | undefined) {
    const x = keyX(key), y = keyY(key), z = keyZ(key)
    const ck = chunkOf(x, y, z)
    let cells = this.chunkCells.get(ck)
    const wasEmpty = !cells || cells.size === 0

    if (id === undefined) {
      this.voxels.delete(key)
      cells?.delete(key)
    } else {
      this.voxels.set(key, id)
      if (!cells) {
        cells = new Set()
        this.chunkCells.set(ck, cells)
      }
      cells.add(key)
    }

    const isEmpty = !cells || cells.size === 0
    if (wasEmpty !== isEmpty) this.markStructure()

    this.markDirty(ck)
    // Los chunks vecinos también cambian si el voxel está en el borde:
    // sus caras de frontera dejan de estar (o pasan a estar) ocluidas.
    if (x % CHUNK === 0) this.markDirty(chunkOf(x - 1, y, z))
    if (x % CHUNK === CHUNK - 1) this.markDirty(chunkOf(x + 1, y, z))
    if (y % CHUNK === 0) this.markDirty(chunkOf(x, y - 1, z))
    if (y % CHUNK === CHUNK - 1) this.markDirty(chunkOf(x, y + 1, z))
    if (z % CHUNK === 0) this.markDirty(chunkOf(x, y, z - 1))
    if (z % CHUNK === CHUNK - 1) this.markDirty(chunkOf(x, y, z + 1))
  }

  applyDeltas(deltas: CellDelta[], direction: 'redo' | 'undo') {
    this.beginBatch()
    for (const d of deltas) {
      this.writeKey(d.key, direction === 'redo' ? d.next : d.prev)
    }
    this.endBatch()
  }

  replaceAll(entries: Iterable<[VoxelKey, BlockId]>, dims?: Dims) {
    this.beginBatch()
    for (const ck of this.chunkCells.keys()) this.markDirty(ck)
    this.voxels.clear()
    this.chunkCells.clear()
    if (dims) this.dims = dims
    for (const [k, id] of entries) this.writeKey(k, id)
    this.markStructure()
    this.endBatch()
  }

  clear() {
    this.replaceAll([])
  }

  resize(dims: Dims) {
    const kept: [VoxelKey, BlockId][] = []
    for (const [k, id] of this.voxels) {
      if (keyX(k) < dims.x && keyY(k) < dims.y && keyZ(k) < dims.z) kept.push([k, id])
    }
    this.replaceAll(kept, dims)
  }

  /* ── batching ───────────────────────────────────────────────────────── */

  beginBatch() {
    this.batching++
  }

  endBatch() {
    if (--this.batching > 0) return
    for (const ck of this.pendingDirty) {
      this.versions.set(ck, (this.versions.get(ck) ?? 0) + 1)
      const subs = this.chunkSubs.get(ck)
      if (subs) for (const cb of subs) cb()
    }
    this.pendingDirty.clear()
    if (this.pendingStructure) {
      this.pendingStructure = false
      this.structureVersion++
      for (const cb of this.structureSubs) cb()
    }
  }

  private markDirty(ck: ChunkKey) {
    this.pendingDirty.add(ck)
    if (this.batching === 0) {
      this.pendingDirty.delete(ck)
      this.versions.set(ck, (this.versions.get(ck) ?? 0) + 1)
      const subs = this.chunkSubs.get(ck)
      if (subs) for (const cb of subs) cb()
    }
  }

  private markStructure() {
    if (this.batching > 0) {
      this.pendingStructure = true
      return
    }
    this.structureVersion++
    for (const cb of this.structureSubs) cb()
  }

  /* ── suscripciones (useSyncExternalStore) ───────────────────────────── */

  cellsOf(ck: ChunkKey): Set<VoxelKey> | undefined {
    return this.chunkCells.get(ck)
  }

  nonEmptyChunks(): ChunkKey[] {
    const out: ChunkKey[] = []
    for (const [ck, cells] of this.chunkCells) if (cells.size > 0) out.push(ck)
    return out
  }

  getStructureVersion = () => this.structureVersion

  subscribeStructure = (cb: () => void) => {
    this.structureSubs.add(cb)
    return () => {
      this.structureSubs.delete(cb)
    }
  }

  getChunkVersion = (ck: ChunkKey) => this.versions.get(ck) ?? 0

  subscribeChunk(ck: ChunkKey) {
    return (cb: () => void) => {
      let subs = this.chunkSubs.get(ck)
      if (!subs) {
        subs = new Set()
        this.chunkSubs.set(ck, subs)
      }
      subs.add(cb)
      return () => {
        subs!.delete(cb)
      }
    }
  }

  /* ── consultas ──────────────────────────────────────────────────────── */

  counts(): Map<BlockId, number> {
    const m = new Map<BlockId, number>()
    for (const id of this.voxels.values()) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }

  /** Capas (y) que tienen al menos un bloque, ordenadas. */
  occupiedLayers(): number[] {
    const s = new Set<number>()
    for (const k of this.voxels.keys()) s.add(keyY(k))
    return [...s].sort((a, b) => a - b)
  }

  bounds(): { min: [number, number, number]; max: [number, number, number] } | null {
    if (this.voxels.size === 0) return null
    let mnx = Infinity, mny = Infinity, mnz = Infinity
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (const k of this.voxels.keys()) {
      const x = keyX(k), y = keyY(k), z = keyZ(k)
      if (x < mnx) mnx = x
      if (y < mny) mny = y
      if (z < mnz) mnz = z
      if (x > mxx) mxx = x
      if (y > mxy) mxy = y
      if (z > mxz) mxz = z
    }
    return { min: [mnx, mny, mnz], max: [mxx, mxy, mxz] }
  }
}
