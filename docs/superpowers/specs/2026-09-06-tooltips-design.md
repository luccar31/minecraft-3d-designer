# Tooltips y ayuda contextual — diseño

Workstream 03. Cubre `specs/03-tooltips.md`.

Este diseño existe por un motivo concreto: **03 y 04 ya se implementaron una
vez, en paralelo, cada uno a partir de su spec de una carilla, y se
contradijeron.** El resultado se revirtió. La sección 2.1 es la lección.

## 1. Problema

Los controles usan el atributo `title` nativo cuando lo usan, y lo usan poco:

| Archivo | Controles interactivos | Con `title` |
|---|---|---|
| `TopBar.tsx` | 12 | 5 |
| `ToolPanel.tsx` | 15 | 5 |
| `PalettePanel.tsx` | 4 + ~60 botones de bloque | 1 |
| `DesignsPanel.tsx` | 9 | 2 |
| `GuideView.tsx` | 5 | 0 |
| `AuthPanel.tsx` | 3 | 0 |

El `title` nativo aparece después de un segundo, no se puede estilar, y **no
existe en touch**. Además, los pocos que hay describen el botón en vez de
explicar cómo se usa: `title="Espejar en X"` arriba de un botón que dice `X`
no dice qué hace el espejo ni cuándo conviene.

El caso que lo resume: no hay forma de saber qué hace la herramienta `L` sin
probarla. Su `label` es `Línea (modo capa)`, que nombra una precondición sin
explicarla.

Hay una excepción que conviene imitar: `AXES` en `ToolPanel.tsx:18` ya tiene un
campo `help` con textos que sí explican (`'Capas horizontales — pisos'`). Es
exactamente la forma correcta, aplicada a 3 de 48 controles.

## 2. Decisiones tomadas

### 2.1 Un solo espacio de ids, y lo define el catálogo

**Esto es lo que falló y es la decisión central del diseño.**

En el intento anterior, 03 y 04 nombraron los mismos controles distinto:

| Acción | id de 03 | id de 04 |
|---|---|---|
| Deshacer | `topbar.undo` | `edit.undo` |
| Guardar | `topbar.save` | `file.save` |
| Colocar bloque | `canvas.place` | `pointer.place` |
| Modo 3D | `slice.off` | `view.mode3d` |

El panel de atajos quedó mostrando "sin ficha" en **23 de 34 filas**. No fue
descuido de ninguno de los dos: cada uno definió su propio espacio de ids
porque nada decía cuál era el compartido.

Dos reglas lo resuelven:

**Regla A — el id nombra la acción, no el lugar donde aparece.** `topbar.undo`
está mal porque deshacer no vive en la barra superior: vive también en
`Ctrl+Z`, y mañana en la barra inferior del workstream 02. `edit.undo` está
bien. El dominio es la **tarea** (`tool`, `edit`, `view`, `slice`, `mirror`,
`file`, `palette`, `designs`, `guide`, `canvas`, `help`, `debug`, `auth`),
nunca el contenedor visual.

Corolario: una acción con dos formas de invocarse tiene **un** id. Deshacer es
`edit.undo` tanto en el botón como en el atajo.

**Regla B — el catálogo define los ids; los consumidores los referencian con
un tipo, no con un string.**

```ts
// ayuda.ts
export const HELP = { /* … */ } satisfies Record<string, HelpEntry>
export type HelpId = keyof typeof HELP
```

y en `atajos.ts` (workstream 04):

```ts
helpId?: HelpId          // no `string`
```

Un id que no existe en el catálogo **no compila**. En el intento anterior el
campo era `helpId?: string` con una marca visible en runtime para los huecos;
por eso 23 filas pudieron quedar desalineadas sin romper nada. El tipo mueve
el error de "se ve feo en pantalla" a "no buildea".

Esto acopla `atajos.ts` a `ayuda.ts` en una dirección. Es deliberado: el
catálogo es la capa de abajo y no importa a nadie.

### 2.2 Qué NO lleva `<Tip>`

Tres cosas entran al catálogo pero no reciben tooltip:

- **Los gestos del canvas** (`canvas.place`, `canvas.orbit`, …): un tooltip
  sobre el viewport tapa justo lo que el usuario está mirando.
- **Los atajos sin botón** (`edit.paste`, `debug.panel`): no hay elemento donde
  colgarlo.
- **`help.shortcuts`** si termina sin botón propio.

Están en el catálogo porque **04 y 05 los necesitan**. El catálogo es la fuente
de ayuda del producto, no la lista de tooltips. Separar las dos cosas evita la
tentación de meter un `<Tip>` en el canvas para "no dejar huecos".

### 2.3 Los textos son datos, no JSX

`ayuda.ts` es un módulo de datos sin dependencias de React. Tres razones: se
revisa de un vistazo (74 entradas, un archivo), lo pueden importar los tests
sin montar nada, y 04 y 05 lo consumen sin arrastrar el componente.

### 2.4 El `title` nativo se borra al cablear

Si queda, el navegador muestra su tooltip **además** del nuestro, con otro
texto y otro tiempo de aparición. Los 13 `title=` existentes se eliminan en la
misma pasada que agrega el `<Tip>`. Los tres textos de `AXES.help` se mudan al
catálogo tal cual: ya están bien escritos.

## 3. El catálogo

### 3.1 Forma

```ts
export type HelpGroup =
  | 'tools' | 'view' | 'slice' | 'mirror' | 'edit' | 'file'
  | 'palette' | 'designs' | 'guide' | 'canvas' | 'help' | 'debug' | 'auth'

export type HelpEntry = {
  /** Nombre del control, para listarlo fuera de su contexto visual. */
  titulo: string
  /** Qué hace. Una línea. */
  que: string
  /** El gesto o el flujo: cómo se usa de verdad. */
  como: string
  /** Combinaciones equivalentes, una por elemento, listas para <kbd>. */
  atajo?: string[]
  grupo: HelpGroup
}
```

`atajo` es un array, no un string: `Supr` y `Retroceso` son dos combinaciones
para la misma acción, y 04 renderiza un `<kbd>` por elemento. Partir un string
por `/` en el consumidor es la clase de acoplamiento por formato que después
nadie encuentra.

Los nombres de campo van en español porque son texto visible, no
identificadores. Es la convención que el repo ya usa en `AXES.help`.

### 3.2 Cobertura

Un dominio por tarea, no por panel:

| Dominio | Entradas | Origen |
|---|---|---|
| `tool` | 8 | 7 herramientas + relleno/contorno |
| `slice` | 9 | 3 modos, 3 ejes, slider, subir, bajar |
| `view` | 2 | Centrar, Grilla |
| `mirror` | 2 | Espejo X, Z |
| `edit` | 7 | deshacer, rehacer, copiar, cortar, pegar, borrar, quitar selección |
| `file` | 6 | guardar, exportar JSON, exportar .schem, importar, imprimir guía, chip de almacenamiento |
| `palette` | 10 | buscador, 7 categorías, bloque activo, botón de bloque |
| `designs` | 9 | nombre, 3 dimensiones, Crear, Redimensionar, Abrir, borrar, Cerrar |
| `guide` | 6 | Editar/Guía, imprimir, pasos, materiales |
| `canvas` | 7 | los gestos de mouse |
| `auth` | 3 | email, enviar link, salir |
| `help` | 1 | panel de atajos |
| `debug` | 1 | telemetría |

Total aproximado: **71**. El número exacto sale del relevamiento del plan; lo
que fija el diseño es que **no hay control interactivo sin entrada**, y que eso
se verifica con un test, no con una lectura.

### 3.3 Los ~60 botones de bloque son un caso aparte

`PalettePanel` genera un botón por bloque de la paleta. No pueden tener 60
entradas de catálogo: el texto útil ahí es dinámico (`Piedra · minecraft:stone`),
no editorial.

Solución: **una** entrada `palette.block` con el texto genérico ("Elegí este
bloque como bloque activo"), más un slot `extra` en `<Tip>` que el llamador
llena con el nombre y el id del bloque. El `title` que hoy tienen no se pierde:
se mueve al slot.

## 4. El componente `<Tip>`

### 4.1 Apertura y cierre

| Entrada | Abre | Cierra |
|---|---|---|
| Mouse | `pointerenter`, 350 ms | `pointerleave`, o `Esc` |
| Teclado | `focus` (sin demora: el foco ya es deliberado) | `blur`, o `Esc` |
| Touch | long-press 500 ms | `pointerdown` en cualquier otro lado |

Dos comportamientos del navegador que el intento anterior encontró probando en
Chrome real, no leyendo, y que este diseño trata como restricciones:

1. **Al soltar el dedo, el puntero táctil deja de existir y dispara
   `pointerleave`.** Un `<Tip>` que cierre con `pointerleave` sin filtrar por
   `pointerType` se cierra en el mismo gesto que lo abrió.
2. **En touch no hay `leave` al alejarse**, porque no hay puntero que se aleje.
   Sin un `pointerdown` a nivel documento, la ayuda queda abierta para siempre.

El long-press **no** puede disparar la acción del botón: al abrir por
long-press se marca el gesto y se cancela el `click` que viene después.

### 4.2 Posición

Se ubica sobre el control; si no entra, abajo; si se sale por un costado, se
corre. Se mide contra `visualViewport` cuando existe, que en touch es lo que de
verdad se ve con el teclado abierto.

### 4.3 Accesibilidad

El contenido vive siempre en el DOM, con `hidden` cuando está cerrado, y el
control lo referencia con `aria-describedby`. Un tooltip que se monta y
desmonta no lo alcanza el lector de pantalla en el momento del foco.

Consecuencia del cableado que hay que resolver, no evitar: **tres controles con
ayuda no son focusables** y necesitan `tabIndex={0}`, o la ayuda es inalcanzable
por teclado.

### 4.4 Se puede apagar

`localStorage` `mcb.tips` con valores `on` / `off`. Se lee una vez al montar.
Si está apagado, `<Tip>` renderiza sus hijos y nada más: cero listeners.

## 5. El contrato con 04 y 05

`ayuda.ts` exporta, además del catálogo:

```ts
helpFor(id: HelpId): HelpEntry          // id tipado
lookupHelp(id: string): HelpEntry | undefined   // id suelto, para marcar huecos
helpByGroup(): Record<HelpGroup, HelpEntry[]>
searchHelp(q: string): HelpId[]
shortcutLabel(e: HelpEntry): string
```

- **04** (panel de atajos) usa `helpByGroup` y `searchHelp` para armar el panel
  y el buscador, y tipa su `helpId` como `HelpId`.
- **05** (tutorial) usa `helpFor` para los textos de los cinco pasos, con el
  mapeo paso → id fijado en su propio plan.

`lookupHelp` existe para el único caso legítimo de id suelto: 04 lista también
los atajos que todavía no tienen ficha, y necesita distinguir "no hay entrada"
de "hay entrada vacía".

## 6. Verificación

1. **Cobertura, por test**: recorrer los archivos de UI, extraer los ids usados
   en `<Tip id=…>`, y contrastar contra `HELP`. Sobrantes y faltantes fallan.
   Es el mismo mecanismo que 04 usa contra el `switch` de `App.tsx`.
2. **Calidad del texto, por test**: `que` no puede ser igual al `titulo` ni al
   label del botón. Un tooltip que dice "Guardar" arriba de un botón que dice
   "Guardar" no aporta nada, y es el criterio 4 del spec.
3. **Foco**: Tab hasta un control abre su ayuda.
4. **Touch**: long-press abre la ayuda y **no** ejecuta la acción; un tap en
   otro lado la cierra. Los dos comportamientos de 4.1 se testean explícitamente.
5. **`aria-describedby`** apunta a un nodo con el texto.
6. **El tooltip no se sale del viewport** en las cuatro esquinas.

## 7. Riesgos

### 7.1 74 entradas de texto son 74 oportunidades de escribir de más

El riesgo real no es el hueco: es el relleno. Un `como` que dice "Hacé click en
el botón" es peor que nada, porque ocupa el lugar del texto útil y hace que el
test de cobertura dé verde.

Mitigación: el test de 6.2 compara contra el label, y la revisión del plan
enumera las 74 entradas con su texto, para que se lean juntas y no de a una.

### 7.2 El cableado toca cinco archivos compartidos

`TopBar.tsx`, `ToolPanel.tsx`, `PalettePanel.tsx`, `DesignsPanel.tsx`,
`GuideView.tsx`. Es una pasada mecánica pero grande, y es donde se rompe el
layout sin querer.

Mitigación: el entregable incluye un parche aplicable verificado contra el
árbol, no una lista de instrucciones. Se aplica, se corre la suite, y si algo
sale mal se revierte de una.

### 7.3 El acoplamiento de 04 al catálogo es una dependencia de orden

Con `helpId?: HelpId`, 04 no compila hasta que exista `ayuda.ts`. Es el precio
de que la desincronización sea imposible.

Mitigación: **03 se implementa y se mergea antes que 04.** Ya no van en
paralelo; eso fue lo que falló.

## 8. Alcance

Entra: el catálogo, el componente, su CSS, el parche de cableado, y los tests
de cobertura, calidad de texto, foco y touch.

No entra:
- El panel de atajos (04) y el tutorial (05), que consumen el catálogo.
- Traducir la app a otro idioma. El catálogo queda en un módulo, que es lo que
  haría falta después, pero no se agrega maquinaria de i18n ahora.
- Ayuda larga o documentación embebida. Dos líneas por control es el techo.

## 9. Convenciones

Código e identificadores en inglés; texto visible y campos del catálogo en
español. Comentarios de 20 palabras o menos. Sin punto y coma, comillas simples,
encabezados `/* ── nombre ── */`.
