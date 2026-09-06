import { expect, test, type Page } from '@playwright/test'

async function ready(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => Boolean(window.__mcb))
  // Lets the atlas and first frame settle.
  await page.waitForTimeout(400)
}

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

test('en modo build, arrastrar sobre la construcción pinta', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBeGreaterThan(before)
})

test('en modo navigate, el mismo arrastre no escribe nada', async ({ page }) => {
  await ready(page)
  await platform(page)
  await page.evaluate(() => window.__mcb.store.getState().setMode('navigate'))
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before)
})

test('un click con temblor coloca exactamente un bloque', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1)
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await count(page)).toBe(before + 1)
})

test('el cursor y la edición resuelven a la misma celda', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.mouse.move(cx, cy)
  await page.waitForTimeout(150)
  const hover = await page.evaluate(() => window.__mcb.store.getState().hover)

  await page.mouse.click(cx, cy)
  await page.waitForTimeout(200)

  const written = await page.evaluate((h) => {
    const w = window.__mcb.store.getState().world
    return h ? Boolean(w.get(h.x, h.y, h.z)) : false
  }, hover)

  expect(hover).not.toBeNull()
  expect(written).toBe(true)
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
  await page.waitForTimeout(400)
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)

  const ys = await page.evaluate(() => {
    const w = window.__mcb.store.getState().world
    return [...w.voxels.keys()].map((k) => (k >>> 10) & 1023)
  })
  expect(ys.length).toBeGreaterThan(0)
  expect(new Set(ys)).toEqual(new Set([3]))
})

test('en modo capa, la línea necesita dos clicks y usa el ancla', async ({ page }) => {
  await ready(page)
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 16, y: 12, z: 16 }, 'Línea')
    s.setSliceView('isolate')
    s.setSliceIndex(2)
    s.setTool('line')
  })
  await page.waitForTimeout(400)
  const box = (await page.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.mouse.click(cx - 60, cy)
  await page.waitForTimeout(150)
  const afterFirst = await page.evaluate(() => ({
    anchor: window.__mcb.store.getState().anchor,
    size: window.__mcb.store.getState().world.size,
  }))

  await page.mouse.click(cx + 60, cy)
  await page.waitForTimeout(200)
  const afterSecond = await count(page)

  // The first click only drops the anchor; the second draws the run.
  expect(afterFirst.anchor).not.toBeNull()
  expect(afterFirst.size).toBe(0)
  expect(afterSecond).toBeGreaterThan(1)
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
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60)
  await page.waitForTimeout(200)

  const belowGrid = await page.evaluate(() => {
    const events = JSON.parse(window.__mcb.tel.toJSON()).events as
      { ev: string; data?: Record<string, number> }[]
    return events.some((e) => e.ev.startsWith('hover') && (e.data?.y ?? 0) < 0)
  })

  expect(belowGrid).toBe(false)
  expect(await page.evaluate(() => window.__mcb.store.getState().hover)).toBeNull()
})

test('en navigate, el registro no contiene ninguna escritura durante el gesto', async ({ page }) => {
  await ready(page)
  await platform(page)
  await page.evaluate(() => {
    window.__mcb.store.getState().setMode('navigate')
    window.__mcb.tel.clear()
  })
  const box = (await page.locator('canvas').boundingBox())!

  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  const writes = await page.evaluate(() => {
    const events = JSON.parse(window.__mcb.tel.toJSON()).events as { ev: string }[]
    return events.filter((e) => e.ev === 'write').length
  })
  expect(writes).toBe(0)
})
