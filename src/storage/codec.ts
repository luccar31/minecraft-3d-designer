import { EV, rec, str } from '../debug'
import pako from 'pako'
import type { BlockId, DesignMeta, StoredDesign, VoxelKey } from '../types'
import type { World } from '../voxel/world'

/* Base64 over binary, chunked so large arrays don't blow the call stack. */

function toBase64(bytes: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH))
  }
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/**
 * Each cell: 6 bytes — packed key (uint32) + palette index (uint16). Gzip
 * compresses well (100k blocks ≈ 40 KB).
 */
export function serializeDesign(meta: DesignMeta, world: World): StoredDesign {
  const __t0 = performance.now()
  const palette: BlockId[] = []
  const index = new Map<BlockId, number>()
  const keys = [...world.voxels.keys()].sort((a, b) => a - b)

  const buf = new ArrayBuffer(keys.length * 6)
  const view = new DataView(buf)
  let off = 0
  for (const k of keys) {
    const id = world.voxels.get(k)!
    let pi = index.get(id)
    if (pi === undefined) {
      pi = palette.length
      palette.push(id)
      index.set(id, pi)
    }
    view.setUint32(off, k, true)
    view.setUint16(off + 4, pi, true)
    off += 6
  }

  const data = toBase64(pako.gzip(new Uint8Array(buf)))
  rec(
    EV.codec, str('serialize'), performance.now() - __t0,
    buf.byteLength, data.length, keys.length,
  )

  return {
    v: 1,
    id: meta.id,
    name: meta.name,
    description: meta.description,
    dims: meta.dims,
    palette,
    data,
    blockCount: keys.length,
    createdAt: meta.createdAt,
    updatedAt: new Date().toISOString(),
  }
}

export function deserializeDesign(sd: StoredDesign): {
  meta: DesignMeta
  entries: [VoxelKey, BlockId][]
} {
  const t0 = performance.now()
  const raw = pako.ungzip(fromBase64(sd.data))
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const entries: [VoxelKey, BlockId][] = []
  let unmapped = 0
  for (let off = 0; off + 6 <= raw.byteLength; off += 6) {
    const key = view.getUint32(off, true)
    const pi = view.getUint16(off + 4, true)
    const id = sd.palette[pi]
    // A cell whose palette index doesn't exist used to vanish silently —
    // blocks gone with nothing to check.
    if (id) entries.push([key, id])
    else unmapped++
  }
  const total = Math.floor(raw.byteLength / 6)
  if (unmapped) rec(EV.discarded, str('deserialize/palette'), unmapped, total)
  rec(EV.codec, str('deserialize'), performance.now() - t0, raw.byteLength, sd.data.length, entries.length)
  return {
    meta: {
      id: sd.id,
      name: sd.name,
      description: sd.description ?? '',
      dims: sd.dims,
      createdAt: sd.createdAt,
      updatedAt: sd.updatedAt,
    },
    entries,
  }
}

export function isStoredDesign(v: unknown): v is StoredDesign {
  const o = v as StoredDesign
  return !!o && o.v === 1 && typeof o.data === 'string' && Array.isArray(o.palette) && !!o.dims
}
