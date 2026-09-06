/**
 * Telemetría de MC Blueprint — fachada pública.
 *
 * Todo el resto de la app importa desde acá. Las piezas:
 *   ring.ts    buffer circular en typed arrays, sin allocations al registrar
 *   events.ts  catálogo de eventos, con sus campos y nivel de captura
 *   perf.ts    sondas de frames, tareas largas, memoria y entorno
 *   format.ts  exportación a texto, JSON y traza de Perfetto
 */

import {
  beginGesture, clear, currentGesture, endGesture, getLevel, getVersion, intern,
  isPaused, LEVEL, memoryBytes, rec, recObj, selfBenchmark, setLevel, setPaused,
  size, subscribe, touchClock, type Level,
} from './ring'
import { EV, packMods, str } from './events'
import { resumen, resumenTexto, toJSON, toText, toTrace } from './format'
import {
  attachRenderer, medir, registrarArranque, startFrames,
  startObservers, stopFrames, stopObservers, watchCanvas,
} from './perf'
import { detenerSondaUI, iniciarSondaUI } from './ui'

export { EV, LEVEL, packMods, str, intern, rec, recObj, medir }
export type { Level }
export {
  beginGesture, endGesture, currentGesture, getLevel, setLevel, isPaused,
  setPaused, clear, size, subscribe, getVersion, memoryBytes, selfBenchmark,
  touchClock,
}
export { toText, toJSON, toTrace, resumen, resumenTexto }
export { attachRenderer, startFrames, watchCanvas }

/* ── snapshots ───────────────────────────────────────────────────────────── */

type SnapshotSource = () => Record<string, unknown>
let snapshotSource: SnapshotSource | null = null

/**
 * El store registra acá su lector de estado. Se hace por inyección y no por
 * import para no crear un ciclo: el store ya importa la telemetría.
 */
export function registerSnapshotSource(fn: SnapshotSource) {
  snapshotSource = fn
}

/** Vuelca el estado completo de la app al registro. */
export function snapshot(motivo = 'manual') {
  recObj(EV.snapshot, { motivo, ...(snapshotSource ? snapshotSource() : {}) })
}

/* ── nivel de captura ────────────────────────────────────────────────────── */

export function cambiarNivel(a: Level) {
  const de = getLevel()
  if (de === a) return
  setLevel(a)
  rec(EV.nivelCaptura, de, a)
}

/* ── arranque ────────────────────────────────────────────────────────────── */

let iniciado = false

/**
 * Enciende la telemetría. Idempotente: llamarlo dos veces no duplica sondas.
 */
export function iniciarTelemetria() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  registrarArranque()
  startObservers()
  iniciarSondaUI()
  // Un snapshot al cerrar deja el estado final aunque no se haya exportado.
  window.addEventListener('pagehide', () => snapshot('pagehide'), { once: true })
}

export function detenerTelemetria() {
  stopFrames()
  stopObservers()
  detenerSondaUI()
  iniciado = false
}
