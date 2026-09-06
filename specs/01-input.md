# 01 — Modelo de input y controles

## Problema

Diagnosticado con datos, no supuesto. `Scene.tsx:onDown` commitea la edición en
el mismo milisegundo del `pointerdown` y apaga OrbitControls para todo el gesto.
Evidencia del registro:

```
13882ms puntero.down  {objeto:"Mesh", tool:"brush", orbitAntes:true}
13882ms edicion trazo.inicio
13882ms edicion escritura {aplicadas:1, total:37}   <- mismo ms que el down
```

Cero eventos de cámara en todo el arrastre.

## Defectos a corregir

1. **No se puede orbitar sobre la construcción.** Sólo funciona arrastrando en
   el vacío. Con una construcción que llena el viewport es imposible.
2. **Un click con 2 px de temblor pinta una tira.** No hay umbral click/arrastre.
3. **El cursor miente.** `onHover` no llama a `stopPropagation()`, así que R3F lo
   dispara por cada objeto atravesado y **gana el más lejano** (el build plate),
   mientras `onDown` sí corta y usa **el más cercano**. Verificado: mismo pixel,
   cursor en `(4,0,8)` y edición en `(6,0,9)`.
4. **La goma apunta a `y = -1`** sobre el build plate: `floorVec(p, n, -1)` busca
   "el bloque apuntado" debajo de un plano infinitamente fino. Celda imposible.
5. **Shift+click borra pero el cursor muestra colocar.** `onHover` sólo mira
   `tool === 'eraser'` e ignora los modificadores.
6. **Estado trabado permanente.** Si se pierde el `pointerup` (soltar fuera de la
   ventana, alt-tab, `pointercancel`), `controls.enabled` queda en `false` y
   `stroking` en `true` para siempre. No hay `setPointerCapture` ni recuperación.
7. **Cursor fantasma** flotando en el vacío tras orbitar.
8. **Centrar con pocos bloques mete la cámara adentro del bloque** (`radius` sin
   mínimo, `Scene.tsx` en el `ViewFitter`).

## Diseño

Máquina de estados explícita del gesto, con tres fases:

```
inactivo -> pendiente -> (click | pintando | orbitando) -> inactivo
```

- **pendiente**: en `pointerdown` NO se escribe nada. Se guarda la celda
  candidata, se hace `setPointerCapture`, y OrbitControls queda habilitado.
- A los **4 px** de movimiento se decide: si la herramienta pinta y el gesto
  empezó sobre geometría, pasa a `pintando` (recién ahí se apaga la órbita y se
  commitea la celda pendiente); si no, pasa a `orbitando`.
- En `pointerup` sin superar el umbral, es `click`: se commitea una sola celda.
- `pointercancel`, `lostpointercapture`, `blur` y desmontaje llaman a
  `abortar()`, que restaura la órbita, cierra el trazo y limpia refs.
  **Un solo camino de limpieza, no cuatro.**

Órbita explícita adicional (aditivo, no rompe lo documentado en el README):
**botón del medio** y **Espacio + arrastrar** orbitan en cualquier lado, incluso
sobre la construcción. El arrastre en el vacío y el paneo con botón derecho
siguen funcionando igual que hoy.

Cursor: `stopPropagation()` en el hover, y la celda se deriva de la **misma**
función que usa la edición. Una sola fuente de verdad:

```ts
resolverCelda(e, mods) -> { objetivo, colocacion, elegida, valida }
```

Sobre el build plate, `objetivo` es `null` y la goma no muestra cursor: no hay
nada que borrar debajo de un plano.

## Claridad visual

- Cursor verde para colocar, rojo para borrar, ámbar para cuentagotas.
- **Cara apuntada resaltada**: un quad translúcido sobre la cara del bloque
  contra la que se apoya el nuevo, para que se entienda de qué lado va.
- Al borrar, silueta del bloque objetivo en vez del contorno de una celda vacía.
- Arreglar de paso la fuga de `new THREE.BoxGeometry(...)` en el cuerpo de
  `Cursor` y `SelectionBox`: hoy se crea una geometría por movimiento del mouse
  y nadie la libera.

## Archivos propios

`src/scene/Scene.tsx`, `src/scene/Overlays.tsx`

## Telemetría obligatoria

Los eventos ya están declarados en `src/debug/events.ts`: `gestoInicio`,
`gestoClasificado`, `gestoFin`, `gestoAbortado`, `punteroCaptura`,
`orbitHabilitado`, `rayoCelda`, `hover`. Registrar cada transición de fase con
su motivo.

## Criterios de aceptación

1. Arrastrar empezando **sobre** la construcción orbita la cámara y **no** pinta.
2. Un click con 4 px o menos de temblor coloca **exactamente un** bloque.
3. La celda del cursor coincide siempre con la celda editada. Verificable desde
   el registro: `hover` y `rayoCelda` tienen que resolver a lo mismo.
4. Con la goma sobre el piso vacío no hay cursor y no se registra `y = -1`.
5. Shift mientras se apunta cambia el cursor a rojo en vivo, sin clickear.
6. Tras un `pointercancel`, `orbitHabilitado` vuelve a 1 y se puede seguir usando.
7. Los 8 tests de `tests/editor.spec.ts` siguen verdes.
