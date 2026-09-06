import { EV, rec, str } from '../debug'
import pako from 'pako'
import type { BlockId, DesignMeta, StoredDesign, VoxelKey } from '../types'
import type { World } from '../voxel/world'

/* base64 sobre binario, por trozos para no reventar la pila con arrays grandes */

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
 * Cada celda son 6 bytes: uint32 con la clave empaquetada + uint16 con el
 * índice en la paleta. Gzip encima: las claves salen casi ordenadas y la
 * paleta es chica, así que comprime muy bien (100k bloques ≈ 40 KB).
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
    EV.codec, str('serializar'), performance.now() - __t0,
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
  let sinPaleta = 0
  for (let off = 0; off + 6 <= raw.byteLength; off += 6) {
    const key = view.getUint32(off, true)
    const pi = view.getUint16(off + 4, true)
    const id = sd.palette[pi]
    // Una celda cuyo índice de paleta no existe desaparecía muda: bloques que
    // se esfuman al abrir un diseño, sin nada que consultar.
    if (id) entries.push([key, id])
    else sinPaleta++
  }
  const total = Math.floor(raw.byteLength / 6)
  if (sinPaleta) rec(EV.descartado, str('deserializar/paleta'), sinPaleta, total)
  rec(EV.codec, str('deserializar'), performance.now() - t0, raw.byteLength, sd.data.length, entries.length)
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
