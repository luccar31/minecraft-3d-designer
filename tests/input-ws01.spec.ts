import { expect, test, type Page } from '@playwright/test'

/* ── helpers ─────────────────────────────────────────────────────────── */

async function ready(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => Boolean(window.__mcb))
  await page.waitForTimeout(400)
}

/** A 6x6 platform at y = 0, centred in the viewport. */
async function platform(page: Page) {
  await page.evaluate(() => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Input')
    st().setSliceView('off')
    st().setTool('brush')
    st().setBlock('minecraft:stone')
    const cells = []
    for (let x = 5; x <= 10; x++) for (let z = 5; z <= 10; z++)
      cells.push({ p: { x, y: 0, z }, id: 'minecraft:stone' })
    st().applyCells(cells)
    st().requestFit()
  })
  await page.waitForTimeout(700)
}

const count = (page: Page) =>
  page.evaluate(() => window.__mcb.store.getState().world.size)

const events = (page: Page) =>
  page.evaluate(() => {
    const log = JSON.parse(window.__mcb.tel.toJSON()) as {
      events: { ev: string; data?: Record<string, number | string> }[]
    }
    return log.events
  })

const center = async (page: Page) => {
  const box = (await page.locator('canvas').boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

/* ── tests ───────────────────────────────────────────────────────────── */

test('en modo construir, arrastrar sobre la construcción pinta', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)
  const before = await count(page)

  await page.mouse.move(x - 30, y)
  await page.mouse.down()
  await page.mouse.move(x + 30, y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBeGreaterThan(before)
})

test('con Espacio mantenido, el mismo arrastre no escribe nada', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)
  const before = await count(page)

  await page.keyboard.down('Space')
  await page.mouse.move(x - 30, y)
  await page.mouse.down()
  await page.mouse.move(x + 30, y, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before)
  // Soltar tras orbitar es transitorio: el modo vuelve a construir.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 20, y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await count(page)).toBeGreaterThan(before)
})

test('un click con temblor coloca exactamente un bloque', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)
  const before = await count(page)

  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 2, y + 1)
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before + 1)
})

test('el cursor y la edición resuelven a la misma celda', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)

  await page.mouse.move(x, y)
  await page.waitForTimeout(150)
  const hover = await page.evaluate(() => window.__mcb.store.getState().hover)

  await page.mouse.click(x, y)
  await page.waitForTimeout(200)

  const written = await page.evaluate((h) => {
    const w = window.__mcb.store.getState().world
    return h ? Boolean(w.get(h.x, h.y, h.z)) : false
  }, hover)

  expect(hover).not.toBeNull()
  expect(written).toBe(true)
})

test('Shift cambia la celda apuntada en vivo, sin clickear', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)

  await page.mouse.move(x, y)
  await page.waitForTimeout(150)
  const placing = await page.evaluate(() => window.__mcb.store.getState().hover)

  await page.keyboard.down('Shift')
  await page.waitForTimeout(150)
  const erasing = await page.evaluate(() => window.__mcb.store.getState().hover)
  await page.keyboard.up('Shift')

  expect(placing).not.toBeNull()
  expect(erasing).not.toBeNull()
  // Colocar apunta encima del bloque; borrar, al bloque mismo.
  expect(erasing!.y).toBe(placing!.y - 1)
})

test('la goma sobre el piso vacío no apunta debajo de la grilla', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Goma')
    st().setSliceView('off')
    st().setTool('eraser')
    window.__mcb.tel.clear()
  })
  const { x, y } = await center(page)
  await page.mouse.move(x, y + 40)
  await page.waitForTimeout(200)

  const belowGrid = (await events(page)).some(
    (e) => e.ev.startsWith('hover') && Number(e.data?.y ?? 0) < 0,
  )

  expect(belowGrid).toBe(false)
  expect(await page.evaluate(() => window.__mcb.store.getState().hover)).toBeNull()
})

test('tras un pointercancel la órbita vuelve y se puede seguir usando', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)

  await page.mouse.move(x - 30, y)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 6 })
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }))
  })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const orbit = (await events(page)).filter((e) => e.ev === 'camera.orbit-enabled').pop()
  expect(orbit?.data?.active).toBe(1)

  // Y la cámara vuelve a responder: arrastrar en el vacío la mueve.
  await page.evaluate(() => window.__mcb.tel.clear())
  const before = await count(page)
  await page.mouse.move(x, y - 150)
  await page.mouse.down()
  await page.mouse.move(x + 60, y - 130, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect((await events(page)).some((e) => e.ev === 'camera.pose')).toBe(true)
  expect(await count(page)).toBe(before)
})

test('el botón del medio orbita sobre la construcción sin escribir', async ({ page }) => {
  await ready(page)
  await platform(page)
  const { x, y } = await center(page)
  const before = await count(page)
  await page.evaluate(() => window.__mcb.tel.clear())

  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(x + 60, y + 20, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before)
  expect((await events(page)).some((e) => e.ev === 'camera.pose')).toBe(true)
})

test('en modo capa, un click dibuja en la celda de la capa activa', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 16, y: 12, z: 16 }, 'Capa')
    s.setSliceView('isolate')
    s.setSliceIndex(3)
    s.setTool('brush')
  })
  await page.waitForTimeout(300)
  const { x, y } = await center(page)
  await page.mouse.click(x, y)
  await page.waitForTimeout(200)

  const ys = await page.evaluate(() => {
    const w = window.__mcb.store.getState().world
    return [...w.voxels.keys()].map((k) => (k >>> 10) & 1023)
  })
  expect(ys.length).toBeGreaterThan(0)
  expect(new Set(ys)).toEqual(new Set([3]))
})

test('encuadrar con un solo bloque no mete la cámara adentro', async ({ page }) => {
  await ready(page)
  const dist = await page.evaluate(async () => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Uno')
    st().paintAt({ x: 8, y: 0, z: 8 }, false)
    st().requestFit()
    await new Promise((r) => setTimeout(r, 600))
    const log = JSON.parse(window.__mcb.tel.toJSON()) as {
      events: { ev: string; data?: Record<string, number> }[]
    }
    const pose = log.events.filter((e) => e.ev === 'camera.pose').pop()
    if (!pose?.data) return null
    const dx = pose.data.x - 8.5
    const dy = pose.data.y - 0.5
    const dz = pose.data.z - 8.5
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  })
  expect(dist).not.toBeNull()
  expect(dist!).toBeGreaterThan(6)
})

/* ── pendiente de la pasada de integración: ver docs/integracion/01-input.md ── */

test.fixme('el indicador de modo se ve en la barra del viewport', async ({ page }) => {
  // Necesita montar <ModeIndicator /> en App.tsx. Diff en docs/integracion/01-input.md.
  await ready(page)
  await expect(page.getByTestId('mode-indicator')).toBeVisible()
})

test.fixme('el modo vive en el store y es consultable', async ({ page }) => {
  // Necesita `mode` y `setMode` en el store. Diff en docs/integracion/01-input.md.
  await ready(page)
  expect(await page.evaluate(() => window.__mcb.store.getState().mode)).toBe('build')
})
