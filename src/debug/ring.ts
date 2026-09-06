/**
 * Columns of typed arrays, not objects: avoids allocating per event
 * (~120/s), whose GC pauses would BE the jank measured.
 */

/* ── configuration ───────────────────────────────────────────────────────── */

/** Power of two: lets wraparound use a bitmask instead of modulo. */
const CAPACITY = 1 << 15 // 32768
const MASK = CAPACITY - 1

/** Numeric slots per record. Six covers our widest event. */
export const SLOTS = 6

/**
 * Capture levels. Each event declares its minimum; `rec` drops it with a
 * single integer comparison if above.
 */
export const LEVEL = {
  OFF: 0,
  /** Only user actions and intents. */
  ACTIONS: 1,
  /** + per-frame performance and coalesced pointers. The default. */
  NORMAL: 2,
  /** + every raw pointermove, every raycast, every remesh. Firehose. */
  ALL: 3,
} as const

export type Level = (typeof LEVEL)[keyof typeof LEVEL]

let level: number = LEVEL.NORMAL

export const getLevel = () => level as Level
export function setLevel(l: Level) {
  level = l
  bump()
}

/* ── categories ──────────────────────────────────────────────────────────── */

export const CAT = [
  'pointer', 'gesture', 'camera', 'edit', 'tool', 'keyboard',
  'view', 'design', 'frame', 'render', 'perf', 'net', 'system', 'error',
] as const

export type Cat = (typeof CAT)[number]
const catId = new Map<Cat, number>(CAT.map((c, i) => [c, i]))

/* ── string interning ────────────────────────────────────────────────────── */

const strings: string[] = ['']
const stringIds = new Map<string, number>([['', 0]])

/** Converts a string to a stable integer id; reuses it if already seen. */
export function intern(s: string): number {
  const hit = stringIds.get(s)
  if (hit !== undefined) return hit
  const id = strings.length
  strings.push(s)
  stringIds.set(s, id)
  return id
}

export const stringOf = (id: number): string => strings[id] ?? `?${id}`

/* ── event definitions ───────────────────────────────────────────────────── */

export type EventDef = {
  id: number
  cat: number
  catName: Cat
  name: string
  /**
   * Slot names. A `$`-prefixed name means the slot holds an interned string
   * id, not a literal number.
   */
  fields: readonly string[]
  level: number
}

const defs: EventDef[] = []

/**
 * Declares an event type, once at module load; at runtime `rec` only sees
 * the integer.
 */
export function def(
  cat: Cat,
  name: string,
  fields: readonly string[] = [],
  minLevel: number = LEVEL.ACTIONS,
): EventDef {
  if (fields.length > SLOTS) {
    throw new Error(`event ${name}: ${fields.length} fields exceeds the max of ${SLOTS}`)
  }
  const d: EventDef = {
    id: defs.length,
    cat: catId.get(cat)!,
    catName: cat,
    name,
    fields,
    level: minLevel,
  }
  defs.push(d)
  return d
}

export const defOf = (id: number): EventDef | undefined => defs[id]
export const allDefs = (): readonly EventDef[] => defs

/* ── columns ─────────────────────────────────────────────────────────────── */

const colT = new Float64Array(CAPACITY) // ms since origin, with decimals
const colEv = new Uint16Array(CAPACITY) // EventDef id
const colGesture = new Uint16Array(CAPACITY) // gesture id, 0 = none
const colRef = new Int32Array(CAPACITY) // index into the object side-array, -1 = none
/**
 * Float32, not Float64: payloads are coordinates, counts, ms — exact to
 * 2^24, far above app values; halves memory.
 */
const colN = new Float32Array(CAPACITY * SLOTS)

let head = 0
/** Total records ever written. `count > CAPACITY` means some were dropped. */
let count = 0
let dropped = 0

/* ── object side (cold path) ─────────────────────────────────────────────── */

const OBJ_CAPACITY = 512
const objs: (Record<string, unknown> | null)[] = new Array(OBJ_CAPACITY).fill(null)
let objHead = 0

/* ── clock ───────────────────────────────────────────────────────────────── */

const hasPerf = typeof performance !== 'undefined'
export const T0 = hasPerf ? performance.now() : 0
export const WALL0 = Date.now()
const readClock = (): number => (hasPerf ? performance.now() - T0 : Date.now() - WALL0)

/**
 * Anchored per task, not per event: `performance.now()` costs ~443 ns vs
 * ~22 ns to write a record (95% of cost).
 */
let clockNow = 0

export function touchClock(): number {
  clockNow = readClock()
  return clockNow
}

/** Current mark without refreshing it; for readers that need the record's time. */
export const clockRead = () => clockNow

/* ── subscription (for the UI) ───────────────────────────────────────────── */

const subs = new Set<() => void>()
let version = 0
/**
 * Notifies the UI via requestAnimationFrame: at 120 events/s, notifying
 * every one would re-render React faster than the scene.
 */
let notifyQueued = false

function bump() {
  version++
  if (notifyQueued || subs.size === 0) return
  notifyQueued = true
  const flush = () => {
    notifyQueued = false
    for (const cb of subs) cb()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
  else setTimeout(flush, 16)
}

export function subscribe(cb: () => void) {
  subs.add(cb)
  return () => {
    subs.delete(cb)
  }
}

export const getVersion = () => version

/* ── gestures (causality) ─────────────────────────────────────────────────── */

let gesture = 0
let gestureSeq = 0

/**
 * Opens a gesture; everything recorded until `endGesture` is attributed to
 * it — links causally related events.
 */
export function beginGesture(): number {
  gestureSeq = (gestureSeq + 1) & 0xffff
  if (gestureSeq === 0) gestureSeq = 1
  gesture = gestureSeq
  return gesture
}

export function endGesture() {
  gesture = 0
}

export const currentGesture = () => gesture

/* ── writing ─────────────────────────────────────────────────────────────── */

let paused = false
export const isPaused = () => paused
export function setPaused(v: boolean) {
  paused = v
  bump()
}

/**
 * Records an event. Hot path: no allocations, no strings, no closures.
 * Extra arguments are ignored; missing ones default to NaN.
 */
export function rec(
  d: EventDef,
  n0 = NaN, n1 = NaN, n2 = NaN, n3 = NaN, n4 = NaN, n5 = NaN,
): void {
  if (paused || d.level > level) return
  const i = head
  colT[i] = clockNow
  colEv[i] = d.id
  colGesture[i] = gesture
  colRef[i] = -1
  const b = i * SLOTS
  colN[b] = n0
  colN[b + 1] = n1
  colN[b + 2] = n2
  colN[b + 3] = n3
  colN[b + 4] = n4
  colN[b + 5] = n5
  head = (head + 1) & MASK
  if (count >= CAPACITY) dropped++
  count++
  bump()
}

/**
 * Structured-payload variant. Allocates — reserved for rare events (errors,
 * boot, snapshots) where shape matters more than cost.
 */
export function recObj(d: EventDef, payload: Record<string, unknown>): void {
  if (paused || d.level > level) return
  const i = head
  colT[i] = touchClock()
  colEv[i] = d.id
  colGesture[i] = gesture
  objs[objHead] = payload
  colRef[i] = objHead
  objHead = (objHead + 1) % OBJ_CAPACITY
  const b = i * SLOTS
  colN[b] = NaN
  colN[b + 1] = NaN
  colN[b + 2] = NaN
  colN[b + 3] = NaN
  colN[b + 4] = NaN
  colN[b + 5] = NaN
  head = (head + 1) & MASK
  if (count >= CAPACITY) dropped++
  count++
  bump()
}

/* ── reading ─────────────────────────────────────────────────────────────── */

export type Row = {
  i: number
  t: number
  def: EventDef
  gesture: number
  nums: number[]
  obj: Record<string, unknown> | null
}

export const size = () => Math.min(count, CAPACITY)
export const totalWritten = () => count
export const droppedCount = () => dropped

/** Physical index of logical record `k` (0 = oldest still alive). */
function physical(k: number): number {
  return count <= CAPACITY ? k : (head + k) & MASK
}

export function rowAt(k: number): Row {
  const i = physical(k)
  const b = i * SLOTS
  const ref = colRef[i]
  return {
    i: k,
    t: colT[i],
    def: defs[colEv[i]],
    gesture: colGesture[i],
    nums: [colN[b], colN[b + 1], colN[b + 2], colN[b + 3], colN[b + 4], colN[b + 5]],
    obj: ref >= 0 ? objs[ref] : null,
  }
}

/** Iterates without materializing rows: exports without allocating 32k objects. */
export function forEach(
  fn: (t: number, d: EventDef, gestureId: number, base: number, obj: Record<string, unknown> | null) => void,
  from = 0,
) {
  const n = size()
  for (let k = from; k < n; k++) {
    const i = physical(k)
    const ref = colRef[i]
    fn(colT[i], defs[colEv[i]], colGesture[i], i * SLOTS, ref >= 0 ? objs[ref] : null)
  }
}

export const slot = (base: number, j: number): number => colN[base + j]

export function clear() {
  head = 0
  count = 0
  dropped = 0
  objHead = 0
  objs.fill(null)
  bump()
}

export const capacity = () => CAPACITY

/* ── self-instrumentation ─────────────────────────────────────────────────── */

/**
 * Measures the real cost of `rec` in this browser — a measured number, not
 * a claim.
 */
export function selfBenchmark(iterations = 200_000): {
  nsPerEvent: number
  eventsPerSecond: number
  msTotal: number
} {
  const probe = def('system', 'benchmark.probe', ['a', 'b', 'c'], LEVEL.ACTIONS)
  const prevLevel = level
  const prevPaused = paused
  level = LEVEL.ALL
  paused = false

  // Warm up the JIT before measuring.
  for (let i = 0; i < 5000; i++) rec(probe, i, i * 2, i * 3)

  const t0 = hasPerf ? performance.now() : Date.now()
  for (let i = 0; i < iterations; i++) rec(probe, i, i * 2, i * 3)
  const t1 = hasPerf ? performance.now() : Date.now()

  level = prevLevel
  paused = prevPaused

  const msTotal = t1 - t0
  return {
    nsPerEvent: (msTotal * 1e6) / iterations,
    eventsPerSecond: Math.round(iterations / (msTotal / 1000)),
    msTotal,
  }
}

export const memoryBytes = () =>
  colT.byteLength + colEv.byteLength + colGesture.byteLength +
  colRef.byteLength + colN.byteLength
