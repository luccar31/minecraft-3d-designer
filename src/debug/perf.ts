/**
 * Logs what users don't actively do but explains what they see; without
 * it "it's laggy" has no data.
 */

import { rec, recObj, LEVEL, getLevel, touchClock } from './ring'
import { EV, str } from './events'

/* ── frames ──────────────────────────────────────────────────────────────── */

type RendererLike = {
  info: {
    render: { calls: number; triangles: number; frame: number }
    memory: { geometries: number; textures: number }
    programs?: { length: number } | null
    autoReset?: boolean
  }
}

let renderer: RendererLike | null = null
let last = 0
let cpuStart = 0
/** Delta vs. the previous frame; computed when the frame opens, used when it closes. */
let deltaFrame = NaN
const unsubscribers: (() => void)[] = []

/** A frame above this is logged separately, even if the level is lower. */
const SLOW_THRESHOLD_MS = 33 // two vsyncs at 60 Hz

export function attachRenderer(gl: unknown) {
  const r = gl as RendererLike
  if (r && r.info && r.info.render) {
    renderer = r
    // `autoReset` defaults true and resets calls/triangles inside `render()` —
    // read them AFTER render, not before.
    if (r.info.autoReset === false) r.info.autoReset = true
  }
}

/**
 * Hooks r3f's loop; `addAfterEffect` is the only point where
 * `renderer.info` matches this frame's real counters.
 */
export function startFrames(
  addEffect: (cb: (t: number) => void) => () => void,
  addAfterEffect: (cb: (t: number) => void) => () => void,
) {
  if (unsubscribers.length) return

  unsubscribers.push(
    addEffect((t: number) => {
      touchClock()
      cpuStart = performance.now()
      deltaFrame = last ? t - last : NaN
      last = t
      if (deltaFrame > SLOW_THRESHOLD_MS) {
        const info = renderer?.info
        rec(EV.frameSlow, deltaFrame, info?.render.calls ?? NaN, info?.render.triangles ?? NaN)
      }
    }),
  )

  unsubscribers.push(
    addAfterEffect(() => {
      if (getLevel() < LEVEL.NORMAL) return
      const info = renderer?.info
      rec(
        EV.frame,
        deltaFrame,
        performance.now() - cpuStart,
        info?.render.calls ?? NaN,
        info?.render.triangles ?? NaN,
        info?.memory.geometries ?? NaN,
        info?.programs?.length ?? NaN,
      )
    }),
  )
}

export function stopFrames() {
  for (const off of unsubscribers) off()
  unsubscribers.length = 0
  last = 0
}

/* ── work-block stopwatch ────────────────────────────────────────────────── */

/**
 * Times a function, records duration. Used for meshing, serialization,
 * export — the three things that can stall the thread.
 */
export function measure<T>(label: string, fn: () => T): T {
  if (getLevel() === LEVEL.OFF) return fn()
  const id = str(label)
  const t0 = performance.now()
  try {
    return fn()
  } finally {
    rec(EV.measurement, id, performance.now() - t0)
  }
}

/* ── environment observers ───────────────────────────────────────────────── */

const observers: { disconnect: () => void }[] = []
const listeners: (() => void)[] = []
let memTimer = 0

type PerfMemory = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }

export function startObservers() {
  if (typeof window === 'undefined') return

  /**
   * Unsupported entryType with `{type}` throws; with `{entryTypes}` it
   * silently stays mute. Checked upfront; uses singular form for `durationThreshold`.
   */
  const supported = new Set<string>(
    (typeof PerformanceObserver === 'function' &&
      (PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes) || [],
  )
  const observe = (
    type: string,
    fn: (e: PerformanceEntry) => void,
    extra: Record<string, unknown> = {},
  ) => {
    if (!supported.has(type)) return
    try {
      const po = new PerformanceObserver((list) => {
        touchClock()
        for (const e of list.getEntries()) fn(e)
      })
      po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
      observers.push(po)
    } catch { /* browser may still reject it; not critical */ }
  }

  // Long frames: splits script from style/layout and paint, unlike
  // `longtask`. The most useful signal for a 3D canvas.
  observe('long-animation-frame', (e) => {
    const l = e as PerformanceEntry & {
      renderStart?: number; styleAndLayoutStart?: number; blockingDuration?: number
    }
    rec(
      EV.longFrame,
      e.duration,
      l.renderStart ? l.renderStart - e.startTime : NaN,
      l.styleAndLayoutStart && l.renderStart ? l.styleAndLayoutStart - l.renderStart : NaN,
      l.blockingDuration ?? NaN,
    )
  })
  observe('longtask', (e) => rec(EV.longTask, e.duration))
  observe('event', (e) => rec(EV.eventLatency, e.duration, str(e.name)), { durationThreshold: 16 })

  // Heap memory: Chromium only, and only every two seconds.
  const mem = (performance as Performance & { memory?: PerfMemory }).memory
  if (mem) {
    memTimer = window.setInterval(() => {
      touchClock()
      const m = (performance as Performance & { memory?: PerfMemory }).memory
      if (m) {
        rec(
          EV.memory,
          m.usedJSHeapSize / 1048576,
          m.totalJSHeapSize / 1048576,
          m.jsHeapSizeLimit / 1048576,
        )
      }
    }, 2000)
  }

  const on = <K extends keyof WindowEventMap>(
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ) => {
    const wrapped = ((ev: Event) => { touchClock(); (fn as (e: Event) => void)(ev) }) as EventListener
    window.addEventListener(type, wrapped, opts)
    listeners.push(() => window.removeEventListener(type, wrapped, opts))
  }

  on('resize', () => rec(EV.resize, window.innerWidth, window.innerHeight, window.devicePixelRatio))
  on('focus', () => rec(EV.focus, 1))
  // Losing focus mid-gesture is one way the editor gets stuck; logged so
  // it can be correlated.
  on('blur', () => rec(EV.focus, 0))

  const onVis = () => rec(EV.visibility, document.visibilityState === 'visible' ? 1 : 0)
  document.addEventListener('visibilitychange', onVis)
  listeners.push(() => document.removeEventListener('visibilitychange', onVis))

  on('error', (e) =>
    recObj(EV.exception, {
      message: e.message,
      source: `${e.filename}:${e.lineno}:${e.colno}`,
      stack: e.error instanceof Error ? e.error.stack?.slice(0, 900) : undefined,
    }),
  )
  on('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason
    recObj(EV.unhandledRejection, {
      reason: r instanceof Error ? r.message : String(r),
      stack: r instanceof Error ? r.stack?.slice(0, 900) : undefined,
    })
  })
}

/** WebGL context loss: the scene goes dark with no console error. */
export function watchCanvas(canvas: HTMLCanvasElement) {
  const lost = (e: Event) => {
    e.preventDefault()
    rec(EV.webglContext, 1)
  }
  const restored = () => rec(EV.webglContext, 0)
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)
  listeners.push(() => {
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('webglcontextrestored', restored)
  })
}

export function stopObservers() {
  for (const o of observers) o.disconnect()
  observers.length = 0
  for (const off of listeners) off()
  listeners.length = 0
  if (memTimer) clearInterval(memTimer)
  memTimer = 0
}

/* ── boot ────────────────────────────────────────────────────────────────── */

export function recordBoot() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } }
  recObj(EV.boot, {
    agent: nav.userAgent,
    language: nav.language,
    platform: (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform,
    threads: nav.hardwareConcurrency,
    memoryGB: nav.deviceMemory,
    touchPoints: nav.maxTouchPoints,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    network: nav.connection?.effectiveType,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? null,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? null,
  })
}
