/**
 * UI probe by delegation instead of instrumenting every onClick by hand;
 * reads existing DOM accessibility attributes for names.
 */

import { rec, recObj, touchClock } from './ring'
import { EV, packMods, str } from './events'

/** Stable, readable label for a control. */
function label(el: Element): string {
  const h = el as HTMLElement
  const test = h.dataset?.testid
  if (test) return test
  const aria = h.getAttribute?.('aria-label')
  if (aria) return aria.slice(0, 48)
  const title = h.getAttribute?.('title')
  if (title) return title.slice(0, 48)
  const txt = h.textContent?.trim().replace(/\s+/g, ' ')
  if (txt) return txt.slice(0, 48)
  const tag = el.tagName.toLowerCase()
  const type = h.getAttribute?.('type')
  return type ? `${tag}[${type}]` : tag
}

/** Panel or region the control lives in, to disambiguate repeated names. */
function context(el: Element): string {
  let n: Element | null = el
  for (let i = 0; i < 8 && n; i++) {
    const cls = typeof n.className === 'string' ? n.className.split(/\s+/)[0] : ''
    if (cls && cls !== 'on' && cls !== 'chip') return cls
    n = n.parentElement
  }
  return 'app'
}

const INTERACTIVE = 'button, input, select, textarea, a, [role="button"], [role="tab"]'

let active = false
const off: (() => void)[] = []

export function startUiProbe(root: Document | HTMLElement = document) {
  if (active || typeof document === 'undefined') return
  active = true

  const onClick = (e: Event) => {
    const t = e.target as Element | null
    const ctl = t?.closest?.(INTERACTIVE)
    if (!ctl) return
    const h = ctl as HTMLElement & { disabled?: boolean }
    if (h.disabled) {
      // A click on a disabled button does nothing; without this, "I
      // clicked and nothing happened" leaves no trace.
      recObj(EV.failure, { where: 'ui/disabled', control: label(ctl), panel: context(ctl) })
      return
    }
    rec(EV.button, str(label(ctl)), str(context(ctl)))
  }

  // `change` covers selects/checkboxes; for text, logs length not content —
  // often a design name, not useful here.
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement | null
    if (!t || !t.tagName) return
    const type = t.getAttribute?.('type')
    if (type === 'range' || type === 'number') {
      rec(EV.field, str(label(t)), Number(t.value))
      return
    }
    rec(EV.field, str(label(t)), t.value?.length ?? NaN)
  }

  const onWheel = (e: WheelEvent) => rec(EV.wheel, e.deltaY, packMods(e))

  const onPointerDownCapture = (e: PointerEvent) => {
    // Logs the down even if nothing handles it later — distinguishes
    // "never arrived" from "arrived and got dropped".
    const t = e.target as Element | null
    if (t?.closest?.(INTERACTIVE)) return // already covered by onClick
    if (t?.tagName === 'CANVAS') return // covered by Scene's instrumentation
    rec(EV.pointerDown, str(e.pointerType || 'mouse'), e.clientX, e.clientY, e.button,
      packMods(e), NaN)
  }

  const add = <K extends keyof DocumentEventMap>(
    type: K, fn: (e: DocumentEventMap[K]) => void, capture = true,
  ) => {
    const wrapped = ((ev: Event) => { touchClock(); (fn as (e: Event) => void)(ev) }) as EventListener
    root.addEventListener(type, wrapped, capture)
    off.push(() => root.removeEventListener(type, wrapped, capture))
  }

  add('click', onClick)
  add('change', onChange)
  add('wheel', onWheel as (e: Event) => void)
  add('pointerdown', onPointerDownCapture as (e: Event) => void)
}

export function stopUiProbe() {
  for (const f of off) f()
  off.length = 0
  active = false
}
