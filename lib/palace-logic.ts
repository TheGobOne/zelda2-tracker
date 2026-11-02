/**
 * The palace maps' rules, with no React in them: room shapes and exits, how a new
 * room turns to meet its neighbours, and reading saved rooms and links back safely.
 */

/** The pages the map's arrows step through after the two overworlds. */
export const PALACE_PAGES = [
  { id: 'p1', label: 'P1', name: 'Palace 1', columns: 13 },
  { id: 'p2', label: 'P2', name: 'Palace 2', columns: 13 },
  { id: 'p3', label: 'P3', name: 'Palace 3', columns: 13 },
  { id: 'p4', label: 'P4', name: 'Palace 4', columns: 13 },
  { id: 'p5', label: 'P5', name: 'Palace 5', columns: 13 },
  { id: 'p6', label: 'P6', name: 'Palace 6', columns: 13 },
  // The Great Palace takes the whole band: as much width as fits.
  { id: 'gp', label: 'GP', name: 'Great Palace', columns: 20 },
] as const

export type PalacePage = (typeof PALACE_PAGES)[number]

export const PALACE_ROWS = 13

export type Side = 'N' | 'E' | 'S' | 'W'
export const SIDES: Side[] = ['N', 'E', 'S', 'W']
export const OPPOSITE: Record<Side, Side> = { N: 'S', E: 'W', S: 'N', W: 'E' }
export const STEP: Record<Side, { row: number; column: number }> = {
  N: { row: -1, column: 0 },
  E: { row: 0, column: 1 },
  S: { row: 1, column: 0 },
  W: { row: 0, column: -1 },
}

export type PalaceRole = 'up' | 'down' | 'boss' | 'item'

/**
 * One room. `exits` are the sides with a doorway or elevator, kept in N-E-S-W
 * order so equal rooms compare equal as strings. The role is separate from the
 * shape, so an item room can still be a passthrough.
 */
export type PalaceRoom = { exits: string; role?: PalaceRole }

export const ROLES: { id: PalaceRole; label: string }[] = [
  { id: 'up', label: 'E elevator up' },
  { id: 'down', label: 'E elevator down' },
  { id: 'boss', label: 'Boss' },
  { id: 'item', label: 'I item' },
]

export type Shape = 'dead' | 'pass' | 'turn' | 'three' | 'four'

/**
 * The shapes the menu offers. Most fix their exits, since a room entered by an
 * elevator that only goes left and right is a left-right passthrough however it
 * was reached. A dead end has no `exits`: it turns to face a neighbour.
 */
export const MENU_SHAPES: { id: string; label: string; exits?: Side[] }[] = [
  { id: 'pass-left', label: 'Pass L', exits: ['W'] },
  { id: 'pass-right', label: 'Pass R', exits: ['E'] },
  { id: 'pass-v', label: 'Pass up-down', exits: ['N', 'S'] },
  { id: 'three-up', label: '3-way up', exits: ['W', 'E', 'N'] },
  { id: 'three-down', label: '3-way down', exits: ['W', 'E', 'S'] },
  { id: 'four', label: '4-way', exits: ['N', 'E', 'S', 'W'] },
  { id: 'dead', label: 'Dead end' },
]


export const SHAPE_NAMES: Record<Shape, string> = {
  dead: 'Dead end',
  pass: 'Passthrough',
  turn: 'Elevator and one side',
  three: '3-way',
  four: '4-way',
}

/** An entrance is an elevator, so its room always has the doorway the elevator uses. */
export function requiredExit(role: PalaceRole | undefined): Side | null {
  return role === 'up' ? 'N' : role === 'down' ? 'S' : null
}

export function withRequiredExit(exits: string, role: PalaceRole | undefined) {
  const required = requiredExit(role)
  return required && !exits.includes(required) ? joinExits([...exits, required] as Side[]) : exits
}

/** Dead ends only: which side to face, turned to match the neighbours. */
export const DEAD_END_SIDES: Side[] = ['W', 'E', 'N', 'S']

export function joinExits(sides: Side[]) {
  return SIDES.filter((side) => sides.includes(side)).join('')
}

export function shapeOf(exits: string): Shape {
  if (exits.length >= 4) return 'four'
  if (exits.length === 3) return 'three'
  if (exits.length === 2) return OPPOSITE[exits[0] as Side] === exits[1] ? 'pass' : 'turn'
  return 'dead'
}

export function roomKey(pageId: string, row: number, column: number) {
  return `${pageId}-${row}-${column}`
}

export function neighbour(
  rooms: Record<string, PalaceRoom>,
  pageId: string,
  row: number,
  column: number,
  side: Side,
) {
  const step = STEP[side]
  return rooms[roomKey(pageId, row + step.row, column + step.column)]
}

/**
 * Points a dead end at its surroundings. A neighbour with a doorway back at this
 * square wins outright; failing that, any neighbouring room is better than a blank
 * wall. A tie keeps the order above, so a lone room still gets a sensible default.
 */
export function pickDeadEnd(
  rooms: Record<string, PalaceRoom>,
  pageId: string,
  row: number,
  column: number,
  role?: PalaceRole,
) {
  const required = requiredExit(role)
  if (required) return required

  let best: Side = DEAD_END_SIDES[0]
  let bestScore = -Infinity

  for (const side of DEAD_END_SIDES) {
    const next = neighbour(rooms, pageId, row, column, side)
    const score = next ? (next.exits.includes(OPPOSITE[side]) ? 2 : 1) : 0
    if (score > bestScore) {
      best = side
      bestScore = score
    }
  }

  return best
}

/**
 * A doorway that points at a room joins it: a room placed beside one whose exit
 * faces it gains the matching exit, so a left-right passthrough set above a room
 * with an up doorway picks up its own down doorway rather than leaving it dangling.
 */
export function joinFacingNeighbours(
  exits: string,
  rooms: Record<string, PalaceRoom>,
  pageId: string,
  row: number,
  column: number,
) {
  const joined = [...exits] as Side[]
  for (const side of SIDES) {
    const next = neighbour(rooms, pageId, row, column, side)
    if (next?.exits.includes(OPPOSITE[side]) && !joined.includes(side)) joined.push(side)
  }
  return joinExits(joined)
}

/**
 * Left click turns a room a quarter turn. An entrance keeps the doorway its
 * elevator needs and turns only the rest.
 */
export function rotateExits(exits: string, role?: PalaceRole) {
  const required = requiredExit(role)
  const turned = [...exits]
    .filter((side) => side !== required)
    .map((side) => SIDES[(SIDES.indexOf(side as Side) + 1) % 4])
  return withRequiredExit(joinExits(turned), role)
}

/** Reads an untrusted save: every key must be a palace square and every room well formed. */
export function parsePalaceRooms(value: unknown): Record<string, PalaceRoom> | null {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const rooms: Record<string, PalaceRoom> = {}
  for (const [key, entry] of Object.entries(value)) {
    const match = /^(p[1-6]|gp)-(\d+)-(\d+)$/.exec(key)
    if (!match || typeof entry !== 'object' || entry === null) return null
    const { exits, role } = entry as { exits?: unknown; role?: unknown }
    const page = PALACE_PAGES.find((candidate) => candidate.id === match[1])
    if (
      !page ||
      Number(match[2]) >= PALACE_ROWS ||
      Number(match[3]) >= page.columns ||
      typeof exits !== 'string' ||
      !/^N?E?S?W?$/.test(exits) ||
      (role !== undefined && !ROLES.some((entryRole) => entryRole.id === role))
    ) {
      return null
    }
    rooms[key] = role ? { exits, role: role as PalaceRole } : { exits }
  }
  return rooms
}

/** One end of a drawn link: a room's doorway on one of its sides. */
export type PalaceLinkEnd = { row: number; column: number; side: Side }
/**
 * A doorway joined to another that is not beside it, for the palaces whose rooms
 * loop back on themselves. Drawn as a line over the grid.
 */
export type PalaceLink = { page: string; a: PalaceLinkEnd; b: PalaceLinkEnd }

export function isLinkEnd(value: unknown, columns: number): value is PalaceLinkEnd {
  if (typeof value !== 'object' || value === null) return false
  const { row, column, side } = value as Record<string, unknown>
  return (
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    (row as number) >= 0 &&
    (row as number) < PALACE_ROWS &&
    (column as number) >= 0 &&
    (column as number) < columns &&
    SIDES.includes(side as Side)
  )
}

/** Reads untrusted saved links; saves from before they existed have none. */
export function parsePalaceLinks(value: unknown): PalaceLink[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null

  const links: PalaceLink[] = []
  for (const entry of value) {
    const { page: pageId, a, b } = (entry ?? {}) as Record<string, unknown>
    const page = PALACE_PAGES.find((candidate) => candidate.id === pageId)
    if (!page || !isLinkEnd(a, page.columns) || !isLinkEnd(b, page.columns)) return null
    links.push({
      page: page.id,
      a: { row: a.row, column: a.column, side: a.side },
      b: { row: b.row, column: b.column, side: b.side },
    })
  }
  return links
}

export const sameEnd = (x: PalaceLinkEnd, y: PalaceLinkEnd) =>
  x.row === y.row && x.column === y.column && x.side === y.side

export const touches = (link: PalaceLink, row: number, column: number) =>
  [link.a, link.b].some((end) => end.row === row && end.column === column)
