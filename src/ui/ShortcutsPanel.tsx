import { useEffect, useMemo, useRef, useState } from 'react'
import {
  comboLabels, GROUPS, helpText, POINTER_GROUP_TITLE, POINTER_SHORTCUTS, SHORTCUTS,
} from './atajos'
import { HELP } from './ayuda'
import './atajos.css'

type Row = { id: string; keys: string[]; text: string; gap: boolean }
type Section = { title: string; rows: Row[] }

/** Rows with no entry in the catalogue of 03: the panel shows the hole. */
function countGaps(): number {
  const keyboard = SHORTCUTS.filter((s) => !helpText(s, HELP).fromCatalog).length
  const pointer = POINTER_SHORTCUTS.filter((p) => !helpText(p, HELP).fromCatalog).length
  return keyboard + pointer
}

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    inputRef.current?.focus()
    // Capture phase: closes the panel before the editor's own Esc handler runs.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const gaps = useMemo(countGaps, [])

  const sections = useMemo<Section[]>(() => {
    const needle = query.trim().toLowerCase()
    const keep = (parts: string[]) =>
      needle === '' || parts.some((p) => p.toLowerCase().includes(needle))

    const out: Section[] = []

    for (const g of GROUPS) {
      const rows: Row[] = []
      for (const s of SHORTCUTS) {
        if (s.group !== g.id) continue
        const keys = comboLabels(s)
        const { text, fromCatalog } = helpText(s, HELP)
        if (!keep([...keys, text, s.label, g.title])) continue
        rows.push({ id: s.id, keys, text, gap: !fromCatalog })
      }
      if (rows.length) out.push({ title: g.title, rows })
    }

    const pointer: Row[] = []
    for (const p of POINTER_SHORTCUTS) {
      const { text, fromCatalog } = helpText(p, HELP)
      if (!keep([p.gesture, text, p.label, POINTER_GROUP_TITLE])) continue
      pointer.push({ id: p.id, keys: [p.gesture], text, gap: !fromCatalog })
    }
    if (pointer.length) out.push({ title: POINTER_GROUP_TITLE, rows: pointer })

    return out
  }, [query])

  const shown = sections.reduce((n, s) => n + s.rows.length, 0)

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal sc-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Atajos"
        data-testid="shortcuts-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Atajos</h2>
        <p className="sub">
          Todo lo que la app hace sin soltar el teclado. Cerrá con{' '}
          <span className="kbd">Esc</span>.
        </p>

        <div className="sc-search">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o por tecla…"
            aria-label="Buscar atajos"
            data-testid="shortcuts-search"
          />
          <span className="label" data-testid="shortcuts-count">
            {shown} de {SHORTCUTS.length + POINTER_SHORTCUTS.length}
          </span>
        </div>

        {gaps > 0 && (
          <p className="sc-gaps" data-testid="shortcuts-gaps">
            {gaps} sin ficha en el catálogo de ayuda: se muestran igual, marcados.
          </p>
        )}

        {sections.map((sec) => (
          <div className="section sc-group" key={sec.title}>
            <h3>{sec.title}</h3>
            {sec.rows.map((r) => (
              <div className="sc-row" key={r.id} data-shortcut={r.id}>
                <span className="sc-keys">
                  {r.keys.map((k) => (
                    <span className="kbd" key={k}>
                      {k}
                    </span>
                  ))}
                </span>
                <span className="sc-desc">
                  {r.text}
                  {r.gap && (
                    <span
                      className="sc-gap"
                      title="Sin entrada en el catálogo de ayuda (src/ui/ayuda.ts)"
                    >
                      sin ficha
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}

        {shown === 0 && <div className="empty">Ningún atajo coincide con «{query}».</div>}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

/** Touch reaches the panel from here: `?` needs a keyboard. */
export function ShortcutsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      title="Ver los atajos de teclado (?)"
      aria-label="Ver los atajos de teclado"
      data-testid="open-shortcuts"
    >
      Atajos
    </button>
  )
}
