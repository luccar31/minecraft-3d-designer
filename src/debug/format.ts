/**
 * Three outputs: `toText` to paste in a message, `toJSON` for tooling,
 * `toTrace` for a Perfetto timeline.
 */

import {
  T0, WALL0, capacity, droppedCount, forEach, getLevel, memoryBytes, size,
  slot, stringOf, totalWritten, type EventDef,
} from './ring'
import { modsLabel } from './events'

/* ── field resolution ────────────────────────────────────────────────────── */

/** Formats a slot according to the name declared on the event. */
function fieldValue(field: string, raw: number): string | null {
  if (Number.isNaN(raw)) return null
  if (field.startsWith('$')) return stringOf(raw)
  if (field === 'mods') return modsLabel(raw)
  // Flags are declared as numbers but read better as yes/no.
  if (
    field === 'erase' || field === 'inStroke' || field === 'applied' ||
    field === 'active' || field === 'open' || field === 'visible' ||
    field === 'has' || field === 'ok' || field === 'lost' ||
    field === 'clamped' || field === 'cut' || field === 'forcedLayer' ||
    field === 'repeat' || field === 'batched'
  ) {
    return raw ? 'sí' : 'no'
  }
  return Number.isInteger(raw) ? String(raw) : raw.toFixed(2)
}

function payload(d: EventDef, base: number, obj: Record<string, unknown> | null): string {
  const parts: string[] = []
  for (let j = 0; j < d.fields.length; j++) {
    const f = d.fields[j]
    const v = fieldValue(f, slot(base, j))
    if (v !== null) parts.push(`${f.replace(/^\$/, '')}=${v}`)
  }
  if (obj) parts.push(JSON.stringify(obj))
  return parts.join(' ')
}

/* ── header ──────────────────────────────────────────────────────────────── */

const LEVEL_LABELS = ['apagado', 'acciones', 'normal', 'todo']

export function header(): string {
  const n = size()
  const drop = droppedCount()
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const win = typeof window !== 'undefined' ? window : null
  return [
    'MC Blueprint — telemetría',
    `generado      ${new Date().toISOString()}`,
    `inicio sesión ${new Date(WALL0).toISOString()}  (t=0 del registro)`,
    `eventos       ${n} vivos de ${totalWritten()} escritos` +
      (drop ? `  · ${drop} descartados por capacidad (${capacity()})` : ''),
    `nivel         ${LEVEL_LABELS[getLevel()] ?? getLevel()}`,
    `buffer        ${(memoryBytes() / 1048576).toFixed(2)} MB`,
    `agente        ${nav?.userAgent ?? '—'}`,
    `pantalla      ${win ? `${win.innerWidth}×${win.innerHeight} dpr ${win.devicePixelRatio}` : '—'}`,
    `hardware      ${nav?.hardwareConcurrency ?? '?'} hilos` +
      (nav && 'deviceMemory' in nav ? ` · ${(nav as Navigator & { deviceMemory?: number }).deviceMemory} GB` : '') +
      ` · táctil ${nav?.maxTouchPoints ?? 0} puntos`,
    '',
  ].join('\n')
}

/* ── text ────────────────────────────────────────────────────────────────── */

export function toText(): string {
  const out: string[] = [header()]
  let last = 0
  forEach((t, d, gestureId, base, obj) => {
    const delta = out.length > 1 ? t - last : 0
    last = t
    const ms = t.toFixed(1).padStart(9)
    // Delta against the previous event is what makes a pause visible.
    const dt = delta >= 0.05 ? `+${delta.toFixed(1)}`.padStart(7) : ''.padStart(7)
    const g = gestureId ? `g${String(gestureId).padStart(3, '0')}` : '    '
    out.push(`${ms} ${dt} ${g} ${d.catName.padEnd(11)} ${d.name.padEnd(26)} ${payload(d, base, obj)}`.trimEnd())
  })
  return out.join('\n') + '\n'
}

/* ── JSON ────────────────────────────────────────────────────────────────── */

export function toJSON(): string {
  const rows: unknown[] = []
  forEach((t, d, gestureId, base, obj) => {
    const data: Record<string, unknown> = {}
    for (let j = 0; j < d.fields.length; j++) {
      const raw = slot(base, j)
      if (Number.isNaN(raw)) continue
      const f = d.fields[j]
      data[f.replace(/^\$/, '')] = f.startsWith('$') ? stringOf(raw) : raw
    }
    if (obj) Object.assign(data, obj)
    rows.push({
      t: +t.toFixed(3),
      cat: d.catName,
      ev: d.name,
      ...(gestureId ? { gesture: gestureId } : {}),
      ...(Object.keys(data).length ? { data } : {}),
    })
  })
  return JSON.stringify(
    {
      meta: {
        generated: new Date().toISOString(),
        sessionStart: new Date(WALL0).toISOString(),
        perfOrigin: T0,
        events: size(),
        written: totalWritten(),
        discarded: droppedCount(),
        capacity: capacity(),
        level: getLevel(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      events: rows,
    },
    null,
    2,
  )
}

/* ── Chrome / Perfetto trace ─────────────────────────────────────────────── */

/**
 * Chrome Trace format: gestures as async spans, frames as durations,
 * everything else as instants.
 */
export function toTrace(): string {
  const ev: unknown[] = []
  const openGestures = new Map<number, number>()

  ev.push({ name: 'process_name', ph: 'M', pid: 1, tid: 1, args: { name: 'MC Blueprint' } })
  ev.push({ name: 'thread_name', ph: 'M', pid: 1, tid: 1, args: { name: 'events' } })
  ev.push({ name: 'thread_name', ph: 'M', pid: 1, tid: 2, args: { name: 'frames' } })

  forEach((t, d, gestureId, base, obj) => {
    const us = Math.round(t * 1000)
    const args: Record<string, unknown> = {}
    for (let j = 0; j < d.fields.length; j++) {
      const raw = slot(base, j)
      if (Number.isNaN(raw)) continue
      const f = d.fields[j]
      args[f.replace(/^\$/, '')] = f.startsWith('$') ? stringOf(raw) : raw
    }
    if (obj) Object.assign(args, obj)

    if (d.name === 'frame' || d.name === 'frame.slow') {
      const dur = slot(base, 0)
      ev.push({
        name: 'frame', cat: 'frame', ph: 'X', pid: 1, tid: 2,
        ts: us - Math.round((Number.isNaN(dur) ? 0 : dur) * 1000), dur: Math.round((Number.isNaN(dur) ? 0 : dur) * 1000),
        args,
      })
      return
    }

    if (gestureId && !openGestures.has(gestureId)) {
      openGestures.set(gestureId, us)
      ev.push({ name: `gesture ${gestureId}`, cat: 'gesture', ph: 'b', id: gestureId, pid: 1, tid: 1, ts: us })
    }
    if (gestureId && d.name.startsWith('gesture.end')) {
      ev.push({ name: `gesture ${gestureId}`, cat: 'gesture', ph: 'e', id: gestureId, pid: 1, tid: 1, ts: us })
      openGestures.delete(gestureId)
    }

    ev.push({
      name: d.name, cat: d.catName, ph: 'i', s: 't',
      pid: 1, tid: 1, ts: us, args,
    })
  })

  // Close any gestures left open, or Perfetto discards them.
  const closeTs = Math.round((size() ? 0 : 0) * 1000)
  for (const [id, ts] of openGestures) {
    ev.push({ name: `gesture ${id}`, cat: 'gesture', ph: 'e', id, pid: 1, tid: 1, ts: Math.max(ts, closeTs) })
  }

  return JSON.stringify({ traceEvents: ev, displayTimeUnit: 'ms' })
}

/* ── summary ─────────────────────────────────────────────────────────────── */

export type Summary = {
  byEvent: { name: string; cat: string; n: number }[]
  frames: { n: number; p50: number; p95: number; p99: number; worst: number; slow: number } | null
  errors: number
  gestures: number
  windowMs: number
}

const pct = (arr: number[], p: number): number => {
  if (arr.length === 0) return 0
  const i = Math.min(arr.length - 1, Math.max(0, Math.round((p / 100) * (arr.length - 1))))
  return arr[i]
}

export function summary(): Summary {
  const counts = new Map<string, { cat: string; n: number }>()
  const frameMs: number[] = []
  const gestures = new Set<number>()
  let errors = 0
  let tMin = Infinity
  let tMax = -Infinity

  forEach((t, d, gestureId, base) => {
    if (t < tMin) tMin = t
    if (t > tMax) tMax = t
    const cur = counts.get(d.name)
    if (cur) cur.n++
    else counts.set(d.name, { cat: d.catName, n: 1 })
    if (d.catName === 'error') errors++
    if (gestureId) gestures.add(gestureId)
    if (d.name === 'frame') {
      const ms = slot(base, 0)
      if (!Number.isNaN(ms)) frameMs.push(ms)
    }
  })

  frameMs.sort((a, b) => a - b)

  return {
    byEvent: [...counts.entries()]
      .map(([name, v]) => ({ name, cat: v.cat, n: v.n }))
      .sort((a, b) => b.n - a.n),
    frames: frameMs.length
      ? {
          n: frameMs.length,
          p50: +pct(frameMs, 50).toFixed(2),
          p95: +pct(frameMs, 95).toFixed(2),
          p99: +pct(frameMs, 99).toFixed(2),
          worst: +frameMs[frameMs.length - 1].toFixed(2),
          slow: frameMs.filter((m) => m > 16.7).length,
        }
      : null,
    errors,
    gestures: gestures.size,
    windowMs: tMax > tMin ? +(tMax - tMin).toFixed(0) : 0,
  }
}

export function summaryText(): string {
  const r = summary()
  const out = [header(), '── resumen ──', '']
  out.push(`ventana        ${(r.windowMs / 1000).toFixed(1)} s`)
  out.push(`gestos         ${r.gestures}`)
  out.push(`errores        ${r.errors}`)
  if (r.frames) {
    out.push(
      `frames         ${r.frames.n}  ·  p50 ${r.frames.p50} ms  p95 ${r.frames.p95} ms  ` +
        `p99 ${r.frames.p99} ms  peor ${r.frames.worst} ms  ·  ${r.frames.slow} por encima de 16,7 ms`,
    )
  }
  out.push('', '── eventos por tipo ──', '')
  for (const e of r.byEvent) {
    out.push(`${String(e.n).padStart(7)}  ${e.cat.padEnd(11)} ${e.name}`)
  }
  return out.join('\n') + '\n'
}
