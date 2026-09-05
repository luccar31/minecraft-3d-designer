import { useMemo, useState } from 'react'
import { useEditor } from '../state/store'
import { blockDef } from '../blocks/palette'
import { buildGuide, luminance, openPrintableGuide, stacksLabel, type Guide, type GuideStep } from '../export/guide'

function LayerSvg({ step, guide, cell = 24 }: { step: GuideStep; guide: Guide; cell?: number }) {
  const pad = 22
  const w = guide.width * cell + pad
  const h = guide.depth * cell + pad
  const lines: JSX.Element[] = []

  for (let dx = 0; dx <= guide.width; dx++) {
    const x = pad + dx * cell
    lines.push(
      <line key={`vx${dx}`} x1={x} y1={pad} x2={x} y2={pad + guide.depth * cell}
        stroke="#cfcfcf" strokeWidth={dx % 4 === 0 ? 1.4 : 0.6} />,
    )
  }
  for (let dz = 0; dz <= guide.depth; dz++) {
    const y = pad + dz * cell
    lines.push(
      <line key={`hz${dz}`} x1={pad} y1={y} x2={pad + guide.width * cell} y2={y}
        stroke="#cfcfcf" strokeWidth={dz % 4 === 0 ? 1.4 : 0.6} />,
    )
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Capa ${step.fromY}`}>
      <rect width={w} height={h} fill="#ffffff" />
      {step.below?.map((col, dx) =>
        col.map((id, dz) =>
          id ? (
            <rect key={`g${dx}-${dz}`} x={pad + dx * cell} y={pad + dz * cell}
              width={cell} height={cell} fill="#e9e9e9" />
          ) : null,
        ),
      )}
      {step.grid.map((col, dx) =>
        col.map((id, dz) => {
          if (!id) return null
          const def = blockDef(id)
          const code = guide.legend.get(id) ?? '?'
          const x = pad + dx * cell
          const y = pad + dz * cell
          return (
            <g key={`c${dx}-${dz}`}>
              <rect x={x} y={y} width={cell} height={cell} fill={def.color} stroke="#00000022" />
              <text
                x={x + cell / 2}
                y={y + cell / 2 + 4}
                fontSize={Math.round(cell * 0.46)}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                textAnchor="middle"
                fill={luminance(def.color) > 0.55 ? '#111' : '#fff'}
              >
                {code}
              </text>
            </g>
          )
        }),
      )}
      {lines}
      {Array.from({ length: Math.ceil(guide.width / 4) }, (_, i) => (
        <text key={`lx${i}`} x={pad + i * 4 * cell + 2} y={pad - 6} fontSize={10} fill="#777"
          fontFamily="ui-monospace, monospace">{guide.originX + i * 4}</text>
      ))}
      {Array.from({ length: Math.ceil(guide.depth / 4) }, (_, i) => (
        <text key={`lz${i}`} x={2} y={pad + i * 4 * cell + 12} fontSize={10} fill="#777"
          fontFamily="ui-monospace, monospace">{guide.originZ + i * 4}</text>
      ))}
    </svg>
  )
}

export function GuideView() {
  const world = useEditor((s) => s.world)
  const rev = useEditor((s) => s.rev)
  const meta = useEditor((s) => s.meta)
  const setView = useEditor((s) => s.setView)
  const [i, setI] = useState(0)

  const guide = useMemo(
    () => buildGuide(world),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world, rev],
  )

  if (guide.steps.length === 0) {
    return (
      <div className="guide">
        <div className="empty" style={{ maxWidth: 460, margin: '60px auto' }}>
          Todavía no hay bloques. Volvé al editor y construí algo.
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setView('edit')}>Ir al editor</button>
          </div>
        </div>
      </div>
    )
  }

  const step = guide.steps[Math.min(i, guide.steps.length - 1)]

  return (
    <div className="guide">
      <div className="guide-head">
        <h1>{meta.name}</h1>
        <span className="hint">
          {guide.totalBlocks} bloques · {guide.steps.length} pasos ·
          ocupa {guide.width}×{guide.height}×{guide.depth}
        </span>
        <button onClick={() => openPrintableGuide(guide, meta)}>Imprimir / PDF</button>
      </div>

      <div className="steps-strip">
        {guide.steps.map((s, idx) => (
          <button key={s.n} className={idx === i ? 'on' : ''} onClick={() => setI(idx)}>
            {s.repeat > 1 ? `y${s.fromY}–${s.toY}` : `y${s.fromY}`}
          </button>
        ))}
      </div>

      <div className="nav">
        <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>← Anterior</button>
        <b data-testid="guide-step">
          Paso {step.n} de {guide.steps.length} — capa y = {step.fromY}
          {step.repeat > 1 ? ` a ${step.toY}` : ''}
        </b>
        {step.repeat > 1 && <span className="rep">repetir {step.repeat}×</span>}
        <button
          onClick={() => setI((v) => Math.min(guide.steps.length - 1, v + 1))}
          disabled={i >= guide.steps.length - 1}
        >
          Siguiente →
        </button>
      </div>

      <div className="guide-cols">
        <div className="canvas-wrap">
          <LayerSvg step={step} guide={guide} />
        </div>

        <div className="guide-side">
          <h3 style={{ margin: '0 0 8px' }}>Esta capa</h3>
          <table className="legend-tbl">
            <tbody>
              {step.counts.map(([id, n]) => (
                <tr key={id}>
                  <td className="code">{guide.legend.get(id)}</td>
                  <td>
                    <span className="sw" style={{ background: blockDef(id).color, display: 'inline-block', verticalAlign: -2, marginRight: 6 }} />
                    {blockDef(id).name}
                  </td>
                  <td className="num">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>
            El gris claro es la capa anterior: usalo para alinear.
          </p>

          <h3 style={{ margin: '18px 0 8px' }}>Materiales totales</h3>
          <table className="legend-tbl">
            <thead>
              <tr><th>Cód.</th><th>Bloque</th><th style={{ textAlign: 'right' }}>Total</th><th>Stacks</th></tr>
            </thead>
            <tbody>
              {guide.totals.map(([id, n]) => (
                <tr key={id}>
                  <td className="code">{guide.legend.get(id)}</td>
                  <td>{blockDef(id).name}</td>
                  <td className="num">{n}</td>
                  <td className="num" style={{ textAlign: 'left' }}>{stacksLabel(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
