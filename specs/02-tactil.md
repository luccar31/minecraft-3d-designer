# 02 — Táctil y responsive

**Depende de 01** (comparte la máquina de estados del gesto).

## Problema

La app es inusable en tablet y celular:

- Borrar y cuentagotas dependen de `shiftKey` / `altKey`, que **no existen** sin
  teclado físico. Son literalmente inalcanzables en touch.
- El layout es una grilla de tres columnas fijas. En 390 px de ancho el viewport
  3D queda reducido a nada.
- No hay ningún gesto de dos dedos definido. OrbitControls maneja la cámara, pero
  compite con el gesto de dibujo, que se dispara con un dedo.

## Diseño

**Gestos**, apoyados en la máquina de estados de 01:

| Gesto | Acción |
|---|---|
| Tap | Coloca un bloque |
| Mantener 400 ms | Borra el bloque apuntado (vibra si hay `navigator.vibrate`) |
| Arrastrar un dedo | Pinta, igual que el mouse |
| Dos dedos | Orbitar / zoom / paneo. Sólo cámara, nunca edita |
| Doble tap | Cuentagotas |

`touch-action: none` en el canvas para que el navegador no se coma los gestos.
El umbral de arrastre sube a **10 px** en touch: un dedo tiembla mucho más que
un mouse. El umbral se elige por `pointerType`, no por ancho de pantalla.

**Layout**, tres cortes:

- **1024 px o más**: el actual, tres columnas.
- **600 a 1023 px** (tablet): paleta y herramientas pasan a cajones deslizables
  sobre el viewport, con solapas. El viewport ocupa todo el ancho.
- **menos de 600 px** (celular): barra inferior con las cuatro acciones
  frecuentes (bloque activo, herramienta, capa, menú). El resto en hoja modal.

La barra superior colapsa a un menú de desbordamiento por debajo de 900 px.

## Archivos propios

- `src/ui/responsive.css` (nuevo)
- `src/ui/MobileBar.tsx` (nuevo)
- `src/ui/Drawer.tsx` (nuevo)

Los gestos táctiles van en `src/scene/Scene.tsx`, que pertenece a 01: **este
workstream arranca cuando 01 esté mergeado.**

## Telemetría

Declarar y registrar: `gestoTactil` con el tipo de gesto reconocido y la cantidad
de punteros activos. Un gesto de dos dedos que igual termina escribiendo es
exactamente el bug que hay que poder detectar sin reproducirlo a mano.

## Criterios de aceptación

1. En viewport de 390x844 se puede colocar, borrar, cambiar de capa y abrir la
   guía sin teclado.
2. Dos dedos nunca escriben en la grilla. Verificable en el registro: entre un
   `gestoInicio` con dos punteros y su `gestoFin` no debe haber ninguna
   `escritura`.
3. Ningún scroll horizontal del body a 320 px de ancho.
4. Los paneles se abren y cierran sin tapar el viewport de forma permanente.
5. Los 8 tests existentes siguen verdes.
