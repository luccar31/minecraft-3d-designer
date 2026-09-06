/**
 * Sondas de rendimiento y de entorno.
 *
 * Registra lo que el usuario no hace pero igual explica lo que ve: cuánto tardó
 * cada frame, cuántas llamadas de dibujo hubo, cuándo el hilo principal se
 * bloqueó, cuándo la pestaña perdió el foco. Sin esto, «se traba» no tiene
 * ningún dato detrás.
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
/** Delta contra el frame anterior, calculado al abrir el frame y usado al cerrarlo. */
let deltaFrame = NaN
const desenganchar: (() => void)[] = []

/** Un frame por encima de esto se registra aparte, aunque baje el nivel. */
const UMBRAL_LENTO_MS = 33 // dos vsyncs a 60 Hz

export function attachRenderer(gl: unknown) {
  const r = gl as RendererLike
  if (r && r.info && r.info.render) {
    renderer = r
    // `autoReset` viene en true y resetea calls/triangles dentro de render(),
    // así que hay que leerlos DESPUÉS del render, no antes.
    if (r.info.autoReset === false) r.info.autoReset = true
  }
}

/**
 * Se engancha al loop de r3f, no a un requestAnimationFrame propio.
 *
 * `addEffect` corre antes de los useFrame y del `gl.render()`; `addAfterEffect`
 * corre justo después. La diferencia entre los dos es el tiempo de CPU real del
 * frame, y el segundo es el único punto donde `renderer.info` ya tiene los
 * contadores de este frame y todavía no los reseteó el siguiente.
 */
export function startFrames(
  addEffect: (cb: (t: number) => void) => () => void,
  addAfterEffect: (cb: (t: number) => void) => () => void,
) {
  if (desenganchar.length) return

  desenganchar.push(
    addEffect((t: number) => {
      touchClock()
      cpuStart = performance.now()
      deltaFrame = last ? t - last : NaN
      last = t
      if (deltaFrame > UMBRAL_LENTO_MS) {
        const info = renderer?.info
        rec(EV.frameLento, deltaFrame, info?.render.calls ?? NaN, info?.render.triangles ?? NaN)
      }
    }),
  )

  desenganchar.push(
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
  for (const off of desenganchar) off()
  desenganchar.length = 0
  last = 0
}

/* ── cronómetro de bloques de trabajo ────────────────────────────────────── */

/**
 * Cronometra una función y registra la duración. Se usa para el meshing, la
 * serialización y el export: son las tres cosas que pueden clavar el hilo.
 */
export function medir<T>(que: string, fn: () => T): T {
  if (getLevel() === LEVEL.OFF) return fn()
  const id = str(que)
  const t0 = performance.now()
  try {
    return fn()
  } finally {
    rec(EV.medicion, id, performance.now() - t0)
  }
}

/* ── observadores del entorno ────────────────────────────────────────────── */

const observers: { disconnect: () => void }[] = []
const listeners: (() => void)[] = []
let memTimer = 0

type PerfMemory = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }

export function startObservers() {
  if (typeof window === 'undefined') return

  /**
   * Observar un entryType no soportado con `{type}` lanza, y con `{entryTypes}`
   * no lanza pero deja el observador mudo para siempre. Se chequea antes, y se
   * usa siempre la forma singular: `durationThreshold` sólo se honra con ella.
   */
  const soportados = new Set<string>(
    (typeof PerformanceObserver === 'function' &&
      (PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes) || [],
  )
  const observar = (
    tipo: string,
    fn: (e: PerformanceEntry) => void,
    extra: Record<string, unknown> = {},
  ) => {
    if (!soportados.has(tipo)) return
    try {
      const po = new PerformanceObserver((list) => {
        touchClock()
        for (const e of list.getEntries()) fn(e)
      })
      po.observe({ type: tipo, buffered: true, ...extra } as PerformanceObserverInit)
      observers.push(po)
    } catch { /* el navegador puede rechazarlo igual: no es crítico */ }
  }

  // Frames largos: separa script de style/layout y de paint, cosa que
  // `longtask` no hace. Es la señal más útil para un canvas 3D.
  observar('long-animation-frame', (e) => {
    const l = e as PerformanceEntry & {
      renderStart?: number; styleAndLayoutStart?: number; blockingDuration?: number
    }
    rec(
      EV.frameLargo,
      e.duration,
      l.renderStart ? l.renderStart - e.startTime : NaN,
      l.styleAndLayoutStart && l.renderStart ? l.styleAndLayoutStart - l.renderStart : NaN,
      l.blockingDuration ?? NaN,
    )
  })
  observar('longtask', (e) => rec(EV.tareaLarga, e.duration))
  observar('event', (e) => rec(EV.latenciaEvento, e.duration, str(e.name)), { durationThreshold: 16 })

  // Memoria del heap: sólo Chromium, y sólo cada dos segundos.
  const mem = (performance as Performance & { memory?: PerfMemory }).memory
  if (mem) {
    memTimer = window.setInterval(() => {
      touchClock()
      const m = (performance as Performance & { memory?: PerfMemory }).memory
      if (m) {
        rec(
          EV.memoria,
          m.usedJSHeapSize / 1048576,
          m.totalJSHeapSize / 1048576,
          m.jsHeapSizeLimit / 1048576,
        )
      }
    }, 2000)
  }

  const on = <K extends keyof WindowEventMap>(
    tipo: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ) => {
    const envuelto = ((ev: Event) => { touchClock(); (fn as (e: Event) => void)(ev) }) as EventListener
    window.addEventListener(tipo, envuelto, opts)
    listeners.push(() => window.removeEventListener(tipo, envuelto, opts))
  }

  on('resize', () => rec(EV.resize, window.innerWidth, window.innerHeight, window.devicePixelRatio))
  on('focus', () => rec(EV.foco, 1))
  // Perder el foco con un gesto a medias es una de las formas de dejar el
  // editor trabado: queda registrado para poder correlacionarlo.
  on('blur', () => rec(EV.foco, 0))

  const onVis = () => rec(EV.visibilidad, document.visibilityState === 'visible' ? 1 : 0)
  document.addEventListener('visibilitychange', onVis)
  listeners.push(() => document.removeEventListener('visibilitychange', onVis))

  on('error', (e) =>
    recObj(EV.excepcion, {
      mensaje: e.message,
      origen: `${e.filename}:${e.lineno}:${e.colno}`,
      stack: e.error instanceof Error ? e.error.stack?.slice(0, 900) : undefined,
    }),
  )
  on('unhandledrejection', (e) => {
    const r = (e as PromiseRejectionEvent).reason
    recObj(EV.promesaRechazada, {
      motivo: r instanceof Error ? r.message : String(r),
      stack: r instanceof Error ? r.stack?.slice(0, 900) : undefined,
    })
  })
}

/** Pérdida del contexto WebGL: la escena se apaga y no hay error en consola. */
export function watchCanvas(canvas: HTMLCanvasElement) {
  const perdido = (e: Event) => {
    e.preventDefault()
    rec(EV.contextoWebGL, 1)
  }
  const vuelto = () => rec(EV.contextoWebGL, 0)
  canvas.addEventListener('webglcontextlost', perdido)
  canvas.addEventListener('webglcontextrestored', vuelto)
  listeners.push(() => {
    canvas.removeEventListener('webglcontextlost', perdido)
    canvas.removeEventListener('webglcontextrestored', vuelto)
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

/* ── arranque ────────────────────────────────────────────────────────────── */

export function registrarArranque() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } }
  recObj(EV.arranque, {
    agente: nav.userAgent,
    idioma: nav.language,
    plataforma: (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? nav.platform,
    hilos: nav.hardwareConcurrency,
    memoriaGB: nav.deviceMemory,
    puntosTactiles: nav.maxTouchPoints,
    pantalla: `${window.innerWidth}×${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    red: nav.connection?.effectiveType,
    reduceMovimiento: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? null,
    punteroGrueso: window.matchMedia?.('(pointer: coarse)').matches ?? null,
  })
}
