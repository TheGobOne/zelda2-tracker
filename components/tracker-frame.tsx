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
        // The Great Palace holds no items at all, so Thunderbird caps at zero and
        // has no slots to show or cycle.
        maxSlots: 0,
        // Which leaves this row's item area free, so the heart tally takes it -
        // landing directly under Palace 6's items, in the column the eye already
        // follows for what a run has picked up. Carried as data so the renderer
        // asks the row where the tally goes instead of naming a palace itself.
        heartTally: true,
      },
    ],
  },
]

/**
 * Slot count a boss shows before anything is tracked. Read by the renderer, by
 * the slot cycle, and after a clear or preset load, which all reset the stored
 * counts back to empty.
 *
 * A boss opens with one slot, or none when it cannot hold items at all - taking
 * that from `maxSlots` rather than a second field keeps one number in charge of
 * both, so an opening count can never exceed the cap.
 */
function startSlotsFor(name: string) {
  for (const column of palaceColumns) {
    for (const boss of column.bosses) {
      if (boss.name === name) {
        return Math.min(1, boss.maxSlots)
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

/**
 * The pickups the tallies count. Checking off a slot holding one of these is what
 * raises its count, so each number is read off the board rather than kept beside
 * it - one source of truth, which is what stops the two from drifting apart.
 *
 * Containers can only ever be gained, so both tallies count up from what the
 * ruleset starts Link with rather than from zero, and neither has an empty state -
 * the opening figure is a real reading, not "unset".
 *
 * How many Link opens with, and how many exist at all, are set by the flags,
 * so those figures live on each preset. Magic happens to cap at eight under both
 * current rulesets, but hearts do not, so the cap is per-preset for both rather
 * than a constant for one and a field for the other.
 */
const HEART_ITEM_ID = 'heartcontainer'
const MAGIC_ITEM_ID = 'magiccontainer'

/**
 * Granny hands over her spell item once the magic container in New Kasuto's
 * basement is taken, so checking that container off finishes her too. Both slots
 * are named here and matched by name rather than by their position in the rows,
 * so reordering a row cannot quietly break the link.
 */
const GRANNY_SLOT_NAME = 'Spell Item Count'
const NEW_KASUTO_MAGIC_SLOT_NAME = 'New Kasuto Magic Container'

// A location row holds sprite slots plus the occasional numeric counter slot,
// which takes up one icon of space and shows a chosen number over its art. The
// counter carries a `src` like any other slot rather than hardcoding one in the
// markup, so the art stays beside the name it belongs to.
type LocationEntry =
  | { name: string; src: string }
  | { kind: 'count'; name: string; src: string }

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
  {
    kind: 'count',
    name: 'Spell Item Count',
    src: '/images/locations/granny.png',
  },
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
  // The pair's two halves, each pickable on its own so a slot can name the exact
  // pickup rather than only "one of these two".
  { id: '1up', name: '1-Up', src: '/images/items/1up.png' },
  { id: 'redjar', name: 'Red Jar', src: '/images/items/redpotion.png' },
  // The blue jar beside its red counterpart, then the small key. All four sit in
  // the same run: repeatable pickups a slot can name, rather than one-off items.
  { id: 'bluejar', name: 'Blue Jar', src: '/images/items/bluejar.png' },
  { id: 'smallkey', name: 'Small Key', src: '/images/items/smallkey.png' },
  // The junk check: all four filler pickups in one box, one to a corner. Stands
  // for "this check holds something worthless" without saying which, so the
  // presets can mark filler where the exact pickup is not worth distinguishing.
  // It reads as the summary of the four boxes above it.
  {
    id: 'junk',
    name: 'Junk Check',
    // Listed in the order the 2x2 grid fills its corners: top-left, top-right,
    // bottom-left, bottom-right. The blue jar leads with the 1-Up below it, so
    // the two jars sit side by side across the top row.
    src: [
      '/images/items/bluejar.png',
      '/images/items/redpotion.png',
      '/images/items/1up.png',
      '/images/items/smallkey.png',
    ],
    // The point bag sits in the middle, over the four corners. Kept in its own
    // field rather than appended to `src`, because that array is positional - a
    // fifth entry would be handed the grid's next cell and land bottom-left of a
    // 3x2, not in the centre.
    center: '/images/items/pbag.png',
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

// Pickups the collection tracker leaves out. Containers and point bags repeat all
// over the map, and the jars, keys and the junk check that stands for them are
// filler, so none of them are one-off collectibles worth a checkbox. Filler is
// placeable on a slot rather than collected once - and leaving it out is what keeps
// the collection grid at its 16 items, two clean rows of eight.
const UNTRACKED_IDS = new Set([
  'heartcontainer',
  'magiccontainer',
  'pbag',
  '1up',
  'redjar',
  'bluejar',
  // Keys are per-palace and there are many of them, so a single checkbox could
  // never say anything useful about how many have been found.
  'smallkey',
  'junk',
])

// The 16 tracked items, which fill two rows of eight above the spell row.
const collectionItems = items.filter((entry) => !UNTRACKED_IDS.has(entry.id))

/** Placeholder sprite marking a connector end whose destination is unknown. */
const UNKNOWN_NOTE = '/images/notes/unknown.png'

/**
 * Destinations a connector end can be tagged with. Left click steps forward
 * through these and right click steps back; the unknown "?" marker sits between
 * the last entry and the first, so a full cycle returns the end to unmarked.
 */
const CONNECTOR_MARKS: { src: string; alt: string }[] = [
  { src: '/images/notes/w.png', alt: 'W' },
  { src: '/images/notes/e.png', alt: 'E' },
  { src: '/images/notes/mi.png', alt: 'MI' },
  { src: '/images/notes/dm.png', alt: 'DM' },
]

/**
 * Connector art centered in the palace section. Each entry renders one row, flanked
 * by a clickable destination marker per end. Add sprites here as
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
 * Thunderbird's requirement, which every Upstarts week fixes. Held on its own
 * because some weeks state this one and nothing else, and naming it twice would
 * let the two copies disagree.
 *
 * Palace 7 is Thunderbird - the boss art names the row, not the number.
 */
const UPSTARTS_THUNDERBIRD_MARK = { 'boss-Palace 7': 'DV' }

/**
 * The board the Upstarts weeks share: the known checks, plus the full set of
 * palace requirements. Held once and spread into each week because the weeks
 * differ only around the edges, so copying these literals per week would only
 * invite one copy to drift. A week that departs from it overrides the one field
 * it disagrees on after the spread.
 *
 * Safe to share by reference - the apply step copies both maps rather than
 * writing through them, so a run cannot leak edits back into the table.
 */
const UPSTARTS_KNOWN_BOARD = {
  // The first three palaces gate on W, Palace 4 on MI, and the two right-column
  // palaces on E.
  marks: {
    'boss-Palace 1': 'W',
    'boss-Palace 2': 'W',
    'boss-Palace 3': 'W',
    'boss-Palace 4': 'MI',
    'boss-Palace 5': 'E',
    'boss-Palace 6': 'E',
    ...UPSTARTS_THUNDERBIRD_MARK,
  },
  // Known checks. Both stab teachers hold their own stab under these flagsets,
  // unlike SGL where the two are swapped.
  placements: {
    'location-Downstab Man': 'downstab',
    'location-Up Stab Man': 'upstab',
    'location-Saria Table': 'mirror',
    'location-Bagu': 'noteforriverman',
    'location-Nabooru Fountain': 'water',
  },
  // Downstab is the one of those already in hand; the rest are known but still
  // out there, so they stay unticked.
  checkedSlots: ['location-Downstab Man'],
}

/**
 * What each Upstarts week fixes in advance, keyed by week number.
 *
 * Kept apart from the weeks themselves because the weeks are generated: every
 * other field they carry is shared, so this table holds only the differences and
 * a week with no entry falls back to the placeholder board. Filling in a further
 * week means adding a key here and nothing else.
 *
 * Declared above `PRESETS` because that array reads it while being built.
 */
const UPSTARTS_WEEK_FLAGS: Record<
  number,
  {
    marks?: Record<string, string>
    placements?: Record<string, string>
    checkedSlots?: string[]
    /**
     * Pickups this week starts with, beyond the candle every week opens holding.
     * Added to that rather than replacing it, so a week only has to name its
     * extras.
     */
    startsWith?: string[]
  }
> = {
  1: {
    ...UPSTARTS_KNOWN_BOARD,
    // Link opens this week already knowing Life and Fairy.
    startsWith: ['life-spell', 'fairy-spell'],
  },
  2: {
    ...UPSTARTS_KNOWN_BOARD,
    // Week 2 runs the same board on Shield alone. Life and Fairy are dropped by
    // simply not being named - `startsWith` lists a week's extras rather than
    // subtracting from a running total.
    startsWith: ['shield-spell'],
  },
  3: {
    ...UPSTARTS_KNOWN_BOARD,
    startsWith: ['shield-spell'],
    // Week 2's board, but the palaces go in unlabelled - only Thunderbird's
    // requirement is fixed. Replaces the shared `marks` outright rather than
    // deleting from it, so the six that are unknown here simply go unnamed.
    marks: UPSTARTS_THUNDERBIRD_MARK,
  },
}

/**
 * Starting states for the rulesets the tracker knows, plus a blank entry for the
 * ones it does not. A preset both lights pickups Link begins with and fills the
 * checks whose contents that ruleset fixes in advance, so a run only has to record
 * what is actually still unknown.
 */
const PRESETS: {
  id: string
  name: string
  /**
   * Which submenu the entry belongs to. Absent for the rulesets that sit at the
   * top level of the flags list. Tagging them here rather than holding a second
   * array keeps every preset in one place, so the lookups that turn `activeFlags`
   * back into a ruleset - and the panel that prints its name - need no changes to
   * cover the weeks.
   */
  group?: 'upstarts'
  collectedIds: string[]
  heartStart: number
  heartMax: number
  magicStart: number
  magicMax: number
  placements: Record<string, string>
  counts: Record<string, string>
  /**
   * Requirement letters the ruleset already knows, keyed the way the board keys
   * them - `boss-Palace 3` and the like. Optional because most rulesets fix none,
   * and an absent map is the same as an empty one.
   */
  marks?: Record<string, string>
  /**
   * Checks the ruleset starts already ticked off, as full slot keys. Separate from
   * `collectedIds`, which lights entries in the collection row: a known placement
   * that has also been picked up is a property of the check, not of the item, and
   * the two are stored under different keys.
   */
  checkedSlots?: string[]
}[] = [
  {
    // Vanilla flags: Link only ever starts with the candle, and nothing on the
    // board is known in advance, so both placement maps stay empty.
    id: 'standard',
    name: 'Standard',
    collectedIds: ['candle'],
    // Vanilla containers: Link opens with four of the eight of each.
    heartStart: 4,
    heartMax: 8,
    magicStart: 4,
    magicMax: 8,
    placements: {},
    counts: {},
  },
  {
    id: 'sgl',
    name: 'SGL',
    // Candle and cross only: the fire spell is not a starting item under this
    // ruleset, so it stays unmarked until it is actually found.
    collectedIds: ['candle', 'cross'],
    // This ruleset runs a shorter heart track - three of six rather than vanilla's
    // four of eight - and holds back one starting magic container, leaving one more
    // of those to find than vanilla has.
    heartStart: 3,
    heartMax: 6,
    magicStart: 3,
    magicMax: 8,
    placements: {
      // All three P-Bag caves keep their vanilla point bags.
      'location-West P-Bag Cave': 'pbag',
      'location-East P-Bag Cave': 'pbag',
      'location-East P-Bag Cave 2': 'pbag',
      // These two checks are always filler, tracked as the junk check.
      'location-Saria Table': 'junk',
      'location-Nabooru Fountain': 'junk',
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
  {
    // For a ruleset the tracker has no entry for. Nothing is assumed: no starting
    // pickups, no known placements, and both container tallies open empty, so
    // every square on the board is filled in by hand.
    id: 'custom',
    name: 'Custom',
    collectedIds: [],
    // Opening figures only. Unlike the presets above, whose numbers describe a
    // published ruleset and so are fixed, these are a starting point: right
    // clicking either tally sets both of its sides.
    heartStart: 0,
    heartMax: 8,
    magicStart: 0,
    magicMax: 8,
    placements: {},
    counts: {},
  },
  // The Upstarts weeks. Held at the end of the array because they render from
  // their own submenu rather than in list order, and generated rather than typed
  // out six times over: the weeks share their whole opening state bar what
  // `UPSTARTS_WEEK_FLAGS` states, so six near-identical literals would only
  // invite one of them to drift.
  //
  // A week with no entry in that table is still a vanilla-shaped placeholder -
  // candle in hand, four of eight containers each, nothing known in advance -
  // until its real flagset is filled in there.
  ...Array.from({ length: 6 }, (_, index) => {
    const week = index + 1
    const flags = UPSTARTS_WEEK_FLAGS[week] ?? {}

    return {
      id: `upstarts-week-${week}`,
      name: `Week ${week}`,
      group: 'upstarts' as const,
      collectedIds: ['candle', ...(flags.startsWith ?? [])],
      heartStart: 4,
      heartMax: 8,
      magicStart: 4,
      magicMax: 8,
      placements: flags.placements ?? {},
      counts: {},
      marks: flags.marks ?? {},
      checkedSlots: flags.checkedSlots ?? [],
    }
  }),
]

/** The one ruleset whose container figures are the user's to set. */
const CUSTOM_FLAGS_ID = 'custom'

/**
 * The three runs the flags list is built from, split once here so the menu does
 * not filter on every render.
 *
 * Custom is held apart from the rest of the top level rather than left to fall
 * where it sits in `PRESETS`, because it has to stay at the foot of the list: it
 * is the odd one out - the ruleset you configure rather than one that states its
 * own figures - and anything added later should land above it. Deriving it by id
 * means that holds no matter where it sits in the array, and no matter how many
 * named rulesets or submenus arrive above it.
 */
const UPSTARTS_PRESETS = PRESETS.filter((preset) => preset.group === 'upstarts')
const NAMED_PRESETS = PRESETS.filter(
  (preset) => !preset.group && preset.id !== CUSTOM_FLAGS_ID,
)
const CUSTOM_PRESET = PRESETS.find((preset) => preset.id === CUSTOM_FLAGS_ID)

/**
 * The four figures behind the two container tallies: what Link starts with, and
 * the ceiling each count runs to. Only the Custom ruleset exposes them for
 * editing - the rest state their own, and those are a property of the ruleset
 * rather than a preference.
 */
type ContainerLimits = Pick<
  (typeof PRESETS)[number],
  'heartStart' | 'heartMax' | 'magicStart' | 'magicMax'
>

/** Which tally a limit belongs to, and which side of the slash it sets. */
type ContainerKind = 'heart' | 'magic'
type ContainerSide = 'start' | 'max'

/**
 * Values offered on either side of the slash. Capped at 8 because that is the
 * game's own ceiling for both containers, so there is no meaningful figure above
 * it; a total of 0 is dropped for the same reason, since a tally that can never
 * fill is not a ruleset anyone plays.
 */
const CONTAINER_LIMIT_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

/** Reads the four figures off a preset, for seeding the editable copy. */
function containerLimitsOf(preset: (typeof PRESETS)[number]): ContainerLimits {
  return {
    heartStart: preset.heartStart,
    heartMax: preset.heartMax,
    magicStart: preset.magicStart,
    magicMax: preset.magicMax,
  }
}

/** The Custom entry's opening figures, which its tallies reset to. */
const CUSTOM_LIMIT_DEFAULTS = containerLimitsOf(
  PRESETS.find((preset) => preset.id === CUSTOM_FLAGS_ID) ?? PRESETS[0],
)

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

  // Checks the ruleset opens already ticked. These are board slots rather than
  // collection entries, so they are keyed as they come rather than prefixed.
  for (const slotKey of preset.checkedSlots ?? []) {
    next[slotKey] = true
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
const BLOCKS: { id: string; name: string; src: string[] }[] = [
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

/**
 * Draws a single sprite, or a multi-sprite entry as one sprite per corner.
 *
 * The corners come from the grid in CSS rather than from per-sprite classes here,
 * so any number of sprites up to four lays itself out without this needing to know
 * the count. No separator between them: at this size a slash cost more room than
 * the sprites it divided, and four items in four corners already read as a set.
 */
function ItemArt({ item }: { item: (typeof allPickables)[number] }) {
  if (Array.isArray(item.src)) {
    // Only the junk check carries a centre sprite, so the field is read off the
    // entry rather than being required of every multi-sprite item.
    // The `typeof` is what narrows this to a string: only some entries in the
    // union declare `center`, so the `in` check alone leaves it untyped.
    const center =
      'center' in item && typeof item.center === 'string' ? item.center : null
    return (
      <span className="item-pair">
        {item.src.map((src) => (
          <Image alt="" height={32} key={src} src={src} width={32} />
        ))}
        {center ? (
          <Image
            alt=""
            className="item-pair-center"
            height={32}
            src={center}
            width={32}
          />
        ) : null}
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

/**
 * The controls reference, grouped by what you are pointing at. Every board
 * element here answers to more than one mouse button, and nothing on the board
 * advertises that on its own, so this is the one place it is written down.
 *
 * Kept as data rather than markup so each group renders through the same row,
 * and so a control added to a handler has an obvious place to be recorded.
 * These strings must track the handlers in this file - if a button changes
 * there, it changes here.
 */
const CONTROL_GROUPS: {
  title: string
  note?: string
  /** Absent on a group that carries a credit instead of controls. */
  rows?: { input: string; effect: string }[]
  /**
   * Standalone line, for the sign-off box. Kept a separate field from `rows`
   * because a credit is not an input paired with an effect, and forcing it into
   * that shape would style the name as if it were a mouse button.
   */
  credit?: string
}[] = [
  {
    title: 'Palace bosses',
    rows: [
      { input: 'Left click', effect: 'Mark the boss defeated' },
      { input: 'Right click', effect: 'Cycle the location' },
      { input: 'Middle click', effect: 'Change how many item slots it shows' },
      { input: 'Scroll', effect: 'Cycle what blocks the boss' },
    ],
  },
  {
    // "Palace items" rather than the generic "item slots": these are the slots
    // hanging off the boss rows above, so naming the palace ties the two panels
    // together in the order they are now read.
    title: 'Palace items',
    rows: [
      { input: 'Left click', effect: 'Mark the item collected' },
      { input: 'Right click', effect: 'Choose or change the item' },
      { input: 'Middle click', effect: 'Clear the slot' },
      { input: 'Scroll', effect: 'Cycle what blocks the slot' },
    ],
  },
  {
    title: 'Continent connectors',
    rows: [
      { input: 'Left click', effect: 'Cycle forward through destinations' },
      { input: 'Right click', effect: 'Cycle back' },
    ],
  },
  {
    // Distinguished from the palace items above, which are also locations in the
    // loose sense - these are the overworld checks.
    title: 'Item locations',
    rows: [
      { input: 'Left click', effect: 'Mark the item collected' },
      { input: 'Right click', effect: 'Choose or change the item' },
      { input: 'Middle click', effect: 'Clear the slot' },
    ],
  },
  {
    title: "Granny's Basement",
    note: "Completes on its own when Granny's item is collected.",
    rows: [
      { input: 'Left click', effect: 'Next count' },
      { input: 'Right click', effect: 'Previous count' },
    ],
  },
  {
    title: 'Item collection',
    rows: [
      { input: 'Left click', effect: 'Mark found, or clear it again' },
      {
        input: 'Right click',
        effect: 'Cycle the location, until the item is found',
      },
    ],
  },
  {
    title: 'Overworld maps',
    note: 'Click a palette icon to hold it, click it again to put it down.',
    rows: [
      { input: 'Left click', effect: 'Drop the held icon on a square' },
      { input: 'Right click', effect: 'Clear the square' },
    ],
  },
  {
    // Takes the slot the heart/magic controls held: the footnote below the grid
    // already states both of that panel's facts, so the box was repeating itself.
    title: 'Made By',
    credit: 'TheGobOne',
    // Reuses the existing note slot, which already renders directly beneath the
    // credit in the dimmer aside styling - the right weight for a footnote that
    // should sit under the name without competing with it.
    note: 'If you have any issues or bugs to report please find me on the Z2R Discord.',
  },
]

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
  // What is walling something off, holding a `BLOCKS` id. The wheel steps it; an
  // absent key is unblocked. Covers both palace bosses, under their "boss-" key,
  // and individual palace item slots, under the slot's own key - the two key
  // shapes cannot collide, so one map serves both.
  const [blocks, setBlocks] = useState<Record<string, string>>({})
  // Number shown in a counter slot, stepped through by left click.
  const [countValues, setCountValues] = useState<Record<string, string>>({})
  // Destination tagged on each connector end, keyed by row index and side. An
  // absent key means the end is still unknown and shows the "?" marker.
  const [connectorEnds, setConnectorEnds] = useState<Record<string, string>>({})
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  // Clearing is destructive, so it waits on a confirmation dialog.
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const [isShowingControls, setIsShowingControls] = useState(false)
  // Which ruleset is loaded. Standard is the default, so the board opens matching
  // it rather than needing the flags picked by hand. Still tracked now that the
  // picker is a menu, to mark the active entry.
  const [activeFlags, setActiveFlags] = useState(PRESETS[0].id)
  // The container figures the loaded ruleset plays by: Standard runs 4 of 8 hearts
  // and magic, SGL 3 of 6 hearts and 3 of 8 magic. Switching flags moves both
  // tallies' floors and totals with it. Read off the preset rather than switched on
  // its id, so a new ruleset only has to declare its own numbers. Falls back to
  // Standard if an id ever goes missing.
  const loadedPreset =
    PRESETS.find((preset) => preset.id === activeFlags) ?? PRESETS[0]

  // The Custom ruleset's container figures, which right clicking either tally
  // sets. Held outside `PRESETS` so that entry stays the blank slate it describes,
  // and so a run's edits cannot leak into the next board built from it.
  const [customLimits, setCustomLimits] = useState<ContainerLimits>(
    CUSTOM_LIMIT_DEFAULTS,
  )

  // Custom is the one ruleset whose numbers are a choice, so its tallies read
  // through the overrides. Everything downstream keeps taking the figures off
  // `activePreset`, which is what lets the tallies stay unaware of the difference.
  const activePreset =
    loadedPreset.id === CUSTOM_FLAGS_ID
      ? { ...loadedPreset, ...customLimits }
      : loadedPreset

  // Whether the loaded ruleset is one of the Upstarts weeks, which is what marks
  // the collapsed submenu as holding the active entry.
  const isUpstartsActive = UPSTARTS_PRESETS.some(
    (preset) => preset.id === activeFlags,
  )

  // Which tally has its dropdown open, if either. One at a time: they sit in
  // different columns and both hang the same panel, so opening the second closes
  // the first rather than leaving two open.
  const [openLimitPicker, setOpenLimitPicker] = useState<ContainerKind | null>(
    null,
  )

  // Clear and the flags entries share one hamburger button, so a single piece of
  // state covers the whole menu rather than just the flags list.
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Whether the Upstarts weeks are flown out beside the menu. Separate from
  // `isMenuOpen` so the submenu can be opened and shut without disturbing the
  // menu holding it.
  const [isUpstartsOpen, setIsUpstartsOpen] = useState(false)
  // Which icon sits on each overworld cell, keyed by grid id and coordinates.
  // Only filled cells are stored, so an absent key is an empty square.
  const [overworldCells, setOverworldCells] = useState<Record<string, string>>({})
  // The palette icon held ready to place. It stays armed after each drop, so a
  // repeated icon can be placed across the map without reselecting it, and
  // clicking it again puts it down.
  const [armedIcon, setArmedIcon] = useState<string | null>(null)
  const palaceGridRef = useRef<HTMLDivElement | null>(null)

  /**
   * Sets one side of a Custom container tally, keeping the pair coherent: a start
   * above the total would read as `9/8`, which is not a state the game can be in.
   *
   * The side just picked is the one that stands, and the other gives way to it.
   * Clamping the picked value instead would quietly ignore the choice just made -
   * picking a start of 6 against a total of 4 would leave 4/4 - and the dropdown
   * would look like it had dropped the click.
   */
  function setContainerLimit(
    kind: ContainerKind,
    side: ContainerSide,
    value: number,
  ) {
    setCustomLimits((current) => {
      const startKey = kind === 'heart' ? 'heartStart' : 'magicStart'
      const maxKey = kind === 'heart' ? 'heartMax' : 'magicMax'
      const next = { ...current }

      if (side === 'start') {
        next[startKey] = value
        next[maxKey] = Math.max(next[maxKey], value)
      } else {
        next[maxKey] = value
        next[startKey] = Math.min(next[startKey], value)
      }

      return next
    })
  }

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

    // Keeping focus out covers every route we control, but not one we don't: if
    // focus ever lands inside anyway - a browser quirk, an extension, devtools
    // inspecting a node - Enter and Space would still fire the focused control,
    // because a button synthesises a click from them. Enter acts on keydown and
    // Space on keyup, so both phases are cancelled.
    //
    // Only those two keys, and only unmodified. Blocking everything would take
    // the browser's own shortcuts hostage - Ctrl+F, Ctrl+P, Ctrl+R - which is
    // not what "mouse-only tracker" asks for. No other key activates a button,
    // so nothing else can reach tracker state.
    //
    // Listening on the root rather than the window is deliberate: a keystroke
    // only arrives here when focus is already inside the tracker, so this can
    // never swallow a keystroke meant for the game beside it.
    function blockActivationKeys(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      // ' ' is the modern value; 'Spacebar' is the legacy one older engines send.
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
    }

    // Capture phase, so this runs before React's delegated handlers rather than
    // after they have already toggled something.
    root.addEventListener('keydown', blockActivationKeys, true)
    root.addEventListener('keyup', blockActivationKeys, true)

    return () => {
      observer.disconnect()
      root.removeEventListener('keydown', blockActivationKeys, true)
      root.removeEventListener('keyup', blockActivationKeys, true)
    }
  }, [])

  // Escape closes the controls. The board itself takes no keystrokes, which is
  // why its menus close on an outside click instead, but this one is a modal
  // panel of copy - Escape is the expected way out of it, and the listener is
  // only mounted while it is open, so the board is never listening.
  useEffect(() => {
    if (!isShowingControls) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsShowingControls(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isShowingControls])

  // Scrolling a boss steps what blocks its palace, and scrolling one of its item
  // slots steps what blocks that slot. One delegated listener on the grid rather
  // than an `onWheel` per target, because React registers wheel handlers as
  // passive: `preventDefault` would be ignored there and the page would scroll
  // away under the cursor while the block cycled.
  useEffect(() => {
    const grid = palaceGridRef.current

    if (!grid) {
      return
    }

    function handleWheel(event: WheelEvent) {
      const target = event.target as HTMLElement | null
      const blockable = target?.closest<HTMLElement>('[data-block-key]')
      const blockKey = blockable?.dataset.blockKey

      if (!blockKey || event.deltaY === 0) {
        return
      }

      event.preventDefault()
      cycleBlock(blockKey, event.deltaY > 0 ? 1 : -1)
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
    options?: { canBlock?: boolean; onCycleMark?: () => void },
  ) {
    const item = allPickables.find((entry) => entry.id === slotItems[slotKey])
    const isCollected = Boolean(item && collected[slotKey])
    const cycleHint = options?.onCycleMark
      ? ' Shift right click to cycle the location.'
      : ''
    // Only the palace slots can be blocked: they are the ones inside the grid
    // carrying the wheel listener, so a town slot would show a plate it had no
    // way to cycle.
    const block = options?.canBlock
      ? BLOCKS.find((entry) => entry.id === blocks[slotKey])
      : undefined
    const blockLabel = block ? `, blocked by ${block.name}` : ''
    const blockHint = options?.canBlock
      ? ' Scroll to cycle what blocks it.'
      : ''

    return (
      <div className="item-slot-wrap" key={slotKey}>
        <button
          aria-haspopup="dialog"
          aria-label={
            item
              ? `${label}: ${item.name}${isCollected ? ', collected' : ''}${blockLabel}. Left click to mark collected, right click to change, middle click to clear.${cycleHint}${blockHint}`
              : `${label}: empty${blockLabel}. Right click to choose an item.${cycleHint}${blockHint}`
          }
          aria-pressed={item ? isCollected : undefined}
          className={`${isCollected ? 'item-slot item-slot-collected' : 'item-slot'}${block ? ' item-slot-blocked' : ''}`}
          // Read by the palace grid's wheel listener, the same way the bosses are.
          data-block-key={options?.canBlock ? slotKey : undefined}
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
          {/* Mirrors the boss plates, on the opposite edge: the plates take the
              slot's right side and the item shifts left to clear them, where a
              blocked boss puts its plates left and shifts its letter right.
              Sizing is all in the stylesheet, which knows each slot size. */}
          {block ? (
            <span aria-hidden="true" className="slot-block">
              {block.src.map((src) => (
                <Image alt="" height={16} key={src} src={src} width={16} />
              ))}
            </span>
          ) : null}
          {isCollected ? (
            <Check
              aria-hidden="true"
              className="item-slot-check"
              // Matches the palace sprite size; CSS scales it down for towns and
              // for palaces holding more than one item.
              size={38}
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
   * How many hearts and magic containers Link is carrying: what the ruleset starts
   * him with, plus every matching container checked off out on the map. Counting
   * slots rather than tracking numbers of their own means unchecking a container
   * takes its tally back down, one cannot be counted twice, and Clear and a ruleset
   * switch reset both for free.
   *
   * A run only ever holds enough containers to reach the caps, but the clamp keeps
   * the readings honest under a ruleset that shuffles in more than that.
   */
  const { heartCount, magicCount } = useMemo(() => {
    let hearts = 0
    let magic = 0

    for (const [slotKey, isChecked] of Object.entries(collected)) {
      if (!isChecked) continue

      const itemId = slotItems[slotKey]

      if (itemId === HEART_ITEM_ID) hearts += 1
      if (itemId === MAGIC_ITEM_ID) magic += 1
    }

    return {
      heartCount: Math.min(
        activePreset.heartStart + hearts,
        activePreset.heartMax,
      ),
      magicCount: Math.min(
        activePreset.magicStart + magic,
        activePreset.magicMax,
      ),
    }
    // The four figures rather than the preset holding them: under Custom that is
    // rebuilt on every render to fold in the user's overrides, so depending on the
    // object would defeat the memo entirely.
  }, [
    collected,
    slotItems,
    activePreset.heartStart,
    activePreset.heartMax,
    activePreset.magicStart,
    activePreset.magicMax,
  ])

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
        aria-label={`${entry.name}${isCollected ? ', collected' : ', not collected'}${palaceNumber ? `, in palace ${palaceNumber}` : mark ? `, marked ${mark}` : ''}. Right click to cycle the location.`}
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
  function cycleBlock(bossKey: string, direction: number) {
    setBlocks((current) => {
      const index = BLOCKS.findIndex(
        (block) => block.id === (current[bossKey] ?? ''),
      )
      const length = BLOCKS.length
      const block = BLOCKS[(index + direction + length) % length]
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
   *
   * `step` is +1 for left click and -1 for right click, so overshooting a
   * destination costs one click to undo rather than a lap through the whole
   * cycle. The unknown state is treated as position 0 of a ring one longer than
   * the sprite list, which makes both directions the same modulo hop and keeps
   * the wrap symmetric: forward off the last mark lands on unknown, and
   * backward off unknown lands on the last mark.
   */
  function cycleConnectorEnd(endKey: string, step: 1 | -1) {
    if (CONNECTOR_MARKS.length === 0) {
      return
    }

    setConnectorEnds((current) => {
      const next = { ...current }
      const marks = CONNECTOR_MARKS.map((mark) => mark.src)
      const ring = marks.length + 1
      // indexOf returns -1 for an unmarked end, so +1 puts unknown at 0 and the
      // sprites at 1..n. Adding `ring` keeps the operand positive, since JS `%`
      // would otherwise return a negative for a backward step off unknown.
      const position = marks.indexOf(current[endKey] ?? '') + 1
      const target = (position + step + ring) % ring
      const mark = target === 0 ? undefined : marks[target - 1]

      if (mark) {
        next[endKey] = mark
      } else {
        delete next[endKey]
      }

      return next
    })
  }

  /** Renders one end of a connector row as a clickable marker. */
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
        aria-label={`${noteAlt} ${side} side: ${endMark?.alt ?? 'unknown'}. Click to change, right click to go back.`}
        className="palace-note-end"
        // onClick is the left-click path only. The tracker is mouse-only, so the
        // Enter and Space that would otherwise reach this are cancelled at the
        // root; see the focusability effect.
        onClick={() => {
          cycleConnectorEnd(endKey, 1)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          cycleConnectorEnd(endKey, -1)
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
    setBlocks({})
    setCountValues({})
    setConnectorEnds({})
    setOpenSlot(null)
    setIsConfirmingClear(false)
    setOpenLimitPicker(null)
    // `customLimits` deliberately survives: Clear empties the board but keeps the
    // loaded ruleset, and these figures describe that ruleset rather than the run.
    // Resetting them would make a blank board mean re-entering the flags too.
  }

  /**
   * Applies a ruleset's starting state over a cleared board. Presets are chosen
   * at the top of a run, so starting clean avoids leaving stale placements from
   * whatever was on screen before.
   */
  /**
   * Shuts the options menu and the Upstarts flyout together. The submenu lives
   * inside the menu, so leaving it open would have it spring back out the next
   * time the hamburger was pressed.
   */
  function closeMenu() {
    setIsMenuOpen(false)
    setIsUpstartsOpen(false)
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    // The maps describe the seed being played, so a new ruleset empties them
    // along with everything else.
    setOverworldCells({})
    setArmedIcon(null)
    setSlotItems({ ...preset.placements })
    setCollected(collectedFromPreset(preset))
    setSlotCounts({})
    // Seeded from the ruleset rather than emptied, so a week that already knows
    // its palace requirements opens with them showing.
    setIconMarks({ ...preset.marks })
    setBlocks({})
    setCountValues({ ...preset.counts })
    setConnectorEnds({})
    setActiveFlags(preset.id)
    // Back to the Custom entry's opening figures. Loading a ruleset is the start
    // of a new run, so figures typed for the last one would be stale - and for the
    // fixed presets they are unreachable anyway, which would leave them waiting to
    // reappear the next time Custom was picked.
    setCustomLimits(CUSTOM_LIMIT_DEFAULTS)
    // The tallies are about to be rebuilt underneath it, and on a fixed preset the
    // panel cannot be reopened at all.
    setOpenLimitPicker(null)
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

  /**
   * One of the two container tallies. Both read the same way - sprite, then
   * `found/total` - and differ only in which sprite and which pair of figures, so
   * they render through here rather than as two near-identical blocks.
   *
   * Under a fixed ruleset this is a readout: the count follows the containers
   * ticked off out on the map and the total is the ruleset's, so there is nothing
   * to click and it stays a `role="img"` with its label. Under Custom the figures
   * are the user's to set, so it becomes a button that opens the dropdown on right
   * click. `aria-live` announces the count either way, since it moves when a
   * container is checked off elsewhere on the board.
   */
  function renderContainerTally(kind: ContainerKind) {
    const isHeart = kind === 'heart'
    const count = isHeart ? heartCount : magicCount
    const start = isHeart ? activePreset.heartStart : activePreset.magicStart
    const max = isHeart ? activePreset.heartMax : activePreset.magicMax
    const name = isHeart ? 'Heart containers' : 'Magic containers'
    const src = isHeart
      ? '/images/items/heartcontainer.png'
      : '/images/items/magiccontainer.png'
    // Only Custom exposes these figures; every other ruleset states its own.
    const isEditable = activeFlags === CUSTOM_FLAGS_ID
    const isOpen = openLimitPicker === kind

    const face = (
      <>
        <Image
          alt=""
          height={32}
          // Eager because this sits above the fold and Next flags it as the
          // largest contentful paint.
          loading="eager"
          src={src}
          width={32}
        />
        {/* Inline SVG glyphs rather than text, so the tally sets in the same
            letterforms as the requirement marks instead of introducing a second
            typeface. */}
        <GlyphText className="container-tally-count" scale={2}>
          {`${count}/${max}`}
        </GlyphText>
      </>
    )

    if (!isEditable) {
      return (
        <div
          aria-label={`${name}: ${count} of ${max}`}
          aria-live="polite"
          className="container-tally"
          role="img"
        >
          {face}
        </div>
      )
    }

    return (
      // Positioning context for the dropdown, mirroring the hamburger's wrap.
      <div className="container-tally-wrap">
        <button
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={`${name}: ${count} of ${max}, starting from ${start}. Click to set the starting count and the total.`}
          aria-live="polite"
          className="container-tally container-tally-editable"
          // Either button opens the figures. Right click alone was the mistake:
          // the tally has no left-click meaning to protect - unlike an item slot,
          // where left marks it collected and right has to be kept free for the
          // picker - so binding only the less obvious of the two left the plain
          // click dead. It also left the keyboard with nothing, since Enter and
          // Space arrive as clicks and never as a context menu.
          onClick={() => setOpenLimitPicker(isOpen ? null : kind)}
          onContextMenu={(event) => {
            // Still bound, so the habit the rest of the board teaches - right
            // click opens a chooser - keeps working here, and so the panel opens
            // rather than the browser's own menu.
            event.preventDefault()
            setOpenLimitPicker(isOpen ? null : kind)
          }}
          type="button"
        >
          {face}
        </button>

        {isOpen ? (
          <div
            aria-label={`${name} figures`}
            className="limit-picker"
            role="menu"
          >
            {/* Two columns in the order the tally reads them, so the left list
                sets the number left of the slash and the right list the one right
                of it. Naming them "Start" and "Total" rather than the figures'
                field names, because what the left number means is the count Link
                begins the run with - the tally climbs from there as containers are
                found. */}
            {(
              [
                {
                  side: 'start' as ContainerSide,
                  title: 'Start',
                  // Spelled out for screen readers, where "Start" alone does not
                  // say what it starts. The visible heading stays short to fit the
                  // column.
                  label: `${name} starting count`,
                  value: start,
                },
                {
                  side: 'max' as ContainerSide,
                  title: 'Total',
                  label: `${name} total`,
                  value: max,
                },
              ]
            ).map((column) => (
              // Grouped rather than left as plain divs, because a `menu` only
              // takes menu items and groups as children - the columns would
              // otherwise break the panel's own role.
              <div
                aria-label={column.label}
                className="limit-picker-column"
                key={column.side}
                role="group"
              >
                <p aria-hidden="true" className="limit-picker-heading">
                  {column.title}
                </p>

                <div className="limit-picker-choices">
                  {CONTAINER_LIMIT_CHOICES
                    // A total of 0 is dropped: a tally that can never fill is not
                    // a ruleset anyone plays, and it would also force the start to
                    // 0 and strand both lists at a single value.
                    .filter((choice) => column.side === 'start' || choice > 0)
                    .map((choice) => (
                      <button
                        aria-checked={choice === column.value}
                        className="limit-picker-option"
                        key={choice}
                        onClick={() =>
                          setContainerLimit(kind, column.side, choice)
                        }
                        role="menuitemradio"
                        type="button"
                      >
                        {choice}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
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
                      aria-label={`${town.name} town${mark ? `, marked ${mark}` : ''}. Right click to cycle the location.`}
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
                a panel's own z-index cannot lift it past the sections that follow
                in the DOM - the grid is what has to move. Raised for either panel
                that hangs out of it, the options menu and a container tally's
                figures, and only while one is open, so the board's paint order is
                otherwise untouched. */}
            <div
              aria-label="Palace locations"
              className={`palace-grid${isMenuOpen || openLimitPicker ? ' palace-grid-raised' : ''}`}
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
                    const block = BLOCKS.find(
                      (entry) => entry.id === blocks[bossKey],
                    )
                    // A boss that holds no items has no slot count worth reading
                    // out and nothing for middle click to do, so its label drops
                    // both rather than offering an action that does nothing.
                    const holdsItems = palace.maxSlots > 0
                    const slotLabel = holdsItems
                      ? `, ${slots} of ${palace.maxSlots} item slots`
                      : ', holds no items'
                    const slotHint = holdsItems
                      ? ' middle click to cycle slots,'
                      : ''

                    return (
                      <div className="palace-row" key={palace.name}>
                        <button
                          aria-label={`${palace.name} palace boss${isBeaten ? ', defeated' : ''}${mark ? `, marked ${mark}` : ''}${block ? `, blocked by ${block.name}` : ''}${slotLabel}. Left click to mark defeated, right click to cycle the location,${slotHint} scroll to cycle what blocks it.`}
                          aria-pressed={isBeaten}
                          className={
                            isBeaten
                              ? 'town-icon icon-toggle boss-toggle-beaten'
                              : 'town-icon icon-toggle'
                          }
                          // Read by the grid's wheel listener to find what was
                          // scrolled. The listener sits on the grid rather than here
                          // because React registers `wheel` passively, which would
                          // leave the page scrolling as the block cycles.
                          data-block-key={bossKey}
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
                                  height={16}
                                  key={src}
                                  src={src}
                                  width={16}
                                />
                              ))}
                            </span>
                          ) : null}
                          {/* A blocked boss carries its plates down the icon's left
                              edge, so the letter shifts right to keep off them. Set
                              here from the same `block` the plates render from
                              rather than matched in CSS with `:has()`, which the
                              stylesheet's browser targets compile away.

                              MI and DV need more than the shift. At scale 3 a pair
                              runs 48px of ink against the 34px free beside the
                              plates, so shifting alone would hang it off the icon;
                              dropping to scale 2 brings the pair to 32px, which
                              fits that gap with a pixel either side. Single letters
                              are 24px and stay at scale 3.

                              The two cases also align differently, so they take
                              different classes: a pair is set from the plate edge
                              rightward, a single letter from the icon's right edge
                              leftward. See the stylesheet for why. */}
                          {mark ? (
                            <GlyphText
                              className={
                                block
                                  ? mark.length > 1
                                    ? 'icon-mark-glyph icon-mark-glyph-pair'
                                    : 'icon-mark-glyph icon-mark-glyph-shifted'
                                  : 'icon-mark-glyph'
                              }
                              scale={block && mark.length > 1 ? 2 : 3}
                            >
                              {mark}
                            </GlyphText>
                          ) : null}
                          {isBeaten ? (
                            <Check
                              aria-hidden="true"
                              className="item-slot-check"
                              // Same 28px stamp the 56px location sprites use. Unlike
                              // the slot checks, no CSS rule sizes this one, so this
                              // attribute is what actually draws it.
                              size={28}
                              strokeWidth={4}
                            />
                          ) : null}
                        </button>
                        {Array.from({ length: slots }, (_, index) =>
                          renderItemSlot(
                            `${palace.name}-${index}`,
                            `${palace.name} item ${index + 1}`,
                            { canBlock: true }
                          )
                        )}
                        {'heartTally' in palace ? renderContainerTally('heart') : null}
                      </div>
                    )
                  })}

                  {/* The right column's free fourth row: that column holds three
                      bosses to the left column's four, so the band under
                      Thunderbird is open. It carries the magic tally and the
                      hamburger side by side - the tally taking the gutter the heart
                      tally uses in the row above, and the hamburger the boss slot
                      below Thunderbird. Column `align-items: flex-end` pins the
                      pair to the edge the boss sprites use, which is what lines the
                      two tallies up on the same left edge. */}
                  {column.id === 'right' ? (
                    <div className="tracker-utility-row">
                      {/* Reads like the heart tally above it and is built by the
                          same renderer, so both behave alike: readouts under a
                          fixed ruleset, editable under Custom. */}
                      {renderContainerTally('magic')}

                      <div className="tracker-menu-wrap">
                      <button
                        aria-expanded={isMenuOpen}
                        aria-haspopup="menu"
                        aria-label="Tracker options"
                        className="tracker-menu-toggle"
                        // Closing from the hamburger goes through the same helper
                        // as the backdrop, so the flyout cannot be left open
                        // behind a shut menu.
                        onClick={() =>
                          isMenuOpen ? closeMenu() : setIsMenuOpen(true)
                        }
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
                          <p className="tracker-menu-heading">Flags</p>

                          {NAMED_PRESETS.map((preset) => (
                            <button
                              aria-checked={preset.id === activeFlags}
                              className="tracker-menu-option"
                              key={preset.id}
                              onClick={() => {
                                closeMenu()
                                applyPreset(preset)
                              }}
                              role="menuitemradio"
                              type="button"
                            >
                              {preset.name}
                            </button>
                          ))}

                          {/* The Upstarts weeks, behind one entry rather than six
                              loose ones: they are a series, and spelling them all
                              out would make the weeks the bulk of a menu that also
                              has to hold Controls and Clear. */}
                          <div className="tracker-submenu-wrap">
                            <button
                              aria-expanded={isUpstartsOpen}
                              aria-haspopup="menu"
                              // Gold while one of its weeks is loaded, so a
                              // collapsed submenu still shows where the active
                              // ruleset came from - the job the entries above do
                              // for themselves.
                              aria-checked={isUpstartsActive}
                              className="tracker-menu-option tracker-submenu-toggle"
                              onClick={() => setIsUpstartsOpen((open) => !open)}
                              role="menuitemradio"
                              type="button"
                            >
                              Upstarts
                              {/* Points the way the panel opens. Drawn with
                                  borders so it stays crisp like the hamburger's
                                  bars rather than softening at zoom. */}
                              <span
                                aria-hidden="true"
                                className="tracker-submenu-arrow"
                              />
                            </button>

                            {isUpstartsOpen ? (
                              <div
                                aria-label="Upstarts weeks"
                                className="tracker-submenu"
                                role="menu"
                              >
                                {UPSTARTS_PRESETS.map((preset) => (
                                  <button
                                    aria-checked={preset.id === activeFlags}
                                    className="tracker-menu-option"
                                    key={preset.id}
                                    onClick={() => {
                                      closeMenu()
                                      applyPreset(preset)
                                    }}
                                    role="menuitemradio"
                                    type="button"
                                  >
                                    {preset.name}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          {/* Custom last, below the named rulesets and the
                              Upstarts submenu. Rendered from its own constant
                              rather than in list order so it stays pinned to the
                              foot of the flags run however many entries appear
                              above it. */}
                          {CUSTOM_PRESET ? (
                            <button
                              aria-checked={CUSTOM_PRESET.id === activeFlags}
                              className="tracker-menu-option"
                              onClick={() => {
                                closeMenu()
                                applyPreset(CUSTOM_PRESET)
                              }}
                              role="menuitemradio"
                              type="button"
                            >
                              {CUSTOM_PRESET.name}
                            </button>
                          ) : null}

                          {/* Opens the controls reference. Sits below the
                              flags entries and above Clear, so the menu runs from
                              harmless to destructive top to bottom. */}
                          <button
                            className="tracker-menu-option tracker-menu-option-bordered"
                            onClick={() => {
                              closeMenu()
                              setIsShowingControls(true)
                            }}
                            role="menuitem"
                            type="button"
                          >
                            Controls
                          </button>

                          {/* Clearing wipes the board, so it is set apart from
                              the flags entries above it and tinted with the frame's
                              red. Still routed through the confirm dialog. */}
                          <button
                            className="tracker-menu-option tracker-menu-option-danger"
                            onClick={() => {
                              closeMenu()
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

                  // Counter slots cycle through their numbers on left click, drawn
                  // over their art the way a palace's requirement letter is.
                  if ('kind' in location) {
                    const value = countValues[slotKey] ?? ''

                    // Granny is finished the moment New Kasuto's magic container is
                    // checked off, since that is the same visit. Read straight off
                    // that slot rather than recorded here, so the two always agree
                    // and unchecking the container brings Granny back - `clearItem`
                    // drops the collected flag with the item, so wiping the slot
                    // reverts her as well.
                    const isComplete =
                      location.name === GRANNY_SLOT_NAME &&
                      Boolean(
                        collected[`location-${NEW_KASUTO_MAGIC_SLOT_NAME}`],
                      )

                    return (
                      <button
                        aria-label={
                          isComplete
                            ? `${location.name}: complete, collected with the New Kasuto magic container.`
                            : value
                              ? `${location.name}: ${value}. Left click for the next number.`
                              : `${location.name}: unset. Left click to choose 5, 6 or 7.`
                        }
                        className={
                          isComplete
                            ? 'location-icon location-count location-icon-collected'
                            : 'location-icon location-count'
                        }
                        // Nothing left to record once she is done, and the number is
                        // hidden below, so cycling an unseen value would be a click
                        // with no visible effect.
                        disabled={isComplete}
                        key={location.name}
                        onClick={() => cycleCount(slotKey, 1)}
                        // Right click steps back through the numbers.
                        onContextMenu={(event) => {
                          event.preventDefault()
                          cycleCount(slotKey, -1)
                        }}
                        type="button"
                      >
                        <Image
                          alt={location.name}
                          height={56}
                          src={location.src}
                          width={56}
                        />
                        {/* The count comes off the sprite once she is complete,
                            leaving just the greyed art. The chosen number stays in
                            state rather than being wiped, so unchecking the
                            container brings it back rather than losing it. */}
                        {value && !isComplete ? (
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
                          size={28}
                          strokeWidth={4}
                        />
                      ) : null}
                    </button>
                  )
                })}

                {/* Row three fills four of its nine icon positions, so the flags
                    in play are named in the space left over instead of it staying
                    black. The name comes off `activePreset`, so switching flags
                    rewrites this rather than needing its own copy kept in step.

                    Rendered inside the row, not as its own absolutely positioned
                    block, so the row's own flex layout lines it up with the icons
                    and it stays lined up if a fifth location is ever added. The
                    label is what keeps it from being read as another location.

                    A grouped ruleset needs both halves named - "Week 3" alone only
                    means something beside the other weeks in the submenu, and
                    "Upstarts" alone loses which week is in play - so the group
                    joins the label and the week stays in the value. Both on the
                    value line wrapped to two, which the 48px row cannot seat, and
                    this split is the better reading anyway: the label already
                    carries the fixed identifier and the value the part that
                    changes. Keyed off `group`, so further weeks or a second group
                    need no change here. */}
                {rowIndex === 2 ? (
                  <div className="flags-panel">
                    <p className="flags-panel-label">
                      {activePreset.group === 'upstarts'
                        ? 'Upstarts Flags'
                        : 'Flags'}
                    </p>
                    <p className="flags-panel-value">{activePreset.name}</p>
                  </div>
                ) : null}
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
                onClick={closeMenu}
                type="button"
              />
            ) : null}

            {/* The same catcher for a tally's figures, and for the same reason.
                Kept separate from the menu's rather than driven by an `||`, so
                clicking out of one panel cannot close the other along with it. */}
            {openLimitPicker ? (
              <button
                aria-label="Close container figures"
                className="tracker-menu-backdrop"
                onClick={() => setOpenLimitPicker(null)}
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

            {isShowingControls ? (
              <div className="tracker-dialog-overlay">
                <button
                  aria-label="Close the controls"
                  className="item-picker-backdrop"
                  onClick={() => setIsShowingControls(false)}
                  type="button"
                />
                <div
                  aria-labelledby="controls-title"
                  aria-modal="true"
                  className="tracker-dialog controls-dialog"
                  role="dialog"
                >
                  <div className="item-picker-header">
                    <p className="item-picker-title" id="controls-title">
                      Controls
                    </p>
                    <button
                      aria-label="Close the controls"
                      className="item-picker-close"
                      onClick={() => setIsShowingControls(false)}
                      type="button"
                    >
                      <span aria-hidden="true">X</span>
                    </button>
                  </div>

                  <div className="controls-groups">
                    {CONTROL_GROUPS.map((group) => (
                      <section className="controls-group" key={group.title}>
                        <h3 className="controls-group-title">{group.title}</h3>

                        {/* A description list, since each row really is a term
                            and its meaning - the input and what it does. Skipped
                            entirely for a credit box, so no empty list is left
                            behind to space the box out. */}
                        {group.rows ? (
                          <dl className="controls-list">
                            {group.rows.map((row) => (
                              <div className="controls-row" key={row.input}>
                                <dt className="controls-input">{row.input}</dt>
                                <dd className="controls-effect">{row.effect}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}

                        {group.credit ? (
                          <p className="controls-credit">{group.credit}</p>
                        ) : null}

                        {group.note ? (
                          <p className="controls-note">{group.note}</p>
                        ) : null}
                      </section>
                    ))}
                  </div>

                  {/* Closes the dialog on the one behaviour that surprises people:
                      the counts move by themselves, so the click is for the figures
                      rather than the count. */}
                  <p className="controls-footnote">
                    The heart/magic containers will increment on their own when
                    collected. Setting the flags to Custom allows selection.
                  </p>
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
