import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DOMAttributes,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { createPortal } from 'react-dom'
import { helpFor, shortcutLabel, type HelpEntry, type HelpId } from './ayuda'
import './tip.css'

const HOVER_MS = 350
const PRESS_MS = 500
const GAP = 8
const SLOP = 10
const STORE_KEY = 'mcb.tips'

/* ── ajuste "mostrar ayudas" ─────────────────────────────────────────── */

const readPref = () => {
  try {
    return localStorage.getItem(STORE_KEY) !== 'off'
  } catch {
    return true
  }
}

let showTips = readPref()
const listeners = new Set<() => void>()

export function setTipsEnabled(on: boolean) {
  showTips = on
  try {
    localStorage.setItem(STORE_KEY, on ? 'on' : 'off')
  } catch {
    // Navegación privada: el ajuste vale sólo para esta sesión.
  }
  listeners.forEach((f) => f())
}

export const tipsEnabled = () => showTips

const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}

export const useTipsEnabled = () =>
  useSyncExternalStore(subscribe, () => showTips, () => true)

/* ── posición ────────────────────────────────────────────────────────── */

export type TipSide = 'top' | 'bottom' | 'left' | 'right'

type Pos = { top: number; left: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

function place(a: DOMRect, b: DOMRect, side: TipSide): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (side === 'left' || side === 'right') {
    const wantLeft = side === 'left' ? a.left - b.width - GAP : a.right + GAP
    const flipped = side === 'left' ? a.right + GAP : a.left - b.width - GAP
    const fits = wantLeft >= GAP && wantLeft + b.width <= vw - GAP
    return {
      left: clamp(fits ? wantLeft : flipped, GAP, vw - b.width - GAP),
      top: clamp(a.top + a.height / 2 - b.height / 2, GAP, vh - b.height - GAP),
    }
  }

  const above = a.top - b.height - GAP
  const below = a.bottom + GAP
  const wantTop = side === 'top' ? above : below
  const fits = wantTop >= GAP && wantTop + b.height <= vh - GAP
  return {
    top: clamp(fits ? wantTop : side === 'top' ? below : above, GAP, vh - b.height - GAP),
    left: clamp(a.left + a.width / 2 - b.width / 2, GAP, vw - b.width - GAP),
  }
}

/* ── componente ──────────────────────────────────────────────────────── */

type TipProps = {
  id: HelpId
  /** Un único elemento; `Tip` le agrega handlers y `aria-describedby`. */
  children: ReactElement
  side?: TipSide
  /** Dato del ítem concreto, para controles repetidos: el bloque, el paso. */
  extra?: string
}

type ChildProps = DOMAttributes<HTMLElement> & { 'aria-describedby'?: string }

const chain =
  <E,>(mine: (e: E) => void, theirs?: (e: E) => void) =>
  (e: E) => {
    mine(e)
    theirs?.(e)
  }

export function Tip({ id, children, side = 'top', extra }: TipProps) {
  const entry = helpFor(id)
  const descId = useId()
  const enabled = useTipsEnabled()

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)

  const anchor = useRef<HTMLElement | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef(0)
  const pressTimer = useRef(0)
  // Un long-press que ya mostró la ayuda no debe además ejecutar el botón.
  const swallow = useRef(false)
  const from = useRef<{ x: number; y: number } | null>(null)

  const clearTimers = useCallback(() => {
    window.clearTimeout(hoverTimer.current)
    window.clearTimeout(pressTimer.current)
  }, [])

  const close = useCallback(() => {
    clearTimers()
    setOpen(false)
    setPos(null)
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])

  useEffect(() => {
    if (!open) return
    const bye = () => close()
    // En touch no hay pointerleave: sin esto la ayuda queda colgada para siempre.
    const outside = (e: Event) => {
      if (!anchor.current?.contains(e.target as Node)) close()
    }
    window.addEventListener('scroll', bye, true)
    window.addEventListener('resize', bye)
    document.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('scroll', bye, true)
      window.removeEventListener('resize', bye)
      document.removeEventListener('pointerdown', outside, true)
    }
  }, [open, close])

  // Se mide una vez pintado: hasta tener el tamaño real no se sabe si entra.
  useLayoutEffect(() => {
    if (!open) return
    const a = anchor.current?.getBoundingClientRect()
    const b = boxRef.current?.getBoundingClientRect()
    if (a && b) setPos(place(a, b, side))
  }, [open, side])

  if (!isValidElement(children)) return children

  const own = children.props as ChildProps

  const track = (e: { currentTarget: EventTarget & Element }) => {
    anchor.current = e.currentTarget as HTMLElement
  }

  const show = () => {
    if (enabled) setOpen(true)
  }

  const enter = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') return
    track(e)
    clearTimers()
    hoverTimer.current = window.setTimeout(show, HOVER_MS)
  }

  const focus = (e: FocusEvent<HTMLElement>) => {
    track(e)
    let byKeyboard = true
    try {
      byKeyboard = e.currentTarget.matches(':focus-visible')
    } catch {
      // Navegador sin :focus-visible: mejor mostrar de más que de menos.
    }
    if (byKeyboard) show()
  }

  const down = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch') {
      close()
      return
    }
    track(e)
    swallow.current = false
    from.current = { x: e.clientX, y: e.clientY }
    clearTimers()
    pressTimer.current = window.setTimeout(() => {
      swallow.current = true
      show()
    }, PRESS_MS)
  }

  const endPress = () => window.clearTimeout(pressTimer.current)

  // Un dedo tiembla: cancelar al primer píxel haría el long-press irrealizable.
  const move = (e: PointerEvent<HTMLElement>) => {
    const p = from.current
    if (!p) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) endPress()
  }

  // Al soltar, el puntero táctil deja de existir y dispara leave: cerraría al instante.
  const leave = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch') endPress()
    else close()
  }

  const clickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swallow.current) return
    swallow.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const keyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && open) close()
  }

  const trigger = cloneElement(children, {
    'aria-describedby': [own['aria-describedby'], descId].filter(Boolean).join(' '),
    onPointerEnter: chain(enter, own.onPointerEnter),
    onPointerLeave: chain(leave, own.onPointerLeave),
    onPointerDown: chain(down, own.onPointerDown),
    onPointerUp: chain(endPress, own.onPointerUp),
    onPointerCancel: chain(endPress, own.onPointerCancel),
    onPointerMove: chain(move, own.onPointerMove),
    onFocus: chain(focus, own.onFocus),
    onBlur: chain(close, own.onBlur),
    onKeyDown: chain(keyDown, own.onKeyDown),
    onClickCapture: chain(clickCapture, own.onClickCapture),
    onContextMenu: chain((e: MouseEvent<HTMLElement>) => {
      if (swallow.current) e.preventDefault()
    }, own.onContextMenu),
  } as ChildProps)

  return (
    <>
      {trigger}
      {createPortal(
        <>
          {/* La descripción vive siempre en el DOM: el lector no depende del hover. */}
          <span id={descId} className="tip-sr">
            {extra ? `${extra}. ${describe(entry)}` : describe(entry)}
          </span>
          {open && (
            <div
              ref={boxRef}
              className="tip"
              role="tooltip"
              aria-hidden="true"
              data-testid={`tip-${id}`}
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, opacity: 0 }}
            >
              <b className="tip-t">{entry.titulo}</b>
              {extra && <span className="tip-x">{extra}</span>}
              <span className="tip-q">{entry.que}</span>
              <span className="tip-c">
                {entry.atajo?.map((k) => (
                  <span className="kbd" key={k}>
                    {k}
                  </span>
                ))}
                {entry.como}
              </span>
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  )
}

const describe = (e: HelpEntry): string => {
  const keys = e.atajo?.length ? `Atajo: ${shortcutLabel(e)}. ` : ''
  return `${e.que} ${keys}${e.como}`
}
