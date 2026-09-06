import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  clear, getLevel, getVersion, isPaused, LEVEL, memoryBytes, summaryText,
  selfBenchmark, setPaused, size, snapshot, subscribe, toJSON, toText, toTrace,
  setCaptureLevel, type Level,
} from '../debug'
import {
  droppedCount, forEach, slot, stringOf, totalWritten, capacity,
  type EventDef,
} from '../debug/ring'
import { CAT, type Cat } from '../debug/ring'
import { modsLabel } from '../debug/events'

/** How many lines get rendered; the buffer holds tens of thousands. */
const VISIBLE = 260

const LEVEL_OPTIONS: { id: Level; label: string; help: string }[] = [
  { id: LEVEL.ACTIONS, label: 'Acciones', help: 'Sólo lo que hace el usuario. El más liviano.' },
  { id: LEVEL.NORMAL, label: 'Normal', help: 'Suma rendimiento por frame y raycasts. Es el default.' },
  { id: LEVEL.ALL, label: 'Todo', help: 'Suma cada pointermove crudo. Manguera abierta, para cazar un gesto puntual.' },
]

type DisplayRow = { k: number; t: number; def: EventDef; gesture: number; text: string }

function fieldValue(field: string, raw: number): string | null {
  if (Number.isNaN(raw)) return null
  if (field.startsWith('$')) return stringOf(raw)
  if (field === 'mods') return modsLabel(raw)
  return Number.isInteger(raw) ? String(raw) : raw.toFixed(2)
}

function download(name: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking in the same tick cuts the download short in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function DebugPanel({ onClose }: { onClose: () => void }) {
  const [hidden, setHidden] = useState<Set<Cat>>(new Set())
  const [filter, setFilter] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [bench, setBench] = useState<string | null>(null)
  const [view, setView] = useState<'feed' | 'summary'>('feed')

  const version = useSyncExternalStore(subscribe, getVersion)
  const paused = isPaused()
  const level = getLevel()

  const feed = useMemo(() => {
    const out: DisplayRow[] = []
    const q = filter.trim().toLowerCase()
    // Walks the whole buffer and keeps the tail: typed arrays mean no
    // allocation for discarded events.
    const all: DisplayRow[] = []
    forEach((t, d, gesture, base, obj) => {
      if (hidden.has(d.catName)) return
      const parts: string[] = []
      for (let j = 0; j < d.fields.length; j++) {
        const v = fieldValue(d.fields[j], slot(base, j))
        if (v !== null) parts.push(`${d.fields[j].replace(/^\$/, '')}=${v}`)
      }
      if (obj) parts.push(JSON.stringify(obj))
      const text = parts.join(' ')
      if (q && !d.name.toLowerCase().includes(q) && !text.toLowerCase().includes(q)) return
      all.push({ k: all.length, t, def: d, gesture, text })
    })
    for (let i = all.length - 1; i >= 0 && out.length < VISIBLE; i--) out.push(all[i])
    return { rows: out, total: all.length }
    // `version` is the real dependency: it changes on every recorded event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, filter, version])

  const toggleCategory = (c: Cat) =>
    setHidden((prev) => {
      const n = new Set(prev)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })

  const copyToClipboard = async (which: 'feed' | 'summary') => {
    try {
      await navigator.clipboard.writeText(which === 'feed' ? toText() : summaryText())
      setCopied(which)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // Clipboard access can be blocked; falls back to a file download,
      // which always works.
      download('mcb-telemetry.txt', toText(), 'text/plain')
      setCopied('file')
      setTimeout(() => setCopied(null), 1600)
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dropped = droppedCount()

  return (
    <div className="debug-panel" role="dialog" aria-label="Telemetría">
      <header>
        <strong>Telemetría</strong>
        <span className="hint">
          {size()} / {capacity()} · {totalWritten()} escritos
          {dropped > 0 && <span className="warn"> · {dropped} descartados</span>}
          {' · '}{(memoryBytes() / 1048576).toFixed(1)} MB
        </span>
        <span style={{ flex: 1 }} />
        <button
          className={view === 'feed' ? 'on' : ''}
          onClick={() => setView('feed')}
          title="Ver los eventos en orden, del más nuevo al más viejo"
        >
          Flujo
        </button>
        <button
          className={view === 'summary' ? 'on' : ''}
          onClick={() => setView('summary')}
          title="Ver conteos por tipo de evento y percentiles de frame"
        >
          Resumen
        </button>
        <button onClick={onClose} title="Cerrar (Ctrl+Shift+D)">✕</button>
      </header>

      <div className="debug-filters">
        <span className="hint" style={{ alignSelf: 'center' }}>Captura:</span>
        {LEVEL_OPTIONS.map((n) => (
          <button
            key={n.id}
            className={`chip ${level === n.id ? 'on' : ''}`}
            onClick={() => setCaptureLevel(n.id)}
            title={n.help}
          >
            {n.label}
          </button>
        ))}
        <span className="sep" />
        <button
          className={`chip ${paused ? 'on' : ''}`}
          onClick={() => setPaused(!paused)}
          title={paused ? 'Reanudar la captura' : 'Pausar para leer sin que se mueva'}
        >
          {paused ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
        <button className="chip" onClick={() => snapshot('manual')} title="Volcar el estado completo de la app al registro">
          Snapshot
        </button>
        <button className="chip" onClick={clear} title="Vaciar el registro">Limpiar</button>
        <span className="sep" />
        <button className="chip" onClick={() => copyToClipboard(view)} title="Copiar al portapapeles">
          {copied === 'file' ? 'Bajado' : copied ? '¡Copiado!' : 'Copiar'}
        </button>
        <button className="chip" onClick={() => download(`mcb-${stamp}.txt`, toText(), 'text/plain')} title="Texto plano">.txt</button>
        <button className="chip" onClick={() => download(`mcb-${stamp}.json`, toJSON(), 'application/json')} title="JSON para procesar">.json</button>
        <button
          className="chip"
          onClick={() => download(`mcb-${stamp}.trace.json`, toTrace(), 'application/json')}
          title="Traza de Chrome: se abre arrastrándola a ui.perfetto.dev y muestra la línea de tiempo"
        >
          .trace
        </button>
        <span className="sep" />
        <button
          className="chip"
          onClick={() => {
            const r = selfBenchmark()
            setBench(`${r.nsPerEvent.toFixed(0)} ns/evento · ${(r.eventsPerSecond / 1e6).toFixed(1)} M/s`)
          }}
          title="Mide cuánto cuesta registrar un evento en este navegador"
        >
          Medirme
        </button>
        {bench && <span className="hint" style={{ alignSelf: 'center' }}>{bench}</span>}
      </div>

      {view === 'feed' && (
        <>
          <div className="debug-filters">
            <input
              type="text"
              value={filter}
              placeholder="Filtrar por nombre o contenido…"
              onChange={(e) => setFilter(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 140 }}
            />
            {CAT.map((c) => (
              <button
                key={c}
                className={`chip ${hidden.has(c) ? '' : 'on'}`}
                onClick={() => toggleCategory(c)}
                title={`Mostrar u ocultar ${c}`}
              >
                {c}
              </button>
            ))}
          </div>

          <ol className="debug-rows">
            {feed.rows.length === 0 && (
              <li className="hint" style={{ padding: 10 }}>
                Nada que mostrar con estos filtros.
              </li>
            )}
            {feed.rows.map((f) => (
              <li key={f.k} className={`row cat-${f.def.catName}`}>
                <span className="t">{f.t.toFixed(1)}</span>
                <span className="g">{f.gesture ? `g${f.gesture}` : ''}</span>
                <span className="cat">{f.def.catName}</span>
                <span className="ev">{f.def.name}</span>
                <span className="data">{f.text}</span>
              </li>
            ))}
          </ol>
          <footer className="debug-foot hint">
            mostrando {feed.rows.length} de {feed.total} que pasan el filtro
          </footer>
        </>
      )}

      {view === 'summary' && <pre className="debug-summary">{summaryText()}</pre>}
    </div>
  )
}
