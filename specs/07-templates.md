# 07 — Biblioteca de templates

**Depende de 06** (los templates se construyen con los generadores).

## Problema

Arrancar de cero cada vez. Las construcciones típicas de Minecraft —una casa
inicial, una granja de trigo, una trampa de mobs— tienen proporciones y mecánicas
conocidas que no hay razón para redescubrir bloque por bloque.

## Postura sobre el origen del contenido

Los templates se **diseñan originales**, a partir de los patrones estándar y las
mecánicas del juego (que son hechos funcionales: un mob spawnea en un área oscura
de 3x3, el agua riega 4 bloques a la redonda, una caída de 23 bloques deja al
zombi a un golpe). **No se copia el schematic de ningún creador puntual.** Es la
misma postura que el proyecto ya tiene con las texturas, y está documentada en
SPEC.md 1.4.

Investigar las proporciones y mecánicas reales sí: dimensiones canónicas, alturas
de caída, radios de riego, requisitos de luz.

## Catálogo inicial

**Casas y refugios**
- Refugio inicial 5x5, una sola habitación, techo a dos aguas.
- Casa de campo 9x7 con dos ambientes y ventanas.
- Torre de vigía 5x5, cuatro pisos con escalera central.

**Granjas**
- Granja de trigo 9x9 con agua central. La geometría canónica: el agua riega
  4 bloques en cada dirección.
- Granja de caña, hileras alternadas junto al agua.
- Granja de árboles con la separación correcta entre troncos.

**Trampas y granjas de mobs**
- Torre de spawn oscura con plataformas, canal de agua y caída de 23 bloques.
- Trampa de caída simple, con la cámara de recolección.

**Decoración de interiores**
- Cocina con mesada, horno y almacenamiento.
- Biblioteca de dos alturas.
- Dormitorio con cama, mesita y alfombra.

**Infraestructura**
- Puente de arco.
- Pozo con techo.
- Camino empedrado con farolas.

## Formato

Cada template es un módulo que **genera** su contenido, no un blob de datos:

```ts
type Template = {
  id: string
  nombre: string
  descripcion: string
  categoria: 'casas' | 'granjas' | 'mobs' | 'interior' | 'infra'
  dims: Dims                                   // caja mínima
  parametros?: ParamDef[]                      // tamaño, materiales
  construir(p: Record<string, unknown>): Cell[]
  notas?: string                               // mecánica del juego, si aplica
}
```

Generar y no almacenar tiene dos ventajas: los templates son **paramétricos**
(cambiar el material o el tamaño sin rehacerlos) y pesan bytes en vez de KB.

## UI

Panel de templates con miniatura, filtro por categoría, y **dos acciones
distintas**, que es lo que pediste explícitamente:

- **Insertar**: lo pega en el diseño actual, en la posición del cursor, como una
  sola entrada de historial.
- **Abrir como diseño nuevo**: crea un diseño independiente y editable. No toca
  el actual.

Antes de insertar, previa con los parámetros ajustables.

La miniatura se genera al vuelo con una proyección isométrica en canvas 2D a
partir de las celdas: nada de imágenes en el repo.

## Archivos propios

- `src/templates/index.ts`, `src/templates/tipos.ts`
- `src/templates/casas.ts`, `granjas.ts`, `mobs.ts`, `interior.ts`, `infra.ts`
- `src/templates/miniatura.ts`
- `src/ui/TemplatesPanel.tsx`
- `tests/templates.spec.ts`

## Criterios de aceptación

1. Cada template construye dentro de sus `dims` declaradas. Test que lo verifica
   para todos, sin excepción.
2. Insertar entra como una sola entrada de historial.
3. "Abrir como nuevo" no modifica el diseño actual.
4. Todos los `BlockId` usados existen en la paleta. Un test lo verifica: si no,
   el bloque sale magenta y la auditoría mostró que eso pasa mudo.
5. Los templates con mecánica de juego llevan `notas` explicando por qué esas
   medidas.
