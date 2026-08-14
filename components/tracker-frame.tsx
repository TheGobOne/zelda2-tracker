'use client'

import { Check } from 'lucide-react'
import Image from 'next/image'
import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { GlyphText } from '@/components/glyph-text'

const BASE_WIDTH = 600
// Must match the `.game-canvas` height in globals.css, since the board is scaled
// to fit against these dimensions.
const BASE_HEIGHT = 1138
const MIN_SCALE = 0.35
const MAX_SCALE = 1.75

const towns = [
  { name: 'Rauru', src: '/images/towns/rauru.png' },
  { name: 'Ruto', src: '/images/towns/ruto.png' },
  { name: 'Saria', src: '/images/towns/saria.png' },
  { name: 'Mido', src: '/images/towns/mido.png' },
  { name: 'Nabooru', src: '/images/towns/nabooru.png' },
  { name: 'Darunia', src: '/images/towns/darunia.png' },
  { name: 'New Kasuto', src: '/images/towns/new-kasuto.png' },
  { name: 'Old Kasuto', src: '/images/towns/old-kasuto.png' },
]

// The seven palace bosses sit in two columns pushed to opposite edges: four on
// the left, three on the right.
const palaceColumns = [
  {
    id: 'left',
    // Mirrored so the left column faces inward, toward the right column.
    flipped: true,
    bosses: [
      { name: 'Palace 1', src: '/images/palaces/horsehead.png', maxSlots: 2 },
      { name: 'Palace 2', src: '/images/palaces/helmethead.png', maxSlots: 2 },
      { name: 'Palace 3', src: '/images/palaces/rebonack.png', maxSlots: 2 },
      { name: 'Palace 4', src: '/images/palaces/karock.png', maxSlots: 2 },
    ],
  },
  {
    id: 'right',
    bosses: [
      { name: 'Palace 5', src: '/images/palaces/gooma.png', maxSlots: 3 },
      { name: 'Palace 6', src: '/images/palaces/barba.png', maxSlots: 3 },
      {
        name: 'Palace 7',
        src: '/images/palaces/thunderbird.png',
        maxSlots: 2,
        // Thunderbird holds no items on a fresh tracker, so it starts empty and
        // middle click reveals its slots when a run actually places something.
        startSlots: 0,
      },
    ],
  },
]

/**
 * Slot count a boss shows before anything is tracked. Every boss opens with a
 * single slot unless its data overrides that, so this is read by the renderer,
 * by the slot cycle, and after a clear or preset load, which all reset the
 * stored counts back to empty.
 */
function startSlotsFor(name: string) {
  for (const column of palaceColumns) {
    for (const boss of column.bosses) {
      if (boss.name === name) {
        return 'startSlots' in boss ? boss.startSlots : 1
      }
    }
  }

  return 1
}

// Overworld item locations, shown in rows in upload order. Unlike towns and
// palaces these have no separate slot box: the chosen item draws over the art.
const locationRowOne = [
  { name: 'Trophy Cave', src: '/images/locations/trophycave.png' },
  { name: 'Water of Life Cave', src: '/images/locations/wateroflifecave.png' },
  {
    name: 'Heart Container Cave',
    src: '/images/locations/heartcontainercave.png',
  },
  {
    name: 'Magic Container Cave',
    src: '/images/locations/magiccontainercave.png',
  },
  { name: 'West P-Bag Cave', src: '/images/locations/westpbagcave.png' },
  { name: 'Saria Table', src: '/images/locations/sariatable.png' },
  { name: 'Bagu', src: '/images/locations/bagu.png' },
  {
    name: 'Heart Container Grass',
    src: '/images/locations/heartcontainergrass.png',
  },
  { name: 'Downstab Man', src: '/images/locations/downstabman.png' },
]

// Values a counter slot steps through on left click. The empty entry starts the
// cycle, so clicking past the last number clears the slot again.
const COUNT_VALUES = ['', '5', '6', '7']

// A location row holds sprite slots plus the occasional numeric counter slot,
// which takes up one icon of space but shows a chosen number instead of art.
type LocationEntry =
  | { name: string; src: string }
  | { kind: 'count'; name: string }

// Second location row, filled in as the remaining sprites are added.
const locationRowTwo: LocationEntry[] = [
  { name: 'East P-Bag Cave', src: '/images/locations/eastpbagcave.png' },
  { name: 'East P-Bag Cave 2', src: '/images/locations/eastpbagcave2.png' },
  {
    name: 'Desert Heart Container',
    src: '/images/locations/heartcontainerdesert.png',
  },
  {
    name: 'Sea Heart Container',
    src: '/images/locations/heartcontainersea.png',
  },
  { name: 'Nabooru Fountain', src: '/images/locations/naboorufountain.png' },
  { kind: 'count', name: 'Spell Item Count' },
  {
    name: 'New Kasuto Magic Container',
    src: '/images/locations/magiccontainernewkasuto.png',
  },
  {
    name: 'New Kasuto Magical Key',
    src: '/images/locations/magickeynewkasuto.png',
  },
  { name: 'Up Stab Man', src: '/images/locations/upstabman.png' },
]

// Third location row. Only four entries, so it is centred rather than spread
// across the full icon width like the two full rows above it.
const locationRowThree: LocationEntry[] = [
  {
    name: 'Boulder Magic Container',
    src: '/images/locations/magiccontainerboulder.png',
  },
  { name: 'Hammer Cave', src: '/images/locations/hammercave.png' },
  {
    name: 'Maze Magic Container',
    src: '/images/locations/magiccontainermaze.png',
  },
  { name: 'Maze Kid', src: '/images/locations/kidmaze.png' },
]

const locationRows: LocationEntry[][] = [
  locationRowOne,
  locationRowTwo,
  locationRowThree,
]

// Every collectible in the game, available to drop into any palace item slot.
const items = [
  { id: 'candle', name: 'Candle', src: '/images/items/candle.png' },
  { id: 'glove', name: 'Glove', src: '/images/items/glove.png' },
  { id: 'raft', name: 'Raft', src: '/images/items/raft.png' },
  { id: 'boots', name: 'Boots', src: '/images/items/boots.png' },
  { id: 'flute', name: 'Flute', src: '/images/items/flute.png' },
  { id: 'cross', name: 'Cross', src: '/images/items/cross.png' },
  { id: 'hammer', name: 'Hammer', src: '/images/items/hammer.png' },
  { id: 'magickey', name: 'Magic Key', src: '/images/items/magickey.png' },
  { id: 'upstab', name: 'Upstab', src: '/images/items/upstab.png' },
  { id: 'downstab', name: 'Downstab', src: '/images/items/downstab.png' },
  { id: 'trophy', name: 'Trophy', src: '/images/items/trophy.png' },
  { id: 'kid', name: 'Kid', src: '/images/items/kid.png' },
  { id: 'mirror', name: 'Mirror', src: '/images/items/mirror.png' },
  { id: 'water', name: 'Water', src: '/images/items/water.png' },
  {
    id: 'noteforriverman',
    name: 'Note for Riverman',
    src: '/images/items/noteforriverman.png',
  },
  { id: 'wateroflife', name: 'Water of Life', src: '/images/items/wateroflife.png' },
  {
    id: 'heartcontainer',
    name: 'Heart Container',
    src: '/images/items/heartcontainer.png',
  },
  {
    id: 'magiccontainer',
    name: 'Magic Container',
    src: '/images/items/magiccontainer.png',
  },
  { id: 'pbag', name: 'Point Bag', src: '/images/items/pbag.png' },
  // Two sprites shown side by side to mean "either of these two pickups".
  {
    id: '1up-redpotion',
    name: '1-Up or Red Potion',
    src: ['/images/items/1up.png', '/images/items/redpotion.png'],
  },
]

// The eight spells, listed in their own menu section below the items.
const spells: { id: string; name: string; src: string | string[] }[] = [
  { id: 'shield-spell', name: 'Shield', src: '/images/spells/shield.png' },
  { id: 'jump-spell', name: 'Jump', src: '/images/spells/jump.png' },
  { id: 'life-spell', name: 'Life', src: '/images/spells/life.png' },
  { id: 'fairy-spell', name: 'Fairy', src: '/images/spells/fairy.png' },
  { id: 'fire-spell', name: 'Fire', src: '/images/spells/fire.png' },
  { id: 'reflect-spell', name: 'Reflect', src: '/images/spells/reflect.png' },
  { id: 'spell-spell', name: 'Spell', src: '/images/spells/spell.png' },
  { id: 'thunder-spell', name: 'Thunder', src: '/images/spells/thunder.png' },
]

// Every pickable entry, used to resolve whatever id a slot is holding.
const allPickables = [...items, ...spells]

// Pickups the collection tracker leaves out. Containers and point bags repeat
// all over the map, and the 1-Up/Red Jar pair is filler, so none of them are
// one-off collectibles worth a checkbox.
const UNTRACKED_IDS = new Set([
  'heartcontainer',
  'magiccontainer',
  'pbag',
  '1up-redpotion',
])

// The 16 tracked items, which fill two rows of eight above the spell row.
const collectionItems = items.filter((entry) => !UNTRACKED_IDS.has(entry.id))

/** Placeholder sprite marking a connector end whose destination is unknown. */
const UNKNOWN_NOTE = '/images/notes/unknown.png'

/**
 * Destinations a connector end can be tagged with. Right click steps through
 * these in order; the empty entry is the unknown "?" starting state, so a full
 * cycle returns the end to being unmarked.
 */
const CONNECTOR_MARKS: { src: string; alt: string }[] = [
  { src: '/images/notes/w.png', alt: 'W' },
  { src: '/images/notes/e.png', alt: 'E' },
  { src: '/images/notes/mi.png', alt: 'MI' },
  { src: '/images/notes/dm.png', alt: 'DM' },
]

/**
 * Connector art centered in the palace section. Each entry renders one row, flanked
 * by a right-clickable destination marker per end. Add sprites here as
 * { src, alt } and the column renders them in order. The same src may repeat,
 * so entries are keyed by position rather than by path.
 */
const PALACE_NOTES: { src: string; alt: string }[] = [
  { src: '/images/notes/cave.png', alt: 'Cave entrance' },
  { src: '/images/notes/cave.png', alt: 'Cave entrance' },
  { src: '/images/notes/raft.png', alt: 'Raft' },
  { src: '/images/notes/bridge.png', alt: 'Bridge' },
]

/**
 * Starting states for known rulesets. A preset both lights pickups Link begins
 * with and fills the checks whose contents that ruleset fixes in advance, so a
 * run only has to record what is actually still unknown.
 */
const PRESETS: {
  id: string
  name: string
  collectedIds: string[]
  placements: Record<string, string>
  counts: Record<string, string>
}[] = [
  {
    // Vanilla flags: Link only ever starts with the candle, and nothing on the
    // board is known in advance, so both placement maps stay empty.
    id: 'standard',
    name: 'Standard',
    collectedIds: ['candle'],
    placements: {},
    counts: {},
  },
  {
    id: 'sgl',
    name: 'SGL',
    // Candle and cross only: the fire spell is not a starting item under this
    // ruleset, so it stays unmarked until it is actually found.
    collectedIds: ['candle', 'cross'],
    placements: {
      // All three P-Bag caves keep their vanilla point bags.
      'location-West P-Bag Cave': 'pbag',
      'location-East P-Bag Cave': 'pbag',
      'location-East P-Bag Cave 2': 'pbag',
      // These two checks are always filler, tracked as the 1-Up/Red Jar pair.
      'location-Saria Table': '1up-redpotion',
      'location-Nabooru Fountain': '1up-redpotion',
      // The stab teachers are swapped relative to their names.
      'location-Downstab Man': 'upstab',
      'location-Up Stab Man': 'downstab',
      // Bagu always hands over his letter for the river man.
      'location-Bagu': 'noteforriverman',
    },
    counts: {
      // The counter beside the fountain starts on 6 under this ruleset.
      'location-Spell Item Count': '6',
    },
  },
]

/**
 * Turns a preset's item list into the `collected` map the board holds. Shared by
 * the initial state and the flags dropdown so the default Standard board is built
 * the same way as one picked by hand.
 */
function collectedFromPreset(preset: (typeof PRESETS)[number]) {
  const next: Record<string, boolean> = {}

  for (const itemId of preset.collectedIds) {
    next[`collection-${itemId}`] = true
  }

  return next
}

// Requirement letters a town or boss can be tagged with. The empty entry is
// the starting state, so a full cycle returns the icon to having no letter.
const ICON_MARKS = ['', 'W', 'E', 'MI', 'DV']

// The collection row keeps its own list: it ends on DM where the bosses end on
// DV, so the two cycles cannot share one constant.
const COLLECTION_MARKS = ['', 'W', 'E', 'MI', 'DM']

// Towns only ever gate on W or E, so their cycle stops short of the MI and DV
// the bosses use.
const TOWN_MARKS = ['', 'W', 'E']

/**
 * What a palace can be walled off by, as the sprites of the items and spells that
 * open it. Scrolling a boss steps through these; the empty first entry is the
 * unblocked state, so a full turn of the wheel returns the boss to unmarked.
 *
 * A pair of sprites means either one gets you in. That is drawn as the two sprites
 * stacked rather than as a written "OR", because the alternatives are always a
 * choice between two things the tracker already has art for, and the art reads
 * faster at this size than any word would.
 */
const BOSS_BLOCKS: { id: string; name: string; src: string[] }[] = [
  { id: '', name: '', src: [] },
  { id: 'glove', name: 'Glove', src: ['/images/items/glove.png'] },
  { id: 'fairy', name: 'Fairy', src: ['/images/spells/fairy.png'] },
  {
    id: 'glove-fairy',
    name: 'Glove or Fairy',
    src: ['/images/items/glove.png', '/images/spells/fairy.png'],
  },
  { id: 'jump', name: 'Jump', src: ['/images/spells/jump.png'] },
  {
    id: 'jump-fairy',
    name: 'Jump or Fairy',
    src: ['/images/spells/jump.png', '/images/spells/fairy.png'],
  },
  { id: 'boots', name: 'Boots', src: ['/images/items/boots.png'] },
  { id: 'hammer', name: 'Hammer', src: ['/images/items/hammer.png'] },
]

/** Turns a slot key into the heading shown in the item menu. */
function slotLabel(slotKey: string) {
  if (slotKey.startsWith('town-')) {
    return `${slotKey.slice('town-'.length)} ITEM`.toUpperCase()
  }

  if (slotKey.startsWith('location-')) {
    return `${slotKey.slice('location-'.length)} ITEM`.toUpperCase()
  }

  return slotKey
    .replace(/-(\d+)$/, (_, index) => ` ITEM ${Number(index) + 1}`)
    .toUpperCase()
}

/** Draws a single sprite, or two sprites separated by a slash for pairs. */
function ItemArt({ item }: { item: (typeof allPickables)[number] }) {
  if (Array.isArray(item.src)) {
    return (
      <span className="item-pair">
        <Image alt="" height={32} src={item.src[0]} width={32} />
        <span aria-hidden="true" className="item-pair-slash">
          /
        </span>
        <Image alt="" height={32} src={item.src[1]} width={32} />
      </span>
    )
  }

  // Asks for the sprite's full resolution so the larger menu boxes stay crisp;
  // CSS decides the drawn size in each context.
  return <Image alt={item.name} height={64} src={item.src} width={64} />
}

type Handle = {
  id: string
  label: string
  x: -1 | 0 | 1
  y: -1 | 0 | 1
}

const handles: Handle[] = [
  { id: 'top', label: 'top edge', x: 0, y: -1 },
  { id: 'right', label: 'right edge', x: 1, y: 0 },
  { id: 'bottom', label: 'bottom edge', x: 0, y: 1 },
  { id: 'left', label: 'left edge', x: -1, y: 0 },
  { id: 'top-left', label: 'top left corner', x: -1, y: -1 },
  { id: 'top-right', label: 'top right corner', x: 1, y: -1 },
  { id: 'bottom-right', label: 'bottom right corner', x: 1, y: 1 },
  { id: 'bottom-left', label: 'bottom left corner', x: -1, y: 1 },
]

/** The two overworlds, each tracked on its own 9x9 grid. */
const OVERWORLDS = [
  { id: 'west', name: 'West' },
  { id: 'east', name: 'East' },
] as const

/** Both grids are square, so one number drives rows and columns alike. */
const OVERWORLD_SIZE = 9

/**
 * Icons that can be dropped onto a grid, as the four vertical columns they are
 * laid out in between the two maps. Columns are written out rather than filled by
 * splitting one flat list, because which icons group together is a deliberate
 * choice: the palaces belong in a column of their own, in numbered order, and an
 * even split would scatter them across all four. Add an entry with its sprite
 * path to the column it belongs in and it becomes placeable.
 *
 * Every column must stay within nine icons, the height of a grid beside it.
 */
const OVERWORLD_ICON_COLUMNS: { id: string; name: string; src: string }[][] = [
  // Palaces. The unnumbered one leads, above the seven numbered ones: it is the
  // generic marker for a palace whose number is not known yet, so it belongs before
  // 1 rather than at any position within the count. Eight entries, one short of the
  // nine-row cap.
  [
    { id: 'palace', name: 'Palace', src: '/images/overworld/palace.png' },
    { id: 'palace-1', name: 'Palace 1', src: '/images/overworld/palace1.png' },
    { id: 'palace-2', name: 'Palace 2', src: '/images/overworld/palace2.png' },
    { id: 'palace-3', name: 'Palace 3', src: '/images/overworld/palace3.png' },
    { id: 'palace-4', name: 'Palace 4', src: '/images/overworld/palace4.png' },
    { id: 'palace-5', name: 'Palace 5', src: '/images/overworld/palace5.png' },
    { id: 'palace-6', name: 'Palace 6', src: '/images/overworld/palace6.png' },
    { id: 'palace-7', name: 'Palace 7', src: '/images/overworld/palace7.png' },
  ],
  [
    { id: 'town-1', name: 'Town 1', src: '/images/overworld/town1.png' },
    { id: 'town-2', name: 'Town 2', src: '/images/overworld/town2.png' },
    { id: 'town-3', name: 'Town 3', src: '/images/overworld/town3.png' },
    { id: 'town-4', name: 'Town 4', src: '/images/overworld/town4.png' },
    { id: 'town-5', name: 'Town 5', src: '/images/overworld/town5.png' },
    { id: 'town-6', name: 'Town 6', src: '/images/overworld/town6.png' },
    { id: 'town-7', name: 'Town 7', src: '/images/overworld/town7.png' },
    { id: 'town-8', name: 'Town 8', src: '/images/overworld/town8.png' },
  ],
  // Lettered markers - the ones that stand for something found rather than for a
  // piece of ground: the four item/entrance markers, then the four cave connectors
  // in alphabetical order, since a connector is only meaningful paired with the
  // matching letter at the cave's other end. Eight entries, the most this column
  // can take before it outgrows the nine-row grids beside it.
  [
    { id: 'w-marker', name: 'W', src: '/images/overworld/w.png' },
    { id: 'e-marker', name: 'E', src: '/images/overworld/e.png' },
    { id: 'mi-marker', name: 'MI', src: '/images/overworld/mi.png' },
    { id: 'dm-entrance', name: 'DM Entrance', src: '/images/overworld/dmentrance.png' },
    { id: 'connector-a', name: 'Connector A', src: '/images/overworld/connectora.png' },
    { id: 'connector-b', name: 'Connector B', src: '/images/overworld/connectorb.png' },
    { id: 'connector-c', name: 'Connector C', src: '/images/overworld/connectorc.png' },
    { id: 'connector-d', name: 'Connector D', src: '/images/overworld/connectord.png' },
  ],
  // Terrain and connectors. Eight entries, so they still stack in one column of
  // nine rows now that the lettered markers have moved out of this group. Mountain
  // sits next to Boulder, the other impassable rock, and the three ground-surface
  // fills - Water, Desert, Lava - close the column as a run.
  [
    { id: 'bridge', name: 'Bridge', src: '/images/overworld/bridge.png' },
    { id: 'river-devil', name: 'River Devil', src: '/images/overworld/riverdevil.png' },
    { id: 'boulder', name: 'Boulder', src: '/images/overworld/boulder.png' },
    { id: 'mountain', name: 'Mountain', src: '/images/overworld/mountain.png' },
    { id: 'forest', name: 'Forest', src: '/images/overworld/forest.png' },
    { id: 'water', name: 'Water', src: '/images/overworld/water.png' },
    { id: 'desert', name: 'Desert', src: '/images/overworld/desert.png' },
    { id: 'lava', name: 'Lava', src: '/images/overworld/lava.png' },
  ],
]

/** Every palette icon, flattened, for resolving whatever id a map cell holds. */
const OVERWORLD_ICONS = OVERWORLD_ICON_COLUMNS.flat()

/** The palette's columns, as laid out above. */
function overworldIconColumns() {
  return OVERWORLD_ICON_COLUMNS
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function TrackerFrame() {
  const [scale, setScale] = useState(0.85)
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  // Only bosses whose count has been changed are stored here; the rest fall back
  // to `startSlotsFor`. Middle click cycles a boss up to its max, then to zero.
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({})

  // Which item sits in each slot, keyed by boss name and slot index.
  const [slotItems, setSlotItems] = useState<Record<string, string>>({})
  // Slots marked as collected: their art dims and a green check appears. Seeded
  // from Standard, the flag set the dropdown starts on.
  const [collected, setCollected] = useState<Record<string, boolean>>(() =>
    collectedFromPreset(PRESETS[0]),
  )
  // Requirement letter shown over a town or boss; right click steps through
  // them. Keys are namespaced ("town-"/"boss-") so names cannot collide.
  const [iconMarks, setIconMarks] = useState<Record<string, string>>({})
  // What is walling off each palace, keyed by the same "boss-" key as the letters
  // and holding a `BOSS_BLOCKS` id. The wheel steps it; an absent key is unblocked.
  const [bossBlocks, setBossBlocks] = useState<Record<string, string>>({})
  // Number shown in a counter slot, stepped through by left click.
  const [countValues, setCountValues] = useState<Record<string, string>>({})
  // Destination tagged on each connector end, keyed by row index and side. An
  // absent key means the end is still unknown and shows the "?" marker.
  const [connectorEnds, setConnectorEnds] = useState<Record<string, string>>({})
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  // Clearing is destructive, so it waits on a confirmation dialog.
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  // Which ruleset is loaded. Standard is the default, so the board opens matching
  // it rather than needing the flagset picked by hand. Still tracked now that the
  // picker is a menu, to mark the active entry.
  const [activeFlags, setActiveFlags] = useState(PRESETS[0].id)
  // Clear and the flagsets share one hamburger button, so a single flag covers
  // the whole menu rather than just the flagset list.
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Which icon sits on each overworld cell, keyed by grid id and coordinates.
  // Only filled cells are stored, so an absent key is an empty square.
  const [overworldCells, setOverworldCells] = useState<Record<string, string>>({})
  // The palette icon held ready to place. It stays armed after each drop, so a
  // repeated icon can be placed across the map without reselecting it, and
  // clicking it again puts it down.
  const [armedIcon, setArmedIcon] = useState<string | null>(null)
  const palaceGridRef = useRef<HTMLDivElement | null>(null)

  /** Steps a counter slot to the next value, wrapping back around to empty. */
  function cycleCount(slotKey: string, step: 1 | -1) {
    setCountValues((current) => {
      const index = COUNT_VALUES.indexOf(current[slotKey] ?? '')
      const next =
        COUNT_VALUES[
          (index + step + COUNT_VALUES.length) % COUNT_VALUES.length
        ]

      return { ...current, [slotKey]: next }
    })
  }

  const rootRef = useRef<HTMLDivElement>(null)

  // The tracker is mouse-only: it sits beside a game or emulator, so it must
  // never consume a keystroke. That rules out the window-level Escape listeners
  // this used to have, which fired page-wide, and it also means nothing inside
  // can hold focus or sit in the tab order - a focused control would turn a
  // stray Enter or Space into an unintended toggle. Overlays are closed by
  // their backdrops, the close button, and Cancel instead of Escape.
  useEffect(() => {
    const root = rootRef.current

    if (!root) {
      return
    }

    // The picker, dialog, and menu all mount on demand, so their controls have
    // to be stripped as they appear rather than only on the first pass.
    function stripFocusability() {
      const focusable = root?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [contenteditable], [tabindex]:not([tabindex="-1"])',
      )

      for (const node of focusable ?? []) {
        node.tabIndex = -1
      }
    }

    stripFocusability()

    // Only childList is observed. The callback sets attributes, so watching
    // attributes too would retrigger it in a loop.
    const observer = new MutationObserver(stripFocusability)

    observer.observe(root, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  // Scrolling a boss steps what blocks its palace. One delegated listener on the
  // grid rather than an `onWheel` per boss, because React registers wheel handlers
  // as passive: `preventDefault` would be ignored there and the page would scroll
  // away under the cursor while the block cycled.
  useEffect(() => {
    const grid = palaceGridRef.current

    if (!grid) {
      return
    }

    function handleWheel(event: WheelEvent) {
      const target = event.target as HTMLElement | null
      const boss = target?.closest<HTMLElement>('[data-boss-key]')
      const bossKey = boss?.dataset.bossKey

      if (!bossKey || event.deltaY === 0) {
        return
      }

      event.preventDefault()
      cycleBossBlock(bossKey, event.deltaY > 0 ? 1 : -1)
    }

    grid.addEventListener('wheel', handleWheel, { passive: false })

    return () => grid.removeEventListener('wheel', handleWheel)
  }, [])

  /** One item holder. Left click marks collected, right click opens the menu,
   *  middle click empties it. Shared by the town and palace grids. */
  /**
   * `onCycleMark` is for slots that sit directly on top of an icon that has its
   * own right click action, which is the towns. The slot covers the icon
   * completely, so the icon can no longer be clicked and its letter cycle moves
   * here onto shift + right click.
   */
  function renderItemSlot(
    slotKey: string,
    label: string,
    options?: { onCycleMark?: () => void },
  ) {
    const item = allPickables.find((entry) => entry.id === slotItems[slotKey])
    const isCollected = Boolean(item && collected[slotKey])
    const cycleHint = options?.onCycleMark
      ? ' Shift right click to cycle letters.'
      : ''

    return (
      <div className="item-slot-wrap" key={slotKey}>
        <button
          aria-haspopup="dialog"
          aria-label={
            item
              ? `${label}: ${item.name}${isCollected ? ', collected' : ''}. Left click to mark collected, right click to change, middle click to clear.${cycleHint}`
              : `${label}: empty. Right click to choose an item.${cycleHint}`
          }
          aria-pressed={item ? isCollected : undefined}
          className={isCollected ? 'item-slot item-slot-collected' : 'item-slot'}
          // Middle click clears the item.
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              clearItem(slotKey)
            }
          }}
          // Left click marks the item as collected.
          onClick={() => {
            if (item) {
              toggleCollected(slotKey)
            }
          }}
          // Right click opens the item menu, and shift + right click cycles the
          // underlying icon's letter where the slot covers one.
          onContextMenu={(event) => {
            event.preventDefault()

            if (options?.onCycleMark && event.shiftKey) {
              options.onCycleMark()
              return
            }

            setOpenSlot(openSlot === slotKey ? null : slotKey)
          }}
          // Middle click otherwise triggers autoscroll.
          onMouseDown={(event) => {
            if (event.button === 1) {
              event.preventDefault()
            }
          }}
          type="button"
        >
          {item ? <ItemArt item={item} /> : null}
          {isCollected ? (
            <Check
              aria-hidden="true"
              className="item-slot-check"
              // Matches the palace sprite size; CSS scales it down for towns.
              size={50}
              strokeWidth={4}
            />
          ) : null}
        </button>
      </div>
    )
  }

  /**
   * Item ids already checked off somewhere on the map. Every placed slot stores
   * its pickup in slotItems under the same key collected uses, so a slot that
   * is both filled and checked means that item has been found, wherever it sat.
   */
  const placedCollectedIds = useMemo(() => {
    const found = new Set<string>()

    for (const [slotKey, isChecked] of Object.entries(collected)) {
      const itemId = slotItems[slotKey]

      if (isChecked && itemId) {
        found.add(itemId)
      }
    }

    return found
  }, [collected, slotItems])

  /**
   * Palace number to stamp on each item in the collection row: the palace it has
   * been placed in but not yet picked up. Knowing an item is sitting in Palace 3
   * is the same kind of "still needed, and here is the catch" note the letters
   * carry, so it is drawn in their place and in their style rather than as a
   * second badge competing for the same corner.
   *
   * Palace slots key as `Palace 3-0`, which is where the number comes from - no
   * separate lookup table to keep in step with `palaceColumns`. Collected slots
   * are skipped, since a found item needs no reminder, and the lowest palace wins
   * if the same pickup somehow sits in two.
   */
  const palaceItemNumbers = useMemo(() => {
    const byItem = new Map<string, string>()

    for (const [slotKey, itemId] of Object.entries(slotItems)) {
      const palace = /^Palace (\d+)-\d+$/.exec(slotKey)

      if (!palace || !itemId || collected[slotKey]) {
        continue
      }

      const current = byItem.get(itemId)

      if (!current || Number(palace[1]) < Number(current)) {
        byItem.set(itemId, palace[1])
      }
    }

    return byItem
  }, [collected, slotItems])

  /**
   * Clears an item from the collection row. The row mirrors the map, so undoing
   * it here also unchecks any placed slot holding that item, otherwise the map
   * would immediately light the sprite back up.
   */
  function clearCollectedItem(itemId: string) {
    setCollected((current) => {
      const next = { ...current, [`collection-${itemId}`]: false }

      for (const slotKey of Object.keys(current)) {
        if (slotItems[slotKey] === itemId) {
          next[slotKey] = false
        }
      }

      return next
    })
  }

  /** One checkbox in the collection section. The sprite is fixed, so a click
   *  only flips whether it has been found this session. Collecting lights the
   *  art up from grey to full colour, so no check is drawn over it. */
  function renderCollectionSlot(entry: (typeof allPickables)[number]) {
    const slotKey = `collection-${entry.id}`
    // Lit either by its own click or by being checked off out on the map.
    const isCollected =
      Boolean(collected[slotKey]) || placedCollectedIds.has(entry.id)
    // The letter is a reminder of what is still needed, so it is dropped once
    // the pickup is found. Collecting via the map only flips a derived flag, so
    // the letter is gated on isCollected here as well as cleared on click.
    //
    // A palace number outranks a hand-set letter, because it is the sharper note
    // of the two: the letter says only that something gates this pickup, while the
    // number says exactly where it is waiting. The letter is kept, not cleared, so
    // pulling the item back out of the palace brings it straight back.
    const palaceNumber = isCollected
      ? undefined
      : palaceItemNumbers.get(entry.id)
    const mark = isCollected
      ? undefined
      : (palaceNumber ?? iconMarks[slotKey])

    return (
      <button
        aria-label={`${entry.name}${isCollected ? ', collected' : ', not collected'}${palaceNumber ? `, in palace ${palaceNumber}` : mark ? `, marked ${mark}` : ''}. Right click to cycle letters.`}
        aria-pressed={isCollected}
        className={
          isCollected
            ? 'collection-slot collection-slot-collected'
            : 'collection-slot'
        }
        key={entry.id}
        onClick={() => {
          if (isCollected) {
            clearCollectedItem(entry.id)
            return
          }

          toggleCollected(slotKey)
          // Drop the letter for good, so un-collecting later does not bring a
          // stale requirement back.
          clearMark(slotKey)
        }}
        // Right click steps through the requirement letters. Ignored once the
        // pickup is found, so no hidden letter can build up behind the lit art.
        onContextMenu={(event) => {
          event.preventDefault()

          if (!isCollected) {
            cycleMark(slotKey, COLLECTION_MARKS)
          }
        }}
        type="button"
      >
        <ItemArt item={entry} />
        {mark ? (
          <GlyphText className="icon-mark-glyph" scale={3}>
            {mark}
          </GlyphText>
        ) : null}
      </button>
    )
  }

  /**
   * Steps a boss through its slot counts. The cycle runs 1 up to the max and
   * then wraps through zero, so a boss can show no item slots at all. Starting
   * from the boss's own default keeps the first click relative to what is on
   * screen, so a boss that opens empty steps up to one slot rather than two.
   */
  function cycleSlots(name: string, maxSlots: number) {
    setSlotCounts((current) => ({
      ...current,
      [name]: ((current[name] ?? startSlotsFor(name)) + 1) % (maxSlots + 1),
    }))
  }

  /** Steps an icon through the requirement letters, then back to none. Takes the
   *  letter list so the collection row can end on DM while the bosses end on
   *  DV. */
  function cycleMark(iconKey: string, marks: string[] = ICON_MARKS) {
    setIconMarks((current) => {
      const next = { ...current }
      const index = marks.indexOf(current[iconKey] ?? '')
      const mark = marks[(index + 1) % marks.length]

      if (mark) {
        next[iconKey] = mark
      } else {
        delete next[iconKey]
      }

      return next
    })
  }

  /**
   * Steps a boss through what blocks its palace. `direction` is -1 or 1, so
   * scrolling back up walks the list in reverse instead of having to wrap all the
   * way around - with eight states that matters, and the wheel is the one control
   * here that has a natural backwards.
   */
  function cycleBossBlock(bossKey: string, direction: number) {
    setBossBlocks((current) => {
      const index = BOSS_BLOCKS.findIndex(
        (block) => block.id === (current[bossKey] ?? ''),
      )
      const length = BOSS_BLOCKS.length
      const block = BOSS_BLOCKS[(index + direction + length) % length]
      const next = { ...current }

      if (block.id) {
        next[bossKey] = block.id
      } else {
        delete next[bossKey]
      }

      return next
    })
  }

  /** Drops an icon's requirement letter without stepping the cycle. */
  function clearMark(iconKey: string) {
    setIconMarks((current) => {
      if (!current[iconKey]) {
        return current
      }

      const next = { ...current }
      delete next[iconKey]

      return next
    })
  }

  /**
   * Steps a connector end through the destination sprites, then back to the
   * unknown marker. Each end cycles independently of its partner.
   */
  function cycleConnectorEnd(endKey: string) {
    if (CONNECTOR_MARKS.length === 0) {
      return
    }

    setConnectorEnds((current) => {
      const next = { ...current }
      const marks = CONNECTOR_MARKS.map((mark) => mark.src)
      // -1 for an unmarked end steps to index 0, the first destination.
      const index = marks.indexOf(current[endKey] ?? '')
      const mark = marks[(index + 1) % (marks.length + 1)]

      if (mark) {
        next[endKey] = mark
      } else {
        delete next[endKey]
      }

      return next
    })
  }

  /** Renders one end of a connector row as a right-clickable marker. */
  function renderConnectorEnd(
    index: number,
    side: 'first' | 'second',
    noteAlt: string
  ) {
    const endKey = `connector-${index}-${side}`
    const endSrc = connectorEnds[endKey]
    const endMark = CONNECTOR_MARKS.find((mark) => mark.src === endSrc)

    return (
      <button
        aria-label={`${noteAlt} ${side} side: ${endMark?.alt ?? 'unknown'}. Right click to change.`}
        className="palace-note-end"
        onContextMenu={(event) => {
          event.preventDefault()
          cycleConnectorEnd(endKey)
        }}
        type="button"
      >
        {/* Labelled by the button, so the sprite itself stays decorative. */}
        <img alt="" className="palace-note" src={endSrc ?? UNKNOWN_NOTE} />
      </button>
    )
  }

  /**
   * Returns the tracker to a fresh run. Zoom is deliberately left alone, since
   * it is a display preference rather than run progress.
   */
  /**
   * Drops the armed icon on a cell, or clears the cell when nothing is armed so
   * a stray placement can be undone without first disarming.
   */
  function placeOverworldIcon(cellKey: string) {
    setOverworldCells((current) => {
      const next = { ...current }

      if (armedIcon) {
        next[cellKey] = armedIcon
      } else {
        delete next[cellKey]
      }

      return next
    })
  }

  /**
   * The three columns of placeable icons. Rendered between the two maps, so it is
   * defined here and called from inside the map loop rather than being laid out by
   * CSS `order` - it needs to sit at the DOM position it is read at, so keyboard
   * order matches what is on screen. Its width is reserved in CSS, so the maps
   * stay put as the remaining two columns fill in.
   */
  function renderOverworldPalette() {
    return (
      <div
        aria-label="Overworld icons"
        className="overworld-palette"
        role="toolbar"
      >
        {overworldIconColumns().map((column, columnIndex) => (
          <div className="overworld-palette-column" key={columnIndex}>
            {column.map((icon) => (
              <button
                aria-label={`${icon.name}${armedIcon === icon.id ? ', selected' : ''}. Click, then click a map square to place it.`}
                aria-pressed={armedIcon === icon.id}
                className={
                  armedIcon === icon.id
                    ? 'overworld-palette-icon overworld-palette-icon-armed'
                    : 'overworld-palette-icon'
                }
                key={icon.id}
                // Clicking the armed icon disarms it, so a left click on a cell
                // goes back to clearing it.
                onClick={() =>
                  setArmedIcon((current) =>
                    current === icon.id ? null : icon.id,
                  )
                }
                type="button"
              >
                {/* Drawn at the sprite's native 16px rather than stretched to
                    fill the box. These markers carry a palace number, and a
                    fractional scale smears the digit's strokes to uneven widths,
                    which is exactly the detail that has to stay readable. */}
                <Image alt="" height={16} src={icon.src} width={16} />
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  /** Empties a single cell, on right click, whatever is armed. */
  function clearOverworldCell(cellKey: string) {
    setOverworldCells((current) => {
      if (!(cellKey in current)) {
        return current
      }

      const next = { ...current }
      delete next[cellKey]

      return next
    })
  }

  function clearTracker() {
    setOverworldCells({})
    setArmedIcon(null)
    setSlotItems({})
    setCollected({})
    setSlotCounts({})
    setIconMarks({})
    setBossBlocks({})
    setCountValues({})
    setConnectorEnds({})
    setOpenSlot(null)
    setIsConfirmingClear(false)
  }

  /**
   * Applies a ruleset's starting state over a cleared board. Presets are chosen
   * at the top of a run, so starting clean avoids leaving stale placements from
   * whatever was on screen before.
   */
  function applyPreset(preset: (typeof PRESETS)[number]) {
    // The maps describe the seed being played, so a new ruleset empties them
    // along with everything else.
    setOverworldCells({})
    setArmedIcon(null)
    setSlotItems({ ...preset.placements })
    setCollected(collectedFromPreset(preset))
    setSlotCounts({})
    setIconMarks({})
    setBossBlocks({})
    setCountValues({ ...preset.counts })
    setConnectorEnds({})
    setActiveFlags(preset.id)
  }

  function assignItem(slotKey: string, itemId: string) {
    setSlotItems((current) => ({ ...current, [slotKey]: itemId }))
    setOpenSlot(null)
  }

  function toggleCollected(slotKey: string) {
    setCollected((current) => ({ ...current, [slotKey]: !current[slotKey] }))
  }

  function clearItem(slotKey: string) {
    setSlotItems((current) => {
      const next = { ...current }
      delete next[slotKey]
      return next
    })
    // Middle click wipes the slot entirely, checkmark included.
    setCollected((current) => {
      const next = { ...current }
      delete next[slotKey]
      return next
    })
    setOpenSlot(null)
  }
  const dragRef = useRef<{
    x: number
    y: number
    scale: number
    handle: Handle
  } | null>(null)

  function handlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    handle: Handle
  ) {
    event.preventDefault()
    dragRef.current = { x: event.clientX, y: event.clientY, scale, handle }
    setActiveHandle(handle.id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current

    if (!drag) {
      return
    }

    const { handle } = drag
    // Dragging outward always grows; each active axis contributes evenly.
    const axes = Math.abs(handle.x) + Math.abs(handle.y)
    const deltaX = (handle.x * (event.clientX - drag.x)) / BASE_WIDTH
    const deltaY = (handle.y * (event.clientY - drag.y)) / BASE_HEIGHT

    setScale(clampScale(drag.scale + ((deltaX + deltaY) * 2) / axes))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = null
    setActiveHandle(null)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="tracker-wrap"
      // Clicking a button focuses it by default, which is what let a later
      // stray Enter or Space re-fire the last icon clicked. Cancelling the
      // default on mousedown keeps focus off without touching the click itself,
      // and it suppresses text selection while dragging a resize grip.
      onMouseDown={(event) => event.preventDefault()}
      ref={rootRef}
    >
      <div
        className={`tracker-stage${activeHandle ? ' is-resizing' : ''}`}
        style={{
          width: BASE_WIDTH * scale,
          height: BASE_HEIGHT * scale,
        }}
      >
        <div
          className="tracker-scaler"
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            // `zoom` scales during layout, so the sprites rasterize at their
            // final on-screen size. `transform: scale()` instead rasterizes at
            // the base size and stretches that bitmap, which is why the art
            // looked soft until an interaction forced a fresh repaint.
            zoom: scale,
          }}
        >
          <div
            aria-label="Zelda II portrait tracker canvas with an eight-bit frame"
            className="game-canvas"
            role="img"
          >
            <div aria-label="Town locations" className="town-grid">
              {towns.map((town) => {
                const townKey = `town-${town.name}`
                const mark = iconMarks[townKey]

                return (
                  <div className="town-column" key={town.name}>
                    <button
                      aria-label={`${town.name} town${mark ? `, marked ${mark}` : ''}. Right click to cycle letters.`}
                      className="town-icon icon-toggle"
                      // Right click steps through the requirement letters.
                      onContextMenu={(event) => {
                        event.preventDefault()
                        cycleMark(townKey, TOWN_MARKS)
                      }}
                      type="button"
                    >
                      <Image
                        alt={`${town.name} town`}
                        height={32}
                        src={town.src}
                        width={32}
                      />
                      {mark ? (
                        <GlyphText className="icon-mark-glyph" scale={3}>
                          {mark}
                        </GlyphText>
                      ) : null}
                    </button>
                    {renderItemSlot(townKey, `${town.name} item`, {
                      onCycleMark: () => cycleMark(townKey, TOWN_MARKS),
                    })}
                  </div>
                )
              })}
            </div>

            <div className="section-divider section-divider-towns" />

            {/* The grid carries a transform, so it is its own stacking context and
                the menu's own z-index cannot lift the panel past the sections that
                follow it in the DOM - the grid is what has to move. Raised only
                while the menu is open, so the board's paint order is otherwise
                untouched. */}
            <div
              aria-label="Palace locations"
              className={`palace-grid${isMenuOpen ? ' palace-grid-raised' : ''}`}
              ref={palaceGridRef}
            >
              {palaceColumns.map((column) => (
                <div
                  className={`town-column palace-column-${column.id}${column.flipped ? ' town-column-flipped' : ''}`}
                  key={column.id}
                >
                  {column.bosses.map((palace) => {
                    const slots =
                  slotCounts[palace.name] ?? startSlotsFor(palace.name)
                    const bossKey = `boss-${palace.name}`
                    const isBeaten = Boolean(collected[bossKey])
                    const mark = iconMarks[bossKey]
                    const block = BOSS_BLOCKS.find(
                      (entry) => entry.id === bossBlocks[bossKey],
                    )

                    return (
                      <div className="palace-row" key={palace.name}>
                        <button
                          aria-label={`${palace.name} palace boss${isBeaten ? ', defeated' : ''}${mark ? `, marked ${mark}` : ''}${block ? `, blocked by ${block.name}` : ''}, ${slots} of ${palace.maxSlots} item slots. Left click to mark defeated, right click to cycle letters, middle click to cycle slots, scroll to cycle what blocks it.`}
                          aria-pressed={isBeaten}
                          className={
                            isBeaten
                              ? 'town-icon icon-toggle boss-toggle-beaten'
                              : 'town-icon icon-toggle'
                          }
                          // Read by the grid's wheel listener to find which boss was
                          // scrolled. The listener sits on the grid rather than here
                          // because React registers `wheel` passively, which would
                          // leave the page scrolling as the block cycles.
                          data-boss-key={bossKey}
                          onAuxClick={(event) => {
                            if (event.button === 1) {
                              event.preventDefault()
                              cycleSlots(palace.name, palace.maxSlots)
                            }
                          }}
                          // Left click marks the boss as defeated.
                          onClick={() => toggleCollected(bossKey)}
                          // Right click steps through the requirement letters.
                          onContextMenu={(event) => {
                            event.preventDefault()
                            cycleMark(bossKey)
                          }}
                          // Middle click otherwise triggers browser autoscroll.
                          onMouseDown={(event) => {
                            if (event.button === 1) {
                              event.preventDefault()
                            }
                          }}
                          type="button"
                        >
                          <Image
                            alt={`${palace.name} palace boss`}
                            height={32}
                            src={palace.src}
                            width={32}
                          />
                          {block ? (
                            <span aria-hidden="true" className="boss-block">
                              {block.src.map((src) => (
                                <Image
                                  alt=""
                                  height={22}
                                  key={src}
                                  src={src}
                                  width={22}
                                />
                              ))}
                            </span>
                          ) : null}
                          {mark ? (
                            <GlyphText className="icon-mark-glyph" scale={3}>
                              {mark}
                            </GlyphText>
                          ) : null}
                          {isBeaten ? (
                            <Check
                              aria-hidden="true"
                              className="item-slot-check"
                              // Same 37px stamp the 56px location sprites use.
                              size={37}
                              strokeWidth={4}
                            />
                          ) : null}
                        </button>
                        {Array.from({ length: slots }, (_, index) =>
                          renderItemSlot(
                            `${palace.name}-${index}`,
                            `${palace.name} item ${index + 1}`
                          )
                        )}
                      </div>
                    )
                  })}

                  {/* Flagsets and Clear share one hamburger, sitting in the right
                      column's free fourth row: that column holds three bosses to
                      the left column's four, so the band under Thunderbird is
                      open. Column `align-items: flex-end` pins it to the same edge
                      the boss sprites use, so it lands directly below Thunderbird
                      and level with the left column's fourth boss. */}
                  {column.id === 'right' ? (
                    <div className="tracker-menu-wrap">
                      <button
                        aria-expanded={isMenuOpen}
                        aria-haspopup="menu"
                        aria-label="Tracker options"
                        className="tracker-menu-toggle"
                        onClick={() => setIsMenuOpen((current) => !current)}
                        type="button"
                      >
                        {/* Three chunky bars, drawn as blocks to match the pixel
                            art rather than a thin vector icon. */}
                        <span aria-hidden="true" className="tracker-menu-bar" />
                        <span aria-hidden="true" className="tracker-menu-bar" />
                        <span aria-hidden="true" className="tracker-menu-bar" />
                      </button>

                      {isMenuOpen ? (
                        <div
                          aria-label="Tracker options"
                          className="tracker-menu"
                          role="menu"
                        >
                          <p className="tracker-menu-heading">Flagset</p>

                          {PRESETS.map((preset) => (
                            <button
                              aria-checked={preset.id === activeFlags}
                              className="tracker-menu-option"
                              key={preset.id}
                              onClick={() => {
                                setIsMenuOpen(false)
                                applyPreset(preset)
                              }}
                              role="menuitemradio"
                              type="button"
                            >
                              {preset.name}
                            </button>
                          ))}

                          {/* Clearing wipes the board, so it is set apart from
                              the flagsets above it and tinted with the frame's
                              red. Still routed through the confirm dialog. */}
                          <button
                            className="tracker-menu-option tracker-menu-option-danger"
                            onClick={() => {
                              setIsMenuOpen(false)
                              setIsConfirmingClear(true)
                            }}
                            role="menuitem"
                            type="button"
                          >
                            Clear
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Connector rows fill the space between the boss columns. Only
                rendered once sprites are supplied. */}
            {PALACE_NOTES.length > 0 ? (
              <div className="palace-notes">
                {PALACE_NOTES.map((note, index) => (
                  <div
                    className="palace-note-row"
                    key={`${note.src}-${index}`}
                  >
                    {/* Each connector has two ends, so a destination marker
                        flanks it on either side. Both cycle independently. */}
                    {renderConnectorEnd(index, 'first', note.alt)}
                    <img
                      alt={note.alt}
                      className="palace-note"
                      src={note.src}
                    />
                    {renderConnectorEnd(index, 'second', note.alt)}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="section-divider section-divider-bosses" />

            {locationRows.map((row, rowIndex) => (
              <div
                aria-label={`Overworld item locations, row ${rowIndex + 1}`}
                className={
                  [
                    'location-row',
                    rowIndex === 1 ? 'location-row-second' : '',
                    rowIndex === 2 ? 'location-row-third' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
                key={`location-row-${rowIndex}`}
              >
                {row.map((location) => {
                  const slotKey = `location-${location.name}`

                  // Counter slots hold no sprite: they occupy one icon of space
                  // and cycle through their numbers on left click instead.
                  if ('kind' in location) {
                    const value = countValues[slotKey] ?? ''

                    return (
                      <button
                        aria-label={
                          value
                            ? `${location.name}: ${value}. Left click for the next number.`
                            : `${location.name}: unset. Left click to choose 5, 6 or 7.`
                        }
                        className="location-icon location-count"
                        key={location.name}
                        onClick={() => cycleCount(slotKey, 1)}
                        // Right click steps back through the numbers.
                        onContextMenu={(event) => {
                          event.preventDefault()
                          cycleCount(slotKey, -1)
                        }}
                        type="button"
                      >
                        {value ? (
                          <span aria-hidden="true" className="icon-mark">
                            {value}
                          </span>
                        ) : null}
                      </button>
                    )
                  }

                  const item = allPickables.find(
                    (entry) => entry.id === slotItems[slotKey]
                  )
                  const isCollected = Boolean(item && collected[slotKey])

                  return (
                    <button
                      aria-haspopup="dialog"
                      aria-label={
                        item
                          ? `${location.name}: ${item.name}${isCollected ? ', collected' : ''}. Left click to mark collected, right click to change, middle click to clear.`
                          : `${location.name}: empty. Right click to choose an item.`
                      }
                      aria-pressed={item ? isCollected : undefined}
                      className={
                        isCollected
                          ? 'location-icon location-icon-collected'
                          : 'location-icon'
                      }
                      key={location.name}
                      // Middle click clears the item.
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          event.preventDefault()
                          clearItem(slotKey)
                        }
                      }}
                      onClick={() => {
                        if (item) {
                          toggleCollected(slotKey)
                        }
                      }}
                      // Right click opens the item menu.
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setOpenSlot(openSlot === slotKey ? null : slotKey)
                      }}
                      // Middle click otherwise triggers autoscroll.
                      onMouseDown={(event) => {
                        if (event.button === 1) {
                          event.preventDefault()
                        }
                      }}
                      type="button"
                    >
                      <Image
                        alt={location.name}
                        height={56}
                        src={location.src}
                        width={56}
                      />
                      {/* The item draws over the location art, not beside it. */}
                      {item ? (
                        <span aria-hidden="true" className="location-item">
                          <ItemArt item={item} />
                        </span>
                      ) : null}
                      {isCollected ? (
                        <Check
                          aria-hidden="true"
                          className="item-slot-check"
                          size={37}
                          strokeWidth={4}
                        />
                      ) : null}
                    </button>
                  )
                })}

              </div>
            ))}

            <div className="section-divider section-divider-locations" />

            {/* Session checklist of every one-off pickup, laid out like the item
                menu so a sprite reads the same in both places. */}
            <section aria-label="Item and spell collection" className="collection">
              <div className="collection-grid">
                {collectionItems.map((entry) => renderCollectionSlot(entry))}
              </div>

              <div className="collection-grid">
                {spells.map((entry) => renderCollectionSlot(entry))}
              </div>
            </section>

            {/* Closes the collection off, bracketing the overworld maps below. */}
            <div className="section-divider section-divider-collection" />

            {/* The two overworlds, with the icon palette between them so either
                map is an equally short trip from the icon being placed. */}
            <section aria-label="Overworld maps" className="overworld">
              {OVERWORLDS.map((world, worldIndex) => (
                <Fragment key={world.id}>
                {worldIndex === 1 ? renderOverworldPalette() : null}
                  {/* Unlabelled on screen - the two grids are self-evidently the
                      west and east maps, and dropping the headings buys the height
                      the larger squares need. The name still reaches screen readers
                      through the grid's own label and every cell's. */}
                  <div
                    aria-label={`${world.name} overworld grid`}
                    className="overworld-grid"
                    role="grid"
                  >
                    {Array.from({ length: OVERWORLD_SIZE }, (_, row) => (
                      <div className="overworld-row" key={row} role="row">
                        {Array.from({ length: OVERWORLD_SIZE }, (_, column) => {
                          const cellKey = `${world.id}-${row}-${column}`
                          const icon = OVERWORLD_ICONS.find(
                            (entry) => entry.id === overworldCells[cellKey],
                          )
                          // Grids are read out in the 1-based coordinates a
                          // player would say out loud, not the 0-based indexes.
                          const position = `row ${row + 1}, column ${column + 1}`

                          return (
                            <button
                              aria-label={
                                icon
                                  ? `${world.name} ${position}: ${icon.name}. Right click to clear.`
                                  : `${world.name} ${position}: empty.`
                              }
                              className="overworld-cell"
                              key={column}
                              onClick={() => placeOverworldIcon(cellKey)}
                              onContextMenu={(event) => {
                                event.preventDefault()
                                clearOverworldCell(cellKey)
                              }}
                              role="gridcell"
                              type="button"
                            >
                              {icon ? (
                                <Image
                                  alt=""
                                  className="overworld-cell-icon"
                                  height={16}
                                  src={icon.src}
                                  width={16}
                                />
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </Fragment>
              ))}
            </section>

            {/* Closes the menu on any outside click, since the board takes no
                keystrokes and so has no Escape to fall back on. */}
            {isMenuOpen ? (
              <button
                aria-label="Close tracker options"
                className="tracker-menu-backdrop"
                onClick={() => setIsMenuOpen(false)}
                type="button"
              />
            ) : null}

            {isConfirmingClear ? (
              <div className="tracker-dialog-overlay">
                <button
                  aria-label="Cancel clearing the tracker"
                  className="item-picker-backdrop"
                  onClick={() => setIsConfirmingClear(false)}
                  type="button"
                />
                {/* No copy here, so the dialog carries its own label for
                    screen readers rather than pointing at a heading. */}
                <div
                  aria-label="Clear tracker?"
                  aria-modal="true"
                  className="tracker-dialog"
                  role="dialog"
                >
                  <div className="tracker-dialog-actions">
                    <button
                      className="tracker-button"
                      onClick={() => setIsConfirmingClear(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="tracker-button tracker-button-danger"
                      onClick={clearTracker}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Rendered last so the menu floats over the boss icons and slots. */}
            {openSlot ? (
              <div className="item-picker-overlay">
                <button
                  aria-label="Close item menu"
                  className="item-picker-backdrop"
                  onClick={() => setOpenSlot(null)}
                  type="button"
                />
                <div
                  aria-label={`Choose an item for ${slotLabel(openSlot)}`}
                  className="item-picker"
                  role="dialog"
                >
                  {/* The title stays optically centred because the close button
                      is taken out of flow rather than sharing the row. */}
                  <div className="item-picker-header">
                    <p className="item-picker-title">{slotLabel(openSlot)}</p>
                    <button
                      aria-label="Close item menu"
                      className="item-picker-close"
                      onClick={() => setOpenSlot(null)}
                      type="button"
                    >
                      <span aria-hidden="true">X</span>
                    </button>
                  </div>
                  <div className="item-picker-grid">
                    {items.map((entry) => (
                      <button
                        aria-label={entry.name}
                        className="item-picker-option"
                        key={entry.id}
                        onClick={() => assignItem(openSlot, entry.id)}
                        type="button"
                      >
                        <ItemArt item={entry} />
                      </button>
                    ))}
                  </div>

                  {/* Spells get their own labelled section under the items. */}
                  {spells.length > 0 ? (
                    <>
                      <p className="item-picker-subtitle">Spells</p>
                      <div className="item-picker-grid">
                        {spells.map((entry) => (
                          <button
                            aria-label={entry.name}
                            className="item-picker-option"
                            key={entry.id}
                            onClick={() => assignItem(openSlot, entry.id)}
                            type="button"
                          >
                            <ItemArt item={entry} />
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="frame-rail frame-rail-top" />
            <div className="frame-rail frame-rail-right" />
            <div className="frame-rail frame-rail-bottom" />
            <div className="frame-rail frame-rail-left" />
            <div className="frame-corner frame-corner-top-left" />
            <div className="frame-corner frame-corner-top-right" />
            <div className="frame-corner frame-corner-bottom-right" />
            <div className="frame-corner frame-corner-bottom-left" />
          </div>
        </div>

        {handles.map((handle) => (
          <button
            aria-label={`Drag the ${handle.label} to resize the tracker`}
            className={`tracker-grip tracker-grip-${handle.id}`}
            key={handle.id}
              onPointerCancel={handlePointerUp}
            onPointerDown={(event) => handlePointerDown(event, handle)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            type="button"
          />
        ))}
      </div>
    </div>
  )
}
