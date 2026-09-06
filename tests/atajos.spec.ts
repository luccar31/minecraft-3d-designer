import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { comboLabels, GROUPS, matchShortcut, SHORTCUTS } from '../src/ui/atajos'

/* ── helpers ─────────────────────────────────────────────────────────── */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8')

/** True once the integration pass wired App.tsx to atajos.ts. */
const INTEGRATED = /from '\.\/ui\/atajos'/.test(APP)

const norm = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

/**
 * A shortcut as the comparison sees it: Ctrl and the key. Shift is left out
 * because App.tsx splits undo/redo inside the branch, not in the condition.
 */
const token = (key: string, mod: boolean) => `${mod ? 'ctrl+' : ''}${norm(key)}`

/** Reads the keys the keyboard handler of App.tsx actually answers to. */
function tokensFromApp(src: string): Set<string> {
  const out = new Set<string>()

  const tools = /const TOOL_KEYS[^=]*=\s*\{([\s\S]*?)\}/.exec(src)
  if (!tools) throw new Error('no se encontró TOOL_KEYS en App.tsx')
  for (const m of tools[1].matchAll(/(\w+)\s*:\s*'/g)) out.add(token(m[1], false))

  const from = src.indexOf('const onKey =')
  const to = src.indexOf("window.addEventListener('keydown'")
  if (from < 0 || to < 0) throw new Error('no se encontró el manejador de teclado en App.tsx')

  for (const line of src.slice(from, to).split('\n')) {
    if (!line.includes('if (')) continue
    const mod = /\bmod\b/.test(line)
    const keys = line.matchAll(/(?:e\.key(?:\.toLowerCase\(\))?|\bk)\s*===\s*'([^']+)'/g)
    for (const m of keys) out.add(token(m[1], mod))
  }
  return out
}

const tokensFromMap = () =>
  new Set(
    SHORTCUTS.filter((s) => !s.pending).flatMap((s) =>
      s.keys.map((k) => token(k, s.mod === 'yes')),
    ),
  )

const sorted = (s: Set<string>) => [...s].sort()

/* ── criterio 1: ni uno de más, ni uno de menos ──────────────────────── */

test('atajos.ts cubre exactamente las teclas del manejador de App.tsx', () => {
  test.skip(
    INTEGRATED,
    'App.tsx ya consume atajos.ts: no hay dos listas que puedan desincronizarse',
  )

  const app = tokensFromApp(APP)
  // Guard: si el parser dejara de encontrar teclas, el test pasaría vacío.
  expect(app.size, 'el parser de App.tsx no encontró teclas').toBeGreaterThan(24)
  expect(sorted(tokensFromMap())).toEqual(sorted(app))
})

test('las ramas sensibles a Shift de App.tsx siguen siendo las del mapa', () => {
  test.skip(INTEGRATED, 'App.tsx ya consume atajos.ts')

  // Shift no aparece en la condición: distingue deshacer de rehacer y abre la
  // telemetría. El resto de los atajos lo ignora.
  expect(APP).toContain('e.shiftKey ? s.redo() : s.undo()')
  expect(APP).toContain("if (mod && e.shiftKey && e.key.toLowerCase() === 'd')")

  const shiftAware = SHORTCUTS.filter((s) => s.shift && s.shift !== 'any').map((s) => s.id)
  expect(shiftAware.sort()).toEqual(['debug.telemetry', 'edit.redo', 'edit.undo'])
})

/* ── invariantes del mapa ────────────────────────────────────────────── */

test('el mapa no tiene ids repetidos, huecos ni grupos sueltos', () => {
  const ids = SHORTCUTS.map((s) => s.id)
  expect(new Set(ids).size).toBe(ids.length)

  const groups = new Set(GROUPS.map((g) => g.id))
  for (const s of SHORTCUTS) {
    expect(s.keys.length, `${s.id} sin teclas`).toBeGreaterThan(0)
    expect(s.label.trim().length, `${s.id} sin descripción`).toBeGreaterThan(0)
    expect(groups.has(s.group), `${s.id} en un grupo que no está en GROUPS`).toBe(true)
    expect(comboLabels(s).length).toBe(s.keys.length)
  }
})

test('cada combinación resuelve a un solo atajo', () => {
  const seen = new Map<string, string>()
  for (const s of SHORTCUTS) {
    for (const k of s.keys) {
      const combo = `${token(k, s.mod === 'yes')}/${s.mod ?? 'no'}/${s.shift ?? 'any'}`
      expect(seen.has(combo), `${s.id} choca con ${seen.get(combo)}`).toBe(false)
      seen.set(combo, s.id)
    }
  }
})

test('matchShortcut reproduce las decisiones del manejador', () => {
  const ev = (key: string, mods: { ctrl?: boolean; shift?: boolean } = {}) =>
    ({ key, ctrlKey: !!mods.ctrl, metaKey: false, shiftKey: !!mods.shift }) as KeyboardEvent

  expect(matchShortcut(ev('z', { ctrl: true }))?.id).toBe('edit.undo')
  expect(matchShortcut(ev('Z', { ctrl: true, shift: true }))?.id).toBe('edit.redo')
  expect(matchShortcut(ev('d', { ctrl: true, shift: true }))?.id).toBe('debug.telemetry')
  expect(matchShortcut(ev('s', { ctrl: true }))?.id).toBe('file.save')
  expect(matchShortcut(ev('s'))?.id).toBe('tool.select')
  expect(matchShortcut(ev('c'))?.id).toBe('view.fit')
  expect(matchShortcut(ev('x'))?.id).toBe('mirror.x')
  // Escape, Supr y las flechas ignoran Ctrl, como hoy.
  expect(matchShortcut(ev('Escape', { ctrl: true }))?.id).toBe('edit.cancel')
  expect(matchShortcut(ev('PageDown', { ctrl: true }))?.id).toBe('view.layerDown')
  // Con Ctrl, las teclas sueltas no hacen nada.
  expect(matchShortcut(ev('g', { ctrl: true }))).toBeUndefined()
  expect(matchShortcut(ev('q'))).toBeUndefined()
})

/* ── pendiente del cableado de App.tsx ───────────────────────────────── */

test.fixme(
  'el panel se abre con ? y se cierra con Esc (requiere docs/integracion/04-atajos.md)',
  async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcuts-panel')).toHaveCount(0)
  },
)

test.fixme(
  'en touch se llega desde el botón de ayuda (requiere docs/integracion/04-atajos.md)',
  async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.getByTestId('open-shortcuts').click()
    await expect(page.getByTestId('shortcuts-panel')).toBeVisible()
    await page.getByTestId('shortcuts-search').fill('espejo')
    await expect(page.locator('[data-shortcut="mirror.x"]')).toBeVisible()
    await expect(page.locator('[data-shortcut="tool.brush"]')).toHaveCount(0)
  },
)
