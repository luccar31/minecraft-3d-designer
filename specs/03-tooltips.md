# 03 — Tooltips y ayuda contextual

## Problema

Los botones usan el atributo `title` nativo cuando lo usan: aparece después de un
segundo, no se puede estilar, no funciona en touch, y muchos controles no tienen
ninguno. No hay forma de saber qué hace la herramienta "L" sin probarla.

## Diseño

Componente `<Tip>` propio:

- Aparece a los 350 ms de hover, al foco por teclado (accesible), o con
  long-press en touch.
- Contenido en dos partes: **qué hace** en una línea, y **cómo se usa** con el
  atajo y el gesto. Ejemplo para la herramienta línea:

  > **Línea** — Traza una línea recta entre dos puntos.
  > `L` · Click en el inicio, click en el final. Sólo en modo capa.

- Se reposiciona solo para no salirse de la ventana.
- `aria-describedby` correcto. Se puede desactivar desde ajustes.

**Catálogo de textos** en `src/ui/ayuda.ts`: un mapa `id -> { que, como, atajo }`.
Vive separado de los componentes por dos razones: se revisa de un vistazo, y
**04 (panel de atajos) y 05 (tutorial) leen del mismo catálogo**. Un texto, tres
usos, cero desincronización.

Cobertura mínima del catálogo, sacada del relevamiento del código:

- TopBar: nombre, Diseños, Guardar, deshacer, rehacer, Editar, Guía, Imprimir
  guía, Exportar JSON, Exportar .schem, Importar, chip de almacenamiento.
- ToolPanel: 7 herramientas, relleno/contorno, 3 modos de capa, 3 ejes, slider de
  capa, subir/bajar capa, copiar, cortar, borrar, quitar selección.
- PalettePanel: buscador, 7 categorías, bloque activo.
- DesignsPanel: nombre, los 3 inputs de dimensión, Crear, Redimensionar, Abrir,
  borrar, Cerrar.
- Vista: Centrar, Grilla.
- GuideView: Imprimir/PDF, navegación de pasos.

## Archivos propios

- `src/ui/Tip.tsx` (nuevo)
- `src/ui/ayuda.ts` (nuevo)
- `src/ui/tip.css` (nuevo)

## Integración (la hace la pasada final, en serie)

Envolver los controles existentes con `<Tip id="...">`. El entregable incluye la
lista completa de `id`s con su texto ya escrito, así el cableado es mecánico y no
requiere decisiones.

## Criterios de aceptación

1. Todo control interactivo de la app tiene entrada en `ayuda.ts`. Sin huecos.
2. El tooltip se abre con Tab (foco), no sólo con mouse.
3. En touch, long-press muestra la ayuda **sin** disparar la acción del botón.
4. Los textos dicen cómo se usa, no sólo cómo se llama el botón. Un tooltip que
   dice "Guardar" arriba de un botón que dice "Guardar" no aporta nada.
