# 01 — Modelo de input: lo que necesita la pasada de integración

Este workstream sólo tocó sus archivos propios (`src/scene/Scene.tsx`,
`src/scene/Overlays.tsx`), sus módulos nuevos (`src/scene/gesture.ts`,
`picking.ts`, `modeKeys.ts`, `cameraActivity.ts`) y un apéndice marcado
`/* ── ws01 ── */` en `src/debug/events.ts`.

Todo lo que sigue toca archivos compartidos (`src/App.tsx`, `src/styles.css`,
`src/state/store.ts`, `README.md`, `SPEC.md`) y quedó **sin hacer** a propósito.

---

## 1. Qué quedó funcionando sin cablear nada

- Máquina de gesto con umbral (4 px mouse/lápiz, 10 px touch), captura de
  puntero y un único `abort()` para `pointercancel`, `lostpointercapture`,
  `blur` y desmontaje.
- Órbita explícita con **botón del medio** y con **Espacio mantenido**, encima
  de la construcción incluida.
- Cursor, cara resaltada y silueta de borrado derivados de `resolveCell()`, la
  misma función que usa la edición.
- El modo `build` / `navigate` vive hoy en un `useState` dentro de `Editor`
  (`Scene.tsx`) y se maneja con `Espacio` desde un listener propio de la
  escena. Como no hay indicador en la UI, el cambio de modo se avisa con
  `setStatus()` (se ve en el pie) y con el cursor del canvas (`crosshair` vs.
  `grab`), que `Scene.tsx` escribe en `gl.domElement.style`.

Lo que falta es exactamente eso: que el modo sea estado de la app y se vea.

---

## 2. `src/state/store.ts` — `mode` y `setMode`

**Por qué:** el indicador de modo, la clase del viewport y el manejo de
`Espacio` viven en `App.tsx`, que no puede leer un `useState` de `Scene`.

```diff
+import type { Mode } from '../scene/gesture'
+
 export type EditorState = {
@@
   showGrid: boolean
+  mode: Mode
@@
   setView: (v: 'edit' | 'guide') => void
+  setMode: (m: Mode) => void
@@
   showGrid: true,
+  mode: 'build',
@@
   setView: (view) => {
     rec(EV.view, str(get().view), str(view))
     set({ view })
   },
+  setMode: (mode) => {
+    if (get().mode === mode) return
+    rec(EV.mode, str(get().mode), str(mode), str('store'))
+    set({ mode })
+  },
```

El evento `EV.mode` ya está declarado (`tool` / `mode`, campos
`['$from', '$to', '$reason']`) en el bloque `ws01` de `src/debug/events.ts`.

Conviene además agregar `mode: s.mode` al `registerSnapshotSource` del final
del archivo, para que el modo salga en los snapshots de telemetría.

## 3. `src/scene/Scene.tsx` — pasar el modo al store

Con el store ya extendido, en `Editor()`:

```diff
-  const [mode, setModeState] = useState<Mode>('build')
-  const modeRef = useRef<Mode>('build')
+  const mode = store.mode
+  const modeRef = useRef<Mode>(store.mode)
   const spaceRef = useRef<SpaceState | null>(null)

   const setMode = useCallback((next: Mode, reason: string) => {
     if (modeRef.current === next) return
     rec(EV.mode, str(modeRef.current), str(next), str(reason))
     modeRef.current = next
-    setModeState(next)
-    useEditor.getState().setStatus(...)
+    useEditor.getState().setMode(next)
   }, [])
```

Y si `App.tsx` toma `Espacio` (punto 4), sacar de `Scene.tsx` el bloque
`if (e.code === 'Space' ...)` de `onKeyDown` / `onKeyUp`, dejando sólo el
recálculo de la previa por `Shift` / `Alt`. **Que la tecla quede en un solo
lado**: si queda en los dos, un toque alterna dos veces y no pasa nada.

## 4. `src/App.tsx` — montar el modo

```diff
+import { CoordReadout } from './ui/CoordReadout'
+import { ModeIndicator } from './ui/ModeIndicator'
+import { spaceDown, spaceUp, type SpaceState } from './scene/modeKeys'
+import { consumeCameraMoved } from './scene/cameraActivity'
@@
   const showGrid = useEditor((s) => s.showGrid)
+  const mode = useEditor((s) => s.mode)
+  const spaceRef = useRef<SpaceState | null>(null)
@@
       const s = useEditor.getState()
       const mod = e.ctrlKey || e.metaKey
+
+      if (e.code === 'Space' && !e.repeat) {
+        e.preventDefault()
+        const r = spaceDown(s.mode, performance.now())
+        spaceRef.current = r.state
+        s.setMode(r.mode)
+        return
+      }
@@
     window.addEventListener('keydown', onKey)
-    return () => window.removeEventListener('keydown', onKey)
+    const onKeyUp = (e: KeyboardEvent) => {
+      if (e.code !== 'Space' || !spaceRef.current) return
+      const r = spaceUp(spaceRef.current, performance.now(), consumeCameraMoved())
+      spaceRef.current = null
+      useEditor.getState().setMode(r.mode)
+    }
+    window.addEventListener('keyup', onKeyUp)
+    return () => {
+      window.removeEventListener('keydown', onKey)
+      window.removeEventListener('keyup', onKeyUp)
+    }
   }, [])
@@
-          <div className="viewport">
+          <div className={`viewport ${mode}`}>
@@
             <div className="view-tools">
+              <ModeIndicator />
               <button onClick={() => useEditor.getState().requestFit()} ...>
@@
             </div>
+            <CoordReadout />
           </div>
```

`consumeCameraMoved()` viene de `src/scene/cameraActivity.ts` (ya creado):
`Scene.tsx` marca la bandera desde el `onStart` de OrbitControls. Sin ella,
orbitar rápido con `Espacio` mantenido se leería como toque y dejaría el modo
cambiado sin que nadie lo pida.

El `preventDefault()` de `Espacio` no debe correr con el foco en un `input`,
`textarea`, `button`, `select` o `a`: el manejador de `App.tsx` ya descarta
`INPUT`/`TEXTAREA`/`contentEditable`, hay que sumarle los otros tres o los
botones dejan de activarse con la barra espaciadora.

## 5. `src/ui/ModeIndicator.tsx` y `src/ui/CoordReadout.tsx` (nuevos)

No se crearon porque no compilan sin `store.mode`.

```tsx
// src/ui/ModeIndicator.tsx
import { useEditor } from '../state/store'

export function ModeIndicator() {
  const mode = useEditor((s) => s.mode)
  const setMode = useEditor((s) => s.setMode)
  const build = mode === 'build'

  return (
    <button
      className={`mode-indicator ${build ? 'build' : 'navigate'}`}
      onClick={() => setMode(build ? 'navigate' : 'build')}
      title={build
        ? 'Modo Construir: el arrastre pinta. Espacio para navegar.'
        : 'Modo Navegar: el arrastre mueve la cámara. Espacio para construir.'}
      aria-pressed={!build}
      data-testid="mode-indicator"
    >
      {build ? 'Construir' : 'Navegar'}
    </button>
  )
}
```

```tsx
// src/ui/CoordReadout.tsx
import { useEditor } from '../state/store'

export function CoordReadout() {
  const hover = useEditor((s) => s.hover)
  const sliceIndex = useEditor((s) => s.sliceIndex)
  if (!hover) return null
  return (
    <div className="coord-readout" data-testid="coord-readout">
      x {hover.x} · y {hover.y} · z {hover.z} · capa {sliceIndex}
    </div>
  )
}
```

## 6. `src/styles.css`

```css
/* ── modo de interacción ─────────────────────────────────────────────────── */

.mode-indicator { font-weight: 600; }
.mode-indicator.navigate { background: var(--accent-dim); border-color: var(--accent); }

.viewport.navigate::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  border: 2px solid var(--accent); border-radius: 4px; opacity: .55;
}

.coord-readout {
  position: absolute; left: 10px; bottom: 10px; pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  color: var(--muted); background: #0009; border: 1px solid var(--line);
  border-radius: 6px; padding: 3px 8px;
}
```

`.viewport` ya es `position: relative` en la hoja actual; si no lo fuera, el
borde y la lectura de coordenadas se posicionarían contra el `body`.

El cursor del canvas lo escribe `Scene.tsx` en línea (`crosshair` / `grab`);
si se prefiere en CSS, sacarlo de ahí y no dejar las dos fuentes peleando.

## 7. `README.md` y `SPEC.md`

Tabla de controles del README:

```markdown
| Cambiar de modo | `Espacio` (un toque alterna, mantenerlo es transitorio) |
| Orbitar | Modo Navegar, o botón del medio, o arrastrar sobre el vacío |
| Paneo | Arrastrar con el botón derecho |
```

Y en la sección 4 (Interacción) de `SPEC.md`, documentar el umbral
click/arrastre y que en `pending` no se escribe nada.

## 8. Tests que se destraban con esto

En `tests/input-ws01.spec.ts` hay dos `test.fixme` que pasan a verdes apenas
exista `store.mode` y el indicador esté montado:

- `el indicador de modo se ve en la barra del viewport`
- `el modo vive en el store y es consultable`

Además conviene agregar ahí la versión con `setMode('navigate')` del test que
hoy usa `Espacio` mantenido.

## 9. Riesgo de choque con otros workstreams

- **04 — Atajos** también va a tocar el manejador de teclado de `App.tsx`. La
  tecla `Espacio` tiene que quedar declarada una sola vez, y `modeKeys.ts` es
  quien decide toque vs. mantener: no reimplementarlo en la tabla de atajos.
- **02 — Táctil** comparte la máquina de gesto: el umbral de touch (10 px) y
  el tipo de puntero ya están en `src/scene/gesture.ts`; los gestos de dos
  dedos deberían entrar como fases nuevas ahí, no como listeners paralelos.
