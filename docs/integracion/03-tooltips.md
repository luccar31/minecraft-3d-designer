# 03 — Tooltips y ayuda contextual · integración

Los tres archivos del workstream ya están en la rama y compilan:
`src/ui/Tip.tsx`, `src/ui/ayuda.ts`, `src/ui/tip.css`. Falta **cablearlos**, y eso
toca archivos compartidos (`App.tsx`, `TopBar.tsx`, `ToolPanel.tsx`,
`PalettePanel.tsx`, `DesignsPanel.tsx`, `AuthPanel.tsx`, `GuideView.tsx`), así que
lo hace la pasada final en serie. Acá está todo resuelto: nada que decidir.

`tip.css` lo importa `Tip.tsx`; **no hay que tocar `styles.css` ni `main.tsx`**.

## Lo que se exporta

```ts
// src/ui/ayuda.ts
type HelpGroup = 'tools' | 'view' | 'mirror' | 'edit' | 'file'
               | 'palette' | 'designs' | 'guide' | 'mouse' | 'debug'

type HelpEntry = {
  titulo: string      // nombre del control, para listarlo fuera de contexto
  que: string         // qué hace, una línea
  como: string        // el gesto o el flujo
  atajo?: string[]    // combinaciones equivalentes, una por `<kbd>`
  grupo: HelpGroup
}

const HELP: { 'topbar.save': HelpEntry, ... }   // 74 entradas
type HelpId = keyof typeof HELP                 // un id inexistente no compila

const GROUPS: { key: HelpGroup; label: string }[]        // orden y rótulos
const HELP_IDS: HelpId[]
helpFor(id: HelpId): HelpEntry                  // id tipado
lookupHelp(id: string): HelpEntry | undefined   // id suelto (04 marca el hueco)
helpByGroup(grupo: HelpGroup): [HelpId, HelpEntry][]
searchHelp(q: string): [HelpId, HelpEntry][]    // nombre, texto o tecla
shortcutLabel(e: HelpEntry): string             // '↑ o AvPág'
helpLine(e: HelpEntry): string                  // la ayuda entera en una línea
```

```tsx
// src/ui/Tip.tsx
<Tip id="tool.line" side="left" extra="Roble">{ <button/> }</Tip>

// side: 'top' (default) | 'bottom' | 'left' | 'right'; se da vuelta solo si no entra.
// extra: dato del ítem concreto, para controles repetidos (bloque, paso de guía).
setTipsEnabled(on: boolean)   // ajuste, persistido en localStorage 'mcb.tips'
tipsEnabled(): boolean
useTipsEnabled(): boolean
```

`Tip` toma **un único elemento** y lo clona: le suma `aria-describedby`,
handlers de puntero, foco y teclado, y encadena los que el elemento ya traiga.
No mete un wrapper en el DOM, así que **no rompe** `.tools` ni `.blocks`, que son
grids. El texto de `aria-describedby` está siempre presente (span oculto en un
portal): el lector de pantalla no depende del hover.

## Notas para 04 y 05

- **04**: `helpByGroup` y `GROUPS` dan el panel agrupado por tarea; `searchHelp`
  el buscador; `shortcutLabel` el `<kbd>`. Para los atajos que 04 saque de
  `atajos.ts` y no estén acá, `lookupHelp` devuelve `undefined` y el panel los
  marca. Los grupos `tools/view/mirror/edit/file/mouse/debug` son exactamente
  los que pide el spec de 04; `palette/designs/guide` son controles sin atajo.
- **05**: los pasos del tutorial mapean así — 1 → `canvas.place`,
  2 → `palette.block`, 3 → `slice.index`, 4 → `topbar.viewGuide`,
  5 → `topbar.save`. `helpFor(id).que` es el título del paso y `.como` la
  instrucción.

## Los 74 ids

| id | grupo | título | qué hace | cómo se usa | atajo |
|---|---|---|---|---|---|
| `topbar.name` | file | Nombre del diseño | El nombre con el que se guarda y el título que sale impreso en la guía. | Escribí encima; se aplica al toque, sin confirmar nada. | — |
| `topbar.designs` | designs | Diseños | Abre la lista de diseños guardados y el formulario para crear uno nuevo. | También es donde cambiás el tamaño de la grilla y entrás a la nube. | — |
| `topbar.save` | file | Guardar | Guarda el diseño abierto donde diga el chip: este navegador o tu cuenta. | Sobrescribe el mismo diseño; para tener dos versiones creá uno nuevo desde Diseños. | `Ctrl+S` |
| `topbar.undo` | edit | Deshacer | Revierte la última edición de bloques. | Un trazo arrastrado cuenta como una sola acción, no como un bloque por vez. | `Ctrl+Z` |
| `topbar.redo` | edit | Rehacer | Vuelve a aplicar lo último que deshiciste. | Se pierde apenas editás algo nuevo después de deshacer. | `Ctrl+Shift+Z` |
| `topbar.viewEdit` | view | Editar | Vuelve al editor 3D, donde se ponen los bloques. | Cambiar de vista no toca el diseño: está todo como lo dejaste. | — |
| `topbar.viewGuide` | view | Guía | Muestra el plano de construcción: una lámina por capa con el código de cada bloque. | Es la vista para tener al lado mientras construís adentro del juego. | — |
| `topbar.printGuide` | file | Imprimir guía | Abre la guía completa en una pestaña nueva, armada para papel. | Desde el diálogo de impresión elegí "Guardar como PDF" si la querés en el celular. | — |
| `topbar.exportJson` | file | Exportar JSON | Descarga el diseño como archivo .mcbp.json, con la grilla y la paleta adentro. | Es el formato para copia de seguridad o para pasárselo a otra persona; vuelve con Importar. | — |
| `topbar.exportSchem` | file | Exportar .schem | Descarga un .schem que se puede pegar directo en el mundo de Minecraft. | Cargalo con WorldEdit o Litematica. Es de ida: el .schem no se vuelve a importar acá. | — |
| `topbar.import` | file | Importar | Carga un .mcbp.json y reemplaza el diseño que tengas abierto. | Elegí el archivo en el diálogo. Guardá antes: lo abierto se pierde sin aviso. | — |
| `topbar.storage` | file | Dónde se guarda | Dice si los diseños quedan en este navegador o sincronizados en tu cuenta. | Marca "este navegador" hasta que inicies sesión desde Diseños → Nube. | — |
| `tool.brush` | tools | Pincel | Coloca el bloque activo pegado a la cara que apuntás. | Click para uno solo, arrastrar para pintar varios seguidos. | `B` |
| `tool.eraser` | tools | Goma | Saca el bloque que apuntás. | Arrastrá para borrar en fila. Con cualquier herramienta, Shift+click hace lo mismo. | `E` |
| `tool.picker` | tools | Cuentagotas | Adopta como bloque activo el del cubo que toques. | Click sobre el bloque a copiar. Alt+click hace lo mismo sin salir del pincel. | `I` |
| `tool.line` | tools | Línea | Traza una línea recta de bloques entre dos puntos. | Click en el inicio y click en el final. Sólo en modo capa; Esc cancela el primer punto. | `L` |
| `tool.rect` | tools | Rectángulo | Dibuja un rectángulo entre dos esquinas, macizo o sólo el borde. | Click en una esquina y click en la opuesta. Sólo en modo capa. | `R` |
| `tool.fill` | tools | Relleno | Llena de una toda el área contigua que tenga el mismo contenido. | Click adentro del área. Sólo en modo capa, y se frena en el borde de la capa. | `F` |
| `tool.select` | tools | Selección | Marca un rectángulo de la capa para copiar, cortar o borrar. | Click en una esquina y click en la opuesta. Sólo en modo capa. | `S` |
| `tool.rectFilled` | tools | Relleno o contorno | Elige si el rectángulo sale macizo o si sólo se dibuja el borde. | Alterna entre las dos opciones; el botón muestra la que está puesta ahora. | — |
| `slice.off` | view | Modo 3D | Muestra la construcción entera, sin recortar nada. | Es el modo para mirar. Línea, rectángulo, relleno y selección necesitan modo capa. | `1` |
| `slice.below` | view | Hasta acá | Esconde todo lo que esté por encima de la capa actual. | Sirve para trabajar el piso de arriba viendo lo que ya construiste abajo. | `2` |
| `slice.isolate` | view | Sólo capa | Muestra únicamente la capa actual, como una hoja cuadriculada. | El modo más preciso para dibujar planta por planta. | `3` |
| `slice.axisY` | view | Eje Y | Corta en capas horizontales: cada capa es un piso. | Es el eje que usa la guía impresa. Si dudás, empezá por acá. | — |
| `slice.axisX` | view | Eje X | Corta en rebanadas verticales de este a oeste. | Cómodo para levantar paredes y mirar el perfil del edificio. | — |
| `slice.axisZ` | view | Eje Z | Corta en rebanadas verticales de norte a sur. | Cómodo para trabajar una fachada mirándola de frente. | — |
| `slice.index` | view | Capa activa | Elige qué capa del eje elegido estás editando. | Arrastrá el control, o usá las flechas del teclado con el foco fuera de un campo. | `↑` `↓` `RePág` `AvPág` |
| `slice.up` | view | Subir una capa | Pasa a la capa siguiente del eje elegido. | Se frena en la última capa de la grilla. | `↑` `AvPág` |
| `slice.down` | view | Bajar una capa | Vuelve a la capa anterior del eje elegido. | Se frena en la capa 0. | `↓` `RePág` |
| `mirror.x` | mirror | Espejo X | Cada bloque que pongas se duplica del otro lado del centro en X. | Dejalo prendido mientras construís: no espeja lo que ya estaba puesto. | `X` |
| `mirror.z` | mirror | Espejo Z | Cada bloque que pongas se duplica del otro lado del centro en Z. | Prendé los dos espejos juntos para simetría en cruz. | `Z` |
| `selection.copy` | edit | Copiar | Copia los bloques de la selección al portapapeles interno. | Después pegá con Ctrl+V apuntando la capa destino. | `Ctrl+C` |
| `selection.cut` | edit | Cortar | Copia la selección y la borra de la capa. | Igual que copiar, pero deja el hueco. Se pega con Ctrl+V. | `Ctrl+X` |
| `selection.paste` | edit | Pegar | Pega lo copiado tomando el cursor como esquina. | Poné el puntero sobre la capa destino y apretá Ctrl+V. Sin puntero sobre la grilla no pega. | `Ctrl+V` |
| `selection.delete` | edit | Borrar selección | Vacía todos los bloques que estén adentro del rectángulo marcado. | Se deshace con Ctrl+Z como cualquier otra edición. | `Supr` `Retroceso` |
| `selection.clear` | edit | Quitar selección | Suelta el rectángulo marcado sin tocar ningún bloque. | Esc también cancela el primer click pendiente de línea o rectángulo. | `Esc` |
| `view.fit` | view | Centrar | Mueve la cámara para que entre toda la construcción en pantalla. | Es la salida cuando te perdiste orbitando o abriste un diseño grande. | `C` |
| `view.grid` | view | Grilla | Muestra u oculta las líneas del piso y el contorno de la grilla. | Apagala para mirar el resultado limpio; no cambia nada de lo que se exporta. | `G` |
| `palette.current` | palette | Bloque activo | El bloque que van a colocar el pincel y las herramientas de área. | Cambialo eligiendo otro de la grilla, o con el cuentagotas sobre algo ya construido. | — |
| `palette.search` | palette | Buscar bloque | Filtra la paleta por nombre o por id de Minecraft. | Escribí parte del nombre ("roble") o del id ("oak"). Se suma al filtro de categoría. | — |
| `palette.catAll` | palette | Todos | Saca el filtro de categoría y muestra la paleta completa. | Combinalo con el buscador cuando no sabés en qué categoría cae el bloque. | — |
| `palette.catStone` | palette | Piedra | Deja a la vista piedra, adoquín, ladrillo de piedra y derivados. | Es la categoría de estructura: cimientos, muros, torres. | — |
| `palette.catWood` | palette | Madera | Deja a la vista troncos y tablas de cada tipo de árbol. | La categoría de pisos, vigas y techos. | — |
| `palette.catNature` | palette | Naturaleza | Deja a la vista pasto, tierra, arena, grava y hojas. | Para el terreno y el jardín alrededor de la construcción. | — |
| `palette.catWool` | palette | Lana | Deja a la vista las dieciséis lanas de color. | La forma más barata de meter color; ojo que la lana se prende fuego. | — |
| `palette.catConcrete` | palette | Concreto | Deja a la vista los concretos de color, planos y sin veteado. | El color liso para fachadas modernas, y no arde como la lana. | — |
| `palette.catDecorative` | palette | Decorativo | Deja a la vista vidrio, cuarzo, obsidiana y demás bloques de detalle. | Para ventanas, molduras y remates. | — |
| `palette.block` | palette | Bloque de la paleta | Lo vuelve el bloque activo con el que vas a pintar. | Un click alcanza. El nombre y el id de Minecraft salen en su ayuda. | — |
| `designs.name` | designs | Nombre del diseño nuevo | El nombre que va a llevar el diseño que crees con el botón Crear. | No renombra el diseño abierto: para eso está el campo de la barra de arriba. | — |
| `designs.dimX` | designs | Ancho (X) | Cuántos bloques mide la grilla de este a oeste. | Vale tanto para Crear como para Redimensionar. Máximo 256. | — |
| `designs.dimY` | designs | Alto (Y) | Cuántas capas de altura tiene la grilla, o sea cuántos pasos va a tener la guía. | Vale tanto para Crear como para Redimensionar. Máximo 256. | — |
| `designs.dimZ` | designs | Largo (Z) | Cuántos bloques mide la grilla de norte a sur. | Vale tanto para Crear como para Redimensionar. Máximo 256. | — |
| `designs.create` | designs | Crear | Abre un diseño vacío con el nombre y las medidas de arriba. | Reemplaza lo que tengas abierto. Guardá antes si te importa. | — |
| `designs.resize` | designs | Redimensionar el actual | Cambia la grilla del diseño abierto a las medidas de arriba. | Los bloques que queden fuera del tamaño nuevo se descartan. | — |
| `designs.open` | designs | Abrir | Carga ese diseño guardado en el editor. | Reemplaza lo que tengas abierto sin preguntar. | — |
| `designs.delete` | designs | Borrar diseño | Elimina ese diseño de la lista, para siempre. | Ctrl+Z no lo trae de vuelta. Exportá a JSON antes si querés una copia. | — |
| `designs.close` | designs | Cerrar | Cierra el panel y vuelve al editor. | Un click fuera del panel hace lo mismo. Nada de lo que hiciste acá se pierde. | — |
| `auth.email` | designs | Email para la nube | La dirección a la que se manda el link de acceso. | No hay contraseña: llega un link y con abrirlo quedás adentro. | — |
| `auth.send` | designs | Enviar link | Manda el link de acceso al email de al lado. | Abrilo en este mismo navegador; recién ahí los diseños pasan a guardarse en tu cuenta. | — |
| `auth.signOut` | designs | Salir | Cierra la sesión de la nube en este navegador. | Los diseños de la cuenta dejan de verse; los de este navegador siguen donde estaban. | — |
| `guide.print` | guide | Imprimir / PDF | Abre la guía entera en una pestaña armada para papel. | Elegí "Guardar como PDF" en el diálogo del navegador para llevarla en el celular. | — |
| `guide.prev` | guide | Paso anterior | Vuelve a la capa anterior de la guía. | Se deshabilita cuando ya estás en el primer paso. | — |
| `guide.next` | guide | Paso siguiente | Avanza a la capa siguiente de la guía. | Se deshabilita cuando ya estás en el último paso. | — |
| `guide.steps` | guide | Tira de pasos | Salta directo a cualquier capa de la guía. | Cada botón es un paso; los que muestran dos alturas son capas idénticas agrupadas. | — |
| `guide.back` | guide | Ir al editor | Vuelve al editor 3D para empezar a poner bloques. | Aparece cuando la guía está vacía porque el diseño todavía no tiene nada. | — |
| `panel.materials` | guide | Materiales | Cuenta cuántos bloques de cada tipo lleva el diseño, ordenados por cantidad. | Es la lista de compras. La guía impresa repite el total convertido a stacks. | — |
| `canvas.place` | mouse | Colocar bloque | Pone el bloque activo pegado a la cara que apuntás. | Click izquierdo, sobre el piso de la grilla o sobre un bloque ya puesto. | `Click` |
| `canvas.erase` | mouse | Borrar apuntando | Saca el bloque que estés apuntando, sea cual sea la herramienta. | Shift+click. Es el atajo para no cambiar de herramienta por un bloque suelto. | `Shift+click` |
| `canvas.pick` | mouse | Copiar el bloque apuntado | Vuelve bloque activo el que estés apuntando. | Alt+click, sin salir de la herramienta que tengas puesta. | `Alt+click` |
| `canvas.paint` | mouse | Pintar arrastrando | Coloca o borra en fila mientras movés el puntero apretado. | Mantené apretado y arrastrá. Todo el trazo se deshace de una con Ctrl+Z. | `Arrastrar` |
| `canvas.orbit` | mouse | Orbitar la cámara | Gira la vista alrededor de la construcción. | Arrastrá sobre el fondo vacío. Si arrancás sobre un bloque, pintás en vez de girar. | `Arrastrar en el vacío` |
| `canvas.pan` | mouse | Desplazar la cámara | Corre el centro de la vista sin girarla. | Arrastrá con el botón derecho. | `Botón derecho` |
| `canvas.zoom` | mouse | Acercar y alejar | Acerca o aleja la cámara del centro de la vista. | Rueda del mouse. Si te fuiste muy lejos, Centrar vuelve a encuadrar todo. | `Rueda` |
| `debug.panel` | debug | Telemetría | Abre el panel de diagnóstico con los últimos eventos que registró la app. | Ctrl+Shift+D lo abre y lo cierra. Sirve para reportar bugs, no para construir. | `Ctrl+Shift+D` |

## Cableado

Siete archivos compartidos. El parche de abajo está **verificado**: se aplicó
sobre `6184f6e`, pasó `tsc --noEmit`, `vite build` y los 8 tests de
`tests/editor.spec.ts`, y se comprobó en el navegador que los tooltips salen
donde tienen que salir. Después se revirtió, porque estos archivos no son de
este workstream.

Se aplica con:

```
git apply docs/integracion/03-tooltips.patch   # o pegando el bloque de abajo
npx tsc --noEmit
PLAYWRIGHT_PORT=<el del worktree> npx playwright test
```

### Qué recibe cada control

| archivo | control | id | side |
|---|---|---|---|
| TopBar | input de nombre | `topbar.name` | bottom |
| TopBar | Diseños | `topbar.designs` | bottom |
| TopBar | Guardar | `topbar.save` | bottom |
| TopBar | ↶ | `topbar.undo` | bottom |
| TopBar | ↷ | `topbar.redo` | bottom |
| TopBar | Editar | `topbar.viewEdit` | bottom |
| TopBar | Guía | `topbar.viewGuide` | bottom |
| TopBar | Imprimir guía | `topbar.printGuide` | bottom |
| TopBar | Exportar JSON | `topbar.exportJson` | bottom |
| TopBar | Exportar .schem | `topbar.exportSchem` | bottom |
| TopBar | Importar | `topbar.import` | bottom |
| TopBar | chip de almacenamiento | `topbar.storage` | bottom |
| ToolPanel | las 7 herramientas | `` `tool.${t.id}` `` | left |
| ToolPanel | relleno / contorno | `tool.rectFilled` | left |
| ToolPanel | 3D / Hasta acá / Sólo capa | `slice.off` `slice.below` `slice.isolate` | left |
| ToolPanel | ejes Y / X / Z | `AXES[].tip` | left |
| ToolPanel | slider de capa | `slice.index` | left |
| ToolPanel | ▼ / ▲ | `slice.down` / `slice.up` | left |
| ToolPanel | Espejo X / Z | `mirror.x` / `mirror.z` | left |
| ToolPanel | Copiar / Cortar / Borrar / Quitar | `selection.*` | left |
| ToolPanel | encabezado Materiales | `panel.materials` | left |
| PalettePanel | chip del bloque activo | `palette.current` | right |
| PalettePanel | buscador | `palette.search` | right |
| PalettePanel | Todos | `palette.catAll` | right |
| PalettePanel | las 6 categorías | `CAT_TIPS[c.key]` | right |
| PalettePanel | cada bloque | `palette.block` + `extra` | right |
| DesignsPanel | nombre, X, Y, Z | `designs.name` `designs.dim{X,Y,Z}` | top |
| DesignsPanel | Crear / Redimensionar | `designs.create` / `designs.resize` | top |
| DesignsPanel | Abrir / ✕ | `designs.open` / `designs.delete` + `extra` | top |
| DesignsPanel | Cerrar | `designs.close` | top |
| AuthPanel | email / Enviar link / Salir | `auth.email` `auth.send` `auth.signOut` | top |
| App | Centrar / Grilla | `view.fit` / `view.grid` | top |
| GuideView | Imprimir / PDF | `guide.print` | bottom |
| GuideView | tira de pasos | `guide.steps` + `extra` | bottom |
| GuideView | ← Anterior / Siguiente → | `guide.prev` / `guide.next` | bottom |
| GuideView | Ir al editor | `guide.back` | top |

### Ids que no se cablean como tooltip

`canvas.place`, `canvas.erase`, `canvas.pick`, `canvas.paint`, `canvas.orbit`,
`canvas.pan`, `canvas.zoom`, `selection.paste` y `debug.panel` describen gestos
sobre el viewport y atajos sin botón. **No llevan `<Tip>`**: un tooltip sobre el
canvas taparía justo lo que se está dibujando. Existen en el catálogo porque son
lo que consume el panel de atajos de 04 (grupos `mouse` y `debug`) y el paso 1
del tutorial de 05.

### Detalles que el parche resuelve, para que no se re-decidan

- **Se borran los `title` nativos** de los controles envueltos: si no, aparecen
  los dos tooltips, el propio y el del sistema operativo.
- **`tabIndex={0}`** en tres elementos no focusables que igual llevan ayuda: el
  chip de almacenamiento, el chip del bloque activo y el `<h3>Materiales</h3>`.
  Sin eso el criterio 2 (abrir con Tab) no se cumple para ellos.
- **`ToolPanel`**: `AXES` pierde el campo `help` (lo reemplaza `tip: HelpId`) y
  gana el `tip`. Los campos `label` y `key` de `TOOLS` quedan sin uso una vez que
  se va el `title`; se dejan porque 04 se los lleva a `atajos.ts`.
- **`PalettePanel`**: los ~60 botones de bloque comparten `palette.block` y
  pasan el nombre y el id por `extra`, que es lo que antes decía el `title`.
  Se agrega el mapa `CAT_TIPS: Record<Category, HelpId>` arriba del componente.
- **Botones deshabilitados** (↶ sin historial, Copiar sin selección) no emiten
  eventos de puntero en Chrome, así que no muestran tooltip. Es la misma
  limitación que tenía `title`; `aria-describedby` sí queda puesto.
- **No hace falta importar `tip.css`** en ningún lado: lo importa `Tip.tsx`.

### El parche

```diff
diff --git a/src/App.tsx b/src/App.tsx
index df1466a..8e9f070 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -7,6 +7,7 @@ import { DesignsPanel } from './ui/DesignsPanel'
 import { DebugPanel } from './ui/DebugPanel'
 import { useEditor } from './state/store'
 import { hasWebGL } from './ui/ErrorBoundary'
+import { Tip } from './ui/Tip'
 import { worldToPlane } from './voxel/ops'
 import { EV, packMods, rec, str, touchClock } from './debug'
 import type { Tool } from './types'
@@ -134,16 +135,17 @@ export default function App() {
               </div>
             )}
             <div className="view-tools">
-              <button onClick={() => useEditor.getState().requestFit()} title="Encuadrar la construcción (C)">
-                Centrar
-              </button>
-              <button
-                className={showGrid ? 'on' : ''}
-                onClick={() => useEditor.getState().toggle('showGrid')}
-                title="Mostrar u ocultar la grilla (G)"
-              >
-                Grilla
-              </button>
+              <Tip id="view.fit">
+                <button onClick={() => useEditor.getState().requestFit()}>Centrar</button>
+              </Tip>
+              <Tip id="view.grid">
+                <button
+                  className={showGrid ? 'on' : ''}
+                  onClick={() => useEditor.getState().toggle('showGrid')}
+                >
+                  Grilla
+                </button>
+              </Tip>
             </div>
           </div>
           <ToolPanel />
diff --git a/src/ui/AuthPanel.tsx b/src/ui/AuthPanel.tsx
index 0b07a3e..abd6070 100644
--- a/src/ui/AuthPanel.tsx
+++ b/src/ui/AuthPanel.tsx
@@ -1,6 +1,7 @@
 import { useEffect, useState } from 'react'
 import { getSupabase, setSignedIn, supabaseConfigured } from '../storage'
 import { useEditor } from '../state/store'
+import { Tip } from './Tip'
 
 /**
  * Magic-link login: lets a design saved on your computer show up on your
@@ -50,17 +51,19 @@ export function AuthPanel() {
         <h3>Nube</h3>
         <div className="row">
           <span className="label">Sesión: <b>{user}</b></span>
-          <button
-            className="ghost"
-            onClick={async () => {
-              await getSupabase()?.auth.signOut()
-              setSignedIn(false)
-              sync()
-              refresh()
-            }}
-          >
-            Salir
-          </button>
+          <Tip id="auth.signOut">
+            <button
+              className="ghost"
+              onClick={async () => {
+                await getSupabase()?.auth.signOut()
+                setSignedIn(false)
+                sync()
+                refresh()
+              }}
+            >
+              Salir
+            </button>
+          </Tip>
         </div>
       </div>
     )
@@ -73,13 +76,16 @@ export function AuthPanel() {
         <p className="hint">Te mandamos un link a <b>{email}</b>. Abrilo para iniciar sesión.</p>
       ) : (
         <div className="row">
-          <input
-            type="email"
-            placeholder="tu@email.com"
-            value={email}
-            onChange={(e) => setEmail(e.target.value)}
-            aria-label="Email"
-          />
+          <Tip id="auth.email">
+            <input
+              type="email"
+              placeholder="tu@email.com"
+              value={email}
+              onChange={(e) => setEmail(e.target.value)}
+              aria-label="Email"
+            />
+          </Tip>
+          <Tip id="auth.send">
           <button
             onClick={async () => {
               setErr(null)
@@ -96,6 +102,7 @@ export function AuthPanel() {
           >
             Enviar link
           </button>
+          </Tip>
         </div>
       )}
       {err && <p className="err">{err}</p>}
diff --git a/src/ui/DesignsPanel.tsx b/src/ui/DesignsPanel.tsx
index d4caca9..74582e2 100644
--- a/src/ui/DesignsPanel.tsx
+++ b/src/ui/DesignsPanel.tsx
@@ -1,6 +1,7 @@
 import { useEffect, useState } from 'react'
 import { useEditor } from '../state/store'
 import { AuthPanel } from './AuthPanel'
+import { Tip } from './Tip'
 import { MAX_AXIS } from '../types'
 
 export function DesignsPanel({ onClose }: { onClose: () => void }) {
@@ -32,45 +33,56 @@ export function DesignsPanel({ onClose }: { onClose: () => void }) {
         <div className="section">
           <h3>Nuevo diseño</h3>
           <div className="row" style={{ marginBottom: 8 }}>
-            <input
-              type="text"
-              value={newName}
-              onChange={(e) => setNewName(e.target.value)}
-              placeholder="Nombre"
-              aria-label="Nombre del diseño nuevo"
-            />
+            <Tip id="designs.name">
+              <input
+                type="text"
+                value={newName}
+                onChange={(e) => setNewName(e.target.value)}
+                placeholder="Nombre"
+                aria-label="Nombre del diseño nuevo"
+              />
+            </Tip>
           </div>
           <div className="grid3" style={{ marginBottom: 8 }}>
             <label className="label">
               Ancho (X)
-              <input type="number" min={1} max={MAX_AXIS} value={dx} onChange={(e) => setDx(Number(e.target.value))} />
+              <Tip id="designs.dimX">
+                <input type="number" min={1} max={MAX_AXIS} value={dx} onChange={(e) => setDx(Number(e.target.value))} />
+              </Tip>
             </label>
             <label className="label">
               Alto (Y)
-              <input type="number" min={1} max={MAX_AXIS} value={dy} onChange={(e) => setDy(Number(e.target.value))} />
+              <Tip id="designs.dimY">
+                <input type="number" min={1} max={MAX_AXIS} value={dy} onChange={(e) => setDy(Number(e.target.value))} />
+              </Tip>
             </label>
             <label className="label">
               Largo (Z)
-              <input type="number" min={1} max={MAX_AXIS} value={dz} onChange={(e) => setDz(Number(e.target.value))} />
+              <Tip id="designs.dimZ">
+                <input type="number" min={1} max={MAX_AXIS} value={dz} onChange={(e) => setDz(Number(e.target.value))} />
+              </Tip>
             </label>
           </div>
           <div className="row">
-            <button
-              onClick={() => {
-                s.newDesign({ x: clampAxis(dx), y: clampAxis(dy), z: clampAxis(dz) }, newName)
-                onClose()
-              }}
-              data-testid="create-design"
-            >
-              Crear
-            </button>
-            <button
-              className="ghost"
-              onClick={() => s.resize({ x: clampAxis(dx), y: clampAxis(dy), z: clampAxis(dz) })}
-              title="Cambia el tamaño del diseño actual; lo que quede fuera se descarta"
-            >
-              Redimensionar el actual
-            </button>
+            <Tip id="designs.create">
+              <button
+                onClick={() => {
+                  s.newDesign({ x: clampAxis(dx), y: clampAxis(dy), z: clampAxis(dz) }, newName)
+                  onClose()
+                }}
+                data-testid="create-design"
+              >
+                Crear
+              </button>
+            </Tip>
+            <Tip id="designs.resize">
+              <button
+                className="ghost"
+                onClick={() => s.resize({ x: clampAxis(dx), y: clampAxis(dy), z: clampAxis(dz) })}
+              >
+                Redimensionar el actual
+              </button>
+            </Tip>
           </div>
         </div>
 
@@ -89,17 +101,21 @@ export function DesignsPanel({ onClose }: { onClose: () => void }) {
                       {new Date(d.updatedAt).toLocaleString('es-AR')}
                     </span>
                   </div>
-                  <button
-                    onClick={async () => {
-                      await s.openDesign(d.id)
-                      onClose()
-                    }}
-                  >
-                    Abrir
-                  </button>
-                  <button className="danger ghost" onClick={() => s.deleteDesign(d.id)} title="Borrar">
-                    ✕
-                  </button>
+                  <Tip id="designs.open" extra={d.name}>
+                    <button
+                      onClick={async () => {
+                        await s.openDesign(d.id)
+                        onClose()
+                      }}
+                    >
+                      Abrir
+                    </button>
+                  </Tip>
+                  <Tip id="designs.delete" extra={d.name}>
+                    <button className="danger ghost" onClick={() => s.deleteDesign(d.id)}>
+                      ✕
+                    </button>
+                  </Tip>
                 </div>
               ))}
             </div>
@@ -107,7 +123,9 @@ export function DesignsPanel({ onClose }: { onClose: () => void }) {
         </div>
 
         <div className="row" style={{ justifyContent: 'flex-end' }}>
-          <button onClick={onClose}>Cerrar</button>
+          <Tip id="designs.close">
+            <button onClick={onClose}>Cerrar</button>
+          </Tip>
         </div>
       </div>
     </div>
diff --git a/src/ui/GuideView.tsx b/src/ui/GuideView.tsx
index 29c810e..83813bd 100644
--- a/src/ui/GuideView.tsx
+++ b/src/ui/GuideView.tsx
@@ -2,6 +2,7 @@ import { useMemo, useState } from 'react'
 import { useEditor } from '../state/store'
 import { blockDef } from '../blocks/palette'
 import { buildGuide, luminance, openPrintableGuide, stacksLabel, type Guide, type GuideStep } from '../export/guide'
+import { Tip } from './Tip'
 
 function LayerSvg({ step, guide, cell = 24 }: { step: GuideStep; guide: Guide; cell?: number }) {
   const pad = 22
@@ -92,7 +93,9 @@ export function GuideView() {
         <div className="empty" style={{ maxWidth: 460, margin: '60px auto' }}>
           Todavía no hay bloques. Volvé al editor y construí algo.
           <div style={{ marginTop: 12 }}>
-            <button onClick={() => setView('edit')}>Ir al editor</button>
+            <Tip id="guide.back">
+              <button onClick={() => setView('edit')}>Ir al editor</button>
+            </Tip>
           </div>
         </div>
       </div>
@@ -109,30 +112,43 @@ export function GuideView() {
           {guide.totalBlocks} bloques · {guide.steps.length} pasos ·
           ocupa {guide.width}×{guide.height}×{guide.depth}
         </span>
-        <button onClick={() => openPrintableGuide(guide, meta)}>Imprimir / PDF</button>
+        <Tip id="guide.print" side="bottom">
+          <button onClick={() => openPrintableGuide(guide, meta)}>Imprimir / PDF</button>
+        </Tip>
       </div>
 
       <div className="steps-strip">
         {guide.steps.map((s, idx) => (
-          <button key={s.n} className={idx === i ? 'on' : ''} onClick={() => setI(idx)}>
-            {s.repeat > 1 ? `y${s.fromY}–${s.toY}` : `y${s.fromY}`}
-          </button>
+          <Tip
+            key={s.n}
+            id="guide.steps"
+            side="bottom"
+            extra={s.repeat > 1 ? `Paso ${s.n}: capas y${s.fromY} a y${s.toY}` : `Paso ${s.n}: capa y${s.fromY}`}
+          >
+            <button className={idx === i ? 'on' : ''} onClick={() => setI(idx)}>
+              {s.repeat > 1 ? `y${s.fromY}–${s.toY}` : `y${s.fromY}`}
+            </button>
+          </Tip>
         ))}
       </div>
 
       <div className="nav">
-        <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>← Anterior</button>
+        <Tip id="guide.prev" side="bottom">
+          <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>← Anterior</button>
+        </Tip>
         <b data-testid="guide-step">
           Paso {step.n} de {guide.steps.length} — capa y = {step.fromY}
           {step.repeat > 1 ? ` a ${step.toY}` : ''}
         </b>
         {step.repeat > 1 && <span className="rep">repetir {step.repeat}×</span>}
-        <button
-          onClick={() => setI((v) => Math.min(guide.steps.length - 1, v + 1))}
-          disabled={i >= guide.steps.length - 1}
-        >
-          Siguiente →
-        </button>
+        <Tip id="guide.next" side="bottom">
+          <button
+            onClick={() => setI((v) => Math.min(guide.steps.length - 1, v + 1))}
+            disabled={i >= guide.steps.length - 1}
+          >
+            Siguiente →
+          </button>
+        </Tip>
       </div>
 
       <div className="guide-cols">
diff --git a/src/ui/PalettePanel.tsx b/src/ui/PalettePanel.tsx
index 0740365..eada9a0 100644
--- a/src/ui/PalettePanel.tsx
+++ b/src/ui/PalettePanel.tsx
@@ -2,6 +2,17 @@ import { useMemo, useState } from 'react'
 import { BLOCKS, CATEGORIES, blockDef, type Category } from '../blocks/palette'
 import { blockThumbnail } from '../blocks/atlas'
 import { useEditor } from '../state/store'
+import { Tip } from './Tip'
+import type { HelpId } from './ayuda'
+
+const CAT_TIPS: Record<Category, HelpId> = {
+  stone: 'palette.catStone',
+  wood: 'palette.catWood',
+  nature: 'palette.catNature',
+  wool: 'palette.catWool',
+  concrete: 'palette.catConcrete',
+  decorative: 'palette.catDecorative',
+}
 
 export function PalettePanel() {
   const block = useEditor((s) => s.block)
@@ -22,46 +33,59 @@ export function PalettePanel() {
 
   return (
     <div className="side">
-      <div className="current">
-        <img src={blockThumbnail(current.tex.side)} alt="" />
-        <div style={{ minWidth: 0 }}>
-          <div className="nm">{current.name}</div>
-          <div className="id">{current.id.replace('minecraft:', '')}</div>
+      <Tip id="palette.current" side="right">
+        <div className="current" tabIndex={0}>
+          <img src={blockThumbnail(current.tex.side)} alt="" />
+          <div style={{ minWidth: 0 }}>
+            <div className="nm">{current.name}</div>
+            <div className="id">{current.id.replace('minecraft:', '')}</div>
+          </div>
         </div>
-      </div>
+      </Tip>
 
       <div className="section">
-        <input
-          type="text"
-          placeholder="Buscar bloque…"
-          value={q}
-          onChange={(e) => setQ(e.target.value)}
-          aria-label="Buscar bloque"
-        />
+        <Tip id="palette.search" side="right">
+          <input
+            type="text"
+            placeholder="Buscar bloque…"
+            value={q}
+            onChange={(e) => setQ(e.target.value)}
+            aria-label="Buscar bloque"
+          />
+        </Tip>
       </div>
 
       <div className="cats">
-        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
-          Todos
-        </button>
-        {CATEGORIES.map((c) => (
-          <button key={c.key} className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
-            {c.label}
+        <Tip id="palette.catAll" side="right">
+          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
+            Todos
           </button>
+        </Tip>
+        {CATEGORIES.map((c) => (
+          <Tip key={c.key} id={CAT_TIPS[c.key]} side="right">
+            <button className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
+              {c.label}
+            </button>
+          </Tip>
         ))}
       </div>
 
       <div className="blocks">
         {list.map((b) => (
-          <button
+          <Tip
             key={b.id}
-            className={`blk${b.id === block ? ' sel' : ''}`}
-            title={`${b.name}\n${b.id}`}
-            onClick={() => setBlock(b.id)}
-            data-block={b.id}
+            id="palette.block"
+            side="right"
+            extra={`${b.name} · ${b.id.replace('minecraft:', '')}`}
           >
-            <img src={blockThumbnail(b.tex.side)} alt={b.name} />
-          </button>
+            <button
+              className={`blk${b.id === block ? ' sel' : ''}`}
+              onClick={() => setBlock(b.id)}
+              data-block={b.id}
+            >
+              <img src={blockThumbnail(b.tex.side)} alt={b.name} />
+            </button>
+          </Tip>
         ))}
       </div>
       {list.length === 0 && <p className="hint" style={{ marginTop: 10 }}>Sin resultados.</p>}
diff --git a/src/ui/ToolPanel.tsx b/src/ui/ToolPanel.tsx
index fe4cbaf..7ab9674 100644
--- a/src/ui/ToolPanel.tsx
+++ b/src/ui/ToolPanel.tsx
@@ -3,6 +3,8 @@ import { useEditor } from '../state/store'
 import { blockDef } from '../blocks/palette'
 import { sliceExtent } from '../voxel/ops'
 import { stacksLabel } from '../export/guide'
+import { Tip } from './Tip'
+import type { HelpId } from './ayuda'
 import type { Axis, Tool } from '../types'
 
 const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
@@ -15,10 +17,10 @@ const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
   { id: 'select', icon: '⬚', label: 'Selección (modo capa)', key: 'S' },
 ]
 
-const AXES: { id: Axis; label: string; help: string }[] = [
-  { id: 'y', label: 'Y', help: 'Capas horizontales — pisos' },
-  { id: 'x', label: 'X', help: 'Cortes verticales este-oeste — paredes' },
-  { id: 'z', label: 'Z', help: 'Cortes verticales norte-sur — fachadas' },
+const AXES: { id: Axis; label: string; tip: HelpId }[] = [
+  { id: 'y', label: 'Y', tip: 'slice.axisY' },
+  { id: 'x', label: 'X', tip: 'slice.axisX' },
+  { id: 'z', label: 'Z', tip: 'slice.axisZ' },
 ]
 
 export function ToolPanel() {
@@ -39,22 +41,24 @@ export function ToolPanel() {
         <h3>Herramienta</h3>
         <div className="tools">
           {TOOLS.map((t) => (
-            <button
-              key={t.id}
-              className={s.tool === t.id ? 'on' : ''}
-              title={`${t.label} (${t.key})`}
-              onClick={() => s.setTool(t.id)}
-              data-tool={t.id}
-            >
-              {t.icon}
-            </button>
+            <Tip key={t.id} id={`tool.${t.id}`} side="left">
+              <button
+                className={s.tool === t.id ? 'on' : ''}
+                onClick={() => s.setTool(t.id)}
+                data-tool={t.id}
+              >
+                {t.icon}
+              </button>
+            </Tip>
           ))}
         </div>
         {s.tool === 'rect' && (
           <div className="toggles" style={{ marginTop: 6 }}>
-            <button className={s.rectFilled ? 'on' : ''} onClick={() => s.toggle('rectFilled')}>
-              {s.rectFilled ? 'Relleno' : 'Contorno'}
-            </button>
+            <Tip id="tool.rectFilled" side="left">
+              <button className={s.rectFilled ? 'on' : ''} onClick={() => s.toggle('rectFilled')}>
+                {s.rectFilled ? 'Relleno' : 'Contorno'}
+              </button>
+            </Tip>
           </div>
         )}
         {s.anchor && (
@@ -67,49 +71,61 @@ export function ToolPanel() {
       <div className="section">
         <h3>Modo capa</h3>
         <div className="toggles">
-          <button className={s.sliceView === 'off' ? 'on' : ''} onClick={() => s.setSliceView('off')}>
-            3D
-          </button>
-          <button className={s.sliceView === 'below' ? 'on' : ''} onClick={() => s.setSliceView('below')}>
-            Hasta acá
-          </button>
-          <button className={s.sliceView === 'isolate' ? 'on' : ''} onClick={() => s.setSliceView('isolate')}>
-            Sólo capa
-          </button>
+          <Tip id="slice.off" side="left">
+            <button className={s.sliceView === 'off' ? 'on' : ''} onClick={() => s.setSliceView('off')}>
+              3D
+            </button>
+          </Tip>
+          <Tip id="slice.below" side="left">
+            <button className={s.sliceView === 'below' ? 'on' : ''} onClick={() => s.setSliceView('below')}>
+              Hasta acá
+            </button>
+          </Tip>
+          <Tip id="slice.isolate" side="left">
+            <button className={s.sliceView === 'isolate' ? 'on' : ''} onClick={() => s.setSliceView('isolate')}>
+              Sólo capa
+            </button>
+          </Tip>
         </div>
 
         {s.sliceView !== 'off' && (
           <>
             <div className="toggles" style={{ marginTop: 7 }}>
               {AXES.map((a) => (
-                <button
-                  key={a.id}
-                  title={a.help}
-                  className={s.sliceAxis === a.id ? 'on' : ''}
-                  onClick={() => s.setSliceAxis(a.id)}
-                >
-                  {a.label}
-                </button>
+                <Tip key={a.id} id={a.tip} side="left">
+                  <button
+                    className={s.sliceAxis === a.id ? 'on' : ''}
+                    onClick={() => s.setSliceAxis(a.id)}
+                  >
+                    {a.label}
+                  </button>
+                </Tip>
               ))}
             </div>
             <div className="slice-num" data-testid="slice-index">
               {s.sliceAxis} = {s.sliceIndex}
             </div>
-            <input
-              type="range"
-              min={0}
-              max={max}
-              value={s.sliceIndex}
-              onChange={(e) => s.setSliceIndex(Number(e.target.value))}
-              aria-label="Índice de capa"
-            />
+            <Tip id="slice.index" side="left">
+              <input
+                type="range"
+                min={0}
+                max={max}
+                value={s.sliceIndex}
+                onChange={(e) => s.setSliceIndex(Number(e.target.value))}
+                aria-label="Índice de capa"
+              />
+            </Tip>
             <div className="row" style={{ marginTop: 5 }}>
-              <button className="ghost" onClick={() => s.setSliceIndex(s.sliceIndex - 1)} disabled={s.sliceIndex === 0}>
-                ▼
-              </button>
-              <button className="ghost" onClick={() => s.setSliceIndex(s.sliceIndex + 1)} disabled={s.sliceIndex >= max}>
-                ▲
-              </button>
+              <Tip id="slice.down" side="left">
+                <button className="ghost" onClick={() => s.setSliceIndex(s.sliceIndex - 1)} disabled={s.sliceIndex === 0}>
+                  ▼
+                </button>
+              </Tip>
+              <Tip id="slice.up" side="left">
+                <button className="ghost" onClick={() => s.setSliceIndex(s.sliceIndex + 1)} disabled={s.sliceIndex >= max}>
+                  ▲
+                </button>
+              </Tip>
               <span className="label">de 0 a {max}</span>
             </div>
           </>
@@ -119,12 +135,16 @@ export function ToolPanel() {
       <div className="section">
         <h3>Simetría</h3>
         <div className="toggles">
-          <button className={s.mirrorX ? 'on' : ''} onClick={() => s.toggle('mirrorX')} title="Espejar en X">
-            Espejo X
-          </button>
-          <button className={s.mirrorZ ? 'on' : ''} onClick={() => s.toggle('mirrorZ')} title="Espejar en Z">
-            Espejo Z
-          </button>
+          <Tip id="mirror.x" side="left">
+            <button className={s.mirrorX ? 'on' : ''} onClick={() => s.toggle('mirrorX')}>
+              Espejo X
+            </button>
+          </Tip>
+          <Tip id="mirror.z" side="left">
+            <button className={s.mirrorZ ? 'on' : ''} onClick={() => s.toggle('mirrorZ')}>
+              Espejo Z
+            </button>
+          </Tip>
         </div>
       </div>
 
@@ -132,10 +152,18 @@ export function ToolPanel() {
         <div className="section">
           <h3>Selección</h3>
           <div className="toggles">
-            <button onClick={() => s.copySelection(false)} disabled={!s.selection}>Copiar</button>
-            <button onClick={() => s.copySelection(true)} disabled={!s.selection}>Cortar</button>
-            <button className="danger" onClick={() => s.deleteSelection()} disabled={!s.selection}>Borrar</button>
-            <button onClick={() => s.clearSelection()} disabled={!s.selection}>Quitar</button>
+            <Tip id="selection.copy" side="left">
+              <button onClick={() => s.copySelection(false)} disabled={!s.selection}>Copiar</button>
+            </Tip>
+            <Tip id="selection.cut" side="left">
+              <button onClick={() => s.copySelection(true)} disabled={!s.selection}>Cortar</button>
+            </Tip>
+            <Tip id="selection.delete" side="left">
+              <button className="danger" onClick={() => s.deleteSelection()} disabled={!s.selection}>Borrar</button>
+            </Tip>
+            <Tip id="selection.clear" side="left">
+              <button onClick={() => s.clearSelection()} disabled={!s.selection}>Quitar</button>
+            </Tip>
           </div>
           {s.clipboard && (
             <p className="hint" style={{ marginTop: 6 }}>
@@ -147,7 +175,9 @@ export function ToolPanel() {
       )}
 
       <div className="section">
-        <h3>Materiales ({totalBlocks})</h3>
+        <Tip id="panel.materials" side="left">
+          <h3 tabIndex={0}>Materiales ({totalBlocks})</h3>
+        </Tip>
         <div className="mats" data-testid="materials">
           {totals.slice(0, 40).map(([id, n]) => {
             const d = blockDef(id)
diff --git a/src/ui/TopBar.tsx b/src/ui/TopBar.tsx
index bb33b9f..e7d3917 100644
--- a/src/ui/TopBar.tsx
+++ b/src/ui/TopBar.tsx
@@ -3,6 +3,7 @@ import { useEditor } from '../state/store'
 import { downloadBlob, downloadDesignJson, readDesignFile, slugify } from '../export/files'
 import { buildSchem } from '../export/schem'
 import { buildGuide, openPrintableGuide } from '../export/guide'
+import { Tip } from './Tip'
 
 export function TopBar({ onOpenDesigns }: { onOpenDesigns: () => void }) {
   const s = useEditor()
@@ -44,57 +45,73 @@ export function TopBar({ onOpenDesigns }: { onOpenDesigns: () => void }) {
         MC Blueprint
       </div>
 
-      <input
-        className="name-input"
-        type="text"
-        value={s.meta.name}
-        onChange={(e) => s.rename(e.target.value)}
-        aria-label="Nombre del diseño"
-        data-testid="design-name"
-      />
+      <Tip id="topbar.name" side="bottom">
+        <input
+          className="name-input"
+          type="text"
+          value={s.meta.name}
+          onChange={(e) => s.rename(e.target.value)}
+          aria-label="Nombre del diseño"
+          data-testid="design-name"
+        />
+      </Tip>
 
       <div className="grp">
-        <button onClick={onOpenDesigns} data-testid="open-designs">Diseños</button>
-        <button onClick={() => s.saveCurrent()} disabled={s.busy} data-testid="save">
-          Guardar
-        </button>
+        <Tip id="topbar.designs" side="bottom">
+          <button onClick={onOpenDesigns} data-testid="open-designs">Diseños</button>
+        </Tip>
+        <Tip id="topbar.save" side="bottom">
+          <button onClick={() => s.saveCurrent()} disabled={s.busy} data-testid="save">
+            Guardar
+          </button>
+        </Tip>
       </div>
 
       <div className="grp">
-        <button onClick={() => s.undo()} disabled={!s.canUndo} title="Deshacer (Ctrl+Z)">↶</button>
-        <button onClick={() => s.redo()} disabled={!s.canRedo} title="Rehacer (Ctrl+Shift+Z)">↷</button>
+        <Tip id="topbar.undo" side="bottom">
+          <button onClick={() => s.undo()} disabled={!s.canUndo}>↶</button>
+        </Tip>
+        <Tip id="topbar.redo" side="bottom">
+          <button onClick={() => s.redo()} disabled={!s.canRedo}>↷</button>
+        </Tip>
       </div>
 
       <div className="grp">
-        <button
-          className={s.view === 'edit' ? 'on' : ''}
-          onClick={() => s.setView('edit')}
-          data-testid="view-edit"
-        >
-          Editar
-        </button>
-        <button
-          className={s.view === 'guide' ? 'on' : ''}
-          onClick={() => s.setView('guide')}
-          data-testid="view-guide"
-        >
-          Guía
-        </button>
+        <Tip id="topbar.viewEdit" side="bottom">
+          <button
+            className={s.view === 'edit' ? 'on' : ''}
+            onClick={() => s.setView('edit')}
+            data-testid="view-edit"
+          >
+            Editar
+          </button>
+        </Tip>
+        <Tip id="topbar.viewGuide" side="bottom">
+          <button
+            className={s.view === 'guide' ? 'on' : ''}
+            onClick={() => s.setView('guide')}
+            data-testid="view-guide"
+          >
+            Guía
+          </button>
+        </Tip>
       </div>
 
       <div className="spacer" />
 
       <div className="grp">
-        <button onClick={printGuide} title="Abre la guía lista para imprimir o guardar como PDF">
-          Imprimir guía
-        </button>
-        <button onClick={() => downloadDesignJson(s.toStored())} title="Descargar diseño como .mcbp.json">
-          Exportar JSON
-        </button>
-        <button onClick={exportSchem} title="Exportar .schem para WorldEdit / Litematica">
-          Exportar .schem
-        </button>
-        <button onClick={() => fileRef.current?.click()}>Importar</button>
+        <Tip id="topbar.printGuide" side="bottom">
+          <button onClick={printGuide}>Imprimir guía</button>
+        </Tip>
+        <Tip id="topbar.exportJson" side="bottom">
+          <button onClick={() => downloadDesignJson(s.toStored())}>Exportar JSON</button>
+        </Tip>
+        <Tip id="topbar.exportSchem" side="bottom">
+          <button onClick={exportSchem}>Exportar .schem</button>
+        </Tip>
+        <Tip id="topbar.import" side="bottom">
+          <button onClick={() => fileRef.current?.click()}>Importar</button>
+        </Tip>
         <input
           ref={fileRef}
           type="file"
@@ -107,9 +124,11 @@ export function TopBar({ onOpenDesigns }: { onOpenDesigns: () => void }) {
         />
       </div>
 
-      <span className={`chip${s.storageMode === 'cloud' ? ' cloud' : ''}`}>
-        {s.storageMode === 'cloud' ? '☁ nube' : '💾 este navegador'}
-      </span>
+      <Tip id="topbar.storage" side="bottom">
+        <span className={`chip${s.storageMode === 'cloud' ? ' cloud' : ''}`} tabIndex={0}>
+          {s.storageMode === 'cloud' ? '☁ nube' : '💾 este navegador'}
+        </span>
+      </Tip>
     </header>
   )
 }
```
