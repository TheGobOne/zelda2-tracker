import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PALACE_PAGES,
  joinExits,
  joinFacingNeighbours,
  parsePalaceLinks,
  parsePalaceRooms,
  pickDeadEnd,
  requiredExit,
  roomKey,
  rotateExits,
  shapeOf,
  withRequiredExit,
  type PalaceRoom,
} from '../lib/palace-logic.ts'

const page = 'p3'
const rooms = (entries: Record<string, PalaceRoom>) => entries

describe('exits', () => {
  it('keeps exits in N-E-S-W order', () => {
    assert.equal(joinExits(['W', 'N', 'S']), 'NSW')
  })

  it('names room shapes by their exits', () => {
    assert.equal(shapeOf('W'), 'dead')
    assert.equal(shapeOf('EW'), 'pass')
    assert.equal(shapeOf('NS'), 'pass')
    assert.equal(shapeOf('NW'), 'turn')
    assert.equal(shapeOf('NEW'), 'three')
    assert.equal(shapeOf('NESW'), 'four')
  })

  it('gives an elevator entrance the doorway its elevator uses', () => {
    assert.equal(requiredExit('up'), 'N')
    assert.equal(requiredExit('down'), 'S')
    assert.equal(requiredExit('item'), null)
    assert.equal(withRequiredExit('EW', 'up'), 'NEW')
    assert.equal(withRequiredExit('NEW', 'up'), 'NEW')
    assert.equal(withRequiredExit('EW', undefined), 'EW')
  })
})

describe('dead ends', () => {
  it('face a neighbour whose doorway points at them', () => {
    // A room above with a down doorway: the dead end opens upward.
    const placed = rooms({ [roomKey(page, 3, 4)]: { exits: 'S' } })
    assert.equal(pickDeadEnd(placed, page, 4, 4), 'N')
  })

  it('face any neighbour when none points at them', () => {
    const placed = rooms({ [roomKey(page, 4, 5)]: { exits: 'EW' } })
    // The room to the right has a left doorway, so that one wins outright.
    assert.equal(pickDeadEnd(placed, page, 4, 4), 'E')
    const sideways = rooms({ [roomKey(page, 5, 4)]: { exits: 'EW' } })
    // Below has no up doorway, but it is still a room.
    assert.equal(pickDeadEnd(sideways, page, 4, 4), 'S')
  })

  it('open left when alone', () => {
    assert.equal(pickDeadEnd({}, page, 4, 4), 'W')
  })

  it('follow an entrance elevator whatever the neighbours are', () => {
    const placed = rooms({ [roomKey(page, 4, 3)]: { exits: 'E' } })
    assert.equal(pickDeadEnd(placed, page, 4, 4, 'up'), 'N')
    assert.equal(pickDeadEnd(placed, page, 4, 4, 'down'), 'S')
  })
})

describe('joining neighbours', () => {
  it('adds the doorway a neighbour points at the room', () => {
    // A vertical passthrough below, so a left-right room above gains a down doorway.
    const placed = rooms({ [roomKey(page, 5, 4)]: { exits: 'NS' } })
    assert.equal(joinFacingNeighbours('EW', placed, page, 4, 4), 'ESW')
  })

  it('leaves a room alone when nothing points at it', () => {
    const placed = rooms({ [roomKey(page, 5, 4)]: { exits: 'EW' } })
    assert.equal(joinFacingNeighbours('EW', placed, page, 4, 4), 'EW')
  })

  it('does not join across a gap', () => {
    const placed = rooms({ [roomKey(page, 6, 4)]: { exits: 'N' } })
    assert.equal(joinFacingNeighbours('EW', placed, page, 4, 4), 'EW')
  })
})

describe('turning', () => {
  it('turns a room a quarter turn', () => {
    assert.equal(rotateExits('EW'), 'NS')
    assert.equal(rotateExits('NS'), 'EW')
    assert.equal(rotateExits('W'), 'N')
    assert.equal(rotateExits('NESW'), 'NESW')
  })

  it('keeps the elevator doorway on an entrance', () => {
    assert.equal(rotateExits('N', 'up'), 'N')
    assert.equal(rotateExits('NE', 'up'), 'NS')
    assert.equal(rotateExits('S', 'down'), 'S')
  })
})

describe('pages', () => {
  it('has six 13-wide palaces and a wider Great Palace', () => {
    assert.equal(PALACE_PAGES.length, 7)
    for (const entry of PALACE_PAGES.slice(0, 6)) assert.equal(entry.columns, 13)
    assert.equal(PALACE_PAGES[6].id, 'gp')
    assert.ok(PALACE_PAGES[6].columns > 13)
  })
})

describe('reading saved rooms', () => {
  it('accepts a save from before palace maps', () => {
    assert.deepEqual(parsePalaceRooms(undefined), {})
  })

  it('accepts well formed rooms', () => {
    const saved = { 'p1-0-0': { exits: 'E', role: 'up' }, 'gp-12-19': { exits: 'NESW' } }
    assert.deepEqual(parsePalaceRooms(saved), saved)
  })

  it('rejects anything that is not a palace room', () => {
    assert.equal(parsePalaceRooms([]), null)
    assert.equal(parsePalaceRooms({ 'west-1-1': { exits: 'E' } }), null)
    assert.equal(parsePalaceRooms({ 'p1-13-0': { exits: 'E' } }), null) // past the last row
    assert.equal(parsePalaceRooms({ 'p1-0-13': { exits: 'E' } }), null) // past the last column
    assert.equal(parsePalaceRooms({ 'p1-0-0': { exits: 'XW' } }), null)
    assert.equal(parsePalaceRooms({ 'p1-0-0': { exits: 'WE' } }), null) // wrong order
    assert.equal(parsePalaceRooms({ 'p1-0-0': { exits: 'E', role: 'king' } }), null)
    assert.equal(parsePalaceRooms({ 'p1-0-0': 'E' }), null)
  })
})

describe('reading saved links', () => {
  const link = {
    page: 'p2',
    a: { row: 1, column: 2, side: 'E' },
    b: { row: 5, column: 9, side: 'W' },
  }

  it('accepts a save from before links', () => {
    assert.deepEqual(parsePalaceLinks(undefined), [])
  })

  it('accepts a well formed link', () => {
    assert.deepEqual(parsePalaceLinks([link]), [link])
  })

  it('rejects bad links', () => {
    assert.equal(parsePalaceLinks({}), null)
    assert.equal(parsePalaceLinks([{ ...link, page: 'west' }]), null)
    assert.equal(parsePalaceLinks([{ ...link, a: { ...link.a, side: 'X' } }]), null)
    assert.equal(parsePalaceLinks([{ ...link, b: { ...link.b, column: 13 } }]), null)
    assert.equal(parsePalaceLinks([{ ...link, a: { ...link.a, row: -1 } }]), null)
    assert.equal(parsePalaceLinks([null]), null)
  })
})
