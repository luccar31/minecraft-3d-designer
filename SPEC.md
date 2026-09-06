# MC Blueprint — Especificación técnica

Herramienta web 3D para diseñar construcciones de Minecraft y generar una guía de
construcción paso a paso, capa por capa.

**Versión del documento:** 1.0 · **Estado:** implementado en v1

---

## 1. Objetivo y alcance

### 1.1 Problema

Planificar una construcción grande en Minecraft es caro: equivocarse a la altura 12
implica romper y rehacer. Las herramientas existentes o son mods dentro del juego
(Litematica, WorldEdit) o son editores de voxels genéricos que no hablan el idioma
del juego (no conocen los bloques, no producen una guía de construcción).

### 1.2 Qué resuelve esta herramienta

1. **Diseñar** en 3D sobre una grilla de tamaño configurable, colocando bloques de
   una paleta con identidad real de Minecraft.
2. **Guardar y editar** los diseños, con historial de undo/redo y persistencia
   accesible desde cualquier dispositivo.
3. **Construir**: generar una guía imprimible que dice, capa por capa, exactamente
   qué bloque va en cada coordenada, más la lista de materiales total.

### 1.3 Fuera de alcance en v1

- Bloques con estado direccional (escaleras, losas, vallas, puertas). La grilla es
  de cubos completos. Se documenta como la extensión #1.
- Entidades, redstone, bioma, iluminación real del juego.
- Colaboración en tiempo real sobre el mismo diseño.
- Importar mundos existentes o regiones `.mca`.

### 1.4 Nota legal sobre las texturas

La herramienta **no** distribuye ni usa assets de Mojang. Todas las texturas se
generan proceduralmente en tiempo de ejecución con un canvas: cada bloque tiene una
receta (color base + patrón + semilla) que produce una aproximación reconocible pero
original. Los identificadores namespaced (`minecraft:oak_planks`) sí se usan, porque
son datos necesarios para interoperar con WorldEdit/Litematica, no obra protegida.

---

## 2. Modelo de dominio

### 2.1 Diseño

```ts
type Design = {
  id: string                    // uuid
  name: string
  description: string
  dims: { x: number; y: number; z: number }   // 1..256 por eje
  voxels: Map<VoxelKey, BlockId>              // sparse: solo celdas ocupadas
  createdAt: string
  updatedAt: string
}
```

La grilla es **sparse**: solo se almacenan las celdas ocupadas. Un diseño de
64×64×64 con una casa hueca ocupa ~8k celdas, no 262k.

### 2.2 Clave de voxel

Empaquetado en un entero de 30 bits, independiente de las dimensiones del diseño
(así redimensionar no invalida las claves):

```
key = (x << 20) | (y << 10) | z        // cada eje 0..1023
```

**Regla decidida:** el límite duro por eje es 1024; el límite blando editable desde
la UI es 256, porque más allá el meshing en el hilo principal deja de ser interactivo.

### 2.3 Sistema de coordenadas

Se adopta el sistema de Minecraft: **X = este, Y = arriba, Z = sur**, mano derecha.
`y = 0` es la primera capa construible y coincide con el suelo de la grilla. En la
guía, la capa `y = 0` es el paso 1.

---

## 3. Arquitectura de rendering

Es la decisión técnica que define si la herramienta sirve o no. Un `<mesh>` por cubo
colapsa a los pocos miles de bloques.

### 3.1 Chunked meshing con face culling

La grilla se divide en **chunks de 16×16×16**. Cada chunk mantiene su propio
`BufferGeometry`, reconstruida solo cuando ese chunk se ensucia.

Para cada bloque y cada una de sus 6 caras, la cara se emite **solo si** el vecino
en esa dirección está vacío, o es transparente y de distinto tipo. El interior de un
volumen macizo no genera geometría alguna.

```
emitir cara  ⟺  vecino ausente
             ∨  (vecino transparente ∧ (bloque opaco ∨ bloque ≠ vecino))
```

Escribir un bloque marca como sucio su chunk y —si está en el borde— los chunks
vecinos adyacentes, porque sus caras de frontera cambian.

### 3.2 Oclusión ambiental por vértice

Cada vértice consulta sus 3 vecinos diagonales (dos laterales + esquina) y calcula
el nivel de oclusión clásico de voxels:

```
ao = (lado1 ∧ lado2) ? 0 : 3 − (lado1 + lado2 + esquina)
brillo = [0.55, 0.72, 0.86, 1.0][ao]
```

Esto es lo que hace que las esquinas se vean asentadas en lugar de planas, y es
prácticamente gratis: son colores de vértice, no una pasada de post-procesado.

### 3.3 Sombreado direccional

Multiplicado sobre el AO, replicando la lectura de volumen del juego:

| Cara | Factor |
|---|---|
| Superior (+Y) | 1.00 |
| ±X | 0.80 |
| ±Z | 0.62 |
| Inferior (−Y) | 0.48 |

### 3.4 Atlas de texturas procedural

Un solo `CanvasTexture` de 512×512 con celdas de 32×32 (256 slots). Se genera una
vez al arrancar. Cada bloque declara una o tres caras (`all`, o `top`/`side`/`bottom`)
y cada cara apunta a un slot.

Filtrado `NearestFilter` sin mipmaps: da el look pixelado correcto y elimina el
sangrado entre celdas del atlas. Las UV se insetean medio téxel.

Generadores de patrón implementados: `solid`, `noise`, `planks`, `logSide`, `logTop`,
`bricks`, `cobble`, `leaves`, `glass`, `wool`, `concrete`, `grassTop`, `grassSide`,
`crystal`, `metal`.

### 3.5 Geometría opaca vs. transparente

Cada chunk produce **dos** geometrías: una opaca y una transparente (vidrio, hojas).
Se dibujan con materiales distintos y `renderOrder` separado, para que el vidrio no
tape lo que hay detrás.

### 3.6 Presupuesto de rendimiento

| Escenario | Objetivo |
|---|---|
| Colocar 1 bloque | < 4 ms (1 chunk reconstruido) |
| Diseño de 50k bloques | 60 fps en una laptop integrada |
| Operación de área de 5k bloques | < 60 ms |
| Carga de un diseño de 100k bloques | < 800 ms |

---

## 4. Interacción

### 4.0 Modelo modal

El editor tiene dos modos, al estilo CAD: **construir** y **navegar**. En
`build` el arrastre nunca mueve la cámara; en `navigate` nunca escribe. Es lo
que elimina de raíz la ambigüedad de "¿este arrastre pinta u orbita?", que sin
modo es indecidible sobre una construcción que llena el viewport.

`Espacio` cambia de modo y se resuelve **al soltar**: un toque de menos de
250 ms alterna, mantenerlo es transitorio y vuelve al modo previo. Orbitar
mientras se mantiene lo marca como transitorio aunque dure menos de 250 ms. El
botón del medio orbita en cualquiera de los dos modos, como escape universal.

El modo arranca siempre en `build` y **no persiste** entre sesiones: encontrarse
en un modo elegido hace tres días es exactamente el error que la señalización
intenta evitar. Se señaliza tres veces en paralelo: el botón del viewport, el
cursor del sistema (cruz o mano) y un borde teñido en `navigate`.

**Umbral click/arrastre:** 4 px con mouse o lápiz, 10 px con touch. Por debajo
del umbral el gesto es un click y escribe una sola celda; por encima abre un
trazo. En el `pointerdown` no se escribe nada: la celda candidata se guarda y se
confirma recién al cruzar el umbral o al soltar. `brush` y `eraser` son las
únicas herramientas de arrastre; con las de click (`picker`, `line`, `rect`,
`fill`, `select`) cruzar el umbral pasa el gesto a la cámara.

La máquina de estados vive en `src/scene/gesture.ts` como función pura, sin
React ni three, con un solo camino de limpieza: `cancel`, `lostCapture`, `blur`
y `unmount` entran todos por el mismo `abort()`, que restaura la órbita, cierra
el trazo y libera la captura del puntero.

### 4.1 Picking

`src/scene/picking.ts` es la única fuente de verdad de la celda: la consumen
por igual el cursor, el click y el arrastre, así no pueden discrepar.

El raycast devuelve punto de impacto `p` y normal de cara `n`:

- Bloque apuntado: `floor(p − n × 0.5)`
- Celda de colocación: `floor(p + n × 0.5)`

Un *build plate* (plano en `y = 0` del tamaño de la grilla) recibe los clicks cuando
todavía no hay nada construido. El build plate y el plano de capa son planos sin
espesor: **detrás no hay bloque**, así que el bloque apuntado es `null` y la goma
no tiene nada que borrar. Sin esa regla la goma apunta a `y = -1`.

### 4.2 Modo capa (slice)

**Regla decidida:** el modo capa no es opcional para las herramientas de área. Línea,
rectángulo, relleno y selección operan siempre sobre un plano; si el usuario elige una
de esas herramientas estando en modo 3D libre, la app entra en modo capa en la altura
del último bloque apuntado.

El slice se define por eje e índice, no solo por altura:

```ts
type Slice = { axis: 'x' | 'y' | 'z'; index: number }
```

`axis: 'y'` da capas horizontales (el caso normal). `axis: 'x'` o `'z'` dan cortes
verticales, que es como se dibujan paredes y fachadas sin pelear con la cámara.

Visualización en modo capa:

- El slice activo se dibuja a opacidad plena.
- Los slices anteriores (por debajo / detrás) se dibujan como fantasma al 25%.
- Los posteriores se ocultan.
- Un plano invisible del tamaño del slice captura todos los clicks, así se puede
  pintar sobre celdas vacías sin necesidad de un bloque de apoyo.

### 4.3 Herramientas

| Herramienta | Modo | Comportamiento |
|---|---|---|
| Pincel | 3D y capa | Coloca el bloque activo; arrastrar pinta |
| Goma | 3D y capa | Vacía celdas; arrastrar borra |
| Cuentagotas | 3D y capa | Toma el bloque de la celda apuntada |
| Línea | capa | Bresenham entre dos clicks |
| Rectángulo | capa | Contorno o relleno (modificador) |
| Relleno | capa | Flood fill 4-conexo dentro del slice |
| Selección | capa | Caja: copiar, cortar, pegar, borrar |

Todas las escrituras pasan por un único punto (`applyEdit`) que aplica simetría,
recorta a los límites de la grilla y acumula el delta para el historial.

### 4.4 Simetría

`mirrorX` y `mirrorZ` son toggles independientes. Cada escritura en `(x, y, z)` se
duplica en `(dims.x − 1 − x, y, z)` y/o `(x, y, dims.z − 1 − z)`. Con ambos activos,
una escritura produce hasta 4 celdas.

### 4.5 Historial

Pila de comandos con deltas de celdas: `{ key, prev, next }[]`. Un trazo de arrastre
completo se agrupa en una sola entrada al soltar el puntero. Profundidad: 100
operaciones. `Ctrl+Z` / `Ctrl+Shift+Z`.

---

## 5. Persistencia

### 5.1 Interfaz de storage

Un único puerto con dos adaptadores intercambiables:

```ts
interface DesignStore {
  mode: 'local' | 'cloud'
  list(): Promise<DesignSummary[]>
  load(id: string): Promise<StoredDesign>
  save(design: StoredDesign): Promise<void>
  remove(id: string): Promise<void>
}
```

**Regla decidida:** la app selecciona el adaptador en el arranque. Si
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están definidas y hay sesión activa,
usa la nube; en cualquier otro caso usa `localStorage`. Nunca hay dos fuentes de
verdad simultáneas; migrar de local a nube es una acción explícita del usuario.

### 5.2 Formato serializado

```ts
type StoredDesign = {
  v: 1
  id: string
  name: string
  description: string
  dims: { x, y, z }
  palette: string[]     // ids namespaced, indexados
  data: string          // base64( gzip( registros de 6 bytes ) )
  blockCount: number
  createdAt: string
  updatedAt: string
}
```

Cada registro son 6 bytes: `uint32` clave empaquetada + `uint16` índice de paleta.
Gzip lleva un diseño de 100k bloques de ~600 KB a típicamente menos de 40 KB, porque
las claves son casi monótonas y la paleta es chica.

Este mismo sobre es el formato del export/import `.mcbp.json`, así que un diseño
guardado en la nube y uno exportado a archivo son intercambiables.

### 5.3 Esquema en Supabase

```sql
create table public.mc_designs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  name         text not null,
  description  text not null default '',
  size_x       integer not null,
  size_y       integer not null,
  size_z       integer not null,
  block_count  integer not null default 0,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

RLS activo, una sola política: el usuario ve y escribe únicamente sus filas
(`auth.uid() = user_id`). Autenticación por magic link, que es lo que hace que el
mismo diseño aparezca en la PC y en el celular.

---

## 6. Guía de construcción

Es la razón de ser de la herramienta, no un extra.

### 6.1 Algoritmo

1. Recorrer `y` de 0 a `dims.y − 1` y quedarse con las capas no vacías.
2. Para cada capa, construir la matriz `[x][z]` de ids de bloque.
3. **Compresión de corridas:** si dos capas consecutivas son idénticas celda por
   celda, se fusionan en un paso único con nota "repetir N veces (y = a..b)". Una torre
   de 20 niveles iguales pasa de 20 pasos a 1.
4. Por cada paso: recuento de bloques de esa capa, recuento acumulado, y la capa
   anterior dibujada en gris de fondo como referencia de alineación.
5. Leyenda: a cada bloque presente en el diseño se le asigna un código de 1–2
   caracteres, estable dentro del documento.

### 6.2 Salida

- **En pantalla:** navegación paso a paso con la capa renderizada en SVG, teclas
  ←/→ para avanzar, y resaltado del bloque bajo el cursor.
- **Impresión / PDF:** documento HTML con `@media print` (una capa por página,
  salto de página forzado, colores forzados con `print-color-adjust: exact`). Se abre
  en una pestaña y se imprime a PDF desde el navegador.
- **Lista de materiales:** total por bloque, ordenado descendente, expresado en
  stacks + resto (`3 stacks + 17`), que es la unidad en que se piensa el inventario.

### 6.3 Legibilidad en blanco y negro

Cada celda lleva su color de relleno **y** el código de la leyenda superpuesto. Impreso
en B&W la guía sigue siendo utilizable, que es el caso real: la gente imprime o abre
el PDF en el celular al lado de la compu.

---

## 7. Exportación al juego

Exportador **Sponge Schematic v2** (`.schem`), el formato que leen WorldEdit,
FastAsyncWorldEdit, Litematica y Axiom.

- NBT big-endian comprimido con gzip.
- Orden de `BlockData`: `index = (y × Length + z) × Width + x`.
- Índices de paleta codificados como varints.
- `minecraft:air` ocupa siempre el índice 0.
- `DataVersion: 3465` (1.20.1); las versiones posteriores lo aceptan y lo actualizan.

Con esto, un diseño puede pegarse en el mundo con `//paste` o proyectarse como
holograma con Litematica.

---

## 8. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Build | Vite 5 + TypeScript 5 | Arranque en frío rápido, HMR, `tsc --noEmit` en CI |
| UI | React 18 | — |
| 3D | three.js + @react-three/fiber + drei | Declarativo sin perder acceso a la API imperativa donde importa (geometría) |
| Estado | Zustand | Store plano y selectores; el mundo de voxels vive **fuera** de React |
| Compresión | pako | Gzip para el payload y para el `.schem` |
| Nube | @supabase/supabase-js | Postgres + RLS + auth por magic link |
| Test | Playwright | Prueba funcional headless sobre el editor real |

**Regla decidida sobre el estado:** el mundo de voxels es una clase mutable
(`World`) con suscriptores por chunk, no estado de React. React se entera de los
cambios vía `useSyncExternalStore` a nivel de chunk. Meter 100k voxels en un store
inmutable haría que cada bloque colocado clone la grilla entera.

---

## 9. Estructura del repo

```
src/
  blocks/     palette.ts (definición de bloques), atlas.ts (texturas procedurales)
  voxel/      world.ts (grilla + chunks), mesher.ts (geometría), ops.ts (línea, rect, fill, mirror)
  state/      store.ts (Zustand), history.ts (undo/redo)
  scene/      Scene.tsx, ChunkMesh.tsx, BuildPlate.tsx, SlicePlane.tsx, Cursor.tsx
  ui/         TopBar, Toolbar, PalettePanel, SliceControls, DesignsPanel, GuideView, MaterialsPanel
  storage/    codec.ts, local.ts, supabase.ts, index.ts
  export/     nbt.ts, schem.ts, guide.ts
supabase/migrations/
tests/
```

---

## 10. Extensiones previstas

En orden de valor por esfuerzo:

1. **Bloques con estado**: escaleras, losas y vallas con rotación. Requiere que
   `BlockId` pase de `string` a `{ id, props }` y que el mesher soporte formas no cúbicas.
2. **Import `.schem`**: leer lo que ya construiste en el juego y editarlo acá.
3. **Selección volumétrica 3D** con copiar/pegar entre diseños.
4. **Paleta por proyecto**: fijar 8–10 bloques como accesos rápidos numerados.
5. **Vista de sección vertical** en la guía, para chimeneas y techos donde las capas
   horizontales no son la lectura natural.
6. **Compartir por link** de solo lectura (fila pública con RLS de lectura anónima).
