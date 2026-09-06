# Táctil y responsive — diseño

**Fecha:** 2026-09-06 · **Estado:** aprobado, pendiente de plan de implementación
**Depende de:** [modelo de input](2026-09-06-modelo-de-input-design.md) (workstream 01)

---

## 1. Problema

La app es inusable fuera del escritorio.

### 1.1 Defectos concretos

1. **Borrar y cuentagotas son inalcanzables.** Dependen de `shiftKey` y `altKey`,
   que no existen sin teclado físico.
2. **El layout no entra.** Tres columnas fijas —paleta, viewport, herramientas—
   dejan el viewport 3D reducido a nada en 390 px de ancho.
3. **No hay vocabulario de gestos.** OrbitControls maneja la cámara con touch,
   pero compite con el gesto de dibujo, que se dispara con un dedo.
4. **Los blancos táctiles son chicos.** Los bloques de la paleta están muy por
   debajo de los 44 px que necesita un dedo.
5. **`dpr={[1, 2]}` sin techo por aparato.** En un celular de 390 px con DPR 3
   son ~1,3 M de píxeles por frame en una GPU muy inferior a la que asume el
   presupuesto de rendimiento del SPEC.

### 1.2 El límite físico

Diseñar voxels en 3D con el dedo tiene un problema que ningún diseño elimina:
**el dedo tapa la celda que se quiere tocar**, y en 3D libre además hay que
acertarle a una cara específica del cubo para decidir si el bloque va arriba, al
costado o abajo.

No se elimina, pero se puede esquivar: el **modo capa** que la app ya tiene
convierte el problema en dibujar sobre un plano, donde desaparecen tanto la
elección de cara como la ambigüedad de arriba/abajo.

---

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Alcance | **Editor completo en todos lados**: celular, tablet y escritorio |
| Modo inicial en táctil | **Lo elige el usuario** la primera vez, mostrado y no descrito |
| Layout en celular | **Barra inferior fija + hojas que suben** |
| Mantener el dedo | **Cuentagotas.** Borrar exige elegir la goma |
| Implementación | **Híbrida**: CSS decide el layout, JS sólo lo que CSS no puede expresar |

### 2.1 Por qué el long-press no borra

La regla es **los gestos no destruyen, las herramientas sí**. Apoyar el dedo
mientras se piensa es constante en táctil; ligarlo a una acción destructiva
convierte una distracción en pérdida de trabajo. El cuentagotas es
no destructivo, imposible de lamentar y se usa mucho.

Se evaluó la alternativa con antecedente en el juego —mantener para romper, con
anillo de progreso cancelable— y se descartó a favor de la regla más simple de
recordar.

### 2.2 Por qué híbrida y no CSS puro ni JS puro

**CSS puro** no puede expresar "la paleta es una hoja que sube, se arrastra y se
cierra al soltar". **JS puro** —un `useBreakpoint()` que intercambia
`<DesktopShell>` por `<MobileShell>`— trae dos problemas conocidos: parpadeo de
layout en el primer render, y dos árboles de componentes que se desincronizan.

---

## 3. Arquitectura

### 3.1 Dos ejes independientes

Decidir todo por ancho de pantalla es un error: una tablet con mouse y una laptop
con pantalla táctil son aparatos reales.

| Eje | Detecta | Decide |
|---|---|---|
| **Entrada** | `(pointer: coarse)` + `maxTouchPoints` | Umbral del gesto, tamaño de los blancos, techo de `dpr`, si aparece la elección de primer uso |
| **Ancho** | `min-width` | Layout: tres columnas, cajones o barra inferior |

Una laptop con pantalla táctil recibe umbral de 10 px con el dedo y 4 con el
mouse, **en la misma sesión**, conservando las tres columnas.

### 3.2 Cortes de layout

- **≥ 1024 px** — las tres columnas actuales, intactas.
- **600–1023 px** — viewport a todo el ancho; paleta y herramientas pasan a hojas.
- **< 600 px** — lo mismo, más la barra inferior fija.

`PalettePanel` y `ToolPanel` son **los mismos componentes** en los tres cortes,
montados dentro de un `<Sheet>` cuando el layout lo pide. No hay árboles
duplicados.

### 3.3 Archivos

```
src/scene/touch.ts          traduce dedos a entradas de la máquina de 01. Puro
src/ui/responsive.css       los tres cortes, sin JS
src/ui/Sheet.tsx            hoja inferior arrastrable, en portal
src/ui/BottomBar.tsx        barra fija de celular
src/ui/LayerStepper.tsx     control vertical de capa
src/ui/FirstTouchSheet.tsx  la elección de primer uso
```

### 3.4 Dónde vive el estado

La hoja abierta (`'none' | 'palette' | 'tools' | 'designs'`) va al store de
Zustand: la necesitan la barra inferior, las hojas y el manejador de `Esc`. Es un
campo, no un subsistema.

---

## 4. Gestos táctiles

**No hay una máquina de estados táctil aparte.** `touch.ts` traduce dedos a las
mismas entradas que consume `gesture.ts` de 01. Dos máquinas divergirían, que es
el error que 01 desarma.

| Gesto | Traducción |
|---|---|
| Tap | `down` → `up` sin cruzar umbral → click, un bloque |
| Arrastrar un dedo | `down` → `move` > 10 px → pinta |
| Mantener 400 ms | Cuentagotas, y `cancel` a la máquina |
| Dos dedos | Cámara: orbitar, zoom y paneo |

**No hay doble tap.** Se evaluó para encuadrar y se descartó: un doble tap son
dos taps rápidos, y el primero ya habría colocado un bloque. Distinguirlos exige
retrasar **toda** colocación ~250 ms esperando un segundo toque, o sea volver
lenta la acción más frecuente de la app para habilitar una ocasional. Encuadrar
vive en el menú `⋯` de la barra inferior.

Esa es también la regla general: **ningún gesto táctil puede introducir latencia
en el tap**, porque el tap es la operación central del editor.

### 4.1 Mantener consume el gesto

Al dispararse el cuentagotas, `touch.ts` manda `{ kind: 'cancel' }` a la máquina.
El `up` posterior encuentra `idle` y no coloca nada. No hace falta una fase
nueva: reusa el camino de aborto que ya existe.

El temporizador se cancela si el dedo se mueve más de 10 px o si levanta antes.

Si el dedo se mantiene sobre una celda **sin bloque**, no hay nada que tomar: no
se dispara el cuentagotas, no se vibra, y el gesto sigue su curso normal como
tap o arrastre.

### 4.2 El segundo dedo

Si aparece mientras se está pintando:

1. Se aborta el gesto de pintura (`cancel`), lo que **cierra el trazo**.
2. **Lo ya pintado queda.** Deshacerlo solo sería sorprendente, y con el trazo
   cerrado un único `Ctrl+Z` lo revierte entero.
3. La cámara toma el control.
4. Levantar hasta quedar en un dedo **no** reanuda la pintura: hay que levantar
   del todo.

Sin la regla 4, arrastrar con dos dedos y levantar uno sin querer pinta una tira
atravesando la construcción.

### 4.3 OrbitControls

`touches = { ONE: ROTATE, TWO: DOLLY_PAN }`, fija. Quién manda no lo decide esa
configuración sino el `enabled` que ya controla la máquina de 01: apagada en
`build` sobre geometría, prendida en el vacío y en `navigate`.

### 4.4 Detalles que deciden si se siente bien

- `touch-action: none` en el canvas, o el navegador se lleva el gesto a scroll.
- **Blancos de 44 px como mínimo** en todo control táctil.
- Nada de `:hover` como única señal de estado: en táctil no existe.
- El umbral sale de `pointerType`, no del ancho de pantalla.

---

## 5. Layout móvil

### 5.1 Barra inferior

```
┌──────────────────────────────────────────────┐
│  [✏️ Construir]  [🧱 bloque]  [🖌 tool]  [↶]  [⋯] │
└──────────────────────────────────────────────┘
```

El modo va primero y grande: es el estado que, si no se ve, produce el error de
modo que 01 dedica una sección entera a evitar. `Deshacer` tiene botón propio
porque en táctil uno se equivoca más y enterrarlo en un menú lo vuelve inútil.

El `⋯` se lleva Guardar, Diseños, Exportar, Importar y Guía.

### 5.2 La capa no está en la barra

Va como control vertical pegado al borde derecho del viewport:

```
   ▲
 y = 3
   ▼
```

Subir de capa es subir en el mundo: un control vertical al costado del 3D mapea
esa relación, y en una barra horizontal entre íconos se pierde. Es además la
acción más repetida en modo capa, y así queda bajo el pulgar sin tapar el centro.

### 5.3 Hojas

Abren al 50% de alto, se arrastran hasta el 85%, y se cierran arrastrando hacia
abajo o tocando el fondo. La construcción sigue visible arriba mientras se elige
—que es la razón por la que se descartaron las pestañas a pantalla completa—.
Una sola hoja a la vez. `Esc` la cierra, para las tablets con teclado.

La hoja captura sus propios punteros: el canvas nunca ve un toque que empezó
sobre ella.

### 5.4 Barra superior

Colapsa por debajo de 900 px a: nombre del diseño truncado, y `⋯`.

### 5.5 Elección de primer uso

Aparece una sola vez, como hoja, y **muestra en vez de contar**: dos tarjetas con
un diagrama SVG chico y animado del gesto —una mano pintando sobre un plano
horizontal, y una mano rotando un cubo—. "Capa por capa" viene preseleccionada.
Debajo, *"Podés cambiarlo cuando quieras"*. Un solo botón: "Empezar".

Se recuerda en `localStorage` y sólo se ofrece con puntero grueso.

Cuando exista el tutorial (workstream 05), esta elección se absorbe ahí, que es
su lugar natural.

### 5.6 La guía en celular

Un paso por pantalla:

- El SVG de la capa escalado al ancho completo. Es donde el celular gana: se lee
  a un brazo de distancia mientras se construye en el juego.
- Deslizar lateral para cambiar de paso, además de los botones. El gesto se
  ignora si empieza a menos de 24 px de un borde vertical: esa franja es del
  "atrás" del sistema y competir con él se pierde.
- Encabezado fijo: `Paso 3 de 12 · capa y = 4`.
- La tira de pasos y la lista de materiales, en hojas.

### 5.7 Dos cosas que no se hacen

- **Nada de menús ocultos por deslizamiento desde el borde.** En Android el borde
  izquierdo es el gesto de "atrás" del sistema y en iOS el de navegación.
  Competir con eso se pierde siempre.
- **Nada de `100vh`.** Incluye la barra de direcciones y corta el contenido. Va
  `100dvh`, que `#root` ya usa.

### 5.8 Áreas seguras

La barra inferior respeta `env(safe-area-inset-bottom)`. Sin eso, en un teléfono
con notch queda debajo de la barra de gestos del sistema y los toques no llegan.

---

## 6. Verificación

### 6.1 Unitarios de `touch.ts`, sin navegador

Las expectativas se expresan sobre las **entradas que `touch.ts` emite hacia la
máquina de 01** —`down`, `move`, `up`, `cancel`— y sobre si pide un cuentagotas,
no sobre las clasificaciones internas de la máquina, que son de 01 y se testean
allá.

| Secuencia | Esperado |
|---|---|
| un dedo: down, up rápido | `down` + `up`, sin `cancel` |
| un dedo: down, 6 px, up | ningún `move` supera el umbral de 10 px |
| un dedo: down, 15 px, up | al menos un `move` por encima del umbral |
| un dedo quieto 400 ms | pide cuentagotas y emite `cancel`; el `up` posterior no produce nada |
| un dedo quieto sobre celda vacía, 400 ms | **no** pide cuentagotas |
| un dedo quieto, se mueve a los 200 ms | no pide cuentagotas |
| dos dedos, en cualquier orden | ninguna entrada `down` de dibujo |
| pintando y baja un segundo dedo | `cancel`, y nada más hasta levantar todo |
| dos dedos → levanta uno | **no** emite `down`: no reanuda la pintura |
| tap sobre una hoja abierta | el canvas no recibe ninguna entrada |

### 6.2 Límite de los tests en navegador

Playwright emula touch con `hasTouch`, pero `page.touchscreen` **sólo hace un
toque simple: no tiene API de multi-touch**. Los gestos de dos dedos se prueban
despachando `PointerEvent` sintéticos desde `page.evaluate`, lo que verifica
nuestro manejador pero **no** la pila táctil del navegador.

Queda dicho acá para que nadie se sorprenda cuando el test pase y el aparato
falle.

### 6.3 Lo que sí se automatiza bien

- **Layout** a 390×844, 768×1024 y 1280×800: qué controles existen y son visibles.
- **Sin scroll horizontal a 320 px**: `document.body.scrollWidth <= window.innerWidth`.
- **Blancos de 44 px**: recorrer los interactivos y medir su caja.

Más una lista manual corta contra un celular real: la emulación no reproduce el
pulgar.

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Rendimiento en GPU de celular** | Limitar `dpr` a 1.5 con puntero grueso, y medirlo con el benchmark del workstream 09 en un aparato real, no en SwiftShader |
| La emulación no es un aparato | Módulos puros con tests exhaustivos + checklist manual |
| Safari en iOS | `dvh` desde 15.4, Pointer Events desde 13. Hay que probarlo ahí: es el navegador con más diferencias |
| Arrastrar la hoja vs. pintar | La hoja captura sus propios punteros |
| Rechazo de palma | **No se implementa ahora.** `PointerEvent` trae `width`/`height` del contacto, pero los valores varían mucho entre aparatos. Se instrumenta en telemetría y se decide el umbral con datos reales |

**Telemetría**: el evento `gestureTouch` ya está declarado en `src/debug/events.ts`.
Registra el gesto reconocido, la cantidad de punteros activos y el `width`/`height`
del contacto.

---

## 8. Alcance

**Archivos nuevos:** `src/scene/touch.ts`, `src/ui/responsive.css`,
`src/ui/Sheet.tsx`, `src/ui/BottomBar.tsx`, `src/ui/LayerStepper.tsx`,
`src/ui/FirstTouchSheet.tsx`, `tests/touch.spec.ts`, `tests/responsive.spec.ts`

**Modificados:** `src/scene/Scene.tsx`, `src/App.tsx`, `src/state/store.ts`,
`src/styles.css`, `src/ui/GuideView.tsx`

`Scene.tsx` y `App.tsx` pertenecen al workstream 01: **02 arranca cuando 01 esté
mergeado.**

### Fuera de alcance

- Gestos de tres o más dedos.
- Rechazo de palma (ver §7).
- Modo apaisado con layout propio: se usa el mismo corte por ancho.
- Instalación como PWA y uso sin conexión.

---

## 9. Convenciones

- Identificadores y comentarios en **inglés**.
- Comentarios de **20 palabras o menos**, sólo para lo que el código no dice solo.
- Los textos de interfaz siguen en español.
