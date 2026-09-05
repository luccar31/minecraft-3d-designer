import type { BlockId, DesignMeta } from '../types'
import { blockDef } from '../blocks/palette'
import type { World } from '../voxel/world'

export type LayerGrid = (BlockId | null)[][] // [dx][dz], recortado al bounding box

export type GuideStep = {
  n: number
  fromY: number
  toY: number
  repeat: number
  grid: LayerGrid
  below: LayerGrid | null
  counts: [BlockId, number][] // de UNA capa
  blocksInStep: number
}

export type Guide = {
  steps: GuideStep[]
  legend: Map<BlockId, string>
  totals: [BlockId, number][]
  totalBlocks: number
  width: number // en X
  depth: number // en Z
  originX: number
  originZ: number
  height: number
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function codeFor(i: number): string {
  if (i < 26) return ALPHABET[i]
  const a = Math.floor(i / 26) - 1
  return ALPHABET[a] + ALPHABET[i % 26]
}

function sameGrid(a: LayerGrid, b: LayerGrid): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false
  }
  return true
}

/**
 * Construye la guía capa por capa.
 *
 * Dos decisiones que hacen la diferencia al construir de verdad:
 *  - Todas las capas se recortan al MISMO bounding box, así el marco no se
 *    mueve entre pasos y se puede alinear a ojo.
 *  - Capas consecutivas idénticas se fusionan en un paso con "repetir N veces".
 *    Una torre de 20 niveles iguales pasa de 20 pasos a 1.
 */
export function buildGuide(world: World): Guide {
  const b = world.bounds()
  const empty: Guide = {
    steps: [], legend: new Map(), totals: [], totalBlocks: 0,
    width: 0, depth: 0, originX: 0, originZ: 0, height: 0,
  }
  if (!b) return empty

  const [minX, minY, minZ] = b.min
  const [maxX, maxY, maxZ] = b.max
  const W = maxX - minX + 1
  const D = maxZ - minZ + 1

  const layerAt = (y: number): LayerGrid => {
    const g: LayerGrid = []
    for (let dx = 0; dx < W; dx++) {
      const col: (BlockId | null)[] = []
      for (let dz = 0; dz < D; dz++) col.push(world.get(minX + dx, y, minZ + dz) ?? null)
      g.push(col)
    }
    return g
  }

  const isEmpty = (g: LayerGrid) => g.every((c) => c.every((v) => v === null))

  const raw: { y: number; grid: LayerGrid }[] = []
  for (let y = minY; y <= maxY; y++) {
    const g = layerAt(y)
    if (!isEmpty(g)) raw.push({ y, grid: g })
  }

  // Fusión de capas consecutivas idénticas.
  const merged: { fromY: number; toY: number; grid: LayerGrid }[] = []
  for (const r of raw) {
    const last = merged[merged.length - 1]
    if (last && last.toY === r.y - 1 && sameGrid(last.grid, r.grid)) {
      last.toY = r.y
    } else {
      merged.push({ fromY: r.y, toY: r.y, grid: r.grid })
    }
  }

  const totals = new Map<BlockId, number>()
  const steps: GuideStep[] = merged.map((m, i) => {
    const counts = new Map<BlockId, number>()
    for (const col of m.grid) {
      for (const id of col) {
        if (!id) continue
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    const repeat = m.toY - m.fromY + 1
    for (const [id, c] of counts) totals.set(id, (totals.get(id) ?? 0) + c * repeat)
    const blocksInStep = [...counts.values()].reduce((a, c) => a + c, 0)
    return {
      n: i + 1,
      fromY: m.fromY,
      toY: m.toY,
      repeat,
      grid: m.grid,
      below: i > 0 ? merged[i - 1].grid : null,
      counts: [...counts.entries()].sort((a, c) => c[1] - a[1]),
      blocksInStep,
    }
  })

  const sortedTotals = [...totals.entries()].sort((a, c) => c[1] - a[1])
  const legend = new Map<BlockId, string>()
  sortedTotals.forEach(([id], i) => legend.set(id, codeFor(i)))

  return {
    steps,
    legend,
    totals: sortedTotals,
    totalBlocks: sortedTotals.reduce((a, [, c]) => a + c, 0),
    width: W,
    depth: D,
    originX: minX,
    originZ: minZ,
    height: maxY - minY + 1,
  }
}

/** "3 stacks + 17" — la unidad en la que se piensa el inventario. */
export function stacksLabel(n: number): string {
  const s = Math.floor(n / 64)
  const r = n % 64
  if (s === 0) return `${r}`
  return r === 0 ? `${s} stack${s > 1 ? 's' : ''}` : `${s} stack${s > 1 ? 's' : ''} + ${r}`
}

/* ── documento imprimible ───────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function layerSvg(step: GuideStep, guide: Guide, cell = 24): string {
  const W = guide.width
  const D = guide.depth
  const pad = 22
  const w = W * cell + pad
  const h = D * cell + pad
  const parts: string[] = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="layer">`)
  parts.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`)

  // Capa anterior como fantasma, para alinear.
  if (step.below) {
    for (let dx = 0; dx < W; dx++) {
      for (let dz = 0; dz < D; dz++) {
        if (!step.below[dx][dz]) continue
        parts.push(`<rect x="${pad + dx * cell}" y="${pad + dz * cell}" width="${cell}" height="${cell}" fill="#e9e9e9"/>`)
      }
    }
  }

  for (let dx = 0; dx < W; dx++) {
    for (let dz = 0; dz < D; dz++) {
      const id = step.grid[dx][dz]
      if (!id) continue
      const def = blockDef(id)
      const code = guide.legend.get(id) ?? '?'
      const x = pad + dx * cell
      const y = pad + dz * cell
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${def.color}" stroke="#00000022"/>`)
      const lum = luminance(def.color)
      parts.push(
        `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="${Math.round(cell * 0.46)}" font-family="ui-monospace,monospace" font-weight="700" text-anchor="middle" fill="${lum > 0.55 ? '#111' : '#fff'}">${code}</text>`,
      )
    }
  }

  // Grilla + reglas de coordenadas reales.
  for (let dx = 0; dx <= W; dx++) {
    const x = pad + dx * cell
    parts.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad + D * cell}" stroke="#cfcfcf" stroke-width="${dx % 4 === 0 ? 1.4 : 0.6}"/>`)
  }
  for (let dz = 0; dz <= D; dz++) {
    const y = pad + dz * cell
    parts.push(`<line x1="${pad}" y1="${y}" x2="${pad + W * cell}" y2="${y}" stroke="#cfcfcf" stroke-width="${dz % 4 === 0 ? 1.4 : 0.6}"/>`)
  }
  for (let dx = 0; dx < W; dx += 4) {
    parts.push(`<text x="${pad + dx * cell + 2}" y="${pad - 6}" font-size="10" fill="#777" font-family="ui-monospace,monospace">${guide.originX + dx}</text>`)
  }
  for (let dz = 0; dz < D; dz += 4) {
    parts.push(`<text x="2" y="${pad + dz * cell + 12}" font-size="10" fill="#777" font-family="ui-monospace,monospace">${guide.originZ + dz}</text>`)
  }

  parts.push('</svg>')
  return parts.join('')
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function guideToHtml(guide: Guide, meta: DesignMeta): string {
  const legendRows = guide.totals
    .map(([id, n]) => {
      const def = blockDef(id)
      return `<tr>
        <td class="code"><span class="sw" style="background:${def.color}"></span>${guide.legend.get(id)}</td>
        <td>${esc(def.name)}</td>
        <td class="mono">${n}</td>
        <td class="mono">${esc(stacksLabel(n))}</td>
      </tr>`
    })
    .join('')

  const steps = guide.steps
    .map((s) => {
      const counts = s.counts
        .map(([id, n]) => `<li><span class="sw" style="background:${blockDef(id).color}"></span>${guide.legend.get(id)} · ${esc(blockDef(id).name)} — <b>${n}</b></li>`)
        .join('')
      const title =
        s.repeat > 1
          ? `Paso ${s.n} — capas y = ${s.fromY} a ${s.toY} <span class="rep">repetir ${s.repeat}×</span>`
          : `Paso ${s.n} — capa y = ${s.fromY}`
      return `<section class="step">
        <h2>${title}</h2>
        <div class="row">
          <div class="canvas">${layerSvg(s, guide)}</div>
          <div class="side">
            <p class="sub">${s.blocksInStep} bloques en esta capa${s.repeat > 1 ? ` · ${s.blocksInStep * s.repeat} en total para el paso` : ''}</p>
            <ul class="counts">${counts}</ul>
            <p class="hint">El gris claro es la capa anterior: úsalo para alinear.</p>
          </div>
        </div>
      </section>`
    })
    .join('')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Guía de construcción — ${esc(meta.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 32px; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #16181d; background: #fff; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 0 0 10px; }
  .meta { color: #666; margin: 0 0 22px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .sw { display: inline-block; width: 12px; height: 12px; border: 1px solid #0003; margin-right: 6px; vertical-align: -2px; }
  table { border-collapse: collapse; width: 100%; max-width: 560px; margin-bottom: 26px; }
  th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid #e6e6e6; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
  td.code { font-family: ui-monospace, monospace; font-weight: 700; white-space: nowrap; }
  .step { page-break-inside: avoid; break-inside: avoid; page-break-after: always; padding-top: 8px; }
  .step:last-child { page-break-after: auto; }
  .row { display: flex; gap: 22px; align-items: flex-start; flex-wrap: wrap; }
  .side { min-width: 230px; }
  .sub { margin: 0 0 8px; color: #444; }
  .counts { list-style: none; padding: 0; margin: 0 0 10px; }
  .counts li { padding: 2px 0; }
  .hint { color: #888; font-size: 12px; }
  .rep { background: #ffe9a8; border-radius: 4px; padding: 1px 7px; font-size: 13px; font-weight: 600; }
  .layer { border: 1px solid #ddd; }
  @media print {
    body { padding: 0; }
    @page { margin: 14mm; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head>
<body>
  <h1>${esc(meta.name)}</h1>
  <p class="meta">
    Grilla ${meta.dims.x}×${meta.dims.y}×${meta.dims.z} ·
    Ocupa ${guide.width}×${guide.height}×${guide.depth} desde (x ${guide.originX}, z ${guide.originZ}) ·
    <b>${guide.totalBlocks}</b> bloques · ${guide.steps.length} pasos
  </p>

  <h2>Lista de materiales</h2>
  <table>
    <thead><tr><th>Cód.</th><th>Bloque</th><th>Cantidad</th><th>Stacks</th></tr></thead>
    <tbody>${legendRows}</tbody>
  </table>

  ${steps}
</body></html>`
}

export function openPrintableGuide(guide: Guide, meta: DesignMeta) {
  const html = guideToHtml(guide, meta)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
