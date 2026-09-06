import type { Tool } from '../types'

/* ── model ───────────────────────────────────────────────────────────── */

export type ShortcutGroup =
  | 'tools'
  | 'view'
  | 'symmetry'
  | 'edit'
  | 'file'
  | 'help'
  | 'debug'

/** 'no' = must not be held, 'yes' = must be held, 'any' = ignored. */
export type ModRule = 'no' | 'yes' | 'any'

export type Shortcut = {
  id: string
  group: ShortcutGroup
  /** KeyboardEvent.key values; any of them fires the shortcut. */
  keys: string[]
  /** Ctrl or Cmd. Defaults to 'no'. */
  mod?: ModRule
  /** Defaults to 'any'. */
  shift?: ModRule
  /** Own text, shown until ayuda.ts (03) has an entry for this id. */
  label: string
  /** Id in the help catalogue of 03, when it differs from `id`. */
  helpId?: string
  tool?: Tool
  /** Not wired in App.tsx yet: docs/integracion/04-atajos.md adds it. */
  pending?: true
}

export type PointerShortcut = {
  id: string
  gesture: string
  label: string
  helpId?: string
}

/* ── shortcuts ───────────────────────────────────────────────────────── */

/**
 * Single source of truth: the keyboard handler in App.tsx and the panel read
 * this list. The order mirrors that handler, because the first match wins.
 */
export const SHORTCUTS: Shortcut[] = [
  {
    id: 'debug.telemetry', helpId: 'debug.panel',
    group: 'debug',
    keys: ['d'],
    mod: 'yes',
    shift: 'yes',
    label: 'Abre y cierra el panel de telemetría',
  },
  {
    id: 'edit.undo', helpId: 'topbar.undo',
    group: 'edit',
    keys: ['z'],
    mod: 'yes',
    shift: 'no',
    label: 'Deshace la última operación',
  },
  {
    id: 'edit.redo', helpId: 'topbar.redo',
    group: 'edit',
    keys: ['z'],
    mod: 'yes',
    shift: 'yes',
    label: 'Rehace lo último que deshiciste',
  },
  {
    id: 'file.save', helpId: 'topbar.save',
    group: 'file',
    keys: ['s'],
    mod: 'yes',
    label: 'Guarda el diseño actual',
  },
  {
    id: 'edit.copy', helpId: 'selection.copy',
    group: 'edit',
    keys: ['c'],
    mod: 'yes',
    label: 'Copia la selección al portapapeles',
  },
  {
    id: 'edit.cut', helpId: 'selection.cut',
    group: 'edit',
    keys: ['x'],
    mod: 'yes',
    label: 'Corta la selección al portapapeles',
  },
  {
    id: 'edit.paste', helpId: 'selection.paste',
    group: 'edit',
    keys: ['v'],
    mod: 'yes',
    label: 'Pega el portapapeles sobre la celda apuntada',
  },
  {
    id: 'edit.cancel', helpId: 'selection.clear',
    group: 'edit',
    keys: ['Escape'],
    mod: 'any',
    label: 'Cancela el ancla en curso y quita la selección',
  },
  {
    id: 'edit.delete', helpId: 'selection.delete',
    group: 'edit',
    keys: ['Delete', 'Backspace'],
    mod: 'any',
    label: 'Borra los bloques de la selección',
  },
  {
    id: 'view.layerUp', helpId: 'slice.up',
    group: 'view',
    keys: ['ArrowUp', 'PageUp'],
    mod: 'any',
    label: 'Sube una capa (sólo en modo capa)',
  },
  {
    id: 'view.layerDown', helpId: 'slice.down',
    group: 'view',
    keys: ['ArrowDown', 'PageDown'],
    mod: 'any',
    label: 'Baja una capa (sólo en modo capa)',
  },
  {
    id: 'tool.brush',
    group: 'tools',
    keys: ['b'],
    tool: 'brush',
    label: 'Pincel: coloca bloques del tipo elegido',
  },
  {
    id: 'tool.eraser',
    group: 'tools',
    keys: ['e'],
    tool: 'eraser',
    label: 'Goma: borra el bloque que tocás',
  },
  {
    id: 'tool.picker',
    group: 'tools',
    keys: ['i'],
    tool: 'picker',
    label: 'Cuentagotas: adopta el bloque que tocás',
  },
  {
    id: 'tool.line',
    group: 'tools',
    keys: ['l'],
    tool: 'line',
    label: 'Línea recta entre dos puntos (modo capa)',
  },
  {
    id: 'tool.rect',
    group: 'tools',
    keys: ['r'],
    tool: 'rect',
    label: 'Rectángulo, de contorno o relleno (modo capa)',
  },
  {
    id: 'tool.fill',
    group: 'tools',
    keys: ['f'],
    tool: 'fill',
    label: 'Relleno por inundación del área contigua (modo capa)',
  },
  {
    id: 'tool.select',
    group: 'tools',
    keys: ['s'],
    tool: 'select',
    label: 'Selección rectangular para copiar, cortar o borrar (modo capa)',
  },
  {
    id: 'view.grid',
    group: 'view',
    keys: ['g'],
    label: 'Muestra u oculta la grilla del piso',
  },
  {
    id: 'view.fit',
    group: 'view',
    keys: ['c'],
    label: 'Encuadra la cámara sobre la construcción',
  },
  {
    id: 'mirror.x',
    group: 'symmetry',
    keys: ['x'],
    label: 'Espejo en X: cada bloque se replica del otro lado',
  },
  {
    id: 'mirror.z',
    group: 'symmetry',
    keys: ['z'],
    label: 'Espejo en Z: cada bloque se replica del otro lado',
  },
  {
    id: 'view.mode3d', helpId: 'slice.off',
    group: 'view',
    keys: ['1'],
    label: 'Vista 3D completa, sin cortes',
  },
  {
    id: 'view.modeBelow', helpId: 'slice.below',
    group: 'view',
    keys: ['2'],
    label: 'Muestra desde la base hasta la capa actual',
  },
  {
    id: 'view.modeIsolate', helpId: 'slice.isolate',
    group: 'view',
    keys: ['3'],
    label: 'Muestra sólo la capa actual, con la anterior de fantasma',
  },
  {
    id: 'help.shortcuts',
    group: 'help',
    keys: ['?'],
    label: 'Abre este panel de atajos',
    pending: true,
  },
]

/** Gestures of pointer and wheel: no key, so no entry in the App.tsx handler. */
export const POINTER_SHORTCUTS: PointerShortcut[] = [
  { id: 'pointer.place', helpId: 'canvas.place', gesture: 'Click', label: 'Coloca un bloque contra la cara que apuntás' },
  { id: 'pointer.erase', helpId: 'canvas.erase', gesture: 'Shift + click', label: 'Borra el bloque que apuntás' },
  { id: 'pointer.pick', helpId: 'canvas.pick', gesture: 'Alt + click', label: 'Adopta el bloque que apuntás como bloque activo' },
  { id: 'pointer.paint', helpId: 'canvas.paint', gesture: 'Arrastrar', label: 'Pinta o borra varios bloques en un solo trazo' },
  { id: 'pointer.orbit', helpId: 'canvas.orbit', gesture: 'Arrastrar en el vacío', label: 'Gira la cámara alrededor de la construcción' },
  { id: 'pointer.pan', helpId: 'canvas.pan', gesture: 'Botón derecho', label: 'Desplaza la cámara sin girarla' },
  { id: 'pointer.dolly', helpId: 'canvas.zoom', gesture: 'Botón del medio', label: 'Acerca y aleja arrastrando' },
  { id: 'pointer.zoom', helpId: 'canvas.zoom', gesture: 'Rueda', label: 'Acerca y aleja la cámara' },
]

export const GROUPS: { id: ShortcutGroup; title: string }[] = [
  { id: 'tools', title: 'Herramientas' },
  { id: 'view', title: 'Vista' },
  { id: 'symmetry', title: 'Simetría' },
  { id: 'edit', title: 'Editar' },
  { id: 'file', title: 'Archivo' },
  { id: 'help', title: 'Ayuda' },
  { id: 'debug', title: 'Diagnóstico' },
]

export const POINTER_GROUP_TITLE = 'Mouse'

/* ── matching ────────────────────────────────────────────────────────── */

/** Same normalization as the handler: `e.key.toLowerCase()` for single keys. */
const normKey = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

const ruleOk = (rule: ModRule | undefined, held: boolean, fallback: ModRule) => {
  const r = rule ?? fallback
  return r === 'any' || (r === 'yes') === held
}

/** The shortcut a keydown fires, or undefined. First match wins. */
export function matchShortcut(e: KeyboardEvent): Shortcut | undefined {
  const key = normKey(e.key)
  const mod = e.ctrlKey || e.metaKey
  return SHORTCUTS.find(
    (s) =>
      s.keys.includes(key) &&
      ruleOk(s.mod, mod, 'no') &&
      ruleOk(s.shift, e.shiftKey, 'any'),
  )
}

/* ── labels ──────────────────────────────────────────────────────────── */

const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc',
  Delete: 'Supr',
  Backspace: 'Retroceso',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'Re Pág',
  PageDown: 'Av Pág',
}

export const keyLabel = (key: string) =>
  KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key)

/** One label per accepted key, e.g. ['Ctrl+Shift+Z'] or ['↑', 'Re Pág']. */
export function comboLabels(s: Shortcut): string[] {
  const prefix = `${s.mod === 'yes' ? 'Ctrl+' : ''}${s.shift === 'yes' ? 'Shift+' : ''}`
  return s.keys.map((k) => prefix + keyLabel(k))
}

/* ── help catalogue (03) ─────────────────────────────────────────────── */

/** Structural shape of an entry of src/ui/ayuda.ts, so neither module imports the other. */
export type HelpEntry = { que?: string; como?: string; atajo?: readonly string[] }

export type HelpCatalog = Record<string, HelpEntry | undefined>

export type Described = { id: string; helpId?: string; label: string }

/**
 * Prefers the catalogue text of 03; falls back to our own so a shortcut with
 * no entry still shows up, flagged.
 */
export function helpText(
  item: Described,
  catalog: HelpCatalog,
): { text: string; fromCatalog: boolean } {
  const entry = catalog[item.helpId ?? item.id]
  const que = entry?.que?.trim()
  if (que) return { text: que, fromCatalog: true }
  return { text: item.label, fromCatalog: false }
}
