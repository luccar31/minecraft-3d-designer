# 06 — Pisos y estructuras automáticas

## Problema

Hacer un piso de 20x20 hoy son dos clicks con la herramienta rectángulo, pero
sólo si ya estás en modo capa, en el eje correcto y en la altura correcta. Y para
una casa hay que repetirlo capa por capa. Es la operación más frecuente y la que
más fricción tiene.

## Diseño

Módulo puro `src/voxel/generators.ts`: funciones que reciben parámetros y
devuelven `Cell[]`. **Sin dependencias de React ni del store**, para que sean
testeables solas y reutilizables por 07 (templates) y 08 (IA).

```ts
type Cell = { p: Vec3; id: BlockId | undefined }

pisoRect(y, min, max, bloque): Cell[]
pisoCompleto(y, dims, bloque): Cell[]        // toda la capa
paredes(caja, bloque, alto): Cell[]          // contorno extruido
caja(caja, bloque, hueca): Cell[]
techoPlano(caja, bloque, y, alero): Cell[]
techoDosAguas(caja, bloque, yBase, pendiente): Cell[]
cilindro(centro, radio, y, alto, bloque, hueco): Cell[]
esfera(centro, radio, bloque, hueca): Cell[]
reemplazar(world, de, a): Cell[]             // cambiar un material por otro
```

Todas respetan los límites de la grilla y **devuelven cuántas celdas quedaron
fuera**, para poder avisarle al usuario en vez de descartar en silencio (que es
el patrón que la auditoría encontró por todos lados).

**UI**: un panel "Generar" con el generador elegido, sus parámetros, y una
**vista previa en vivo** antes de confirmar. La previa se dibuja con el mismo
mecanismo del fantasma de capa, en un color distinto. Confirmar hace un solo
`applyCells`, así entra como **una sola** entrada de historial: `Ctrl+Z` deshace
el piso entero, no bloque por bloque.

## Archivos propios

- `src/voxel/generators.ts` (nuevo)
- `src/ui/GeneratorPanel.tsx` (nuevo)
- `tests/generators.spec.ts` (nuevo)

## Telemetría

`generador` con el tipo, la cantidad de celdas producidas y cuántas cayeron
fuera de la grilla.

## Criterios de aceptación

1. Las funciones son puras: mismos parámetros, mismo resultado, sin tocar estado.
2. Un piso de 64x64 entra como **una** entrada de historial.
3. La previa se ve antes de confirmar y se puede cancelar con Esc.
4. Si algo cae fuera de la grilla, se avisa con el número exacto.
5. Tests unitarios de cada generador: conteo de celdas y recorte a límites.
