# 06 — Generadores: qué falta cablear

Este workstream entrega tres archivos nuevos y **no toca ningún archivo
compartido**. Todo lo que sigue es el diff exacto que necesita la pasada de
cableado en serie.

| Archivo | Estado |
|---|---|
| `src/voxel/generators.ts` | **Nuevo, completo.** Puro: sin React, sin store, sin three. |
| `src/ui/GeneratorPanel.tsx` | **Nuevo, completo.** Falta montarlo. |
| `src/ui/generator.css` | **Nuevo.** Lo importa el panel; `styles.css` queda intacto. |
| `tests/generators.spec.ts` | **Nuevo.** 41 unitarios verdes + 3 `test.fixme` que dependen de esto. |
| `src/debug/events.ts` | **Sin cambios.** `EV.generator` ya estaba declarado. |

---

## 1. Mapeo de firmas: español del spec → inglés del código

El spec `specs/06-generadores.md` usa nombres en español; el código del repo es
en inglés. Esta es la traducción, que es lo que van a importar 07 y 08.

| Spec (español) | Firma real (inglés) |
|---|---|
| `pisoRect(y, min, max, bloque)` | `floorRect(b: Box, dims: Dims, id: BlockId): GeneratorResult` |
| `pisoCompleto(y, dims, bloque)` | `fullFloor(y: number, dims: Dims, id: BlockId): GeneratorResult` |
| `paredes(caja, bloque, alto)` | `walls(b: Box, dims: Dims, id: BlockId, thickness: number, height: number)` |
| `caja(caja, bloque, hueca)` | `boxFill(b: Box, dims: Dims, id: BlockId, hollow: boolean)` |
| `techoPlano(caja, bloque, y, alero)` | `flatRoof(b: Box, dims: Dims, id: BlockId, overhang: number)` |
| `techoDosAguas(caja, bloque, yBase, pendiente)` | `gableRoof(b: Box, dims: Dims, id: BlockId, pitch: number, overhang: number)` |
| `cilindro(centro, radio, y, alto, bloque, hueco)` | `cylinder(b: Box, dims: Dims, id: BlockId, hollow: boolean)` |
| `esfera(centro, radio, bloque, hueca)` | `ellipsoid(b: Box, dims: Dims, id: BlockId, hollow: boolean, halfOnly: boolean)` |
| `reemplazar(world, de, a)` | `replaceIn(b: Box, dims: Dims, view: WorldView, from: BlockId, to: BlockId)` |
| — (agregados por el plan) | `ramp(b, dims, id, step)`, `hollowOut(b, dims, view)`, `coverSurface(b, dims, view, id)` |

Dos cambios de forma respecto del spec, deliberados:

1. **Todas toman una `Box` y las `Dims` de la grilla**, no un centro y un radio.
   El arrastre en la escena da una caja; derivar el radio adentro (`rx = w/2`,
   `rz = d/2`) es lo que hace que una caja cuadrada dé un círculo y una alargada
   una elipse. `dims` va como parámetro porque el módulo es puro y no puede leer
   el store.
2. **`reemplazar` recibe una `WorldView`, no el `World`.** `WorldView` es
   `{ get(x, y, z): BlockId | undefined }`, que `World` ya satisface
   estructuralmente: se le puede pasar el `world` del store tal cual. Así los
   tests no construyen un `World` y 08 puede pasarle un mundo simulado.

### Tipos exportados

```ts
type Box = { min: Vec3; max: Vec3 }              // inclusiva en ambos extremos
type CellWrite = { p: Vec3; id: BlockId | undefined }
type GeneratorResult = { cells: CellWrite[]; outside: number; capped: boolean }
type WorldView = { get(x: number, y: number, z: number): BlockId | undefined }
const MAX_CELLS = 500_000
```

`CellWrite` es estructuralmente igual al `Cell` privado de `store.ts`: el
resultado se le puede pasar a `applyCells` sin convertir nada.

### Registro

`GENERATORS: GeneratorDef[]` (once entradas), `generatorById(id)` y
`defaultParams(def)`. Un `GeneratorDef` trae `id`, `label` (en español),
`steps` (1 o 2), `needsWorld`, `params: ParamDef[]` y
`generate(box, dims, params, view?)`. La UI se arma del registro: agregar un
generador no debería pedir tocar ningún panel.

Los tres que leen el mundo son `replace`, `hollow` y `cover`; si se los llama sin
`view` devuelven cero celdas en vez de tirar.

---

## 2. Cómo se reportan las celdas fuera de la grilla

**Ningún generador emite una celda fuera de la grilla, y ninguno la descarta en
silencio.** El recorte vive en un solo lugar (`Emitter.put`) y suma a
`result.outside`. El panel lo muestra con el número exacto:

> «140 celdas caen fuera de la grilla y no se van a escribir.»

`result.capped` es lo mismo para el tope de 500.000 celdas: el panel deshabilita
*Confirmar* y dice cuántas pedía la región. Al confirmar, el evento
`EV.generator` guarda `['$type', 'cells', 'outOfGrid', 'ms']`; al cancelar, el
mismo evento con `NaN` en los tres números.

El test *«ningún generador emite celdas fuera de la grilla»* recorre los once con
una caja a caballo del borde y lo verifica.

---

## 3. Diff de cableado

### 3.1 `src/App.tsx` — montar el panel

El panel es autónomo: lee `world`, `block`, `mirrorX/Z` y `rev` del store, tiene
su propio selector de generador, su propia caja editable y sus propios
parámetros. No necesita estado nuevo en el store para funcionar.

```tsx
import { GeneratorPanel } from './ui/GeneratorPanel'
import type { GeneratorResult } from './voxel/generators'

// dentro de App():
const [genOpen, setGenOpen] = useState(false)
const [genPreview, setGenPreview] = useState<GeneratorResult | null>(null)
```

En la barra de herramientas o en `.view-tools`, un botón que abra el panel:

```tsx
<button className={genOpen ? 'on' : ''} onClick={() => setGenOpen((v) => !v)}>
  Generar
</button>
```

Y el panel, anclado sobre el viewport (el diseño §4.3 lo quiere al lado de la
región, no en una barra fija):

```tsx
{genOpen && (
  <div className="gen-anchor">
    <GeneratorPanel
      onPreview={setGenPreview}
      onClose={() => { setGenOpen(false); setGenPreview(null) }}
    />
  </div>
)}
```

`.gen-anchor` es un `position: absolute` dentro de `.viewport`; va en
`src/ui/generator.css` cuando se decida la posición, no en `styles.css`.

**`onPreview` y `onClose` conviene memoizarlos** (`useCallback`) o guardarlos en
estado: el panel ya se protege de identidades nuevas con un ref, pero memoizar
evita renders al pedo.

El panel maneja `Escape` por su cuenta con un listener en `window`, así que el
`Escape` global de `App.tsx` (que hoy hace `cancelAnchor` + `clearSelection`) no
hay que tocarlo: convive.

### 3.2 `src/state/store.ts` — `applyCellsRaw` (recomendado, no bloqueante)

Hoy el panel escribe con `applyCells`, que aplica `mirrorX`/`mirrorZ` a toda
celda. Para una región que el usuario dibujó explícitamente, duplicarla es una
sorpresa (diseño §3.3). Mientras no exista `applyCellsRaw`, **el panel avisa**:
si hay espejo activo muestra «El espejo está activo: la región se va a duplicar
al confirmar». Es un aviso, no una degradación muda, pero la solución correcta es
la variante sin espejo:

```ts
  applyCellsRaw: (cells) => {
    const { world } = get()
    const t0 = performance.now()
    world.beginBatch()
    const deltas: CellDelta[] = []
    for (const c of cells) {
      const d = world.set(c.p.x, c.p.y, c.p.z, c.id)
      if (d) deltas.push(d)
    }
    world.endBatch()
    if (deltas.length === 0) {
      rec(EV.noChange, cells.length, str('no-delta'))
      return
    }
    rec(EV.write, cells.length, deltas.length, world.size, 0, performance.now() - t0)
    history.push(deltas)
    set((s) => ({ rev: s.rev + 1, canUndo: history.canUndo, canRedo: history.canRedo }))
  },
```

Con eso, el cableado pasa a ser:

```tsx
<GeneratorPanel onApply={useEditor.getState().applyCellsRaw} … />
```

El panel ya acepta esa prop; sin ella cae en `applyCells`.

**Una sola entrada de historial ya está garantizada** por cualquiera de las dos:
el panel hace **una** llamada con todas las celdas, fuera de un trazo, así que
`history.push(deltas)` corre una vez y `Ctrl+Z` deshace el piso entero. Lo que no
está garantizado es la memoria; ver §3.4.

### 3.3 `src/scene/Scene.tsx` — el arrastre como región y la previa

Falta lo que el plan llama Task 9 y Task 11. Dos piezas:

1. **Adaptador**: con un generador activo, el adaptador no reenvía
   `openStroke`/`closeStroke` al store —el trazo no escribe nada y abrirlo
   dejaría una entrada de historial vacía— y en vez de aplicar los commits por
   celda arma la caja entre la primera celda y la última, y se la pasa al panel
   por la prop `box` (con `onBoxChange` para el camino inverso).

2. **`src/scene/GeneratorPreview.tsx`** (no creado: vive en `src/scene/`, que es
   de otro workstream). Recibe `genPreview.cells` y dibuja **una malla única**
   sobre un `World` temporal pasado por `buildChunkGeometry`, no una malla por
   celda: una región de 60×36×60 son 130 mil celdas y una malla por celda sería
   más cara que la construcción real. Las celdas que reemplazan algo van en
   ámbar, con un `slice(0, 4096)` para no dibujar cien mil cajas; el número
   exacto ya lo dice el panel. El código completo está en el plan
   `docs/superpowers/plans/2026-09-06-generadores.md`, Task 9.

Mientras eso no exista, el panel funciona igual: la región se edita con los seis
números y *Toda la construcción*. Lo que falta es sólo la previa visual.

### 3.4 `src/state/history.ts` — presupuesto de deltas

Archivo de nadie, pero **no lo tocamos**: este workstream sólo posee sus tres
archivos nuevos. Es necesario antes de soltar los generadores a los usuarios.

Una generación de 130 mil celdas entra como **una** entrada con 130 mil deltas
adentro. Con `DEPTH = 100` el peor caso son 13 millones de deltas retenidos, del
orden de un gigabyte. Hoy no pasa porque nadie escribe 130 mil celdas de un
saque; los generadores lo hacen posible.

```ts
/** A generation can push 130k deltas; 100 of those would retain ~1 GB. */
export const DELTA_BUDGET = 2_000_000
```

y en `History`, un contador `deltas` que se suma en `push`, se resta en cada
`shift()`, y descarta las entradas más viejas mientras
`this.past.length > 1 && this.deltas > DELTA_BUDGET`, registrando el
`EV.historyPruned` que ya existe. `undo`/`redo` mueven entradas entre pilas sin
tocar el contador; `clear()` lo pone en 0.

El test correspondiente está como `test.fixme` en `tests/generators.spec.ts`.

### 3.5 `src/ui/ToolPanel.tsx` — opcional

El selector de los once generadores ya está **adentro** del panel, armado del
registro, así que `ToolPanel.tsx` no necesita cambios. Si más adelante se quiere
la lista también ahí, se importa `GENERATORS` y se mapea; no hace falta duplicar
labels.

---

## 4. Los tres `test.fixme` de `tests/generators.spec.ts`

| Test | Qué lo desbloquea |
|---|---|
| «confirmar un piso de 64x64 entra como una sola entrada de historial» | §3.1 + §3.2 |
| «el historial descarta entradas viejas al pasarse del presupuesto» | §3.4 |
| «la previa se ve antes de confirmar y Esc la cancela sin escribir» | §3.1 + §3.3 |

Los tres son de navegador y necesitan `window.__mcb`. Cuando el cableado esté,
conviene moverlos a un `tests/generators-ui.spec.ts` propio y dejar
`tests/generators.spec.ts` como lo que es: unitarios puros que corren sin
navegador.

---

## 5. Lo que 07 y 08 pueden dar por cierto

- **Pureza.** `generators.ts` no importa React, ni el store, ni three, ni
  `src/debug`. Se puede importar desde Node y desde un worker.
- **Determinismo.** Mismos parámetros → mismas celdas, en el mismo orden
  (recorrido `x → y → z`). Sin `Math.random`. Testeado sobre los once.
- **Nada se descarta callado.** `outside` y `capped` siempre vienen en el
  resultado.
- **Tope duro de 500.000 celdas** por llamada.
- Los `BlockId` que producen los defaults existen en `src/blocks/palette.ts`.
  Testeado.
