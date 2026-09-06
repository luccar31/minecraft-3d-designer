import { useEditor } from '../state/store'

/** Third redundant mode signal, next to the cursor and the viewport border. */
export function ModeIndicator() {
  const mode = useEditor((s) => s.mode)
  const setMode = useEditor((s) => s.setMode)
  const build = mode === 'build'

  return (
    <button
      className={`mode-indicator ${build ? 'build' : 'navigate'}`}
      onClick={() => setMode(build ? 'navigate' : 'build')}
      title={
        build
          ? 'Modo Construir: el arrastre pinta. Espacio para navegar.'
          : 'Modo Navegar: el arrastre mueve la cámara. Espacio para construir.'
      }
      aria-label={build ? 'Modo Construir, cambiar a Navegar' : 'Modo Navegar, cambiar a Construir'}
      aria-pressed={!build}
      data-testid="mode-indicator"
    >
      {build ? '✏️ Construir' : '🖐 Navegar'}
    </button>
  )
}
