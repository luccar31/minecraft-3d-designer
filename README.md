# MC Blueprint

Herramienta web 3D para planear construcciones de Minecraft: diseñás sobre una
grilla de voxels, guardás el diseño, y la app te devuelve una **guía de
construcción paso a paso, capa por capa**, con la lista de materiales.

No es un editor de voxels genérico: conoce los bloques del juego, exporta a
`.schem` para WorldEdit/Litematica, y su salida principal son las instrucciones
para construirlo a mano en la partida.

---

## Qué hace

**Diseñar**

- Grilla configurable hasta 256 por eje, guardada de forma dispersa (sólo las celdas ocupadas).
- Paleta curada de ~66 bloques con identificadores reales (`minecraft:oak_planks`) en 6 categorías, con buscador.
- Editor 3D con caras ocultas descartadas y oclusión ambiental por vértice: un diseño de decenas de miles de bloques se mueve fluido.
- Deshacer/rehacer con 100 niveles; un trazo de arrastre completo cuenta como una sola operación.

**Modo capa**

- Aislás un nivel y editás en 2D sobre él, con la capa anterior de fondo como fantasma para alinear.
- El corte no es sólo horizontal: podés cortar por **X** o **Z** para dibujar paredes y fachadas de frente.
- Herramientas de área sobre el plano: línea, rectángulo (contorno o relleno), relleno por inundación, y selección con copiar / cortar / pegar.
- Espejo en X y Z, independientes: con los dos activos, cada bloque que ponés se replica en los cuatro cuadrantes.

**Construir**

- Guía paso a paso: cada capa dibujada con su código de bloque, reglas de coordenadas y recuento propio.
- Capas consecutivas idénticas se fusionan en un paso único con "repetir N veces": una torre de 20 niveles iguales pasa de 20 pasos a 1.
- Lista de materiales total, en stacks y unidades (`3 stacks + 17`).
- Versión imprimible o a PDF, legible también en blanco y negro.

**Guardar y exportar**

- Persistencia local (localStorage) sin configurar nada, o en la nube con Supabase y login por magic link para ver los mismos diseños desde cualquier dispositivo.
- Export/import `.mcbp.json` (mismo formato que la nube, así son intercambiables).
- Export `.schem` (Sponge Schematic v2): lo pegás con WorldEdit o lo proyectás como holograma con Litematica.

---

## Arrancar

```bash
npm install
npm run dev          # http://localhost:5173
```

Otros comandos:

```bash
npm run build         # typecheck + build de producción a dist/
npm run build:single  # un único .html autocontenido en dist-single/
npm run typecheck
npm run test          # tests end-to-end con Playwright
```

## Controles

| Acción | Cómo |
|---|---|
| Colocar bloque | Click izquierdo |
| Borrar | `Shift` + click, o la herramienta goma |
| Cuentagotas | `Alt` + click |
| Pintar varios | Arrastrar |
| Orbitar | Arrastrar sobre el vacío |
| Paneo | Arrastrar con el botón derecho |
| Zoom | Rueda |
| Encuadrar | `C` |

Atajos de teclado: `B` pincel, `E` goma, `I` cuentagotas, `L` línea, `R`
rectángulo, `F` relleno, `S` selección · `1` / `2` / `3` modo 3D / hasta acá /
sólo capa · `↑` `↓` cambiar de capa · `X` `Z` espejos · `G` grilla ·
`Ctrl+Z` / `Ctrl+Shift+Z` · `Ctrl+S` guardar · `Ctrl+C` `Ctrl+X` `Ctrl+V` ·
`Supr` borrar selección · `Esc` cancelar.

## Guardar en la nube (opcional)

Sin configurar nada, los diseños viven en el `localStorage` del navegador. Para
que te sigan a otro dispositivo:

1. Creá un proyecto en [Supabase](https://supabase.com).
2. Aplicá `supabase/migrations/0001_mc_designs.sql` (con `supabase db push` o
   pegándolo en el SQL editor).
3. Copiá `.env.example` a `.env` y completá:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. Entrá con tu email desde el panel **Diseños**.

La tabla tiene RLS activo con una sola política: cada usuario ve y escribe
únicamente sus propios diseños.

## Deploy

Infraestructura como código (S3 privado + CloudFront con OAC) y pipeline de
GitHub Actions con autenticación OIDC, sin claves de larga vida.
Ver **[DEPLOY.md](DEPLOY.md)**.

## Cómo está hecho

Vite + React 18 + TypeScript, three.js con react-three-fiber, Zustand, pako.
Las decisiones de arquitectura —meshing por chunks, oclusión ambiental,
formato serializado, algoritmo de la guía— están documentadas en
**[SPEC.md](SPEC.md)**.

```
src/
  blocks/   palette.ts (definición de bloques) · atlas.ts (texturas procedurales)
  voxel/    world.ts (grilla + chunks) · mesher.ts (geometría) · ops.ts (línea, rect, fill, espejo)
  state/    store.ts (Zustand) · history.ts (undo/redo)
  scene/    Scene.tsx · Chunks.tsx · Overlays.tsx
  ui/       TopBar · PalettePanel · ToolPanel · DesignsPanel · GuideView · AuthPanel
  storage/  codec.ts · local.ts · supabase.ts
  export/   nbt.ts · schem.ts · guide.ts · files.ts
infra/      Terraform: S3 + CloudFront + rol OIDC para GitHub Actions
```

## Sobre las texturas

La app **no** usa ni distribuye assets de Mojang. Cada bloque tiene una receta
(color base, patrón y semilla) y las texturas se generan proceduralmente en un
canvas al arrancar: son aproximaciones reconocibles, pero originales. Los
identificadores `minecraft:*` sí se usan, porque son los datos necesarios para
que WorldEdit y Litematica entiendan el `.schem`.

Proyecto no oficial, sin relación con Mojang ni Microsoft.

## Límites conocidos

- Sólo bloques cúbicos completos: todavía no hay escaleras, losas ni vallas
  (es la extensión #1 en SPEC.md).
- La guía se organiza por capas horizontales; para techos y chimeneas una vista
  de sección vertical sería más natural.
- El `.schem` se exporta, pero todavía no se importa.
