# 04 — Panel de atajos · integración

Todo lo que la pasada final tiene que aplicar en archivos compartidos. Nada acá
requiere tomar decisiones: es copiar, pegar y correr los tests.

Archivos nuevos, ya en la rama y sin tocar nada compartido:

- `src/ui/atajos.ts` — el mapa de atajos, la función `matchShortcut()` y las
  etiquetas. Fuente única de verdad.
- `src/ui/ShortcutsPanel.tsx` — el panel modal y el botón de ayuda.
- `src/ui/atajos.css` — se importa desde `ShortcutsPanel.tsx`, no hace falta
  tocar `main.tsx` ni `styles.css`.
- `tests/atajos.spec.ts` — verifica el criterio 1 de forma automática.

---

## 1. Diff de `src/App.tsx`

Un solo diff: el manejador de teclado pasa a consumir `atajos.ts` **y** monta el
panel. Los anclas de contexto son suficientes si otro workstream ya movió
líneas; si `patch` falla, aplicar a mano guiándose por el contexto.

```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -5,15 +5,12 @@
 import { TopBar } from './ui/TopBar'
 import { DesignsPanel } from './ui/DesignsPanel'
 import { DebugPanel } from './ui/DebugPanel'
+import { ShortcutsButton, ShortcutsPanel } from './ui/ShortcutsPanel'
+import { matchShortcut } from './ui/atajos'
 import { useEditor } from './state/store'
 import { hasWebGL } from './ui/ErrorBoundary'
 import { worldToPlane } from './voxel/ops'
 import { EV, packMods, rec, str, touchClock } from './debug'
-import type { Tool } from './types'
-
-const TOOL_KEYS: Record<string, Tool> = {
-  b: 'brush', e: 'eraser', i: 'picker', l: 'line', r: 'rect', f: 'fill', s: 'select',
-}
 
 const WEBGL = hasWebGL()
 
@@ -26,6 +23,7 @@
 export default function App() {
   const [designsOpen, setDesignsOpen] = useState(false)
   const [debugOpen, setDebugOpen] = useState(false)
+  const [shortcutsOpen, setShortcutsOpen] = useState(false)
   const view = useEditor((s) => s.view)
   const status = useEditor((s) => s.status)
   const meta = useEditor((s) => s.meta)
@@ -46,9 +44,9 @@
         return
       }
       const s = useEditor.getState()
-      const mod = e.ctrlKey || e.metaKey
+      const hit = matchShortcut(e)
 
-      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
+      if (hit?.id === 'debug.telemetry') {
         e.preventDefault()
         setDebugOpen((v) => {
           rec(EV.panel, str('telemetry'), v ? 0 : 1)
@@ -59,50 +57,37 @@
 
       rec(EV.key, str(e.key), packMods(e), e.repeat ? 1 : 0)
 
-      if (mod && e.key.toLowerCase() === 'z') {
-        e.preventDefault()
-        e.shiftKey ? s.redo() : s.undo()
-        return
-      }
-      if (mod && e.key.toLowerCase() === 's') {
-        e.preventDefault()
-        s.saveCurrent()
-        return
-      }
-      if (mod && e.key.toLowerCase() === 'c') { s.copySelection(false); return }
-      if (mod && e.key.toLowerCase() === 'x') { s.copySelection(true); return }
-      if (mod && e.key.toLowerCase() === 'v') {
-        if (s.clipboard && s.hover) s.pasteAt(worldToPlane(s.sliceAxis, s.hover))
-        return
-      }
-      if (e.key === 'Escape') {
-        s.cancelAnchor()
-        s.clearSelection()
-        return
-      }
-      if (e.key === 'Delete' || e.key === 'Backspace') {
-        if (s.selection) { e.preventDefault(); s.deleteSelection() }
-        return
-      }
-      if (e.key === 'ArrowUp' || e.key === 'PageUp') {
-        if (s.sliceView !== 'off') { e.preventDefault(); s.setSliceIndex(s.sliceIndex + 1) }
-        return
-      }
-      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
-        if (s.sliceView !== 'off') { e.preventDefault(); s.setSliceIndex(s.sliceIndex - 1) }
-        return
-      }
-      if (mod) return
+      if (!hit) return
+      if (hit.tool) { s.setTool(hit.tool); return }
 
-      const k = e.key.toLowerCase()
-      if (TOOL_KEYS[k]) { s.setTool(TOOL_KEYS[k]); return }
-      if (k === 'g') s.toggle('showGrid')
-      if (k === 'c') s.requestFit()
-      if (k === 'x') s.toggle('mirrorX')
-      if (k === 'z') s.toggle('mirrorZ')
-      if (k === '1') s.setSliceView('off')
-      if (k === '2') s.setSliceView('below')
-      if (k === '3') s.setSliceView('isolate')
+      switch (hit.id) {
+        case 'edit.undo': e.preventDefault(); s.undo(); return
+        case 'edit.redo': e.preventDefault(); s.redo(); return
+        case 'file.save': e.preventDefault(); s.saveCurrent(); return
+        case 'edit.copy': s.copySelection(false); return
+        case 'edit.cut': s.copySelection(true); return
+        case 'edit.paste':
+          if (s.clipboard && s.hover) s.pasteAt(worldToPlane(s.sliceAxis, s.hover))
+          return
+        case 'edit.cancel': s.cancelAnchor(); s.clearSelection(); return
+        case 'edit.delete':
+          if (s.selection) { e.preventDefault(); s.deleteSelection() }
+          return
+        case 'view.layerUp':
+          if (s.sliceView !== 'off') { e.preventDefault(); s.setSliceIndex(s.sliceIndex + 1) }
+          return
+        case 'view.layerDown':
+          if (s.sliceView !== 'off') { e.preventDefault(); s.setSliceIndex(s.sliceIndex - 1) }
+          return
+        case 'view.grid': s.toggle('showGrid'); return
+        case 'view.fit': s.requestFit(); return
+        case 'mirror.x': s.toggle('mirrorX'); return
+        case 'mirror.z': s.toggle('mirrorZ'); return
+        case 'view.mode3d': s.setSliceView('off'); return
+        case 'view.modeBelow': s.setSliceView('below'); return
+        case 'view.modeIsolate': s.setSliceView('isolate'); return
+        case 'help.shortcuts': e.preventDefault(); setShortcutsOpen(true); return
+      }
     }
     window.addEventListener('keydown', onKey)
     return () => window.removeEventListener('keydown', onKey)
@@ -144,6 +129,7 @@
               >
                 Grilla
               </button>
+              <ShortcutsButton onOpen={() => setShortcutsOpen(true)} />
             </div>
           </div>
           <ToolPanel />
@@ -180,6 +166,7 @@
 
       {designsOpen && <DesignsPanel onClose={() => setDesignsOpen(false)} />}
       {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
+      {shortcutsOpen && <ShortcutsPanel onClose={() => setShortcutsOpen(false)} />}
     </div>
   )
 }
```

### Por qué el comportamiento no cambia

Cinco detalles del manejador viejo que el diff conserva a propósito:

1. **`Ctrl+Shift+D` se resuelve antes de `rec(EV.key, …)`.** La telemetría no
   registra su propio atajo, igual que hoy.
2. **`Ctrl+Z` con Shift es rehacer.** El ternario `e.shiftKey ? s.redo() : s.undo()`
   pasa a ser dos entradas del mapa (`edit.undo` con `shift: 'no'`, `edit.redo`
   con `shift: 'yes'`) que `matchShortcut()` resuelve en ese orden.
3. **`Esc`, `Supr`/`Retroceso` y las flechas ignoran Ctrl.** En el mapa van con
   `mod: 'any'`, que es lo que hacía el `if (mod) return` puesto *después* de
   esas ramas.
4. **`if (mod) return` desaparece porque es redundante.** Las teclas sueltas
   (herramientas, `G`, `C`, `X`, `Z`, `1`, `2`, `3`) tienen `mod` en su valor por
   defecto `'no'`, así que con Ctrl apretado `matchShortcut()` ya devuelve
   `undefined`.
5. **`const mod` se borra.** Queda sin usar y `noUnusedLocals` haría fallar
   `tsc`. `packMods(e)` sigue calculando sus propios modificadores.

Verificado: con este diff aplicado (`tsc --noEmit` y la suite completa contra el
build) los 8 tests de `tests/editor.spec.ts` siguen verdes, y a mano se
comprobaron `E`, `3`, `X`, `G`, `1`+`B`+click, `Ctrl+Z` y `Ctrl+Shift+D`.

### Nota sobre `tests/atajos.spec.ts`

Los dos primeros tests comparan el mapa contra el `switch` de `App.tsx` **leyendo
el fuente**. En cuanto App importe de `./ui/atajos`, se auto-saltean solos
(`test.skip(INTEGRATED, …)`): ya no hay dos listas que puedan desincronizarse.
No hay que borrarlos ni editarlos.

Los dos `test.fixme()` del final —abrir con `?` / cerrar con `Esc`, y llegar
desde el botón en touch— pasan a verdes con este diff: sacarles el `.fixme` al
aplicarlo.

---

## 2. Enganche con `src/ui/ayuda.ts` (03) — una línea

En `src/ui/ShortcutsPanel.tsx`, después de los imports, está esta línea:

```ts
const HELP: HelpCatalog = {}
```

Cuando `ayuda.ts` exista, reemplazarla por:

```ts
import { HELP } from './ayuda'
```

Es una línea por una línea, y `import` en medio del módulo es ESM válido; si se
prefiere, moverla arriba junto a los otros imports.

Dos ajustes posibles, ambos mecánicos:

- **El export se llama distinto** (`AYUDA`, `HELP_TEXTS`, …): usar
  `import { AYUDA as HELP } from './ayuda'`.
- **Los ids de 03 no coinciden con los de `atajos.ts`**: cada `Shortcut` tiene un
  campo opcional `helpId` que se consulta antes que `id`. Agregar
  `helpId: 'el.id.de.03'` en las filas que difieran; el resto sigue andando.

El panel sólo usa el campo `que` de cada ficha. Lo que no encuentra en el
catálogo lo muestra igual con su propio texto y una marca `sin ficha` (criterio
del spec: el hueco se ve). Antes de integrar 03 esas marcas son 34 —los 26
atajos de teclado más los 8 gestos de mouse—; después tienen que bajar a 0.

---

## 3. Relevamiento de `App.tsx` (criterio 1, hecho a mano)

26 atajos de teclado en 29 combinaciones de teclas. Las 25 primeras filas son las
que hoy están en el `switch`; `?` es la única que agrega este workstream.

| # | Teclas | Id | Qué hace | En el README |
|---|---|---|---|---|
| 1 | `Ctrl+Shift+D` | `debug.telemetry` | Abre y cierra la telemetría | **no** |
| 2 | `Ctrl+Z` | `edit.undo` | Deshacer | sí |
| 3 | `Ctrl+Shift+Z` | `edit.redo` | Rehacer | sí |
| 4 | `Ctrl+S` | `file.save` | Guardar | sí |
| 5 | `Ctrl+C` | `edit.copy` | Copiar selección | sí |
| 6 | `Ctrl+X` | `edit.cut` | Cortar selección | sí |
| 7 | `Ctrl+V` | `edit.paste` | Pegar sobre la celda apuntada | sí |
| 8 | `Esc` | `edit.cancel` | Cancela ancla y quita selección | parcial |
| 9 | `Supr`, `Retroceso` | `edit.delete` | Borra la selección | `Supr` sí, `Retroceso` **no** |
| 10 | `↑`, `Re Pág` | `view.layerUp` | Sube una capa | `↑` sí, `Re Pág` **no** |
| 11 | `↓`, `Av Pág` | `view.layerDown` | Baja una capa | `↓` sí, `Av Pág` **no** |
| 12 | `B` | `tool.brush` | Pincel | sí |
| 13 | `E` | `tool.eraser` | Goma | sí |
| 14 | `I` | `tool.picker` | Cuentagotas | sí |
| 15 | `L` | `tool.line` | Línea | sí |
| 16 | `R` | `tool.rect` | Rectángulo | sí |
| 17 | `F` | `tool.fill` | Relleno | sí |
| 18 | `S` | `tool.select` | Selección | sí |
| 19 | `G` | `view.grid` | Grilla | sí |
| 20 | `C` | `view.fit` | Encuadrar | sí (en la tabla de mouse) |
| 21 | `X` | `mirror.x` | Espejo en X | sí |
| 22 | `Z` | `mirror.z` | Espejo en Z | sí |
| 23 | `1` | `view.mode3d` | Vista 3D | sí |
| 24 | `2` | `view.modeBelow` | Hasta la capa actual | sí |
| 25 | `3` | `view.modeIsolate` | Sólo la capa actual | sí |
| 26 | `?` | `help.shortcuts` | Abre el panel de atajos | nuevo |

Y 8 gestos de puntero (`POINTER_SHORTCUTS`), que no viven en el `switch`: click,
shift+click, alt+click, arrastrar, arrastrar en el vacío, botón derecho, botón
del medio, rueda.

### Desincronizaciones encontradas con el README

El README es un subconjunto: no documenta ningún atajo inexistente, pero le
faltan cuatro cosas.

1. **`Ctrl+Shift+D`** (panel de telemetría) no figura en ninguna parte.
2. **`Retroceso`** funciona igual que `Supr`; el README sólo nombra `Supr`.
3. **`Re Pág` / `Av Pág`** funcionan igual que `↑` / `↓`; el README sólo nombra
   las flechas.
4. **`↑` / `↓` sólo hacen algo en modo capa** (`sliceView !== 'off'`); el README
   los presenta como incondicionales. Lo mismo con `Supr`, que exige selección
   activa.

Menores, del mismo tenor: `Esc` no sólo cancela el ancla, también quita la
selección; `C` aparece en la tabla de mouse y no en la lista de atajos de
teclado; y la tabla de controles no menciona el **botón del medio** (acerca y
aleja), que `OrbitControls` sí atiende.

Actualizar el README no es de este workstream —es un archivo compartido— pero
con el panel en la app la lista del README pasa a ser redundante: lo razonable es
reemplazarla por un puntero al panel (`?`). Queda a criterio de la pasada final.
