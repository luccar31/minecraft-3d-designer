import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  clear, getLevel, getVersion, isPaused, LEVEL, memoryBytes, resumenTexto,
  selfBenchmark, setPaused, size, snapshot, subscribe, toJSON, toText, toTrace,
  cambiarNivel, type Level,
} from '../debug'
import {
  droppedCount, forEach, slot, stringOf, totalWritten, capacity,
  type EventDef,
} from '../debug/ring'
import { CAT, type Cat } from '../debug/ring'
import { modsLabel } from '../debug/events'

/** Cuántas líneas se pintan. El buffer guarda decenas de miles. */
const VISIBLE = 260

const NIVELES: { id: Level; label: string; ayuda: string }[] = [
  { id: LEVEL.ACCIONES, label: 'Acciones', ayuda: 'Sólo lo que hace el usuario. El más liviano.' },
  { id: LEVEL.NORMAL, label: 'Normal', ayuda: 'Suma rendimiento por frame y raycasts. Es el default.' },
  { id: LEVEL.TODO, label: 'Todo', ayuda: 'Suma cada pointermove crudo. Manguera abierta, para cazar un gesto puntual.' },
]

type Fila = { k: number; t: number; def: EventDef; gesto: number; texto: string }

function valorCampo(campo: string, crudo: number): string | null {
  if (Number.isNaN(crudo)) return null
  if (campo.startsWith('$')) return stringOf(crudo)
  if (campo === 'mods') return modsLabel(crudo)
  return Number.isInteger(crudo) ? String(crudo) : crudo.toFixed(2)
}

function descargar(nombre: string, texto: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revocar en el mismo tick corta la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function DebugPanel({ onClose }: { onClose: () => void }) {
  const [ocultas, setOcultas] = useState<Set<Cat>>(new Set())
  const [filtro, setFiltro] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  const [bench, setBench] = useState<string | null>(null)
  const [vista, setVista] = useState<'flujo' | 'resumen'>('flujo')

  const version = useSyncExternalStore(subscribe, getVersion)
  const pausado = isPaused()
  const nivel = getLevel()

  const filas = useMemo(() => {
    const out: Fila[] = []
    const q = filtro.trim().toLowerCase()
    // Se recorre entero y se queda con la cola: el buffer es de typed arrays,
    // así que esto no aloca por evento descartado.
    const todas: Fila[] = []
    forEach((t, d, gesto, base, obj) => {
      if (ocultas.has(d.catName)) return
      const partes: string[] = []
      for (let j = 0; j < d.fields.length; j++) {
        const v = valorCampo(d.fields[j], slot(base, j))
        if (v !== null) partes.push(`${d.fields[j].replace(/^\$/, '')}=${v}`)
      }
      if (obj) partes.push(JSON.stringify(obj))
      const texto = partes.join(' ')
      if (q && !d.name.toLowerCase().includes(q) && !texto.toLowerCase().includes(q)) return
      todas.push({ k: todas.length, t, def: d, gesto, texto })
    })
    for (let i = todas.length - 1; i >= 0 && out.length < VISIBLE; i--) out.push(todas[i])
    return { filas: out, total: todas.length }
    // `version` es la dependencia real: cambia con cada evento registrado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocultas, filtro, version])

  const alternar = (c: Cat) =>
    setOcultas((prev) => {
      const n = new Set(prev)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })

  const copiar = async (que: 'flujo' | 'resumen') => {
    try {
      await navigator.clipboard.writeText(que === 'flujo' ? toText() : resumenTexto())
      setCopiado(que)
      setTimeout(() => setCopiado(null), 1600)
    } catch {
      // El portapapeles puede estar bloqueado: se cae al archivo, que siempre anda.
      descargar('mcb-telemetria.txt', toText(), 'text/plain')
      setCopiado('archivo')
      setTimeout(() => setCopiado(null), 1600)
    }
  }

  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const descartados = droppedCount()

  return (
    <div className="debug-panel" role="dialog" aria-label="Telemetría">
      <header>
        <strong>Telemetría</strong>
        <span className="hint">
          {size()} / {capacity()} · {totalWritten()} escritos
          {descartados > 0 && <span className="warn"> · {descartados} descartados</span>}
          {' · '}{(memoryBytes() / 1048576).toFixed(1)} MB
        </span>
        <span style={{ flex: 1 }} />
        <button
          className={vista === 'flujo' ? 'on' : ''}
          onClick={() => setVista('flujo')}
          title="Ver los eventos en orden, del más nuevo al más viejo"
        >
          Flujo
        </button>
        <button
          className={vista === 'resumen' ? 'on' : ''}
          onClick={() => setVista('resumen')}
          title="Ver conteos por tipo de evento y percentiles de frame"
        >
          Resumen
        </button>
        <button onClick={onClose} title="Cerrar (Ctrl+Shift+D)">✕</button>
      </header>

      <div className="debug-filters">
        <span className="hint" style={{ alignSelf: 'center' }}>Captura:</span>
        {NIVELES.map((n) => (
          <button
            key={n.id}
            className={`chip ${nivel === n.id ? 'on' : ''}`}
            onClick={() => cambiarNivel(n.id)}
            title={n.ayuda}
          >
            {n.label}
          </button>
        ))}
        <span className="sep" />
        <button
          className={`chip ${pausado ? 'on' : ''}`}
          onClick={() => setPaused(!pausado)}
          title={pausado ? 'Reanudar la captura' : 'Pausar para leer sin que se mueva'}
        >
          {pausado ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
        <button className="chip" onClick={() => snapshot('manual')} title="Volcar el estado completo de la app al registro">
          Snapshot
        </button>
        <button className="chip" onClick={clear} title="Vaciar el registro">Limpiar</button>
        <span className="sep" />
        <button className="chip" onClick={() => copiar(vista)} title="Copiar al portapapeles">
          {copiado === 'archivo' ? 'Bajado' : copiado ? '¡Copiado!' : 'Copiar'}
        </button>
        <button className="chip" onClick={() => descargar(`mcb-${sello}.txt`, toText(), 'text/plain')} title="Texto plano">.txt</button>
        <button className="chip" onClick={() => descargar(`mcb-${sello}.json`, toJSON(), 'application/json')} title="JSON para procesar">.json</button>
        <button
          className="chip"
          onClick={() => descargar(`mcb-${sello}.trace.json`, toTrace(), 'application/json')}
          title="Traza de Chrome: se abre arrastrándola a ui.perfetto.dev y muestra la línea de tiempo"
        >
          .trace
        </button>
        <span className="sep" />
        <button
          className="chip"
          onClick={() => {
            const r = selfBenchmark()
            setBench(`${r.nsPorEvento.toFixed(0)} ns/evento · ${(r.eventosPorSegundo / 1e6).toFixed(1)} M/s`)
          }}
          title="Mide cuánto cuesta registrar un evento en este navegador"
        >
          Medirme
        </button>
        {bench && <span className="hint" style={{ alignSelf: 'center' }}>{bench}</span>}
      </div>

      {vista === 'flujo' && (
        <>
          <div className="debug-filters">
            <input
              type="text"
              value={filtro}
              placeholder="Filtrar por nombre o contenido…"
              onChange={(e) => setFiltro(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: 140 }}
            />
            {CAT.map((c) => (
              <button
                key={c}
                className={`chip ${ocultas.has(c) ? '' : 'on'}`}
                onClick={() => alternar(c)}
                title={`Mostrar u ocultar ${c}`}
              >
                {c}
              </button>
            ))}
          </div>

          <ol className="debug-rows">
            {filas.filas.length === 0 && (
              <li className="hint" style={{ padding: 10 }}>
                Nada que mostrar con estos filtros.
              </li>
            )}
            {filas.filas.map((f) => (
              <li key={f.k} className={`row cat-${f.def.catName}`}>
                <span className="t">{f.t.toFixed(1)}</span>
                <span className="g">{f.gesto ? `g${f.gesto}` : ''}</span>
                <span className="cat">{f.def.catName}</span>
                <span className="ev">{f.def.name}</span>
                <span className="data">{f.texto}</span>
              </li>
            ))}
          </ol>
          <footer className="debug-foot hint">
            mostrando {filas.filas.length} de {filas.total} que pasan el filtro
          </footer>
        </>
      )}

      {vista === 'resumen' && <pre className="debug-resumen">{resumenTexto()}</pre>}
    </div>
  )
}
