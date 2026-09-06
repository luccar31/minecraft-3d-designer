# 04 — Panel de atajos

## Problema

Hay 24 atajos de teclado implementados en `src/App.tsx` y la única forma de
descubrirlos es leer el README. La barra de estado muestra cinco, en letra chica,
y ninguno de los de teclado.

## Diseño

Panel modal que se abre con `?` (y desde un botón de ayuda), agrupado por tarea,
no por tecla:

- **Herramientas**: B pincel, E goma, I cuentagotas, L línea, R rectángulo,
  F relleno, S selección.
- **Vista**: 1 modo 3D, 2 hasta acá, 3 sólo capa, flechas arriba/abajo cambiar de
  capa, C encuadrar, G grilla.
- **Simetría**: X espejo en X, Z espejo en Z.
- **Editar**: Ctrl+Z, Ctrl+Shift+Z, Ctrl+C, Ctrl+X, Ctrl+V, Supr, Esc.
- **Archivo**: Ctrl+S.
- **Diagnóstico**: Ctrl+Shift+D abre la telemetría.
- **Mouse**: click, shift+click, alt+click, arrastrar, botón del medio, rueda.

Cada fila muestra la tecla como `<kbd>` y la descripción **leída de
`src/ui/ayuda.ts`** (el catálogo de 03). Si un atajo no tiene entrada en el
catálogo, el panel lo muestra igual con una marca visible: así el hueco se ve en
vez de esconderse.

Buscador arriba para filtrar por nombre o por tecla.

**Fuente única de verdad**: el mapa de atajos se extrae de `App.tsx` a
`src/ui/atajos.ts`, y tanto el manejador de teclado como este panel lo consumen.
Hoy la lista vive duplicada entre el `switch` de teclas y el README, y ya están
desincronizados.

## Archivos propios

- `src/ui/ShortcutsPanel.tsx` (nuevo)
- `src/ui/atajos.ts` (nuevo)
- `src/ui/atajos.css` (nuevo)

`src/App.tsx` es compartido: el entregable incluye el diff exacto para que el
manejador de teclado consuma `atajos.ts`, y lo aplica la pasada de integración.

## Criterios de aceptación

1. Todo atajo que hoy funciona aparece en el panel. Verificable comparando
   `atajos.ts` contra el `switch` de `App.tsx`: ninguno de más, ninguno de menos.
2. El panel se abre con `?` y se cierra con Esc.
3. En touch se llega desde el botón de ayuda, no sólo por teclado.
4. Los atajos siguen funcionando exactamente igual tras la refactorización.
