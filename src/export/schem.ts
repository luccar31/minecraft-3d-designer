import { EV, rec, str } from '../debug'
import pako from 'pako'
import { keyX, keyY, keyZ } from '../types'
import type { DesignMeta } from '../types'
import type { World } from '../voxel/world'
import { varint, writeNamedCompound, type NbtValue } from './nbt'

const AIR = 'minecraft:air'
/** 1.20.1; later versions read and auto-update it. */
const DATA_VERSION = 3465

/**
 * Sponge Schematic v2, read by WorldEdit/FAWE/Litematica/Axiom. Cropped to
 * the design's bounds so pasting doesn't drag extra air.
 */
export function buildSchem(world: World, meta: DesignMeta): Uint8Array {
  const __t0 = performance.now()
  const b = world.bounds()
  const [minX, minY, minZ] = b ? b.min : [0, 0, 0]
  const [maxX, maxY, maxZ] = b ? b.max : [0, 0, 0]
  const W = b ? maxX - minX + 1 : 1
  const H = b ? maxY - minY + 1 : 1
  const L = b ? maxZ - minZ + 1 : 1

  const palette: Record<string, NbtValue> = { [AIR]: { t: 'int', v: 0 } }
  const paletteIndex = new Map<string, number>([[AIR, 0]])

  // Dense array in the order the spec requires: (y * Length + z) * Width + x
  const ids = new Uint16Array(W * H * L) // 0 = air
  for (const [k, id] of world.voxels) {
    const x = keyX(k) - minX
    const y = keyY(k) - minY
    const z = keyZ(k) - minZ
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= L) continue
    let pi = paletteIndex.get(id)
    if (pi === undefined) {
      pi = paletteIndex.size
      paletteIndex.set(id, pi)
      palette[id] = { t: 'int', v: pi }
    }
    ids[(y * L + z) * W + x] = pi
  }

  const bytes: number[] = []
  for (let i = 0; i < ids.length; i++) varint(ids[i], bytes)

  const root: NbtValue & { t: 'compound' } = {
    t: 'compound',
    v: {
      Version: { t: 'int', v: 2 },
      DataVersion: { t: 'int', v: DATA_VERSION },
      Width: { t: 'short', v: W },
      Height: { t: 'short', v: H },
      Length: { t: 'short', v: L },
      Offset: { t: 'intArray', v: [0, 0, 0] },
      PaletteMax: { t: 'int', v: paletteIndex.size },
      Palette: { t: 'compound', v: palette },
      BlockData: { t: 'byteArray', v: Uint8Array.from(bytes) },
      Metadata: {
        t: 'compound',
        v: {
          Name: { t: 'string', v: meta.name },
          Author: { t: 'string', v: 'MC Blueprint' },
          WEOffsetX: { t: 'int', v: 0 },
          WEOffsetY: { t: 'int', v: 0 },
          WEOffsetZ: { t: 'int', v: 0 },
        },
      },
    },
  }

  const output = pako.gzip(writeNamedCompound('Schematic', root))
  // Heaviest operation in the app, runs on the main thread; records size
  // and time if the tab freezes.
  rec(EV.exportDesign, str('schem'), output.length, performance.now() - __t0)
  return output
}
