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

describe('overworld squares', () => {
  it('puts the last picked icon on an empty square with a left click', async () => {
    const squares = page.locator('.overworld-cell:not(.palace-cell)')
    // Nothing picked yet: a click on an empty square does nothing.
    await squares.nth(61).click()
    const before = Object.keys((await savedRun())?.overworldCells ?? {}).length
    assert.equal(before, 1) // only the starting palace
    await squares.nth(50).click({ button: 'right' })
    await page.locator('.overworld-menu img[src*="mountain"]').first().click()
    await squares.nth(62).click()
    await page.waitForTimeout(300)
    const cells = (await savedRun()).overworldCells ?? {}
    assert.equal(Object.values(cells).filter((id) => id === 'mountain').length, 2)
    assert.equal(Object.keys(cells).length, before + 2)
  })
})

describe('picking a placed icon', () => {
  it('a left click on a placed icon makes it the one an empty square gets', async () => {
    const squares = page.locator('.overworld-cell:not(.palace-cell)')
    await squares.nth(50).click({ button: 'right' })
    await page.locator('.overworld-menu img[src*="mountain"]').first().click()
    await squares.nth(50).click({ button: 'right' })
    await page.locator('.overworld-menu img[src*="forest"]').first().click()
    // Click the mountain-less way: pick the forest again via a plain click, then place.
    await squares.nth(50).click()
    await squares.nth(63).click()
    await page.waitForTimeout(300)
    const cells = (await savedRun()).overworldCells ?? {}
    assert.equal(Object.values(cells).filter((id) => id === 'forest').length, 2)
  })
})

describe('item collection', () => {
  it('names the town an item is waiting in', async () => {
    await page.locator('[aria-label^="Rauru item"]').click({ button: 'right' })
    await page.locator('[aria-label^="Choose an item"]').getByRole('button', { name: /^Hammer/ }).first().click()
    const slot = page.locator('.collection-slot[aria-label^="Hammer"]')
    assert.match((await slot.getAttribute('aria-label')) ?? '', /in Rauru/)
    assert.equal(await slot.locator('.glyph-text').count(), 1)
  })

  it('tags the fountain as Nabooru and the basement and tower as New Kasuto', async () => {
    const choose = async (location, item) => {
      await page.locator(`[aria-label^="${location}"]`).first().click({ button: 'right' })
      await page.locator('[aria-label^="Choose an item"]').getByRole('button', { name: new RegExp(`^${item}`) }).first().click()
    }
    await choose('Fountain', 'Hammer')
    await choose("Granny's Basement:", 'Glove')
    await choose('Spell Tower', 'Candle')
    const label = (item) => page.locator(`.collection-slot[aria-label^="${item}"]`).getAttribute('aria-label')
    assert.match((await label('Hammer')) ?? '', /in Nabooru/)
    assert.match((await label('Glove')) ?? '', /in New Kasuto/)
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
    await place(4, 4, 'Door L')
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
    await place(5, 4, 'Door L')
    assert.equal(await exits(5, 4), 'SW')
  })

  it('leaves neighbours alone when auto-join is off', async () => {
    await pageTo('Palace 3')
    await place(6, 4, 'Pass up-down')
    await cell(5, 4).click({ button: 'right' })
    await page.getByRole('menuitemcheckbox', { name: /Auto-join/ }).click()
    await page.locator('.palace-menu-button', { hasText: /^Door L$/ }).click()
    assert.equal(await exits(5, 4), 'W')
  })

  it('keeps a placed dead end facing its default when auto-join is off', async () => {
    await pageTo('Palace 3')
    await place(6, 4, 'Pass up-down')
    await cell(5, 4).click({ button: 'right' })
    await page.getByRole('menuitemcheckbox', { name: /Auto-join/ }).click()
    await page.locator('.palace-menu-button', { hasText: /^Dead end$/ }).click()
    assert.equal(await exits(5, 4), 'W')
  })

  it('makes an elevator entrance from a dead end with just that doorway', async () => {
    await pageTo('Palace 3')
    await place(6, 4, 'Door L')
    await place(6, 4, 'E elevator up')
    assert.equal(await exits(6, 4), 'N')
  })

  it('does not join a room to a doorway that carries a link', async () => {
    await pageTo('Palace 1')
    await place(7, 5, 'Pass up-down')
    await place(11, 3, 'Pass up-down')
    const a = await cell(7, 5).boundingBox()
    const c = await cell(11, 3).boundingBox()
    await page.mouse.move(a.x + a.width / 2, a.y + a.height - 1)
    await page.mouse.down()
    await page.mouse.move(c.x + c.width / 2, c.y + 1, { steps: 8 })
    await page.mouse.up()
    assert.equal((await savedRun()).palaceLinks.length, 1)
    await place(8, 5, 'Dead end')
    assert.notEqual(await exits(8, 5), 'N')
  })

  it('turns a room on a left click', async () => {
    await pageTo('Palace 3')
    await place(4, 4, 'Pass up-down')
    await cell(4, 4).click()
    assert.equal(await exits(4, 4), 'EW')
  })

  it('moves a room with a middle click then a left click, and links follow it', async () => {
    await pageTo('Palace 2')
    await place(2, 1, 'Door R')
    await place(9, 10, 'Door L')
    await place(6, 6, 'Door R')
    await cell(2, 1).click({ button: 'middle' })
    await cell(5, 3).click()
    assert.match((await cell(2, 1).getAttribute('aria-label')) ?? '', /empty/)
    assert.equal(await exits(5, 3), 'E')
    // Picking up and putting back on the same square changes nothing.
    await cell(5, 3).click({ button: 'middle' })
    await cell(5, 3).click()
    assert.equal(await exits(5, 3), 'E')
    // Swapping with an occupied square.
    await cell(5, 3).click({ button: 'middle' })
    await cell(9, 10).click()
    assert.equal(await exits(9, 10), 'E')
    assert.equal(await exits(5, 3), 'W')
  })

  it('links two far apart rooms by dragging, and only across opposite sides', async () => {
    await pageTo('Palace 2')
    await place(2, 1, 'Door R')
    await place(9, 10, 'Door L')
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

  it('keeps working after a link drag, and keeps the link when a room is turned', async () => {
    await pageTo('Palace 2')
    await place(2, 1, 'Door R')
    await place(9, 10, 'Door L')
    await place(5, 5, '3-way up')
    const a = await cell(2, 1).boundingBox()
    const c = await cell(9, 10).boundingBox()
    await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(c.x + c.width / 2 - 8, c.y + c.height / 2, { steps: 8 })
    await page.mouse.up()
    // The first click after a drag must still turn a room.
    await cell(5, 5).click()
    assert.notEqual(await exits(5, 5), 'WEN')
    // A linked room turns only to positions that keep its linked doorway.
    for (let i = 0; i < 5; i++) await cell(2, 1).click()
    assert.equal((await savedRun()).palaceLinks.length, 1)
    assert.equal(await exits(2, 1), 'E')
  })

  it('closes a doorway a link opened when the link is removed', async () => {
    await pageTo('Palace 2')
    await place(2, 1, 'Door L')
    await place(9, 10, 'Door R')
    const a = await cell(2, 1).boundingBox()
    const c = await cell(9, 10).boundingBox()
    await page.mouse.move(a.x + a.width / 2 + 8, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(c.x + c.width / 2 - 8, c.y + c.height / 2, { steps: 8 })
    await page.mouse.up()
    assert.equal(await exits(2, 1), 'EW')
    await cell(2, 1).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Unlink' }).click()
    assert.equal(await exits(2, 1), 'W')
    assert.equal((await savedRun()).palaceLinks.length, 0)
  })

  it('keeps rooms and links after a reload', async () => {
    await pageTo('Palace 4')
    await place(3, 3, 'Door L')
    await place(3, 9, 'Door R')
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
