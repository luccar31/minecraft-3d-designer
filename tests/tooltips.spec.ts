import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GROUPS, HELP, HELP_IDS, helpLine, lookupHelp, searchHelp } from '../src/ui/ayuda'

const APP = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')

const entries = () => HELP_IDS.map((id) => [id, HELP[id]] as const)

const hasKey = (key: string) =>
  entries().some(([, e]) => (e.atajo ?? []).some((k) => k.toLowerCase() === key.toLowerCase()))

/* ── el catálogo ─────────────────────────────────────────────────────── */

test('every entry says what it does, how it is used, and under a name', () => {
  for (const [id, e] of entries()) {
    expect(e.titulo.trim(), id).not.toBe('')
    expect(e.que.trim(), id).not.toBe('')
    expect(e.como.trim(), id).not.toBe('')
    // Criterio 4: repetir el nombre del botón no es ayuda.
    expect(e.que.toLowerCase(), id).not.toBe(e.titulo.toLowerCase())
    expect(e.que.length, id).toBeGreaterThan(e.titulo.length)
    expect(e.como.length, id).toBeGreaterThan(20)
    expect(e.que.trim(), id).toMatch(/\.$/)
    expect(e.como.trim(), id).toMatch(/\.$/)
  }
})

test('every control relevado in the spec has an entry', () => {
  const required = [
    // TopBar
    'topbar.name', 'topbar.designs', 'topbar.save', 'topbar.undo', 'topbar.redo',
    'topbar.viewEdit', 'topbar.viewGuide', 'topbar.printGuide', 'topbar.exportJson',
    'topbar.exportSchem', 'topbar.import', 'topbar.storage',
    // ToolPanel
    'tool.brush', 'tool.eraser', 'tool.picker', 'tool.line', 'tool.rect', 'tool.fill',
    'tool.select', 'tool.rectFilled',
    'slice.off', 'slice.below', 'slice.isolate',
    'slice.axisX', 'slice.axisY', 'slice.axisZ',
    'slice.index', 'slice.up', 'slice.down',
    'mirror.x', 'mirror.z',
    'selection.copy', 'selection.cut', 'selection.delete', 'selection.clear', 'selection.paste',
    'panel.materials',
    // PalettePanel
    'palette.search', 'palette.current', 'palette.block', 'palette.catAll', 'palette.catStone',
    'palette.catWood', 'palette.catNature', 'palette.catWool', 'palette.catConcrete',
    'palette.catDecorative',
    // DesignsPanel
    'designs.name', 'designs.dimX', 'designs.dimY', 'designs.dimZ', 'designs.create',
    'designs.resize', 'designs.open', 'designs.delete', 'designs.close',
    'auth.email', 'auth.send', 'auth.signOut',
    // vista
    'view.fit', 'view.grid',
    // GuideView
    'guide.print', 'guide.prev', 'guide.next', 'guide.steps', 'guide.back',
    // mouse y diagnóstico
    'canvas.place', 'canvas.erase', 'canvas.pick', 'canvas.paint', 'canvas.orbit',
    'canvas.pan', 'canvas.zoom', 'debug.panel',
  ]
  for (const id of required) expect(lookupHelp(id), id).toBeTruthy()
})

test('every group in GROUPS is used and every entry lands in one', () => {
  const known = new Set(GROUPS.map((g) => g.key))
  for (const [id, e] of entries()) expect(known.has(e.grupo), id).toBe(true)
  for (const g of GROUPS) {
    expect(entries().some(([, e]) => e.grupo === g.key), g.key).toBe(true)
  }
})

/* ── el catálogo contra los atajos reales de App.tsx ─────────────────── */

test('every single-key shortcut wired in App.tsx is documented', () => {
  const tools = APP.slice(APP.indexOf('TOOL_KEYS'), APP.indexOf('}', APP.indexOf('TOOL_KEYS')))
  const keys = new Set<string>()
  for (const m of tools.matchAll(/(\w):\s*'/g)) keys.add(m[1])
  for (const m of APP.matchAll(/k === '([^']+)'/g)) keys.add(m[1])
  expect(keys.size).toBeGreaterThan(10)
  for (const k of keys) expect(hasKey(k), `tecla ${k}`).toBe(true)
})

test('every Ctrl shortcut wired in App.tsx is documented', () => {
  const keys = new Set<string>()
  for (const m of APP.matchAll(/e\.key\.toLowerCase\(\) === '([^']+)'/g)) keys.add(m[1])
  expect(keys.size).toBeGreaterThan(4)
  for (const k of keys) {
    const found = entries().some(([, e]) =>
      (e.atajo ?? []).some((s) => new RegExp(`^ctrl(\\+shift)?\\+${k}$`, 'i').test(s)),
    )
    expect(found, `Ctrl+${k}`).toBe(true)
  }
})

test('the named keys App.tsx listens for are documented in Spanish', () => {
  const named: Record<string, string> = {
    Escape: 'Esc',
    Delete: 'Supr',
    Backspace: 'Retroceso',
    ArrowUp: '↑',
    ArrowDown: '↓',
    PageUp: 'AvPág',
    PageDown: 'RePág',
  }
  for (const [dom, label] of Object.entries(named)) {
    expect(APP, dom).toContain(`'${dom}'`)
    expect(hasKey(label), label).toBe(true)
  }
})

/* ── lo que consumen 04 y 05 ─────────────────────────────────────────── */

test('the catalog readers 04 and 05 depend on behave', () => {
  expect(lookupHelp('no.existe')).toBeUndefined()
  expect(searchHelp('').length).toBe(HELP_IDS.length)
  expect(searchHelp('Ctrl+S').map(([id]) => id)).toContain('topbar.save')
  expect(searchHelp('cuentagotas').map(([id]) => id)).toContain('tool.picker')
  expect(helpLine(HELP['tool.line'])).toContain('L ·')
})

/* ── comportamiento del componente ───────────────────────────────────── */
/* Requiere el cableado de docs/integracion/03-tooltips.md. */

test.fixme('hover over a tool opens the tooltip after 350 ms', async () => {})

test.fixme('Tab focus opens the tooltip without a mouse', async () => {})

test.fixme('long-press on touch shows the help and does not run the button', async () => {})

test.fixme('the control points aria-describedby at the help text', async () => {})

test.fixme('the tooltip flips so it never leaves the viewport', async () => {})
