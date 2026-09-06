# Generadores de estructuras — diseño

**Fecha:** 2026-09-06 · **Estado:** aprobado, pendiente de plan de implementación
**Habilita:** workstream 07 (templates) y 08 (generación por IA)
**Depende de:** [modelo de input](2026-09-06-modelo-de-input-design.md) (workstream 01), parcialmente

---

## 1. Problema

Hacer un piso de 20×20 hoy son dos clicks con la herramienta rectángulo, pero
sólo si ya estás en modo capa, en el eje correcto y a la altura correcta. Y para
una casa hay que repetirlo capa por capa.

El problema real no es la falta de un generador: es **la cantidad de estado que
hay que acomodar antes de poder usar el que ya existe**.

Además, 07 y 08 no pueden existir sin esto. Un template es una llamada a
generadores con parámetros; un plan de IA es una lista de esas llamadas. Sin una
base de generadores, ambos tendrían que emitir coordenadas sueltas.

---

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Cómo se indica la región | **Arrastrar en la escena**, después ajustar números en un panel |
| La tercera dimensión | **Depende del generador**: los planos piden un arrastre, los volumétricos dos |
| Bloques existentes | **Se sobrescriben**, pero la previa avisa cuántos antes de confirmar |
| Forma de los generadores | **Funciones puras que devuelven celdas**, no que escriben en el mundo |

### 2.1 Por qué funciones puras

La alternativa —que escriban directo al `World`— parece más simple hasta que
aparecen los tres consumidores: la previa, los templates y la IA.

Con funciones puras **la previa sale gratis**: es dibujar las celdas que el
generador devolvió sin aplicarlas. Con funciones que escriben, haría falta
duplicar cada generador en una versión "de mentira" que no escribe.

### 2.2 Mitigaciones de la inconsistencia de pasos

Que unos generadores pidan un arrastre y otros dos es una inconsistencia
deliberada, con tres mitigaciones:

- El botón de cada generador muestra **cuántos pasos pide** (un `1` o `2` chico).
- Durante el gesto hay una línea de estado: *"Arrastrá la base"* → *"Ahora la
  altura"* → *"Confirmá o ajustá"*.
- **Con puntero grueso, los volumétricos saltean el segundo arrastre** y abren el
  panel con el campo de altura enfocado. Extruir con el dedo sobre una previa que
  el propio dedo tapa es el peor caso posible.

---

## 3. Módulo y catálogo

### 3.1 Firma

```ts
type Cell = { p: Vec3; id: BlockId | undefined }

type Generator = {
  id: string
  label: string
  /** 1 = sólo la huella. 2 = huella y altura. */
  steps: 1 | 2
  /** Si lee el mundo, recibe una vista de sólo lectura. */
  needsWorld: boolean
  params: ParamDef[]
  generate(box: Box, params: Params, world?: WorldView): GeneratorResult
}

type GeneratorResult = {
  cells: Cell[]
  /** Celdas que cayeron fuera de la grilla. */
  outside: number
  /** true si se alcanzó el tope y el resultado está incompleto. */
  capped: boolean
}
```

`outside` y `capped` se devuelven en vez de descartarse en silencio. Es la lección
de la auditoría de telemetría: los bugs caros de esta app son todos degradaciones
mudas.

### 3.2 Catálogo

| Generador | Pasos | Lee el mundo | Parámetros |
|---|---|---|---|
| Piso | 1 | no | material |
| Paredes | 2 | no | material, espesor, altura |
| Caja | 2 | no | material, hueca/maciza |
| Cilindro | 2 | no | material, hueco/macizo |
| Cúpula / esfera | 2 | no | material, media o entera |
| Techo a dos aguas | 2 | no | material, pendiente, alero |
| Techo plano | 1 | no | material, alero |
| Rampa | 2 | no | material, ancho, escalón |
| Reemplazar | 1 | **sí** | de → a |
| Vaciar | 1 | **sí** | — |
| Cubrir | 1 | **sí** | material |

"Pared" y "Contorno" eran el mismo generador: un contorno rectangular extruido en
altura **son** las cuatro paredes. Quedaron unificados en **Paredes**.

Los ocho que no leen el mundo se testean sin construir uno. La firma lo refleja.

### 3.3 Tres convenciones

1. **Recorte a la grilla adentro del generador, contando.**
2. **Determinismo.** Mismos parámetros, mismas celdas, en el mismo orden. Sin
   `Math.random`. Es lo que permite que 07 arme templates encima y que 08
   re-ejecute un plan y obtenga lo mismo.
3. **Los generadores no pasan por el espejo.** `applyCells` aplica `mirrorX` y
   `mirrorZ` a toda escritura; para una región explícita que el usuario ya dibujó,
   duplicarla al otro lado sería una sorpresa. Requiere una variante
   `applyCellsRaw` que lo saltee.

---

## 4. Interacción

### 4.1 No hace falta tocar `gesture.ts`

Un arrastre de generador tiene la misma forma que uno de pincel: `down` → varios
`move` → `up`. Lo distinto es **qué hace el adaptador**.

Con un generador activo, el adaptador ignora los commits por celda, acumula la
caja entre la primera celda y la actual, dibuja la previa, y al recibir
`closeStroke` genera la región completa.

El generador entra como `dragTool: true` y nada más. Es consecuencia directa de
que 01 haya dejado la máquina pura: **decide la forma del gesto, no su
significado.**

Un detalle de integración que hay que respetar: con un generador activo, el
adaptador **no** llama a `beginStroke` ni a `endStroke` al recibir `openStroke` y
`closeStroke`. El trazo del gesto no escribe nada —sólo define la caja— y abrirlo
dejaría una entrada de historial vacía. La escritura real ocurre al confirmar, y
ahí entra como su propia entrada.

### 4.2 Flujo

```
elegís generador → arrastrás la huella → [2º arrastre si es volumétrico]
   → panel con números y parámetros → Confirmar
```

Se puede salir en cualquier punto: `Esc`, tocar afuera, o cambiar de herramienta.
**Nada se escribe hasta Confirmar.**

Los tres generadores que leen el mundo también toman una región. Para aplicar a
todo, el panel tiene *"Toda la construcción"*, que usa los límites del diseño. Una
sola forma de invocar, once generadores.

### 4.3 El panel

Anclado al lado de la región, no en una barra fija: la previa y los números se
miran en el mismo lugar. Contiene:

- Los números de la caja, editables: origen y tamaño en los tres ejes.
- Los parámetros del generador.
- El conteo: *"1.240 bloques · reemplaza 34"*.
- *Confirmar* y *Cancelar*.

El material arranca en el bloque activo; cambiarlo desde la paleta actualiza la
previa sin cerrar el panel.

### 4.4 La previa

Reusa el material fantasma que 01 construye para el cursor: opacidad 0.45,
`depthWrite: false`. Tres estados:

| | |
|---|---|
| Celda nueva | fantasma con la textura del material |
| Celda que reemplaza algo | ámbar |
| Celda fuera de la grilla | no se dibuja; suma a `outside` |

**La previa no dibuja una malla por celda.** Genera una geometría con el mismo
mesher de chunks, sobre un `World` temporal. Una caja de 60×36×60 son 130 mil
celdas: una malla por celda haría la previa más cara que la construcción real.

---

## 5. Los algoritmos que tienen decisión

### 5.1 Círculos

La prueba ingenua `dx² + dz² ≤ r²` da círculos con protuberancias en radios
chicos, que es donde se usan. La que se ve bien mide desde el **centro** de la
celda:

```ts
const inside = (dx: number, dz: number, r: number) =>
  dx * dx + dz * dz <= (r + 0.5) * (r + 0.5)
```

Vale para cilindro y esfera.

**De dónde sale el radio.** El arrastre da una caja, no un radio. El cilindro usa
un radio por eje —`rx = w / 2`, `rz = d / 2`— y la prueba pasa a elíptica:
`(dx/rx)² + (dz/rz)² ≤ 1`, con el mismo corrimiento de medio bloque. Así una caja
cuadrada da un círculo y una alargada da una elipse, que es lo que uno espera al
arrastrar. La esfera hace lo mismo en tres ejes.

### 5.2 Hueco, una sola vez

No es un caso especial por generador. Una celda pertenece a la cáscara si pasa la
prueba de relleno **y** alguno de sus 6 vecinos no la pasa:

```ts
const shell = (test: (x: number, y: number, z: number) => boolean) =>
  (x: number, y: number, z: number) =>
    test(x, y, z) && (
      !test(x + 1, y, z) || !test(x - 1, y, z) ||
      !test(x, y + 1, z) || !test(x, y - 1, z) ||
      !test(x, y, z + 1) || !test(x, y, z - 1)
    )
```

Once generadores, una definición de "hueco". **Vaciar** es la misma prueba al
revés: saca las celdas con los 6 vecinos llenos.

### 5.3 Techo a dos aguas

La cumbrera va sobre el eje largo; la altura baja con la distancia a ella:

```ts
const ridgeAxis = w >= d ? 'x' : 'z'
const distToRidge = Math.abs(across - Math.floor(span / 2))
const y = yBase + Math.max(0, Math.round((span / 2 - distToRidge) * pitch))
```

`pitch = 1` da los 45° clásicos. El alero extiende la huella hacia afuera **antes**
de calcular, que es lo que hace que el techo sobresalga de las paredes en vez de
apoyarse justo encima.

### 5.4 Cubrir

Por cada celda llena con al menos una cara al aire, llena la celda vecina de esa
cara. Sirve para poner césped sobre tierra o nieve sobre un techo sin dibujarlo.

---

## 6. Verificación

Casi todo va al módulo puro, sin navegador:

| Caso | Verifica |
|---|---|
| Piso 20×20 | 400 celdas exactas, todas en la misma `y` |
| Caja maciza 5×5×5 | 125 celdas |
| Caja hueca 5×5×5 | 98 celdas, y **subconjunto estricto** de la maciza |
| Cilindro r=5, macizo vs. hueco | el hueco es subconjunto; ninguno se sale de la caja |
| Cúpula r=8 | ninguna celda por debajo del centro |
| Techo a dos aguas, pendiente 1 | altura máxima en la cumbrera, mínima en los bordes |
| Región fuera de la grilla | `outside > 0` y ninguna celda fuera |
| Región gigante | `capped === true` y `cells.length <= 500_000` |
| Todos | los `BlockId` usados existen en la paleta |
| Todos | dos llamadas iguales dan el mismo array, en el mismo orden |

La última fila habilita 07 y 08: sin determinismo, un template no es reproducible
y un plan de IA no se puede re-ejecutar.

En navegador, tres: que la previa aparezca sin escribir nada, que `Esc` cancele
sin dejar rastro, y que confirmar entre como **una sola** entrada de historial.

---

## 7. Riesgos

### 7.1 Una región grande revienta la memoria

Una región de 256³ son 16,7 millones de celdas. Un `Cell[]` de ese tamaño es un
objeto por celda y no entra. Es la misma clase de problema que la auditoría
encontró en `buildSchem` con su arreglo denso.

**Tope duro de 500.000 celdas.** El generador devuelve `capped: true`, el panel
muestra *"la región es demasiado grande: 2,1 M de celdas, el máximo es 500 mil"*
y **no deja confirmar**. Falla temprano, visible, y con el número.

### 7.2 El historial se come la memoria

Una generación de 130 mil celdas entra como **una** entrada de historial con 130
mil deltas adentro. Con `DEPTH = 100`, el peor caso son 13 millones de deltas
retenidos: del orden de un gigabyte.

Hoy no ocurre porque nadie escribe 130 mil celdas de un saque. **Los generadores
lo hacen posible.**

Mitigación: que `History` lleve **presupuesto de deltas además de profundidad**
—2 millones— y descarte las entradas más viejas al pasarse, registrando el evento
`history.pruned` que ya existe. El usuario pierde undo lejano en vez de perder la
pestaña.

Toca `src/state/history.ts`, que no pertenece a ningún workstream activo.

### 7.3 Resumen

| Riesgo | Mitigación |
|---|---|
| Región gigante | Tope de 500k celdas, visible y bloqueante |
| Historial sin techo de memoria | Presupuesto de deltas en `History` |
| Previa cara de dibujar | Malla única por el mesher sobre un `World` temporal |
| El espejo duplicaría la región | `applyCellsRaw`, sin espejo |

---

## 8. Alcance

**Nuevos:** `src/voxel/generators.ts`, `src/ui/GeneratorPanel.tsx`,
`src/scene/GeneratorPreview.tsx`, `tests/generators.spec.ts`

**Modificados:** `src/state/store.ts` y `src/scene/Scene.tsx` (**de 01**),
`src/state/history.ts`

### 8.1 Corrección sobre la independencia

Al proponer este workstream se dijo que era independiente de todo. **No lo es**:
el adaptador del gesto vive en `Scene.tsx` y la escritura sin espejo necesita un
método nuevo en `store.ts`.

Lo que sí es independiente es **`generators.ts`**, que es la mayor parte del
trabajo y se puede escribir y testear en paralelo desde ya. La integración se
serializa después de 01.

### 8.2 Fuera de alcance

- Rotar la región.
- Generadores que dependan del bioma o de la iluminación.
- Curvas arbitrarias.
- Más generadores: los templates de 07 se construyen llamando a estos once.

---

## 9. Convenciones

- Identificadores y comentarios en **inglés**.
- Comentarios de **20 palabras o menos**, sólo para lo que el código no dice solo.
- Los textos de interfaz siguen en español.
