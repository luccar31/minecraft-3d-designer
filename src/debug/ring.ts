/**
 * Buffer circular de telemetría, en estructura de arrays.
 *
 * Por qué así y no un array de objetos: el editor tiene que registrar eventos
 * de puntero (~120/s), un registro por frame (~60/s) y cada reconstrucción de
 * chunk. Un `push({...})` por evento aloca miles de objetos por segundo, y esa
 * basura la limpia el GC en pausas que son exactamente el jank que queremos
 * medir. Un logger que perturba lo que mide no sirve.
 *
 * Acá cada registro son columnas de typed arrays y el camino caliente
 * (`rec`) no aloca nada: recibe números, escribe en índices, listo. Las cadenas
 * se internan una vez y viajan como enteros.
 *
 * Costo de memoria: CAPACITY × 47 bytes. Con 32k registros, ~1,5 MB.
 */

/* ── configuración ───────────────────────────────────────────────────────── */

/** Potencia de dos: permite envolver con máscara en lugar de módulo. */
const CAPACITY = 1 << 15 // 32768
const MASK = CAPACITY - 1

/** Ranuras numéricas por registro. Seis cubre el evento más ancho que tenemos. */
export const SLOTS = 6

/**
 * Niveles de captura. Cada evento declara el mínimo en el que aparece, y `rec`
 * lo descarta con una sola comparación de enteros si está por encima.
 */
export const LEVEL = {
  OFF: 0,
  /** Sólo acciones e intenciones del usuario. */
  ACCIONES: 1,
  /** + rendimiento por frame y punteros coalescidos. Es el default. */
  NORMAL: 2,
  /** + cada pointermove crudo, cada raycast, cada remesh. Manguera abierta. */
  TODO: 3,
} as const

export type Level = (typeof LEVEL)[keyof typeof LEVEL]

let level: number = LEVEL.NORMAL

export const getLevel = () => level as Level
export function setLevel(l: Level) {
  level = l
  bump()
}

/* ── categorías ──────────────────────────────────────────────────────────── */

export const CAT = [
  'puntero', 'gesto', 'camara', 'edicion', 'herramienta', 'teclado',
  'vista', 'diseno', 'frame', 'render', 'perf', 'red', 'sistema', 'error',
] as const

export type Cat = (typeof CAT)[number]
const catId = new Map<Cat, number>(CAT.map((c, i) => [c, i]))

/* ── internado de cadenas ────────────────────────────────────────────────── */

const strings: string[] = ['']
const stringIds = new Map<string, number>([['', 0]])

/** Convierte una cadena en un entero estable. Reusa el id si ya se vio. */
export function intern(s: string): number {
  const hit = stringIds.get(s)
  if (hit !== undefined) return hit
  const id = strings.length
  strings.push(s)
  stringIds.set(s, id)
  return id
}

export const stringOf = (id: number): string => strings[id] ?? `?${id}`

/* ── definición de eventos ───────────────────────────────────────────────── */

export type EventDef = {
  id: number
  cat: number
  catName: Cat
  name: string
  /**
   * Nombres de las ranuras numéricas. Un nombre con prefijo `$` significa que
   * la ranura guarda un id de cadena internada, no un número literal.
   */
  fields: readonly string[]
  level: number
}

const defs: EventDef[] = []

/**
 * Declara un tipo de evento. Se hace una vez, al cargar el módulo: en tiempo de
 * ejecución `rec` sólo ve el entero.
 */
export function def(
  cat: Cat,
  name: string,
  fields: readonly string[] = [],
  minLevel: number = LEVEL.ACCIONES,
): EventDef {
  if (fields.length > SLOTS) {
    throw new Error(`evento ${name}: ${fields.length} campos supera el máximo de ${SLOTS}`)
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

/* ── columnas ────────────────────────────────────────────────────────────── */

const colT = new Float64Array(CAPACITY) // ms desde el origen, con decimales
const colEv = new Uint16Array(CAPACITY) // id de EventDef
const colGesture = new Uint16Array(CAPACITY) // id de gesto, 0 = ninguno
const colRef = new Int32Array(CAPACITY) // índice al lado de objetos, -1 = nada
/**
 * Float32 y no Float64: las cargas son coordenadas, conteos y milisegundos.
 * Los enteros son exactos hasta 2^24 (16,7 M), muy por encima de cualquier
 * valor que produzca esta app. Ahorra la mitad de la memoria del buffer.
 */
const colN = new Float32Array(CAPACITY * SLOTS)

let head = 0
/** Total histórico de registros. Con `count > CAPACITY` hubo descarte. */
let count = 0
let dropped = 0

/* ── lado de objetos (camino frío) ───────────────────────────────────────── */

const OBJ_CAPACITY = 512
const objs: (Record<string, unknown> | null)[] = new Array(OBJ_CAPACITY).fill(null)
let objHead = 0

/* ── reloj ───────────────────────────────────────────────────────────────── */

const hasPerf = typeof performance !== 'undefined'
export const T0 = hasPerf ? performance.now() : 0
export const WALL0 = Date.now()
const leerReloj = (): number => (hasPerf ? performance.now() - T0 : Date.now() - WALL0)

/**
 * Reloj anclado a la tarea, no leído por evento.
 *
 * Medido en este navegador: `performance.now()` cuesta ~443 ns y escribir las
 * diez columnas del registro ~22 ns. O sea que leer la hora era el 95% del
 * costo de registrar. Se lee una vez al abrir cada tarea (un evento del DOM, un
 * frame) y todos los registros de esa tarea comparten la marca.
 *
 * No es una aproximación grosera: los eventos de una misma tarea del hilo
 * principal ocurren efectivamente en el mismo instante observable. El orden
 * entre ellos lo preserva la posición en el buffer. Y como efecto lateral, un
 * delta de 0 en la salida marca con precisión los límites de tarea.
 */
let clockNow = 0

export function touchClock(): number {
  clockNow = leerReloj()
  return clockNow
}

/** Marca actual sin refrescar. Para quien necesita la hora del registro. */
export const clockRead = () => clockNow

/* ── suscripción (para la UI) ────────────────────────────────────────────── */

const subs = new Set<() => void>()
let version = 0
/** Se avisa a la UI con `requestAnimationFrame`: a 120 eventos/s, notificar en
 *  cada uno haría que React re-renderice más seguido que la escena. */
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

/* ── gestos (causalidad) ─────────────────────────────────────────────────── */

let gesture = 0
let gestureSeq = 0

/**
 * Abre un gesto. Todo lo que se registre hasta `endGesture` queda atribuido a
 * él, que es lo que permite leer «esta escritura salió de aquel arrastre» en
 * lugar de dos hechos sueltos que pasaron cerca en el tiempo.
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

/* ── escritura ───────────────────────────────────────────────────────────── */

let paused = false
export const isPaused = () => paused
export function setPaused(v: boolean) {
  paused = v
  bump()
}

/**
 * Registra un evento. Camino caliente: sin allocations, sin cadenas, sin
 * cierres. Los argumentos de más se ignoran; los que falten quedan en NaN.
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
 * Variante con carga estructurada. Aloca: reservada para eventos raros
 * (errores, arranque, snapshots) donde la forma importa más que el costo.
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

/* ── lectura ─────────────────────────────────────────────────────────────── */

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

/** Índice físico del registro lógico `k` (0 = el más viejo vivo). */
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

/** Recorre sin materializar filas: para exportar sin alocar 32k objetos. */
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

/* ── autoinstrumentación ─────────────────────────────────────────────────── */

/**
 * Mide el costo real de `rec` en este navegador. Es la única respuesta honesta
 * a «¿el logger es barato?»: un número medido, no una afirmación.
 */
export function selfBenchmark(iterations = 200_000): {
  nsPorEvento: number
  eventosPorSegundo: number
  msTotal: number
} {
  const probe = def('sistema', 'benchmark.sonda', ['a', 'b', 'c'], LEVEL.ACCIONES)
  const prevLevel = level
  const prevPaused = paused
  level = LEVEL.TODO
  paused = false

  // Calentar el JIT antes de medir.
  for (let i = 0; i < 5000; i++) rec(probe, i, i * 2, i * 3)

  const t0 = hasPerf ? performance.now() : Date.now()
  for (let i = 0; i < iterations; i++) rec(probe, i, i * 2, i * 3)
  const t1 = hasPerf ? performance.now() : Date.now()

  level = prevLevel
  paused = prevPaused

  const msTotal = t1 - t0
  return {
    nsPorEvento: (msTotal * 1e6) / iterations,
    eventosPorSegundo: Math.round(iterations / (msTotal / 1000)),
    msTotal,
  }
}

/** Bytes que ocupan las columnas. */
export const memoryBytes = () =>
  colT.byteLength + colEv.byteLength + colGesture.byteLength +
  colRef.byteLength + colN.byteLength
