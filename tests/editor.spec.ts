import { expect, test, type Page } from '@playwright/test'
import { gunzipSync } from 'node:zlib'

/* ── helpers ─────────────────────────────────────────────────────────── */

async function ready(page: Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => Boolean(window.__mcb))
  // Lets the atlas and first frame settle.
  await page.waitForTimeout(400)
}

const blockCount = (page: Page) =>
  page.evaluate(() => window.__mcb.store.getState().world.size)

/** Minimal NBT reader, just to verify the .schem's structure. */
function readNbt(buf: Buffer) {
  let off = 0
  const u8 = () => buf.readUInt8(off++)
  const i16 = () => { const v = buf.readInt16BE(off); off += 2; return v }
  const i32 = () => { const v = buf.readInt32BE(off); off += 4; return v }
  const str = () => { const n = buf.readUInt16BE(off); off += 2; const s = buf.subarray(off, off + n).toString('utf8'); off += n; return s }

  const payload = (tag: number): unknown => {
    switch (tag) {
      case 1: return u8()
      case 2: return i16()
      case 3: return i32()
      case 8: return str()
      case 7: { const n = i32(); const b = buf.subarray(off, off + n); off += n; return b }
      case 11: { const n = i32(); const a: number[] = []; for (let i = 0; i < n; i++) a.push(i32()); return a }
      case 10: {
        const o: Record<string, unknown> = {}
        for (;;) {
          const t = u8()
          if (t === 0) break
          const name = str()
          o[name] = payload(t)
        }
        return o
      }
      default: throw new Error(`unsupported tag: ${tag}`)
    }
  }

  const rootTag = u8()
  const rootName = str()
  return { rootTag, rootName, value: payload(rootTag) as Record<string, unknown> }
}

/* ── tests ───────────────────────────────────────────────────────────── */

test('the app boots and shows the 3D editor', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await ready(page)

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByTestId('block-count')).toContainText('0 bloques')
  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([])
})

test('places blocks by clicking in the viewport', async ({ page }) => {
  await ready(page)
  const canvas = page.locator('canvas')
  const box = (await canvas.boundingBox())!

  // A click in the center lands on the build plate.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(150)
  expect(await blockCount(page)).toBe(1)

  // A second click elsewhere adds another block.
  await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30)
  await page.waitForTimeout(150)
  expect(await blockCount(page)).toBeGreaterThanOrEqual(2)

  // Undo reverts exactly one block.
  const before = await blockCount(page)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(120)
  expect(await blockCount(page)).toBe(before - 1)
})

test('layer mode: filled rectangle and symmetry', async ({ page }) => {
  await ready(page)

  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 16, y: 12, z: 16 }, 'Test capa')
    s.setSliceView('isolate')
    s.setSliceIndex(0)
    s.setBlock('minecraft:stone_bricks')
    s.setTool('rect')
    s.toggle('rectFilled')
    s.planeAction({ u: 2, v: 2 }, false)
    s.planeAction({ u: 6, v: 5 }, false)
  })
  // 5 x 4 cells
  expect(await blockCount(page)).toBe(20)

  // With X mirroring, every write duplicates.
  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 16, y: 12, z: 16 }, 'Test espejo')
    s.setSliceView('isolate')
    s.toggle('mirrorX')
    s.setTool('brush')
    s.planeAction({ u: 1, v: 1 }, false)
  })
  expect(await blockCount(page)).toBe(2)

  const mirrored = await page.evaluate(() => {
    const w = window.__mcb.store.getState().world
    return [w.get(1, 0, 1), w.get(14, 0, 1)]
  })
  expect(mirrored[0]).toBeTruthy()
  expect(mirrored[1]).toBe(mirrored[0])
})

test('area tools force layer mode', async ({ page }) => {
  await ready(page)
  const view = await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.setSliceView('off')
    s.setTool('line')
    return window.__mcb.store.getState().sliceView
  })
  expect(view).not.toBe('off')
})

test('save, reload, and reopen preserves the design', async ({ page }) => {
  await ready(page)

  const id = await page.evaluate(async () => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 12, y: 8, z: 12 }, 'Torre de prueba')
    s.setSliceView('isolate')
    s.setBlock('minecraft:oak_planks')
    for (let y = 0; y < 5; y++) {
      s.setSliceIndex(y)
      window.__mcb.store.getState().planeAction({ u: 3, v: 3 }, false)
      window.__mcb.store.getState().planeAction({ u: 4, v: 3 }, false)
    }
    await window.__mcb.store.getState().saveCurrent()
    return window.__mcb.store.getState().meta.id
  })

  expect(await blockCount(page)).toBe(10)

  await page.reload()
  await page.waitForFunction(() => Boolean(window.__mcb))
  await page.waitForTimeout(200)

  await page.evaluate(async (designId) => {
    await window.__mcb.store.getState().openDesign(designId)
  }, id)

  expect(await blockCount(page)).toBe(10)
  const name = await page.evaluate(() => window.__mcb.store.getState().meta.name)
  expect(name).toBe('Torre de prueba')
})

test('the guide compresses repeated layers and counts materials', async ({ page }) => {
  await ready(page)

  const guide = await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 10, y: 10, z: 10 }, 'Columna')
    s.setSliceView('isolate')
    s.setBlock('minecraft:stone')
    // Same cell at 6 heights: should collapse into a single step.
    for (let y = 0; y < 6; y++) {
      window.__mcb.store.getState().setSliceIndex(y)
      window.__mcb.store.getState().planeAction({ u: 5, v: 5 }, false)
    }
    // A different layer on top.
    window.__mcb.store.getState().setSliceIndex(6)
    window.__mcb.store.getState().setBlock('minecraft:glass')
    window.__mcb.store.getState().planeAction({ u: 5, v: 5 }, false)

    const g = window.__mcb.buildGuide(window.__mcb.store.getState().world)
    return {
      steps: g.steps.length,
      firstRepeat: g.steps[0].repeat,
      totals: g.totals,
      totalBlocks: g.totalBlocks,
    }
  })

  expect(guide.steps).toBe(2)
  expect(guide.firstRepeat).toBe(6)
  expect(guide.totalBlocks).toBe(7)
  expect(guide.totals).toContainEqual(['minecraft:stone', 6])
  expect(guide.totals).toContainEqual(['minecraft:glass', 1])

  // The guide view shows it.
  await page.getByTestId('view-guide').click()
  await expect(page.getByTestId('guide-step')).toContainText('Paso 1 de 2')
  await expect(page.locator('.rep')).toContainText('6')
})

test('the exported .schem is valid NBT and reads as Sponge v2', async ({ page }) => {
  await ready(page)

  const b64 = await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 8, y: 8, z: 8 }, 'Schem test')
    s.setSliceView('isolate')
    s.setBlock('minecraft:stone')
    s.setSliceIndex(0)
    window.__mcb.store.getState().planeAction({ u: 1, v: 1 }, false)
    window.__mcb.store.getState().planeAction({ u: 2, v: 1 }, false)
    window.__mcb.store.getState().setBlock('minecraft:glass')
    window.__mcb.store.getState().planeAction({ u: 1, v: 2 }, false)

    const st = window.__mcb.store.getState()
    const bytes = window.__mcb.buildSchem(st.world, st.meta)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  })

  const gz = Buffer.from(b64, 'base64')
  // Gzip header.
  expect(gz[0]).toBe(0x1f)
  expect(gz[1]).toBe(0x8b)

  const nbt = readNbt(gunzipSync(gz))
  expect(nbt.rootTag).toBe(10)
  expect(nbt.rootName).toBe('Schematic')

  const v = nbt.value
  expect(v.Version).toBe(2)
  expect(typeof v.DataVersion).toBe('number')
  // Bounding box of the 3 blocks: x 1..2, z 1..2, y 0.
  expect(v.Width).toBe(2)
  expect(v.Height).toBe(1)
  expect(v.Length).toBe(2)

  const palette = v.Palette as Record<string, number>
  expect(palette['minecraft:air']).toBe(0)
  expect(palette['minecraft:stone']).toBeGreaterThan(0)
  expect(palette['minecraft:glass']).toBeGreaterThan(0)
  expect(v.PaletteMax).toBe(Object.keys(palette).length)

  const data = v.BlockData as Buffer
  expect(data.length).toBe(4) // 2x1x2 cells, all with a 1-byte varint
  // Order (y*Length + z)*Width + x  →  [ (1,1) stone, (2,1) stone, (1,2) glass, air ]
  const stone = palette['minecraft:stone']
  const glass = palette['minecraft:glass']
  expect([...data]).toEqual([stone, stone, glass, 0])
})

test('screenshot of the editor with a build', async ({ page }) => {
  await ready(page)

  await page.evaluate(() => {
    const s = window.__mcb.store.getState()
    s.newDesign({ x: 24, y: 16, z: 24 }, 'Casa de muestra')
    const st = () => window.__mcb.store.getState()
    st().setSliceView('isolate')

    // Floor
    st().setSliceIndex(0)
    st().setBlock('minecraft:stone_bricks')
    st().setTool('rect')
    st().toggle('rectFilled')
    st().planeAction({ u: 6, v: 6 }, false)
    st().planeAction({ u: 16, v: 15 }, false)

    // Walls
    st().setTool('rect')
    st().toggle('rectFilled') // back to outline
    for (let y = 1; y <= 4; y++) {
      st().setSliceIndex(y)
      st().setBlock(y === 2 ? 'minecraft:glass' : 'minecraft:oak_planks')
      st().planeAction({ u: 6, v: 6 }, false)
      st().planeAction({ u: 16, v: 15 }, false)
    }

    // Roof
    st().setSliceIndex(5)
    st().setBlock('minecraft:dark_oak_planks')
    st().setTool('rect')
    st().toggle('rectFilled')
    st().planeAction({ u: 5, v: 5 }, false)
    st().planeAction({ u: 17, v: 16 }, false)

    st().setSliceView('off')
    st().setTool('brush')
  })

  await page.waitForTimeout(900)
  await page.screenshot({ path: 'test-results/editor.png', fullPage: false })

  await page.getByTestId('view-guide').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'test-results/guide.png', fullPage: false })

  expect(await blockCount(page)).toBeGreaterThan(100)
})
