import { useRef } from 'react'
import { useEditor } from '../state/store'
import { downloadBlob, downloadDesignJson, readDesignFile, slugify } from '../export/files'
import { buildSchem } from '../export/schem'
import { buildGuide, openPrintableGuide } from '../export/guide'

export function TopBar({ onOpenDesigns }: { onOpenDesigns: () => void }) {
  const s = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)

  const exportSchem = () => {
    const bytes = buildSchem(s.world, s.meta)
    downloadBlob(
      `${slugify(s.meta.name)}.schem`,
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }),
    )
    s.setStatus('Exportado .schem — cargalo con WorldEdit o Litematica')
  }

  const printGuide = () => {
    const guide = buildGuide(s.world)
    if (guide.steps.length === 0) {
      s.setStatus('No hay nada que construir todavía')
      return
    }
    openPrintableGuide(guide, s.meta)
  }

  const onImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const sd = await readDesignFile(file)
      s.loadStored(sd)
      s.setStatus(`Importado: ${sd.name}`)
    } catch (e) {
      s.setStatus(`Error al importar: ${(e as Error).message}`)
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="cube" />
        MC Blueprint
      </div>

      <input
        className="name-input"
        type="text"
        value={s.meta.name}
        onChange={(e) => s.rename(e.target.value)}
        aria-label="Nombre del diseño"
        data-testid="design-name"
      />

      <div className="grp">
        <button onClick={onOpenDesigns} data-testid="open-designs">Diseños</button>
        <button onClick={() => s.saveCurrent()} disabled={s.busy} data-testid="save">
          Guardar
        </button>
      </div>

      <div className="grp">
        <button onClick={() => s.undo()} disabled={!s.canUndo} title="Deshacer (Ctrl+Z)">↶</button>
        <button onClick={() => s.redo()} disabled={!s.canRedo} title="Rehacer (Ctrl+Shift+Z)">↷</button>
      </div>

      <div className="grp">
        <button
          className={s.view === 'edit' ? 'on' : ''}
          onClick={() => s.setView('edit')}
          data-testid="view-edit"
        >
          Editar
        </button>
        <button
          className={s.view === 'guide' ? 'on' : ''}
          onClick={() => s.setView('guide')}
          data-testid="view-guide"
        >
          Guía
        </button>
      </div>

      <div className="spacer" />

      <div className="grp">
        <button onClick={printGuide} title="Abre la guía lista para imprimir o guardar como PDF">
          Imprimir guía
        </button>
        <button onClick={() => downloadDesignJson(s.toStored())} title="Descargar diseño como .mcbp.json">
          Exportar JSON
        </button>
        <button onClick={exportSchem} title="Exportar .schem para WorldEdit / Litematica">
          Exportar .schem
        </button>
        <button onClick={() => fileRef.current?.click()}>Importar</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            onImport(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      <span className={`chip${s.storageMode === 'cloud' ? ' cloud' : ''}`}>
        {s.storageMode === 'cloud' ? '☁ nube' : '💾 este navegador'}
      </span>
    </header>
  )
}
