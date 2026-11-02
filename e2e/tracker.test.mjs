// Browser tests for the tracker. They drive the real page in Chrome with real mouse
// input. Start the app first (see README.md); TRACKER_URL points at it.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { chromium } from 'playwright-core'

const URL = process.env.TRACKER_URL ?? 'http://localhost:3000'
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

let browser
let page
const consoleErrors = []

before(async () => {
  browser = await chromium.launch({ executablePath: CHROME, headless: true })
})

after(async () => {
  await browser?.close()
})

beforeEach(async () => {
  // A fresh browser profile each time, so a saved run never leaks between tests.
  const context = await browser.newContext({ viewport: { width: 1100, height: 1400 } })
  page = await context.newPage()
  consoleErrors.length = 0
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await openTracker()
})

// The Updates popup appears just after the page mounts, so wait for it before closing it.
async function openTracker(reload = false) {
  if (reload) await page.reload()
  else await page.goto(URL)
  await page.locator('.overworld-grid').first().waitFor()
  const popup = page.locator('.updates-backdrop')
  if (await popup.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
    await page.getByRole('button', { name: 'OK', exact: true }).click()
    await popup.waitFor({ state: 'detached' })
  }
}

const cell = (row, column) => page.locator('.palace-cell').nth(row * 13 + column)
const pageTo = async (name) => {
  for (let i = 0; i < 9; i++) {
    if (await page.getByRole('grid', { name: `${name} map grid` }).count()) return
    await page.getByRole('button', { name: /^Next map/ }).click()
  }
  throw new Error(`never reached ${name}`)
}
const exits = async (row, column) =>
  /exits (\w*)/.exec((await cell(row, column).getAttribute('aria-label')) ?? '')?.[1]
const place = async (row, column, label) => {
  await cell(row, column).click({ button: 'right' })
  await page.locator('.palace-menu-button', { hasText: new RegExp(`^${label}$`, 'i') }).click()
}
const savedRun = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('z2-tracker-run') ?? 'null'))

describe('the page', () => {
  it('loads without errors', async () => {
    await page.waitForTimeout(500)
    assert.deepEqual(consoleErrors, [])
  })

  it('keeps the icon menu to five rows with Items/Spells at the end', async () => {
    await page.locator('.overworld-cell').nth(60).click({ button: 'right' })
    const rows = await page
      .locator('.overworld-menu-row')
      .evaluateAll((nodes) =>
        nodes.map((row) =>
          [...row.children].map((el) => el.getAttribute('aria-label') ?? el.textContent.trim()),
        ),
      )
    assert.equal(rows.length, 5)
    assert.equal(rows[3].length, 8)
    assert.deepEqual(rows[4], ['Bridge', 'Raft', 'River Devil', 'Boulder', 'Items/Spells'])
  })

  it('shows 3/6 palaces and no leftover bottom bar in the icon menu', async () => {
    await page.locator('.overworld-cell').nth(60).click({ button: 'right' })
    assert.equal(await page.locator('.overworld-menu-items').count(), 0)
    assert.equal(await page.locator('.overworld-menu img[src*="palace3"]').count(), 1)
  })
})

describe('small screens', () => {
  it('fits the board inside a phone-width window', async () => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openTracker(true)
    const box = await page.locator('.game-canvas').boundingBox()
    assert.ok(box.x >= 0, 'board is cut off on the left')
    assert.ok(box.x + box.width <= 375, 'board is cut off on the right')
  })
})

describe('flag presets', () => {
  const pickBeginner = async () => {
    await page.locator('[aria-label^="Flags"]').first().click({ button: 'right' })
    await page.getByRole('menuitemradio', { name: 'Beginner', exact: true }).click()
  }

  it('picks a first flagset without asking when nothing has been marked', async () => {
    await pickBeginner()
    assert.equal(await page.getByText('Change Flags?').count(), 0)
  })

  it('asks before a first flag pick wipes palace rooms', async () => {
    await pageTo('Palace 1')
    await place(4, 4, 'Pass L')
    await pickBeginner()
    await page.getByText('Change Flags?').waitFor()
    await page.getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await exits(4, 4), 'W') // nothing was cleared
  })
})

describe('page arrows', () => {
  it('stay in the same place on every map', async () => {
    const tops = []
    const lefts = []
    for (let i = 0; i < 4; i++) {
      const box = await page.getByRole('button', { name: /^Previous map/ }).boundingBox()
      tops.push(Math.round(box.y))
      lefts.push(Math.round(box.x))
      await page.getByRole('button', { name: /^Next map/ }).click()
    }
    assert.equal(new Set(tops).size, 1, `arrow moved vertically: ${tops}`)
  })
})

describe('palace maps', () => {
  it('pages through every map and wraps round', async () => {
    const names = []
    for (let i = 0; i < 8; i++) {
      await page.getByRole('button', { name: /^Next map/ }).click()
      const grids = await page.getByRole('grid').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('aria-label')),
      )
      names.push(grids.filter((label) => /map grid|overworld grid/.test(label)).join('+'))
    }
    assert.equal(names[0], 'Palace 1 map grid')
    assert.equal(names[5], 'Palace 6 map grid')
    assert.equal(names[6], 'Great Palace map grid')
    assert.match(names[7], /West overworld grid\+East overworld grid/)
  })

  it('gives each palace 13 by 13 squares and the Great Palace more', async () => {
    await pageTo('Palace 1')
    assert.equal(await page.locator('.palace-cell').count(), 169)
    await pageTo('Great Palace')
    assert.equal(await page.locator('.palace-cell').count(), 13 * 20)
  })

  it('turns a new room to meet an elevator entrance', async () => {
    await pageTo('Palace 3')
    await place(6, 4, 'E elevator up')
    assert.equal(await exits(6, 4), 'N')
    await place(5, 4, 'Dead end')
    assert.equal(await exits(5, 4), 'S') // opens down to the entrance below
  })

  it('joins a room placed above a vertical connector', async () => {
    await pageTo('Palace 3')
    await place(6, 4, 'Pass up-down')
    await place(5, 4, 'Pass L')
    assert.equal(await exits(5, 4), 'SW')
  })

  it('turns a room on a left click and clears it on a middle click', async () => {
    await pageTo('Palace 3')
    await place(4, 4, 'Pass up-down')
    await cell(4, 4).click()
    assert.equal(await exits(4, 4), 'EW')
    await cell(4, 4).click({ button: 'middle' })
    assert.match((await cell(4, 4).getAttribute('aria-label')) ?? '', /empty/)
  })

  it('links two far apart rooms by dragging, and only across opposite sides', async () => {
    await pageTo('Palace 2')
    await place(2, 1, 'Pass R')
    await place(9, 10, 'Pass L')
    const drag = async (from, fromDx, to, toDx) => {
      const a = await cell(...from).boundingBox()
      const b = await cell(...to).boundingBox()
      await page.mouse.move(a.x + a.width / 2 + fromDx, a.y + a.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2 + toDx, b.y + b.height / 2, { steps: 8 })
      await page.mouse.up()
    }
    // Out of the right edge and into the same edge: not a passage.
    await drag([2, 1], 8, [9, 10], 8)
    assert.equal((await savedRun()).palaceLinks.length, 0)
    // Out of the right edge and into the left edge.
    await drag([2, 1], 8, [9, 10], -8)
    const links = (await savedRun()).palaceLinks
    assert.equal(links.length, 1)
    assert.deepEqual(
      [links[0].a.side, links[0].b.side, links[0].page],
      ['E', 'W', 'p2'],
    )
    assert.equal(await page.locator('.palace-links path').count(), 1)
  })

  it('keeps rooms and links after a reload', async () => {
    await pageTo('Palace 4')
    await place(3, 3, 'Pass L')
    await place(3, 9, 'Pass R')
    await page.waitForTimeout(300)
    await openTracker(true)
    await pageTo('Palace 4')
    assert.equal(await exits(3, 3), 'W')
    assert.equal(await exits(3, 9), 'E')
  })

  it('opens the room menu inside the maps area', async () => {
    await pageTo('Palace 1')
    await cell(0, 0).click({ button: 'right' })
    const menu = await page.locator('.palace-menu').boundingBox()
    const section = await page.locator('.overworld').first().boundingBox()
    assert.ok(menu.x >= section.x - 1, 'menu spills off the left edge')
    assert.ok(menu.x + menu.width <= section.x + section.width + 1, 'menu spills off the right edge')
  })
})

describe('saves', () => {
  it('reads an old save with no palace data', async () => {
    await page.evaluate(() => {
      const run = JSON.parse(localStorage.getItem('z2-tracker-run') ?? 'null')
      if (!run) return
      delete run.palaceRooms
      delete run.palaceLinks
      localStorage.setItem('z2-tracker-run', JSON.stringify(run))
    })
    await page.waitForTimeout(200)
    await openTracker(true)
    await page.waitForTimeout(300)
    const run = await savedRun()
    assert.deepEqual(run.palaceRooms, {})
    assert.deepEqual(run.palaceLinks, [])
  })
})
