import { useMemo, useState } from 'react'
import { BLOCKS, CATEGORIES, blockDef, type Category } from '../blocks/palette'
import { blockThumbnail } from '../blocks/atlas'
import { useEditor } from '../state/store'

export function PalettePanel() {
  const block = useEditor((s) => s.block)
  const setBlock = useEditor((s) => s.setBlock)
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return BLOCKS.filter(
      (b) =>
        (cat === 'all' || b.category === cat) &&
        (!needle || b.name.toLowerCase().includes(needle) || b.id.includes(needle)),
    )
  }, [cat, q])

  const current = blockDef(block)

  return (
    <div className="side">
      <div className="current">
        <img src={blockThumbnail(current.tex.side)} alt="" />
        <div style={{ minWidth: 0 }}>
          <div className="nm">{current.name}</div>
          <div className="id">{current.id.replace('minecraft:', '')}</div>
        </div>
      </div>

      <div className="section">
        <input
          type="text"
          placeholder="Buscar bloque…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar bloque"
        />
      </div>

      <div className="cats">
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
          Todos
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="blocks">
        {list.map((b) => (
          <button
            key={b.id}
            className={`blk${b.id === block ? ' sel' : ''}`}
            title={`${b.name}\n${b.id}`}
            onClick={() => setBlock(b.id)}
            data-block={b.id}
          >
            <img src={blockThumbnail(b.tex.side)} alt={b.name} />
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="hint" style={{ marginTop: 10 }}>Sin resultados.</p>}
    </div>
  )
}
