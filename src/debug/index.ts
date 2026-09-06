/** MC Blueprint telemetry — public facade; everything else imports from here. */

import {
  beginGesture, clear, currentGesture, endGesture, getLevel, getVersion, intern,
  isPaused, LEVEL, memoryBytes, rec, recObj, selfBenchmark, setLevel, setPaused,
  size, subscribe, touchClock, type Level,
} from './ring'
import { EV, packMods, str } from './events'
import { summary, summaryText, toJSON, toText, toTrace } from './format'
import {
  attachRenderer, measure, recordBoot, startFrames,
  startObservers, stopFrames, stopObservers, watchCanvas,
} from './perf'
import { startUiProbe, stopUiProbe } from './ui'

export { EV, LEVEL, packMods, str, intern, rec, recObj, measure }
export type { Level }
export {
  beginGesture, endGesture, currentGesture, getLevel, setLevel, isPaused,
  setPaused, clear, size, subscribe, getVersion, memoryBytes, selfBenchmark,
  touchClock,
}
export { toText, toJSON, toTrace, summary, summaryText }
export { attachRenderer, startFrames, watchCanvas }

/* ── snapshots ───────────────────────────────────────────────────────────── */

type SnapshotSource = () => Record<string, unknown>
let snapshotSource: SnapshotSource | null = null

/**
 * Store registers its state reader here via injection, not import, to
 * avoid a cycle with telemetry.
 */
export function registerSnapshotSource(fn: SnapshotSource) {
  snapshotSource = fn
}

/** Dumps the app's full state to the log. */
export function snapshot(reason = 'manual') {
  recObj(EV.snapshot, { reason, ...(snapshotSource ? snapshotSource() : {}) })
}

/* ── capture level ───────────────────────────────────────────────────────── */

export function setCaptureLevel(a: Level) {
  const from = getLevel()
  if (from === a) return
  setLevel(a)
  rec(EV.captureLevel, from, a)
}

/* ── boot ────────────────────────────────────────────────────────────────── */

let started = false

/** Turns telemetry on. Idempotent: calling it twice doesn't duplicate probes. */
export function startTelemetry() {
  if (started || typeof window === 'undefined') return
  started = true
  recordBoot()
  startObservers()
  startUiProbe()
  // A snapshot on unload preserves the final state even if never exported.
  window.addEventListener('pagehide', () => snapshot('pagehide'), { once: true })
}

export function stopTelemetry() {
  stopFrames()
  stopObservers()
  stopUiProbe()
  started = false
}
