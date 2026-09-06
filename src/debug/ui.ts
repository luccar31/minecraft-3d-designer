/**
 * Sonda de interfaz por delegación.
 *
 * En lugar de instrumentar a mano cada `onClick` —sesenta y pico hoy, y uno
 * más cada vez que alguien agrega un botón— se escucha en la raíz, en fase de
 * captura, y se identifica el control que recibió el evento. Ventajas: no se
 * desactualiza, cubre lo que todavía no existe, y no ensucia los componentes.
 *
 * El nombre del control sale de lo que ya está en el DOM por accesibilidad
 * (`data-testid`, `aria-label`, `title`, el texto visible), así que no hay que
 * mantener un catálogo de ids en paralelo.
 */

import { rec, recObj, touchClock } from './ring'
import { EV, packMods, str } from './events'

/** Etiqueta estable y legible para un control. */
function etiqueta(el: Element): string {
  const h = el as HTMLElement
  const test = h.dataset?.testid
  if (test) return test
  const aria = h.getAttribute?.('aria-label')
  if (aria) return aria.slice(0, 48)
  const titulo = h.getAttribute?.('title')
  if (titulo) return titulo.slice(0, 48)
  const txt = h.textContent?.trim().replace(/\s+/g, ' ')
  if (txt) return txt.slice(0, 48)
  const tag = el.tagName.toLowerCase()
  const tipo = h.getAttribute?.('type')
  return tipo ? `${tag}[${tipo}]` : tag
}

/** Panel o región donde vive el control, para desambiguar nombres repetidos. */
function contexto(el: Element): string {
  let n: Element | null = el
  for (let i = 0; i < 8 && n; i++) {
    const cls = typeof n.className === 'string' ? n.className.split(/\s+/)[0] : ''
    if (cls && cls !== 'on' && cls !== 'chip') return cls
    n = n.parentElement
  }
  return 'app'
}

const INTERACTIVOS = 'button, input, select, textarea, a, [role="button"], [role="tab"]'

let activo = false
const off: (() => void)[] = []

export function iniciarSondaUI(raiz: Document | HTMLElement = document) {
  if (activo || typeof document === 'undefined') return
  activo = true

  const onClick = (e: Event) => {
    const t = e.target as Element | null
    const ctl = t?.closest?.(INTERACTIVOS)
    if (!ctl) return
    const h = ctl as HTMLElement & { disabled?: boolean }
    if (h.disabled) {
      // Un click sobre un botón deshabilitado no produce ninguna acción. Sin
      // esto, «apreté y no pasó nada» no deja rastro de haber sido apretado.
      recObj(EV.fallo, { donde: 'ui/deshabilitado', control: etiqueta(ctl), panel: contexto(ctl) })
      return
    }
    rec(EV.boton, str(etiqueta(ctl)), str(contexto(ctl)))
  }

  // `change` cubre selects y checkboxes; para texto se registra el largo y no
  // el contenido, que puede ser el nombre de un diseño y no aporta al gesto.
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement | null
    if (!t || !t.tagName) return
    const tipo = t.getAttribute?.('type')
    if (tipo === 'range' || tipo === 'number') {
      rec(EV.campo, str(etiqueta(t)), Number(t.value))
      return
    }
    rec(EV.campo, str(etiqueta(t)), t.value?.length ?? NaN)
  }

  const onWheel = (e: WheelEvent) => rec(EV.rueda, e.deltaY, packMods(e))

  const onPointerDownCapture = (e: PointerEvent) => {
    // Registra el down aunque después nadie lo procese: es la diferencia entre
    // «el evento no llegó» y «llegó y se descartó».
    const t = e.target as Element | null
    if (t?.closest?.(INTERACTIVOS)) return // ya lo cubre onClick
    if (t?.tagName === 'CANVAS') return // lo cubre la instrumentación de Scene
    rec(EV.punteroDown, str(e.pointerType || 'mouse'), e.clientX, e.clientY, e.button,
      packMods(e), NaN)
  }

  const add = <K extends keyof DocumentEventMap>(
    tipo: K, fn: (e: DocumentEventMap[K]) => void, capture = true,
  ) => {
    const envuelto = ((ev: Event) => { touchClock(); (fn as (e: Event) => void)(ev) }) as EventListener
    raiz.addEventListener(tipo, envuelto, capture)
    off.push(() => raiz.removeEventListener(tipo, envuelto, capture))
  }

  add('click', onClick)
  add('change', onChange)
  add('wheel', onWheel as (e: Event) => void)
  add('pointerdown', onPointerDownCapture as (e: Event) => void)
}

export function detenerSondaUI() {
  for (const f of off) f()
  off.length = 0
  activo = false
}
