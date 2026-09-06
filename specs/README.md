# Specs — MC Blueprint, tanda 2

Un archivo por workstream. Cada spec declara **qué archivos posee** en
exclusiva, para que varios se puedan ejecutar en paralelo sin pisarse.

## Regla de propiedad de archivos

Los archivos compartidos —`src/App.tsx`, `src/styles.css`, `src/ui/ToolPanel.tsx`,
`src/ui/TopBar.tsx`— **no los toca ningún workstream**. Cada uno entrega módulos
nuevos y autocontenidos más una sección "Integración" que dice exactamente qué
hay que cablear; el cableado en los archivos compartidos se hace en una pasada
final, en serie.

Esto no es burocracia: es lo que permite correr seis tareas a la vez sin
resolver conflictos de merge a mano.

## Estado

| # | Workstream | Depende de | Archivos propios |
|---|---|---|---|
| 01 | Modelo de input y controles | — | `src/scene/Scene.tsx`, `src/scene/Overlays.tsx` |
| 02 | Táctil y responsive | 01 | `src/ui/responsive.css`, gestos en Scene |
| 03 | Tooltips y ayuda contextual | — | `src/ui/Tip.tsx`, `src/ui/ayuda.ts` |
| 04 | Panel de atajos | — | `src/ui/ShortcutsPanel.tsx` |
| 05 | Tutorial de primeros pasos | 04 | `src/ui/Tutorial.tsx` |
| 06 | Pisos y estructuras automáticas | — | `src/voxel/generators.ts` |
| 07 | Biblioteca de templates | 06 | `src/templates/*` |
| 08 | Generación por IA (BYOK) | 07 | `src/ai/*` |
| 09 | Benchmark de rendimiento | — | `tests/perf.spec.ts` |

## Invariante que aplica a todos

La telemetría de `src/debug/` ya está. **Todo camino nuevo que pueda fallar en
silencio tiene que registrar un evento.** Si tu workstream agrega un límite, un
descarte, un catch o un return temprano, declará el evento en
`src/debug/events.ts` y registralo. Esa es la lección de la auditoría: los bugs
caros de esta app son todos degradaciones mudas.
