# 09 — Benchmark de rendimiento

Es el punto 3 del pedido original, todavía pendiente.

## Objetivo

Medir de verdad y contrastar contra el presupuesto declarado en **SPEC.md 3.6**:

| Escenario | Objetivo declarado |
|---|---|
| Colocar 1 bloque | menos de 4 ms (1 chunk reconstruido) |
| Diseño de 50k bloques | 60 fps en una laptop integrada |
| Operación de área de 5k bloques | menos de 60 ms |
| Carga de un diseño de 100k bloques | menos de 800 ms |

## Escenario pedido

Cáscara hueca de 60x36x60. Conteo exacto: `60*36*60 - 58*34*58 = 129600 - 114376
= 15224` bloques.

## Qué se mide

El detalle que importa: `applyCells()` vuelve enseguida, sólo escribe el `Map` y
marca chunks sucios. El costo real (`buildChunkGeometry`) ocurre después, cuando
React reacciona al `useSyncExternalStore` de cada `ChunkMesh`. Medir sólo la
llamada mediría la parte barata. Por eso, **dos números por operación**:

- `t_write`: dentro de `applyCells`.
- `t_frame`: hasta que el frame con la geometría nueva está dibujado.

Ahora esto no hay que instrumentarlo a mano: **la telemetría ya lo registra**.
El test lee `window.__mcb.tel` y extrae los eventos `escritura`, `remesh`,
`frame` y `medicion`. Eso da además el desglose por chunk, que a mano no se
tenía.

Casos:

1. Cáscara de 15.224 bloques en un `applyCells`.
2. Un bloque suelto en el interior de un chunk (1 remesh).
3. Un bloque suelto en el borde de un chunk (hasta 4 remesh). Es el peor caso
   real y **no está en el presupuesto del SPEC**.
4. Operación de área de 5k.
5. `loadStored` de un diseño de 100k.
6. FPS sostenidos durante 3 s orbitando, con los 15k en escena.

## La advertencia que no se puede omitir

`playwright.config.ts` corre con `--use-angle=swiftshader`: **WebGL por software,
sin GPU**. El número de fps que salga de ahí **no** se puede comparar contra "60
fps en una laptop integrada". Sirve como canario de regresión, no como veredicto.

Los números de CPU (operación masiva, bloque suelto, carga, remesh) **sí** son
representativos: son JS puro y no tocan la GPU. Por eso el test separa
explícitamente `msCPU` de `ms` en los eventos `frame`, que es justo la distinción
que la telemetría ya captura.

## Umbrales

**Primera corrida sin aserciones.** Se reportan los números y recién con los
datos a la vista se fijan los umbrales. Inventar un margen antes de medir es
adivinar.

Cada medición: un warm-up descartado más 3 corridas; se reporta mediana y mínimo.

## Archivos propios

- `tests/perf.spec.ts` (nuevo)
- `tests/util/telemetria.ts` (nuevo, helpers para leer el buffer desde el test)

## Criterios de aceptación

1. El test corre en CI sin flakear.
2. Emite una tabla legible en stdout y adjunta el JSON al reporte de Playwright.
3. Distingue claramente lo medido en CPU de lo medido en GPU por software.
4. Deja el `.trace.json` como artefacto para abrir en Perfetto.
