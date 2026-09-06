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

test('apretar Shift sin mover el mouse cambia la celda apuntada', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)
  const placing = await page.evaluate(() => window.__mcb.store.getState().hover)

  await page.keyboard.down('Shift')
  await page.waitForTimeout(200)
  const erasing = await page.evaluate(() => window.__mcb.store.getState().hover)
  await page.keyboard.up('Shift')
  await page.waitForTimeout(200)
  const back = await page.evaluate(() => window.__mcb.store.getState().hover)

  // Placing aims one cell above the block Shift+click would erase.
  expect(placing).not.toBeNull()
  expect(erasing).not.toBeNull()
  expect(erasing!.y).toBe(placing!.y - 1)
  expect(back).toEqual(placing)
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

test('encuadrar con un solo bloque no mete la cámara adentro', async ({ page }) => {
  await ready(page)
  const dist = await page.evaluate(async () => {
    const st = () => window.__mcb.store.getState()
    st().newDesign({ x: 16, y: 12, z: 16 }, 'Uno')
    st().paintAt({ x: 8, y: 0, z: 8 }, false)
    st().requestFit()
    await new Promise((r) => setTimeout(r, 600))
    const log = window.__mcb.tel.toJSON()
    const events = JSON.parse(log).events as { ev: string; data?: Record<string, number> }[]
    const pose = events.filter((e) => e.ev === 'camera.pose').pop()
    if (!pose?.data) return null
    const dx = pose.data.x - 8.5, dy = pose.data.y - 0.5, dz = pose.data.z - 8.5
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  })
  expect(dist).not.toBeNull()
  expect(dist!).toBeGreaterThan(6)
})

const poseCount = (page: Page) =>
  page.evaluate(() => {
    const events = JSON.parse(window.__mcb.tel.toJSON()).events as { ev: string }[]
    return events.filter((e) => e.ev === 'camera.pose').length
  })

test('en navigate, el mismo arrastre sí mueve la cámara sobre la construcción', async ({ page }) => {
  await ready(page)
  await platform(page)
  await page.evaluate(() => {
    window.__mcb.store.getState().setMode('navigate')
    window.__mcb.tel.clear()
  })
  const box = (await page.locator('canvas').boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  expect(await poseCount(page)).toBeGreaterThan(0)
})

test('el cursor no queda flotando cuando el puntero sale de la construcción', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.__mcb.store.getState().hover)).not.toBeNull()

  await page.mouse.move(box.x + 4, box.y + 4)
  await page.waitForTimeout(250)
  expect(await page.evaluate(() => window.__mcb.store.getState().hover)).toBeNull()
})

test('perder el gesto a mitad de camino no deja la órbita trabada', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.evaluate(() => window.__mcb.tel.clear())
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 12, cy, { steps: 4 })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.mouse.up()
  await page.waitForTimeout(200)

  const aborted = await page.evaluate(() => {
    const events = JSON.parse(window.__mcb.tel.toJSON()).events as
      { ev: string; data?: Record<string, unknown> }[]
    return events.filter((e) => e.ev === 'gesture.aborted').map((e) => e.data?.reason)
  })
  expect(aborted).toContain('blur')

  // The old bug left controls.enabled false until a reload.
  await page.evaluate(() => {
    window.__mcb.store.getState().setMode('navigate')
    window.__mcb.tel.clear()
  })
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 90, cy + 30, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await poseCount(page)).toBeGreaterThan(0)
})

test('Espacio alterna el modo y la interfaz lo refleja', async ({ page }) => {
  await ready(page)
  await expect(page.getByTestId('mode-indicator')).toContainText('Construir')
  await expect(page.locator('.viewport')).toHaveClass(/build/)

  await page.keyboard.press('Space')
  await expect(page.getByTestId('mode-indicator')).toContainText('Navegar')
  await expect(page.locator('.viewport')).toHaveClass(/navigate/)

  await page.keyboard.press('Space')
  await expect(page.getByTestId('mode-indicator')).toContainText('Construir')
})

test('mantener Espacio y orbitar restaura el modo previo', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  const before = await count(page)

  await page.keyboard.down('Space')
  await expect(page.getByTestId('mode-indicator')).toContainText('Navegar')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.up('Space')

  await expect(page.getByTestId('mode-indicator')).toContainText('Construir')
  expect(await count(page)).toBe(before)
})

test('la lectura de coordenadas sigue a la celda apuntada', async ({ page }) => {
  await ready(page)
  await platform(page)
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(200)

  const hover = (await page.evaluate(() => window.__mcb.store.getState().hover))!
  await expect(page.getByTestId('coord-readout')).toContainText(`x ${hover.x}`)
  await expect(page.getByTestId('coord-readout')).toContainText(`z ${hover.z}`)
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

test('el picking sobrevive a entrar y salir del modo capa', async ({ page }) => {
  await ready(page)
  await platform(page)

  // raycast={undefined} escribía una propiedad propia que tapaba
  // Mesh.prototype.raycast, y sólo al volver de modo capa el prop cambiaba.
  await page.evaluate(async () => {
    const s = () => window.__mcb.store.getState()
    s().setSliceView('isolate')
    s().setSliceIndex(3)
    await new Promise((r) => setTimeout(r, 300))
    s().setSliceView('off')
    await new Promise((r) => setTimeout(r, 400))
    window.__mcb.tel.clear()
  })

  const before = await page.evaluate(() => window.__mcb.store.getState().world.size)
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(300)

  const after = await page.evaluate(() => window.__mcb.store.getState().world.size)
  const errors = await page.evaluate(() => {
    const events = JSON.parse(window.__mcb.tel.toJSON()).events as { cat: string }[]
    return events.filter((e) => e.cat === 'error').length
  })

  expect(errors, 'el raycast no debe lanzar').toBe(0)
  expect(after).toBe(before + 1)
})
