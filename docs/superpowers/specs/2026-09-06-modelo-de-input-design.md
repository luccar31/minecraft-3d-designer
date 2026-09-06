# Modelo de input del editor 3D — diseño

**Fecha:** 2026-09-06 · **Estado:** aprobado, pendiente de plan de implementación
**Reemplaza:** el manejo de gesto actual en `src/scene/Scene.tsx`

---

## 1. Problema

Los controles del editor no responden a lo que el usuario espera. El diagnóstico
se hizo con la telemetría del propio proyecto, no por inspección.

### 1.1 Evidencia

Arrastrando el puntero empezando **sobre** la construcción, con el pincel activo:

```
13882ms  puntero.down     {objeto:"Mesh", tool:"brush", orbitAntes:true}
13882ms  edicion trazo.inicio
13882ms  edicion escritura {aplicadas:1, total:37}
13918ms  puntero.arrastre {celda:"7,1,9"}
13953ms  puntero.arrastre {celda:"8,1,8"}
14004ms  puntero.up
14004ms  edicion trazo.fin {celdas:3}
```

Tres bloques escritos, **cero eventos de cámara**. La escritura ocurre en el
mismo milisegundo que el `down`: no hay ningún intervalo en el que se pueda
decidir si el gesto era pintar u orbitar.

Midiendo el hover y el click sobre el **mismo pixel de pantalla**:

```
cursor (hover) → {x:4, y:0, z:8}
click real     → punto [6.65, 1, 9.83] → celda (6,0,9)
```

### 1.2 Defectos confirmados

1. **No se puede orbitar sobre la construcción.** Sólo funciona arrastrando en el
   vacío; con una construcción que llena el viewport es imposible.
2. **Un click con 2 px de temblor pinta una tira.** No hay umbral click/arrastre.
3. **El cursor apunta a otra celda que la edición.** `onHover` no llama a
   `stopPropagation()`, así que R3F lo dispara por cada objeto atravesado y gana
   el más lejano (el build plate). `onDown` sí corta, y usa el más cercano.
4. **La goma apunta a `y = -1`** sobre el build plate: busca "el bloque apuntado"
   debajo de un plano infinitamente fino.
5. **`Shift`+click borra, pero el cursor sigue mostrando "colocar".** `onHover`
   mira `tool === 'eraser'` e ignora los modificadores.
6. **Estado trabado permanente.** Si se pierde el `pointerup` (soltar fuera de la
   ventana, alt-tab, `pointercancel`), `controls.enabled` queda en `false` y
   `stroking` en `true` hasta recargar la página.
7. **Cursor fantasma** flotando en el vacío después de orbitar.
8. **Encuadrar con pocos bloques mete la cámara dentro del bloque** (`radius` sin
   mínimo).

### 1.3 Causa raíz

El estado del gesto no tiene dueño. Vive repartido entre cinco `useRef` de
`Scene.tsx`, un flag mutable de three (`controls.enabled`) y dos variables de
módulo del store (`stroking`, `strokeDeltas`). De ahí salen cuatro caminos de
limpieza distintos, tres de ellos incompletos, y ninguna forma de testearlo.

---

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Modelo de interacción | **Modal**: `build` / `navigate`, estilo CAD |
| Cambio de modo | `Space`: toque alterna, mantener es transitorio |
| Previa de colocación | Bloque fantasma **+** cara de apoyo resaltada **+** coordenadas |
| Ubicación de la lógica | Módulo puro, fuera de React y de three |

### 2.1 Por qué modal

Elimina la ambigüedad de raíz en lugar de administrarla: en `build` el arrastre
nunca mueve la cámara, en `navigate` nunca escribe. Es también la única de las
opciones evaluadas que no depende de teclado ni de botones que no existen en
tablet, así que el soporte táctil sale como consecuencia y no como caso especial.

El costo es el error de modo: creer que estás en uno y estar en el otro. Se
mitiga con señalización redundante (§5) y se mide con telemetría (§7.3).

---

## 3. Arquitectura

```
src/scene/gesture.ts     máquina de estados pura: sin React, sin three, sin I/O
src/scene/picking.ts     resolveCell(): única fuente de verdad de la celda
src/scene/Scene.tsx      adaptador: eventos de R3F → máquina → store
src/scene/Overlays.tsx   fantasma, cara resaltada, cursor
```

### 3.1 `gesture.ts`

Función pura. **No importa nada**: devuelve en su salida qué habría que
registrar, y el adaptador se encarga. Esto la vuelve importable desde Node, así
que se testea con el Playwright que ya está instalado, sin agregar vitest.

```ts
type Phase = 'idle' | 'pending' | 'painting' | 'navigating'
type Mode = 'build' | 'navigate'

type Input =
  | { kind: 'down'; pointerId: number; pointerType: string; button: number
      x: number; y: number; hit: Hit | null; mods: Mods }
  | { kind: 'move'; x: number; y: number; mods: Mods }
  | { kind: 'up'; x: number; y: number }
  | { kind: 'cancel' | 'lostCapture' | 'blur' | 'unmount' }

type Output = {
  phase: Phase
  orbitEnabled: boolean
  capture?: number          // pointerId a capturar
  release?: number
  openStroke?: boolean
  closeStroke?: boolean
  commit?: Cell[]
  log?: LogIntent[]
}
```

### 3.2 `picking.ts`

```ts
resolveCell(hit, mods, state) → {
  target:    Vec3 | null    // bloque apuntado
  placement: Vec3 | null    // celda vacía adyacente
  chosen:    Vec3 | null    // la que esta acción va a tocar
  action:    'place' | 'erase' | 'pick' | 'none'
  face:      { center: Vec3; normal: Vec3 } | null
  valid:     boolean
}
```

Dos reglas cierran los defectos 3 y 4:

1. **`target` es `null` cuando el impacto no es un bloque real.** El build plate y
   el plano de capa son planos infinitamente finos: detrás no hay nada. No se
   corrige con un clamp, que escondería el error; se corrige la premisa de que
   siempre hay un bloque detrás de lo que se toca.
2. **El hover llama a `stopPropagation()`**, igual que el `down`, para que ambos
   consuman la intersección más cercana.

### 3.3 Dónde vive el modo

`mode` es estado del store de Zustand, no de la máquina: lo consultan el
indicador de la barra, el tutorial y el panel de atajos.

---

## 4. La máquina de estados

### 4.1 Transiciones

| Fase | Entrada | Siguiente | Efecto |
|---|---|---|---|
| idle | `down` botón 0, modo `build`, sobre geometría | pending | captura el puntero, guarda celda candidata |
| idle | `down` botón 0, modo `build`, sobre nada | navigating | no hay nada que pintar; va a la cámara |
| idle | `down` botón 0, modo `navigate` | navigating | — |
| idle | `down` botón del medio, cualquier modo | navigating | escape universal |
| pending | `move`, distancia > umbral, herramienta de arrastre | painting | abre trazo, apaga órbita, commitea la candidata |
| pending | `move`, distancia > umbral, herramienta de click | navigating | la herramienta no pinta arrastrando: el gesto va a la cámara |
| pending | `up` | idle | click: commitea la celda candidata |
| painting | `move` | painting | commitea si cambió la celda |
| painting | `up` | idle | cierra trazo, restaura órbita |
| cualquiera | `cancel` · `lostCapture` · `blur` · `unmount` | idle | `abort()` |

En `down` **no se escribe nada**. La celda candidata se guarda y se commitea
recién al cruzar el umbral o al soltar.

### 4.1.1 Herramientas de arrastre y herramientas de click

`brush` y `eraser` son **de arrastre**: mantener y mover pinta una tira.

`picker`, `line`, `rect`, `fill` y `select` son **de click**: su gesto son uno o
dos clicks discretos, y arrastrar no significa nada para ellas. Con una de esas
activa, cruzar el umbral pasa a `navigating` en lugar de a `painting`. Es
gratis: la alternativa era que el arrastre no hiciera absolutamente nada.

Las de dos clicks (`line`, `rect`, `select`) mantienen su ancla en el store, como
hoy; la máquina sólo decide si el gesto fue click o arrastre y delega el resto a
`planeAction`.

### 4.1.2 Botón del medio

OrbitControls mapea por defecto el botón del medio a zoom y el derecho a paneo.
Para que el del medio orbite hay que remapear `controls.mouseButtons`:
medio → `THREE.MOUSE.ROTATE`, derecho → `THREE.MOUSE.PAN`. El paneo con botón
derecho, que el README documenta, no cambia. El zoom queda sólo en la rueda,
que es donde la gente lo busca.

### 4.2 Umbral

4 px con mouse, 10 px con touch o lápiz. Se elige por `pointerType`, no por ancho
de pantalla: un dedo tiembla más que un mouse en cualquier pantalla.

### 4.3 `abort()`

Un solo camino de salida. Restaura `orbitEnabled`, cierra el trazo si estaba
abierto, libera la captura y limpia el estado. Los cuatro eventos de cancelación
entran por acá.

### 4.4 Cambio de modo con `Space`

La ambigüedad se resuelve al soltar, no al apretar:

```
keydown  →  modeAtPress = mode
            if (mode === 'build') mode = 'navigate'
            pressedAt = now
            cameraMovedWhileHeld = false

keyup    →  tap = (now - pressedAt < 250) && !cameraMovedWhileHeld
            tap ? mode = (modeAtPress === 'build' ? 'navigate' : 'build')
                : mode = modeAtPress
```

`cameraMovedWhileHeld` se pone en `true` con el primer evento `start` de
OrbitControls posterior al `keydown`. Sin esa condición, mantener `Space` y
orbitar rápido (menos de 250 ms) se interpretaría como toque y dejaría el modo
cambiado sin que el usuario lo pidiera.

Funciona en ambas direcciones: desde `navigate`, un toque devuelve a `build`, y
mantener no produce nada raro. Se ignora el auto-repeat del teclado.

**Dónde vive.** El manejo de `Space` no es parte de la máquina de gesto: es
teclado, y el listener global está en `App.tsx`, que este workstream no toca. Se
entrega como `src/scene/modeKeys.ts` —una función pura `nextMode(event, state)`
con sus tests— más la instrucción de cableado.

**El modo no cambia con un gesto en curso.** Si se aprieta `Space` mientras se
pinta, se ignora; buffear el cambio dejaría al usuario en un modo que no eligió
conscientemente. `Esc` sí aborta el gesto en curso.

### 4.5 Invariante

> En modo `navigate`, ninguna entrada produce una escritura.

Se testea como aserción única (§7.1) y se verifica en runtime desde la
telemetría: entre un `gesture.start` en `navigate` y su `gesture.end` no puede
existir ningún evento `write`.

---

## 5. Estado visible

Un toggle mal señalizado es peor que el problema que resuelve. Tres señales
redundantes, ninguna ruidosa:

- **Botón en la barra** con icono y texto del modo actual. Es también el control
  táctil.
- **Cursor del sistema**: cruz en `build`, `grab` / `grabbing` en `navigate`. Es
  la señal que se lee sin mirar.
- **Borde interior de 2 px** teñido en el viewport, sólo en `navigate`, que es el
  modo no predeterminado.

**Modo inicial: `build`, siempre.** No persiste entre sesiones a propósito:
abrir la app y encontrarse en un modo que uno eligió hace tres días es
exactamente el error de modo que §5 intenta evitar.

---

## 6. Previa de colocación

| Acción | Qué se dibuja |
|---|---|
| `place` | Bloque fantasma con la textura real del bloque activo, opacidad 0.45, `depthWrite: false`, más la cara de apoyo en blanco translúcido |
| `erase` | El bloque objetivo teñido de rojo (caja a escala 1.02), sin fantasma |
| `pick` | Contorno ámbar sobre el objetivo |
| `none` | Nada. Sin cursor huérfano |

**Modificadores en vivo.** `Shift` y `Alt` se siguen desde `keydown`/`keyup` en
window, no desde el evento de puntero: apretar `Shift` sin mover el mouse no
genera ningún `pointermove`, y hoy por eso el cursor queda desactualizado.

**Coordenadas.** Lectura fija abajo a la izquierda del viewport con `x, y, z` de
la celda elegida y la capa actual. Sirve doble: desambigua arriba/abajo, y la
guía de construcción habla en coordenadas.

Se enciende y apaga desde el grupo de botones del viewport, junto a *Centrar* y
*Grilla*, y se recuerda en `localStorage`. Ese grupo vive en `App.tsx`, que este
workstream no toca: el componente se entrega listo y el botón entra en la pasada
de integración. Hasta entonces queda visible por defecto.

**Fuga de GPU a corregir.** `Cursor` y `SelectionBox` hacen
`new THREE.BoxGeometry(...)` en el cuerpo del componente, que se re-renderiza con
cada movimiento del mouse, sin `dispose()`. Es una fuga proporcional al tiempo de
uso y candidata seria a la pérdida de contexto WebGL. Pasa a una geometría y un
material creados una vez y reposicionados.

---

## 7. Verificación

### 7.1 Unitarios, sin navegador (`tests/gesture.spec.ts`)

| Secuencia | Esperado |
|---|---|
| `down, up` | click, 1 celda |
| `down, move 3px, up` | click, 1 celda |
| `down, move 5px, up` | painting, trazo abierto y cerrado |
| `down, move, cancel` | abortado, órbita restaurada, trazo cerrado |
| `down, blur` / `down, lostCapture` | idéntico a `cancel` |
| touch: `down, move 6px, up` | click (umbral 10 px) |
| modo `navigate`, cualquier secuencia | `commit` siempre vacío |
| `Space` toque, desde cada modo | alterna en ambas direcciones |
| `Space` mantenido 500 ms + arrastre | restaura el modo previo |

### 7.2 Integración (`tests/input.spec.ts`, navegador real)

- Arrastrar sobre la construcción: pinta en `build`, orbita en `navigate`.
- Click con temblor de 2 px: coloca exactamente un bloque.
- Goma sobre el piso vacío: el evento `hover` no aparece, porque `target` es
  `null`. Hoy aparece con `y = -1`.
- Hover y edición sobre el mismo pixel resuelven a la misma celda.
- Los 8 tests de `tests/editor.spec.ts` siguen verdes.

### 7.3 Aserciones sobre el registro

Los tests leen `window.__mcb.tel` y verifican la **secuencia** de eventos, no
sólo el estado final. Comparar `world.size` antes y después pasa igual si dos
bugs se cancelan; la secuencia no.

El error de modo no se elimina, se mide: si aparece seguido el patrón
"gesto en `navigate` → cambio de modo → mismo gesto en `build`", la señalización
de §5 no alcanza.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| `setPointerCapture` lanza con un `pointerId` inválido | `try/catch`, registra `pointer.capture` con `ok=0`, cae a listeners en window |
| `controls` es `null` en el primer render | La máquina tolera `null`; no asume que OrbitControls ya montó |
| Error de modo del usuario | Señalización redundante (§5) e instrumentación desde el día uno (§7.3) |

---

## 9. Alcance

**Archivos nuevos:** `src/scene/gesture.ts`, `src/scene/picking.ts`,
`src/scene/modeKeys.ts`, `src/ui/ModeIndicator.tsx`, `src/ui/CoordReadout.tsx`,
`tests/gesture.spec.ts`, `tests/input.spec.ts`

**Reescritos:** `src/scene/Scene.tsx`, `src/scene/Overlays.tsx`

**Del store** sólo se agrega el campo `mode` y su acción `setMode`.
`src/state/store.ts` es el único archivo compartido que se toca, y el workstream
06 (generadores) también lo necesita: **ese conflicto se resuelve haciendo 01
primero**, no en paralelo.

**No se tocan** `App.tsx`, `styles.css`, `ToolPanel.tsx` ni `TopBar.tsx`. El
indicador de modo, el atajo de `Space` y el botón de coordenadas se entregan como
componentes listos más instrucciones de cableado, para que los workstreams 02–09
de `specs/` puedan avanzar en paralelo sin conflictos.

### Fuera de alcance

- Gestos táctiles y layout responsive: workstream 02, depende de este.
- Herramientas nuevas o cambios en las existentes.
- El benchmark de rendimiento: workstream 09.

---

## 10. Convenciones

- Identificadores y comentarios en **inglés**.
- Comentarios de **20 palabras o menos**, y sólo para lo que el código no dice
  por sí mismo (el porqué de una decisión, no el qué de una línea).
- Los textos de interfaz siguen en español.
