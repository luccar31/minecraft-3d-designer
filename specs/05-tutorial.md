# 05 — Tutorial de primeros pasos

**Depende de 04** (comparte `ayuda.ts` y `atajos.ts`).

## Problema

Alguien que abre la app por primera vez ve una grilla vacía, tres paneles y
ninguna indicación de qué hacer. El concepto central del producto —que esto no
es un editor de voxels sino un generador de guías de construcción— no se
transmite en ningún lado de la interfaz.

## Diseño

Tutorial de **cinco pasos, interactivo**, no un carrusel de capturas. Cada paso
espera a que el usuario haga la acción de verdad y recién ahí avanza. Se detecta
suscribiéndose al store, no con timers.

1. **Colocá tu primer bloque.** Resalta el viewport. Avanza con `world.size > 0`.
2. **Elegí otro bloque.** Resalta la paleta. Avanza al cambiar `block`.
3. **Subí de capa.** Resalta el control de capa, explica que así se construye en
   altura. Avanza al cambiar `sliceIndex`.
4. **Mirá la guía.** Resalta el botón Guía y explica que ahí está la lista de
   materiales y el paso a paso. Avanza al cambiar `view`.
5. **Guardá.** Explica que queda en este navegador. Avanza con `saveCurrent`.

Mecánica:

- Overlay con un recorte alrededor del elemento a resaltar (box-shadow gigante
  con `border-radius`, sin bloquear el click en el elemento resaltado).
- Botones "Saltar" y "Anterior" siempre visibles. **Nunca atrapa al usuario.**
- Se ofrece una sola vez, con `localStorage` (`mcb.tutorial.visto`). Se puede
  relanzar desde el panel de ayuda.
- Si detecta un diseño ya existente al arrancar, no se ofrece: alguien que
  vuelve no es un usuario nuevo.

Los textos salen de `src/ui/ayuda.ts` cuando existe la entrada, para no escribir
lo mismo dos veces con palabras distintas.

## Archivos propios

- `src/ui/Tutorial.tsx` (nuevo)
- `src/ui/tutorial.css` (nuevo)
- `src/ui/pasos.ts` (nuevo, la definición de los pasos)

## Telemetría

Declarar `tutorialPaso` con el número de paso y si se completó o se saltó. Es la
única forma de saber después en qué paso abandona la gente.

## Criterios de aceptación

1. Se puede completar sin tocar el teclado.
2. Se puede saltar en cualquier momento y no vuelve a aparecer.
3. El elemento resaltado sigue siendo clickeable.
4. No aparece si ya hay diseños guardados.
5. Relanzable desde ayuda.
