import * as THREE from 'three'
import { EV, rec } from '../debug'
import { BLOCKS, type TexSpec } from './palette'

export const TILE = 32
export const COLS = 16
export const ATLAS_PX = TILE * COLS

/* ── utilities ──────────────────────────────────────────────────────────── */

const specKey = (s: TexSpec) => `${s.pattern}|${s.color}|${s.accent ?? ''}`

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0)

/* ── tile rendering ─────────────────────────────────────────────────────── */

type Px = { r: number; g: number; b: number; a: number }

function renderTile(spec: TexSpec): Uint8ClampedArray<ArrayBuffer> {
  const S = TILE
  const out = new Uint8ClampedArray(new ArrayBuffer(S * S * 4))
  const rnd = mulberry32(hashStr(specKey(spec)))
  const [br, bg, bb] = hexToRgb(spec.color)
  const [ar, ag, ab] = hexToRgb(spec.accent ?? spec.color)

  // Pre-generated noise, stable per tile.
  const n = new Float32Array(S * S)
  for (let i = 0; i < n.length; i++) n[i] = rnd() * 2 - 1
  const n2 = new Float32Array(S * S)
  for (let i = 0; i < n2.length; i++) n2[i] = rnd()

  const put = (x: number, y: number, p: Px) => {
    const i = (y * S + x) * 4
    out[i] = clamp(p.r)
    out[i + 1] = clamp(p.g)
    out[i + 2] = clamp(p.b)
    out[i + 3] = clamp(p.a)
  }
  const base = (d: number, a = 255): Px => ({ r: br + d, g: bg + d, b: bb + d, a })
  const acc = (d: number, a = 255): Px => ({ r: ar + d, g: ag + d, b: ab + d, a })

  // Reusable blobs for cobble/gravel/moss.
  const blobs: { cx: number; cy: number; r: number; d: number }[] = []
  if (spec.pattern === 'cobble' || spec.pattern === 'gravel' || spec.pattern === 'moss') {
    const count = spec.pattern === 'gravel' ? 14 : 9
    for (let i = 0; i < count; i++) {
      blobs.push({
        cx: rnd() * S,
        cy: rnd() * S,
        r: 4 + rnd() * (spec.pattern === 'gravel' ? 4 : 7),
        d: Math.round((rnd() * 2 - 1) * 26),
      })
    }
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x
      const nv = n[i]
      const nu = n2[i]

      switch (spec.pattern) {
        case 'solid':
          put(x, y, base(nv * 3))
          break

        case 'concrete':
          put(x, y, base(nv * 2))
          break

        case 'snow':
          put(x, y, base(nv * 4))
          break

        case 'stone': {
          let d = nv * 13
          if (nu > 0.94) d -= 16
          put(x, y, base(d))
          break
        }

        case 'dirt': {
          let d = nv * 15
          if (nu > 0.9) d -= 20
          put(x, y, base(d))
          break
        }

        case 'sand':
          put(x, y, base(nv * 9 + (nu > 0.85 ? 10 : 0)))
          break

        case 'quartz': {
          // Thin vertical striations.
          const stripe = ((x * 7919) % 5) - 2
          put(x, y, base(nv * 3 + stripe * 2))
          break
        }

        case 'terracotta': {
          // Horizontal veins.
          const band = Math.sin(y * 0.9 + hashStr(spec.color) % 7) * 6
          const useAcc = nu > 0.82
          put(x, y, useAcc ? acc(nv * 5) : base(nv * 6 + band))
          break
        }

        case 'moss':
        case 'gravel':
        case 'cobble': {
          let d = nv * 8
          let hit = false
          for (const b of blobs) {
            const dx = x - b.cx
            const dy = y - b.cy
            if (dx * dx + dy * dy < b.r * b.r) {
              d += b.d
              hit = true
            }
          }
          if (!hit && spec.pattern === 'cobble') {
            put(x, y, acc(nv * 6))
            break
          }
          put(x, y, base(d))
          break
        }

        case 'stoneBrick': {
          const rowH = S / 4
          const row = Math.floor(y / rowH)
          const offset = row % 2 === 0 ? 0 : S / 4
          const inRowY = y % rowH
          const brickW = S / 2
          const bx = (x + offset) % S
          const inBrickX = bx % brickW
          if (inRowY === 0 || inBrickX === 0) {
            put(x, y, acc(nv * 4))
          } else {
            const shade = ((row * 3 + Math.floor(bx / brickW) * 5) % 4) * 4 - 6
            put(x, y, base(nv * 8 + shade))
          }
          break
        }

        case 'bricks': {
          const rowH = S / 8
          const row = Math.floor(y / rowH)
          const offset = row % 2 === 0 ? 0 : S / 6
          const inRowY = y % rowH
          const brickW = S / 3
          const bx = (x + offset) % S
          const inBrickX = bx % brickW
          if (inRowY === 0 || inBrickX === 0) {
            put(x, y, acc(-40 + nv * 4))
          } else {
            const shade = ((row * 7 + Math.floor(bx / brickW) * 3) % 5) * 3 - 6
            put(x, y, base(nv * 7 + shade))
          }
          break
        }

        case 'planks': {
          const bandH = S / 4
          const band = Math.floor(y / bandH)
          const inBandY = y % bandH
          if (inBandY === 0) {
            put(x, y, acc(nv * 3))
            break
          }
          const bandShade = ((band * 11) % 5) * 3 - 6
          // Vertical grain.
          const grain = ((x * 31 + band * 17) % 13) < 2 ? -9 : 0
          put(x, y, base(nv * 6 + bandShade + grain))
          break
        }

        case 'logSide': {
          // Bark: strong variation per column, soft per row.
          const colShade = (((x * 2654435761) >>> 0) % 100) / 100
          const d = (colShade - 0.5) * 26 + nv * 5
          put(x, y, colShade > 0.82 ? acc(nv * 5) : base(d))
          break
        }

        case 'logTop': {
          const cx = S / 2 - 0.5
          const cy = S / 2 - 0.5
          const dist = Math.hypot(x - cx, y - cy)
          const ring = Math.sin(dist * 1.5)
          put(x, y, ring > 0.45 ? acc(nv * 5) : base(nv * 6 + ring * 6))
          break
        }

        case 'grassTop': {
          put(x, y, base(nv * 15 + (nu > 0.88 ? 14 : 0)))
          break
        }

        case 'grassSide': {
          const lip = 7 + Math.floor(n2[x] * 4)
          if (y < lip) {
            put(x, y, acc(nv * 14))
          } else {
            put(x, y, base(nv * 14 + (nu > 0.9 ? -18 : 0)))
          }
          break
        }

        case 'wool': {
          // "Fuzzy" noise, quantized to 2x2 for fiber texture.
          const qi = (y >> 1) * S + (x >> 1)
          put(x, y, base(n[qi] * 10 + nv * 4))
          break
        }

        case 'leaves': {
          const alpha = nu > 0.78 ? 0 : 255
          put(x, y, base(nv * 22 + (nu < 0.15 ? -22 : 0), alpha))
          break
        }

        case 'glass': {
          const border = x < 2 || y < 2 || x >= S - 2 || y >= S - 2
          if (border) {
            put(x, y, base(10, 200))
          } else {
            // Diagonal reflection.
            const streak = Math.abs((x + y) % 22) < 3 ? 90 : 0
            put(x, y, base(6, 26 + streak))
          }
          break
        }

        case 'metal': {
          const border = x === 0 || y === 0 || x === S - 1 || y === S - 1
          const grad = (1 - y / S) * 10
          if (border) put(x, y, acc(0))
          else put(x, y, base(nv * 2 + grad + (x % 11 === 3 ? 10 : 0)))
          break
        }

        case 'crystal': {
          const cell = ((x >> 3) + (y >> 3)) % 2
          const cx = S / 2 - 0.5
          const cy = S / 2 - 0.5
          const glow = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (S * 0.7)) * 22
          const edge = x % 8 === 0 || y % 8 === 0
          if (edge) put(x, y, acc(nv * 4))
          else put(x, y, base(nv * 6 + glow + cell * 6))
          break
        }

        case 'obsidian': {
          put(x, y, nu > 0.965 ? acc(nv * 8) : base(nv * 7))
          break
        }

        default:
          put(x, y, base(0))
      }
    }
  }
  return out
}

/* ── building the atlas ─────────────────────────────────────────────────── */

const slots = new Map<string, number>()
const specs: TexSpec[] = []

for (const b of BLOCKS) {
  for (const face of [b.tex.top, b.tex.side, b.tex.bottom]) {
    const k = specKey(face)
    if (!slots.has(k)) {
      slots.set(k, specs.length)
      specs.push(face)
    }
  }
}

if (specs.length > COLS * COLS) {
  throw new Error(`Atlas overflow: ${specs.length} tiles, capacity ${COLS * COLS}`)
}

export const slotOf = (spec: TexSpec): number => slots.get(specKey(spec)) ?? 0

/** Slot's UV origin. Assumes `texture.flipY = true` (three's default). */
export function slotUV(slot: number): { u0: number; v0: number; size: number } {
  const col = slot % COLS
  const row = Math.floor(slot / COLS)
  const size = 1 / COLS
  return { u0: col * size, v0: 1 - (row + 1) * size, size }
}

let cached: THREE.CanvasTexture | null = null

export function getAtlasTexture(): THREE.CanvasTexture {
  if (cached) return cached
  const __t0 = performance.now()
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_PX
  canvas.height = ATLAS_PX
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, ATLAS_PX, ATLAS_PX)

  specs.forEach((spec, i) => {
    const data = renderTile(spec)
    const img = new ImageData(data, TILE, TILE)
    const col = i % COLS
    const row = Math.floor(i / COLS)
    ctx.putImageData(img, col * TILE, row * TILE)
  })

  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  rec(EV.atlas, performance.now() - __t0, specs.length)
  cached = tex
  return tex
}

/** Block thumbnail for the UI, as a data URL. */
const thumbCache = new Map<string, string>()
export function blockThumbnail(spec: TexSpec): string {
  const k = specKey(spec)
  const hit = thumbCache.get(k)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = TILE
  canvas.height = TILE
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(renderTile(spec), TILE, TILE), 0, 0)
  const url = canvas.toDataURL()
  thumbCache.set(k, url)
  return url
}
