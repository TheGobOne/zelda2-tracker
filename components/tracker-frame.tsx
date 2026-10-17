'use client'

import { Check, NotebookPen, Settings, X } from 'lucide-react'
import Image from 'next/image'
import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { GlyphText } from '@/components/glyph-text'
import { IconTooltip } from '@/components/icon-tooltip'
import { FramedDialog } from '@/components/framed-dialog'
import { UpdatesDialog } from '@/components/updates-dialog'

const BASE_WIDTH = 600
// The board's full height, with the overworld maps on it. Applied to the canvas
// as well as scaled against, so `.game-canvas` sets no height of its own.
const BASE_HEIGHT = 1138
/**
 * Board height with the overworld maps hidden.
 *
 * The maps are the last block on the board, and the divider above them goes when
 * they do, so the collection becomes the final element. It ends at 846px. The
 * board's first element sits 18px below the top rail, so the bottom edge is placed
 * to leave the same 18px below the collection: 846 + 18 margin + 14 bottom rail =
 * 878. Matching the top margin centres the stack vertically instead of leaving a
 * wider band of black at the foot of the board.
 */
const MAPLESS_HEIGHT = 878
/**
 * Landscape board size. The five stacked sections split into two side-by-side
 * 600px lanes, each packed from the top so neither leaves a dead band:
 *   - left lane:  bosses (242px) + the maps, bottoming out ~518px
 *   - right lane: towns + the three location rows + item checks, ~549px
 * The board is twice as wide and only as tall as the taller lane (the right one)
 * plus the same ~28px bottom band the portrait board carries below its last
 * element.
 *
 * Maps live in the left lane below the bosses. Hiding them just empties that
 * slot - every other section stays put, so the right lane still governs the
 * board height and the value is the same whether or not the maps are showing.
 */
const LANDSCAPE_WIDTH = 1200
const LANDSCAPE_HEIGHT = 577
const MIN_SCALE = 0.35
const MAX_SCALE = 1.75

// `name` is also the saved-state key, so display-only wording goes in `tip`.
const towns: { name: string; src: string; tip?: string }[] = [
  { name: 'Rauru', src: '/images/towns/rauru.png' },
  { name: 'Ruto', src: '/images/towns/ruto.png', tip: 'Ruto (Trophy Required)' },
  { name: 'Saria', src: '/images/towns/saria.png', tip: 'Saria (Mirror Required)' },
  { name: 'Mido', src: '/images/towns/mido.png', tip: 'Mido (Medicine Required)' },
  { name: 'Nabooru', src: '/images/towns/nabooru.png', tip: 'Nabooru (Water Required)' },
  { name: 'Darunia', src: '/images/towns/darunia.png', tip: 'Darunia (Child Required)' },
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
  { name: "Medicine Cave", src: '/images/locations/wateroflifecave.png' },
  {
    name: 'Heart Container Cave',
    src: '/images/locations/heartcontainercave.png',
  },
  {
    name: 'Magic Container Cave',
    src: '/images/locations/magiccontainercave.png',
  },
  { name: "Pillar Pbag Cave", src: '/images/locations/westpbagcave.png' },
  { name: 'Saria Table', src: '/images/locations/sariatable.png' },
  { name: 'Bagu', src: '/images/locations/bagu.png' },
  {
    name: "Grass Tile",
    src: '/images/locations/heartcontainergrass.png',
  },
  { name: "Downstab", src: '/images/locations/downstabman.png' },
]

// Values a counter slot steps through on left click. The empty entry starts the
// cycle, so clicking past the last number clears the slot again.
const BOSS_NAMES: Record<string, string> = {
  'Palace 1': 'Horsehead',
  'Palace 2': 'Helmethead',
  'Palace 3': 'Rebonack',
  'Palace 4': 'Carock',
  'Palace 5': 'Gooma',
  'Palace 6': 'Barba',
  'Palace 7': 'Thunderbird',
}

// Identification screenshots (pillar, window, statue and boss) shown in place of
// the boss name when palace image tooltips are on. The Great Palace has none.
const PALACE_TIP_IMAGES: Record<string, string> = {
  'Palace 1': '/images/palace-tips/palace-1.png',
  'Palace 2': '/images/palace-tips/palace-2.png',
  'Palace 3': '/images/palace-tips/palace-3.png',
  'Palace 4': '/images/palace-tips/palace-4.png',
  'Palace 5': '/images/palace-tips/palace-5.png',
  'Palace 6': '/images/palace-tips/palace-6.png',
}

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
const GRANNY_SLOT_NAME = "Granny's Basement Magic Container Requirement (Left Click)"
const NEW_KASUTO_MAGIC_SLOT_NAME = "Granny's Basement"

// A location row holds sprite slots plus the occasional numeric counter slot,
// which takes up one icon of space and shows a chosen number over its art. The
// counter carries a `src` like any other slot rather than hardcoding one in the
// markup, so the art stays beside the name it belongs to.
type LocationEntry =
  | { name: string; src: string }
  | { kind: 'count'; name: string; src: string }

// Second location row, filled in as the remaining sprites are added.
const locationRowTwo: LocationEntry[] = [
  { name: "Sunken Pbag Cave", src: '/images/locations/eastpbagcave.png' },
  { name: "Risen Pbag Cave", src: '/images/locations/eastpbagcave2.png' },
  {
    name: "Desert Tile",
    src: '/images/locations/heartcontainerdesert.png',
  },
  {
    name: "Water Tile",
    src: '/images/locations/heartcontainersea.png',
  },
  { name: 'Fountain', src: '/images/locations/naboorufountain.png' },
  {
    kind: 'count',
    name: "Granny's Basement Magic Container Requirement (Left Click)",
    src: '/images/locations/granny.png',
  },
  {
    name: "Granny's Basement",
    src: '/images/locations/magiccontainernewkasuto.png',
  },
  {
    name: "Spell Tower",
    src: '/images/locations/magickeynewkasuto.png',
  },
  { name: "Upstab", src: '/images/locations/upstabman.png' },
]

// Third location row. Only four entries, so it is centred rather than spread
// across the full icon width like the two full rows above it.
const locationRowThree: LocationEntry[] = [
  {
    name: "Spec Rock",
    src: '/images/locations/magiccontainerboulder.png',
  },
  { name: 'Hammer Cave', src: '/images/locations/hammercave.png' },
  {
    name: "Maze (Short)",
    src: '/images/locations/magiccontainermaze.png',
  },
  { name: "Maze (Long)", src: '/images/locations/kidmaze.png' },
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
  { id: 'kid', name: 'Child', src: '/images/items/kid.png' },
  { id: 'mirror', name: 'Mirror', src: '/images/items/mirror-v3.png' },
  { id: 'water', name: 'Water', src: '/images/items/water-v3.png' },
  {
    id: 'noteforriverman',
    name: "Bagu's Letter",
    src: '/images/items/noteforriverman-v3.png',
  },
  { id: 'wateroflife', name: 'Medicine', src: '/images/items/wateroflife.png' },
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

/**
 * The filler pickups - exactly the five sprites the junk check is built from. They
 * are the small-footprint items, drawn at half the resolution of the rest (the two
 * jars and the key are 18px against everyone else's 36px), so a slot that blows
 * every item up to one size distorts these worst. The town slots read this to size
 * them by a whole multiple of their own art instead. See `.town-grid
 * .item-slot-minor` in globals.css.
 */
const MINOR_ITEM_IDS = new Set(['pbag', '1up', 'redjar', 'bluejar', 'smallkey'])

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

// The town each spell quest item is handed over in. Hovering the item in the
// collection spotlights that town (see `[data-quest-town]` in globals.css).
const QUEST_ITEM_TOWNS: Record<string, string> = {
  trophy: 'Ruto',
  kid: 'Darunia',
  mirror: 'Saria',
  water: 'Nabooru',
  wateroflife: 'Mido',
}

/** Tooltip names for the palace-section connector rows, top to bottom. */
const CONNECTOR_TIPS = ['Connector Cave 1', 'Connector Cave 2', 'Raft', 'Bridge']

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
 * Builds the connector-ends map a ruleset opens with from one [left, right] pair
 * per connector, in PALACE_NOTES order. Each entry names a CONNECTOR_MARKS letter;
 * an empty string leaves that end unmarked.
 *
 * The ends are stored keyed by row index and side and valued by sprite src, which
 * reads as a wall of `connector-2-first: /images/notes/w.png` when written out. A
 * ruleset states its connectors as "cave, cave, raft, bridge" instead, and this
 * turns that back into the shape the board holds - so the letters cannot fall out
 * of step with the sprite paths, and adding a connector row shifts the keys for
 * free.
 */
function connectorEndsFrom(pairs: [left: string, right: string][]) {
  const srcByLetter = new Map(CONNECTOR_MARKS.map((mark) => [mark.alt, mark.src]))
  const ends: Record<string, string> = {}

  pairs.forEach(([left, right], index) => {
    if (left) ends[`connector-${index}-first`] = srcByLetter.get(left)!
    if (right) ends[`connector-${index}-second`] = srcByLetter.get(right)!
  })

  return ends
}

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
    "location-Downstab": 'downstab',
    "location-Upstab": 'upstab',
    'location-Saria Table': 'mirror',
    'location-Bagu': 'noteforriverman',
    'location-Fountain': 'water',
  },
  // Downstab is the one of those already in hand; the rest are known but still
  // out there, so they stay unticked.
  checkedSlots: ["location-Downstab"],
}

/**
 * The shared board with the palaces left unlabelled - same known checks, but only
 * Thunderbird's requirement fixed. Held as its own variant because more than one
 * week runs it, and restating the override per week would let those copies
 * disagree about which palaces are known.
 */
const UPSTARTS_UNLABELLED_PALACES_BOARD = {
  ...UPSTARTS_KNOWN_BOARD,
  marks: UPSTARTS_THUNDERBIRD_MARK,
}

/**
 * The shared board reduced to its known checks: nothing fixed about the palaces,
 * not even Thunderbird, and nothing picked up yet. Its own variant because more
 * than one week runs it.
 *
 * Spread from the full board and blanked rather than built from `placements`
 * alone, so a check added to the shared board still reaches the weeks using this.
 * Both fields are empty values rather than absent ones: the spread supplies a mark
 * and a tick, so omitting the keys would inherit them.
 */
const UPSTARTS_CHECKS_ONLY_BOARD = {
  ...UPSTARTS_KNOWN_BOARD,
  marks: {},
  checkedSlots: [],
}

/**
 * A placements map with the named locations dropped. Used when a week runs a
 * shared board but hides some of its known checks, so the surviving checks still
 * come from the shared board rather than being restated here.
 */
function withoutPlacements(
  placements: Record<string, string>,
  locations: string[],
): Record<string, string> {
  const copy = { ...placements }
  for (const location of locations) delete copy[location]
  return copy
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
    /**
     * Letters fixed on the palace-section connector ends, keyed and valued as the
     * board holds them. Built with `connectorEndsFrom` rather than written out.
     */
    connectorEnds?: Record<string, string>
  }
> = {
  1: {
    ...UPSTARTS_KNOWN_BOARD,
    // Link opens this week already knowing Life and Fairy.
    startsWith: ['life-spell', 'fairy-spell'],
    // The two caves both run W to DM; the raft W to E and the bridge E to MI.
    connectorEnds: connectorEndsFrom([
      ['W', 'DM'], // cave
      ['W', 'DM'], // cave
      ['W', 'E'], // raft
      ['E', 'MI'], // bridge
    ]),
  },
  2: {
    ...UPSTARTS_KNOWN_BOARD,
    // Week 2 runs the same board on Shield alone. Life and Fairy are dropped by
    // simply not being named - `startsWith` lists a week's extras rather than
    // subtracting from a running total.
    startsWith: ['shield-spell'],
  },
  3: {
    // Week 2's board, but with the palaces unlabelled.
    ...UPSTARTS_UNLABELLED_PALACES_BOARD,
    startsWith: ['shield-spell'],
  },
  4: {
    // Week 3's board opened empty-handed: no `startsWith` at all, which leaves
    // Link on the candle every week carries.
    ...UPSTARTS_UNLABELLED_PALACES_BOARD,
    // ...minus the mirror, letter, and water, which this week hides from their
    // locations. Derived from the shared board so any check later added there
    // still reaches Week 4.
    placements: withoutPlacements(UPSTARTS_UNLABELLED_PALACES_BOARD.placements, [
      'location-Saria Table', // mirror
      'location-Bagu', // letter (note for the river man)
      'location-Fountain', // water
    ]),
  },
  5: {
    // Week 4's board with nothing known about the palaces and nothing pre-ticked,
    // so the known checks are all this week fixes.
    ...UPSTARTS_CHECKS_ONLY_BOARD,
    // ...minus the mirror, letter, and water, which this week hides from their
    // locations. Derived from the shared board so any check later added there
    // still reaches Week 5.
    placements: withoutPlacements(UPSTARTS_CHECKS_ONLY_BOARD.placements, [
      'location-Saria Table', // mirror
      'location-Bagu', // letter (note for the river man)
      'location-Fountain', // water
    ]),
  },
  6: {
    // Same as Week 5, down to starting on the candle alone.
    ...UPSTARTS_CHECKS_ONLY_BOARD,
    // ...minus the mirror, letter, and water, which this week hides from their
    // locations. Derived from the shared board so any check later added there
    // still reaches Week 6.
    placements: withoutPlacements(UPSTARTS_CHECKS_ONLY_BOARD.placements, [
      'location-Saria Table', // mirror
      'location-Bagu', // letter (note for the river man)
      'location-Fountain', // water
    ]),
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
  /**
   * Letters fixed on the palace-section connector ends. Optional like the maps
   * above, since only a ruleset that knows its connections in advance sets any.
   */
  connectorEnds?: Record<string, string>
}[] = [
  {
    // Vanilla flags: Link only ever starts with the candle. The checks known in
    // advance are the stab teachers and the spell-quest spots, all left unticked.
    id: 'standard',
    name: 'Normal',
    collectedIds: ['candle'],
    // Vanilla containers: Link opens with four of the eight of each.
    heartStart: 4,
    heartMax: 8,
    magicStart: 4,
    magicMax: 8,
    placements: {
      "location-Downstab": 'downstab',
      "location-Upstab": 'upstab',
    },
    counts: {},
  },
  {
    // Normal with a head start: Life and Downstab are already in hand. Kept after
    // Normal in the array so `PRESETS[0]` stays the default board; the menu
    // lists it first via `NAMED_PRESETS`.
    id: 'beginner',
    name: 'Beginner',
    collectedIds: ['candle', 'life-spell', 'downstab'],
    heartStart: 4,
    heartMax: 8,
    magicStart: 4,
    magicMax: 8,
    placements: {
      "location-Downstab": 'downstab',
      "location-Upstab": 'upstab',
      'location-Saria Table': 'mirror',
      'location-Bagu': 'noteforriverman',
      'location-Fountain': 'water',
    },
    checkedSlots: ["location-Downstab"],
    counts: {},
  },
  {
    id: 'sgl',
    name: 'SGL 2026',
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
      "location-Pillar Pbag Cave": 'pbag',
      "location-Sunken Pbag Cave": 'pbag',
      "location-Risen Pbag Cave": 'pbag',
      // These two checks are always filler, tracked as the junk check.
      'location-Saria Table': 'junk',
      'location-Fountain': 'junk',
      // The stab teachers are swapped relative to their names.
      "location-Downstab": 'upstab',
      "location-Upstab": 'downstab',
      // Bagu always hands over his letter for the river man.
      'location-Bagu': 'noteforriverman',
    },
    counts: {
      // The counter beside the fountain starts on 6 under this ruleset.
      "location-Granny's Basement Magic Container Requirement (Left Click)": '6',
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
      connectorEnds: flags.connectorEnds ?? {},
    }
  }),
]

/** The one ruleset whose container figures are the user's to set. */
const CUSTOM_FLAGS_ID = 'custom'

const CUSTOM_NAME_MAX_LENGTH = 20
// Ten characters is what the readout holds at its full 20px; past that the
// letters shrink in step so the whole name still sits on one line.
const CUSTOM_NAME_FULL_SIZE_LENGTH = 10
const CUSTOM_NAME_FULL_FONT_SIZE = 20
function customNameFontSize(length: number) {
  if (length <= CUSTOM_NAME_FULL_SIZE_LENGTH) return CUSTOM_NAME_FULL_FONT_SIZE
  return Math.floor((CUSTOM_NAME_FULL_FONT_SIZE * CUSTOM_NAME_FULL_SIZE_LENGTH) / length)
}

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
).sort((a, b) => Number(b.id === 'beginner') - Number(a.id === 'beginner'))
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

/** The two overworlds, each tracked on its own 11x11 grid. */
const OVERWORLDS = [
  { id: 'west', name: 'West' },
  { id: 'east', name: 'East' },
] as const

/** Both grids are square, so one number drives rows and columns alike. */
const OVERWORLD_SIZE = 11

/** Where display preferences (hidden sections, tooltips, layout) are remembered in the browser. */
const SETTINGS_STORAGE_KEY = 'z2-tracker-settings'
const CONTROLS_SEEN_STORAGE_KEY = 'z2-tracker-controls-hint-seen'
const GEAR_SEEN_STORAGE_KEY = 'z2-tracker-gear-hint-seen'

/** Every run starts at the home palace, so it is pre-placed in the middle of the west map. */
const OVERWORLD_START_CELLS: Record<string, string> = {
  [`west-${Math.floor(OVERWORLD_SIZE / 2)}-${Math.floor(OVERWORLD_SIZE / 2)}`]: 'palace',
}

type MapCell = { row: number; column: number }

/**
 * Middle-click move mode for the overworld maps. `select` is the box being drawn
 * (no `from` until a drag starts); `move` carries the lifted icons, the cell they
 * were grabbed from, and the cell the cursor is over, so the drop lands at the same
 * offset the selection was picked up at.
 */
type MapMove =
  | {
      phase: 'select'
      worldId: string | null
      from: MapCell | null
      to: MapCell | null
    }
  | {
      phase: 'move'
      worldId: string
      picked: (MapCell & { icon: string })[]
      anchor: MapCell
      hover: MapCell
    }

function isOnOverworld({ row, column }: MapCell) {
  return (
    row >= 0 && row < OVERWORLD_SIZE && column >= 0 && column < OVERWORLD_SIZE
  )
}

/**
 * Icons that can be dropped onto a grid, as the four groups the right-click map
 * menu lays out one per row. Groups are written out rather than filled by
 * splitting one flat list, because which icons sit together is a deliberate
 * choice: the palaces belong in a row of their own, in numbered order. Add an
 * entry with its sprite path to the group it belongs in and it becomes placeable.
 */
const OVERWORLD_ICON_COLUMNS: { id: string; name: string; src: string }[][] = [
  // Palaces. The unnumbered one leads, above the seven numbered ones: it is the
  // generic marker for a palace whose number is not known yet, so it belongs before
  // 1 rather than at any position within the count. Eight entries, one short of the
  // nine-row cap.
  [
    { id: 'palace', name: 'North Palace', src: '/images/overworld/palace.png' },
    { id: 'palace-1', name: 'Palace 1', src: '/images/overworld/palace1.png' },
    { id: 'palace-2', name: 'Palace 2', src: '/images/overworld/palace2.png' },
    { id: 'palace-3', name: 'Palace 3', src: '/images/overworld/palace3.png' },
    { id: 'palace-4', name: 'Palace 4', src: '/images/overworld/palace4.png' },
    { id: 'palace-5', name: 'Palace 5', src: '/images/overworld/palace5.png' },
    { id: 'palace-6', name: 'Palace 6', src: '/images/overworld/palace6.png' },
    { id: 'palace-7', name: 'GP', src: '/images/overworld/palace7.png' },
  ],
  [
  { id: 'town-1', name: 'Rauru', src: '/images/overworld/town1.png' },
  { id: 'town-2', name: 'Ruto', src: '/images/overworld/town2.png' },
  { id: 'town-3', name: 'Saria', src: '/images/overworld/town3.png' },
  { id: 'town-4', name: 'Mido', src: '/images/overworld/town4.png' },
  { id: 'town-5', name: 'Nabooru', src: '/images/overworld/town5.png' },
  { id: 'town-6', name: 'Darunia', src: '/images/overworld/town6.png' },
  { id: 'town-7', name: 'New Kasuto', src: '/images/overworld/town7.png' },
  { id: 'town-8', name: 'Old Kasuto', src: '/images/overworld/town8.png' },
  ],
  // Lettered markers - the ones that stand for something found rather than for a
  // piece of ground. The menu ends this row with the West and East cave buttons.
  [
    { id: 'w-marker', name: 'W', src: '/images/overworld/w.png' },
    { id: 'e-marker', name: 'E', src: '/images/overworld/e.png' },
    { id: 'mi-marker', name: 'MI', src: '/images/overworld/mi.png' },
    { id: 'dm-entrance', name: 'DM', src: '/images/overworld/dmentrance.png' },
  ],
  // Terrain and connectors. Eight entries, so they still stack in one column of
  // nine rows now that the lettered markers have moved out of this group. Mountain
  // sits next to Boulder, the other impassable rock, and the three ground-surface
  // fills - Water, Desert, Lava - close the column as a run.
  [
    { id: 'bridge', name: 'Bridge/Raft', src: '/images/overworld/bridge.png' },
    { id: 'river-devil', name: 'River Devil', src: '/images/overworld/riverdevil.png' },
    { id: 'boulder', name: 'Boulder', src: '/images/overworld/boulder.png' },
    { id: 'mountain', name: 'Mountain', src: '/images/overworld/mountain.png' },
    { id: 'forest', name: 'Forest', src: '/images/overworld/forest.png' },
    { id: 'water', name: 'Water', src: '/images/overworld/water.png' },
    { id: 'desert', name: 'Desert', src: '/images/overworld/desert.png' },
    { id: 'lava', name: 'Lava', src: '/images/overworld/lava.png' },
  ],
]

// East continent caves: the four passthrough caves, each only meaningful paired
// with the matching number at its other end, then the East item caves. The
// passthrough ids predate the T1-T4 names and are kept so saved maps still load.
const EAST_CAVE_ICONS = [
  { id: 'connector-a', name: 'Passthrough Cave 1', src: '/images/overworld/connectort1.png' },
  { id: 'connector-b', name: 'Passthrough Cave 2', src: '/images/overworld/connectort2.png' },
  { id: 'connector-c', name: 'Passthrough Cave 3', src: '/images/overworld/connectort3.png' },
  { id: 'connector-d', name: 'Passthrough Cave 4', src: '/images/overworld/connectort4.png' },
  { id: 'cave-sunken-pbag', name: 'Sunken Pbag Cave', src: '/images/locations/eastpbagcave.png' },
  { id: 'cave-risen-pbag', name: 'Risen Pbag Cave', src: '/images/locations/eastpbagcave2.png' },
]

// West continent caves: the Parapa, Jump and Fairy connectors, then every West
// item cave using the same art as its slot in the locations rows.
const WEST_CAVE_ICONS = [
  { id: 'connector-p', name: 'Parapa Cave', src: '/images/overworld/connectorp.png' },
  { id: 'connector-j', name: 'Jump Cave', src: '/images/overworld/connectorj.png' },
  { id: 'connector-f', name: 'Fairy Cave', src: '/images/overworld/connectorf.png' },
  { id: 'cave-trophy', name: 'Trophy Cave', src: '/images/locations/trophycave.png' },
  { id: 'cave-medicine', name: 'Medicine Cave', src: '/images/locations/wateroflifecave.png' },
  {
    id: 'cave-heart-container',
    name: 'Heart Container Cave',
    src: '/images/locations/heartcontainercave.png',
  },
  {
    id: 'cave-magic-container',
    name: 'Magic Container Cave',
    src: '/images/locations/magiccontainercave.png',
  },
  { id: 'cave-pillar-pbag', name: 'Pillar Pbag Cave', src: '/images/locations/westpbagcave.png' },
]

const CAVE_MENUS = {
  west: { title: 'West', icons: WEST_CAVE_ICONS },
  east: { title: 'East', icons: EAST_CAVE_ICONS },
} as const

type CaveMenuView = keyof typeof CAVE_MENUS

// Connector markers come in pairs or more, so shift-click hands over a copy
// instead of placing or moving the original.
const DUPLICABLE_MAP_ICONS = new Set([
  'connector-p',
  'connector-j',
  'connector-f',
  'connector-a',
  'connector-b',
  'connector-c',
  'connector-d',
])

/**
 * An icon riding the cursor. `from` is the square it was dragged off, or null for
 * a shift-click copy that drops on the next square clicked. `size` and the point
 * are screen pixels, so the floating art matches the board at any zoom.
 */
type HeldMapIcon = {
  icon: string
  from: string | null
  size: number
  x: number
  y: number
}

/** Every placeable icon, flattened, for resolving whatever id a map cell holds. */
const OVERWORLD_ICONS = [
  ...OVERWORLD_ICON_COLUMNS.flat(),
  ...EAST_CAVE_ICONS,
  ...WEST_CAVE_ICONS,
]

// Items and spells share the map's cell store with the overworld icons, so their
// ids carry a prefix that keeps them from ever colliding with an icon id.
const MAP_ITEM_PREFIX = 'item:'

function findMapIcon(id: string | undefined) {
  if (!id) {
    return undefined
  }

  if (id.startsWith(MAP_ITEM_PREFIX)) {
    const item = allPickables.find(
      (entry) => entry.id === id.slice(MAP_ITEM_PREFIX.length),
    )
    return item ? { kind: 'item' as const, name: item.name, item } : undefined
  }

  const icon = OVERWORLD_ICONS.find((entry) => entry.id === id)
  return icon ? { kind: 'icon' as const, name: icon.name, src: icon.src } : undefined
}

/** The square a map menu was opened on, in the maps section's own layout pixels. */
type MapMenu = {
  cellKey: string
  x: number
  y: number
  size: number
  view?: CaveMenuView
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
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Shown when the browser has no native install prompt to offer (Safari,
// Firefox, or a Chromium browser that has not flagged the app as installable).
const INSTALL_STEPS: { input: string; effect: string }[] = [
  {
    input: 'Chrome / Edge',
    effect: 'Click the install icon in the address bar, or Menu > Install',
  },
  { input: 'Safari (Mac)', effect: 'File > Add to Dock' },
  { input: 'Safari (iOS)', effect: 'Share > Add to Home Screen' },
  { input: 'Firefox', effect: 'Not supported - use Chrome, Edge, or Safari' },
]

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
  /** Outbound link shown at the very bottom of the box. */
  link?: { href: string; label: string }
  /**
   * Spans two grid rows, so the boxes beside it stack in the other column
   * instead of one being pushed onto a row of its own below.
   */
  tall?: boolean
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
    tall: true,
    note: 'West and East in the icon menu open each continent\u2019s caves. In move mode, a box with no icons in it is discarded.',
    rows: [
      { input: 'Right click', effect: 'Open the icon menu for a square' },
      { input: 'Left click (menu)', effect: 'Place that icon on the square' },
      { input: 'Middle click', effect: 'Enter or exit move mode' },
      { input: 'Drag (move mode)', effect: 'Box-select the icons to lift' },
      { input: 'Click (move mode)', effect: 'Place the lifted icons' },
      { input: 'Escape', effect: 'Leave move mode, lifted icons stay put' },
    ],
  },
  {
    title: 'Heart/Magic containers',
    note: 'The heart/magic containers will increment on their own when collected. Setting the flags to Custom allows selection.',
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
    link: { href: 'https://discord.com/channels/429952107593072652/645362483074433025/1543315804391604324', label: 'z2r.gg/discord' },
  },
]

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function focusAtEnd(node: HTMLTextAreaElement | null) {
  if (!node) return
  node.focus()
  node.setSelectionRange(node.value.length, node.value.length)
  node.scrollTop = node.scrollHeight
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
  const [isShowingControls, setIsShowingControls] = useState(false)
  const [isShowingAiDisclosure, setIsShowingAiDisclosure] = useState(false)
  // A ruleset picked while one is already loaded, held here until the player
  // confirms, since loading flags wipes the board.
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  const [pendingPreset, setPendingPreset] = useState<
    (typeof PRESETS)[number] | null
  >(null)
  const [updatesOpenRequest, setUpdatesOpenRequest] = useState(0)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  )
  const [isInstalled, setIsInstalled] = useState(false)
  const [isShowingInstallHelp, setIsShowingInstallHelp] = useState(false)
  // Which ruleset is loaded. Standard is the default, so the board opens matching
  // it rather than needing the flags picked by hand. Still tracked now that the
  // picker is a menu, to mark the active entry.
  const [activeFlags, setActiveFlags] = useState(PRESETS[0].id)
  // The board still opens on Standard's layout, but the flags panel asks to be
  // set rather than claiming a ruleset nobody chose, until one is picked.
  const [hasPickedFlags, setHasPickedFlags] = useState(false)
  // Custom is whatever the runner says it is, so picking it asks for a name in
  // place on the panel; left blank it just reads "Custom".
  const [customFlagsName, setCustomFlagsName] = useState('')
  const [isNamingCustom, setIsNamingCustom] = useState(false)
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
  const flagsDisplayName =
    loadedPreset.id === CUSTOM_FLAGS_ID && customFlagsName.trim()
      ? customFlagsName.trim()
      : activePreset.name
  const isCustomLoaded = hasPickedFlags && loadedPreset.id === CUSTOM_FLAGS_ID
  
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
  // Whether the ruleset pickers are flown out beside the menu. Like
  // `isUpstartsOpen`, kept apart from `isMenuOpen` so the flyout opens and
  // shuts without disturbing the settings menu holding it.
  const [isFlagsOpen, setIsFlagsOpen] = useState(false)
  // Whether the overworld maps are on the board. Not every run maps the
  // overworld, and the two grids are the tallest block on it, so they can be put
  // away to leave a shorter board that is all tracking.
  //
  // Hiding them only takes them off screen - `overworldCells` is left alone, so
  // anything already marked is still there when they come back.
  const [isMapVisible, setIsMapVisible] = useState(true)
  // Free-text notes for the run, typed into a panel laid over the location rows.
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [isNotesVisible, setIsNotesVisible] = useState(true)
  const [notes, setNotes] = useState('')
  // When on, the notes button opens a separate browser window instead of the
  // in-board panel. The popup's body is a React portal target, so it shares the
  // same `notes` state and stays in sync with the board.
  const [isNotesPopout, setIsNotesPopout] = useState(false)
  const [notesWindow, setNotesWindow] = useState<Window | null>(null)
  const closeNotesWindow = () => {
    setNotesWindow((current) => {
      if (current && !current.closed) current.close()
      return null
    })
  }
  const openNotes = () => {
    if (!isNotesPopout) {
      setIsNotesOpen(true)
      return
    }
    if (notesWindow && !notesWindow.closed) {
      notesWindow.focus()
      return
    }
    const popup = window.open('', 'z2-tracker-notes', 'popup,width=480,height=560')
    // Popup blocked: fall back to the in-board panel so notes are still reachable.
    if (!popup) {
      setIsNotesOpen(true)
      return
    }
    const doc = popup.document
    doc.title = 'Notes - Z2 Tracker'
    doc.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove())
    document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]').forEach((node) => {
      const clone = doc.importNode(node, true) as HTMLStyleElement | HTMLLinkElement
      if (node instanceof HTMLLinkElement) (clone as HTMLLinkElement).href = node.href
      doc.head.appendChild(clone)
    })
    doc.documentElement.className = document.documentElement.className
    doc.body.replaceChildren()
    doc.body.className = `${document.body.className} notes-popout-body`
    const canvas = document.querySelector('.game-canvas')
    if (canvas) doc.body.style.fontFamily = getComputedStyle(canvas).fontFamily
    popup.addEventListener('pagehide', () => setNotesWindow(null))
    setIsNotesOpen(false)
    setNotesWindow(popup)
    popup.focus()
  }
  useEffect(() => {
    if (!isNotesPopout || !isNotesVisible) closeNotesWindow()
  }, [isNotesPopout, isNotesVisible])
  useEffect(() => () => closeNotesWindow(), [])
  const [isHoverTextOn, setIsHoverTextOn] = useState(true)
  const [hoverDelay, setHoverDelay] = useState(500)
  const [isPalaceImageTipsOn, setIsPalaceImageTipsOn] = useState(true)
  const [isCaveImageTipsOn, setIsCaveImageTipsOn] = useState(true)
  // Reflows the five stacked sections into two side-by-side columns for a wide
  // board. In-memory like every other setting here, and modelled on isMapVisible:
  // one piece of state plus one settings-menu row.
  const [isLandscape, setIsLandscape] = useState(false)
  // Display preferences are remembered per device. They are restored after mount
  // so the server render and first client render agree, and saving waits until
  // that restore has happened so the defaults never overwrite stored values.
  const [hasRestoredSettings, setHasRestoredSettings] = useState(false)
  // Starts true so the hint arrows never flash in before storage is read.
  const [hasSeenControls, setHasSeenControls] = useState(true)
  useEffect(() => {
    try {
      setHasSeenControls(window.localStorage.getItem(CONTROLS_SEEN_STORAGE_KEY) === '1')
    } catch {
      // Blocked storage: leave the hint hidden rather than nag on every visit.
    }
  }, [])
  // Same pattern as the Controls hint: the gear shimmers until it is first clicked.
  const [hasOpenedMenu, setHasOpenedMenu] = useState(true)
  useEffect(() => {
    try {
      setHasOpenedMenu(window.localStorage.getItem(GEAR_SEEN_STORAGE_KEY) === '1')
    } catch {}
  }, [])
  const markMenuOpened = () => {
    setHasOpenedMenu(true)
    try {
      window.localStorage.setItem(GEAR_SEEN_STORAGE_KEY, '1')
    } catch {}
  }
  const markControlsSeen = () => {
    setHasSeenControls(true)
    try {
      window.localStorage.setItem(CONTROLS_SEEN_STORAGE_KEY, '1')
    } catch {
      // Storage unavailable; the hint stays dismissed for this session only.
    }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null')
      if (saved && typeof saved === 'object') {
        if (typeof saved.isMapVisible === 'boolean') setIsMapVisible(saved.isMapVisible)
        if (typeof saved.isNotesVisible === 'boolean') setIsNotesVisible(saved.isNotesVisible)
        if (typeof saved.isNotesPopout === 'boolean') setIsNotesPopout(saved.isNotesPopout)
        if (typeof saved.isHoverTextOn === 'boolean') setIsHoverTextOn(saved.isHoverTextOn)
        if (typeof saved.isLandscape === 'boolean') setIsLandscape(saved.isLandscape)
        if (typeof saved.isPalaceImageTipsOn === 'boolean') {
          setIsPalaceImageTipsOn(saved.isPalaceImageTipsOn)
        }
        if (typeof saved.isCaveImageTipsOn === 'boolean') {
          setIsCaveImageTipsOn(saved.isCaveImageTipsOn)
        }
        if (typeof saved.hoverDelay === 'number' && saved.hoverDelay >= 0 && saved.hoverDelay <= 3000) {
          setHoverDelay(saved.hoverDelay)
        }
        if (typeof saved.scale === 'number' && Number.isFinite(saved.scale)) {
          setScale(clampScale(saved.scale))
        }
      }
    } catch {
      // Unreadable or blocked storage just means starting from the defaults.
    }
    setHasRestoredSettings(true)
  }, [])
  useEffect(() => {
    if (!hasRestoredSettings) return
    try {
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          isMapVisible,
          isNotesVisible,
          isNotesPopout,
          isHoverTextOn,
          hoverDelay,
          isLandscape,
          isPalaceImageTipsOn,
          isCaveImageTipsOn,
          scale,
        }),
      )
    } catch {
      // Storage can be full or disabled (private browsing); settings stay in memory.
    }
  }, [
    hasRestoredSettings,
    isMapVisible,
    isNotesVisible,
    isNotesPopout,
    isHoverTextOn,
    hoverDelay,
    isLandscape,
    isPalaceImageTipsOn,
    isCaveImageTipsOn,
    scale,
  ])
  // Which icon sits on each overworld cell, keyed by grid id and coordinates.
  // Only filled cells are stored, so an absent key is an empty square.
  const [overworldCells, setOverworldCells] = useState<Record<string, string>>(OVERWORLD_START_CELLS)
  // The right-click icon menu, and the square it will place onto.
  const [mapMenu, setMapMenu] = useState<MapMenu | null>(null)
  const mapMenuRef = useRef<HTMLDivElement | null>(null)
  const mapMenuOpenerRef = useRef<HTMLButtonElement | null>(null)
  // The square the items-and-spells picker will place onto, opened from the menu.
  const [mapItemPickerCell, setMapItemPickerCell] = useState<string | null>(null)
  const [mapMove, setMapMove] = useState<MapMove | null>(null)
  // Dropping happens on press and ends move mode, so the click that follows
  // would otherwise be handled as a normal-mode click.
  const swallowNextCellClickRef = useRef(false)
  const [heldIcon, setHeldIcon] = useState<HeldMapIcon | null>(null)
  const heldIconElementRef = useRef<HTMLDivElement | null>(null)
  // A press on a filled square only becomes a drag once the pointer travels, so
  // a plain click on an icon does not pick it up.
  const pendingMapDragRef = useRef<{
    cellKey: string
    icon: string
    x: number
    y: number
    size: number
  } | null>(null)
  const palaceGridRef = useRef<HTMLDivElement | null>(null)
  // How tall the board currently stands. Everything that has to agree with the
  // board's height reads this rather than `BASE_HEIGHT`, so the canvas, the stage
  // the grips hang off, and the drag arithmetic cannot disagree about it.
  // In landscape the board's size is fixed by the two-column split, so map
  // visibility no longer changes the height - the left column governs it, and a
  // hidden right-column maps block just leaves that lane shorter than its column.
  const canvasWidth = isLandscape ? LANDSCAPE_WIDTH : BASE_WIDTH // landscape: two 600px lanes
  const canvasHeight = isLandscape
    ? LANDSCAPE_HEIGHT
    : isMapVisible
      ? BASE_HEIGHT
      : MAPLESS_HEIGHT

  // Finishes a selection box on release - listened for on the document, so letting
  // go outside the grid still ends the drag. A box with icons in it lifts them;
  // an empty one is discarded and move mode stays on.
  useEffect(() => {
    if (
      mapMove?.phase !== 'select' ||
      !mapMove.worldId ||
      !mapMove.from ||
      !mapMove.to
    ) {
      return
    }

    const { worldId, from, to } = mapMove

    function finishSelection(event: MouseEvent) {
      if (event.button !== 0) {
        return
      }

      const picked: (MapCell & { icon: string })[] = []

      for (
        let row = Math.min(from.row, to.row);
        row <= Math.max(from.row, to.row);
        row++
      ) {
        for (
          let column = Math.min(from.column, to.column);
          column <= Math.max(from.column, to.column);
          column++
        ) {
          const icon = overworldCells[`${worldId}-${row}-${column}`]

          if (icon) {
            picked.push({ row, column, icon })
          }
        }
      }

      setMapMove(
        picked.length > 0
          ? { phase: 'move', worldId, picked, anchor: to, hover: to }
          : { phase: 'select', worldId: null, from: null, to: null },
      )
    }

    document.addEventListener('mouseup', finishSelection)
    return () => document.removeEventListener('mouseup', finishSelection)
  }, [mapMove, overworldCells])

  // Drives dragging and held copies from the document, so the pointer can leave
  // the grid mid-drag. The floating art is moved directly rather than through
  // state, keeping every mousemove from re-rendering the whole board.
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const pending = pendingMapDragRef.current

      if (pending) {
        if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 4) {
          pendingMapDragRef.current = null
          setHeldIcon({
            icon: pending.icon,
            from: pending.cellKey,
            size: pending.size,
            x: event.clientX,
            y: event.clientY,
          })
        }
        return
      }

      const element = heldIconElementRef.current
      if (element) {
        element.style.left = `${event.clientX}px`
        element.style.top = `${event.clientY}px`
      }
    }

    function handleMouseUp(event: MouseEvent) {
      if (event.button !== 0) {
        return
      }

      pendingMapDragRef.current = null

      if (!heldIcon?.from) {
        return
      }

      const { from, icon } = heldIcon
      const to = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-cell-key]')?.dataset.cellKey

      // Released off the maps, or back on its own square, leaves it where it was.
      if (to && to !== from) {
        setOverworldCells((current) => {
          const next = { ...current }
          delete next[from]
          next[to] = icon
          return next
        })
      }
      setHeldIcon(null)
    }

    function handleMouseDown(event: MouseEvent) {
      if (
        heldIcon &&
        !heldIcon.from &&
        !(event.target as Element | null)?.closest?.('[data-cell-key]')
      ) {
        setHeldIcon(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && heldIcon) {
        setHeldIcon(null)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [heldIcon])

  // Places the icon menu beside its square once its real size is known: to the
  // right, flipped left near the section's edge, and kept inside the section
  // vertically. Then focus moves into it so the keyboard can pick an icon.
  useLayoutEffect(() => {
    const menu = mapMenuRef.current
    const section = menu?.offsetParent as HTMLElement | null

    if (!mapMenu || !menu || !section) {
      return
    }

    const gap = 4
    let left = mapMenu.x + mapMenu.size + gap
    if (left + menu.offsetWidth > section.offsetWidth) {
      left = mapMenu.x - menu.offsetWidth - gap
    }
    const centredTop = mapMenu.y + mapMenu.size / 2 - menu.offsetHeight / 2
    const top = Math.max(
      0,
      Math.min(centredTop, section.offsetHeight - menu.offsetHeight),
    )

    menu.style.left = `${Math.max(0, left)}px`
    menu.style.top = `${top}px`
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [mapMenu])

  // Any press outside the menu, or Escape, dismisses it.
  const isMapMenuOpen = mapMenu !== null
  useEffect(() => {
    if (!isMapMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!mapMenuRef.current?.contains(event.target as Node)) {
        setMapMenu(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMapMenu(null)
        mapMenuOpenerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMapMenuOpen])

  // Escape backs out of move mode, leaving any lifted icons where they were.
  const isMapMoveActive = mapMove !== null
  useEffect(() => {
    if (!isMapMoveActive) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMapMove(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMapMoveActive])

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

      // Text fields (the notes panel) need Space and Enter to type; they can't
      // activate a button, so letting them through keeps the guarantee intact.
      const target = event.target
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
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

  // Chromium browsers fire beforeinstallprompt once the app qualifies; holding
  // on to it lets the menu's Install as App open the native prompt on demand.
  // Running as an installed app hides the option entirely.
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)')
    const syncInstalled = () =>
      setIsInstalled(
        standalone.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      )

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    function handleInstalled() {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    syncInstalled()
    standalone.addEventListener('change', syncInstalled)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      standalone.removeEventListener('change', syncInstalled)
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      )
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!isShowingInstallHelp) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsShowingInstallHelp(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isShowingInstallHelp])

  async function handleInstallApp() {
    if (!installPrompt) {
      setIsShowingInstallHelp(true)
      return
    }

    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    // The event can only be used once, so it is dropped either way.
    setInstallPrompt(null)
    if (outcome === 'accepted') {
      setIsInstalled(true)
    }
  }

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
    options?: {
    canBlock?: boolean
    canCheckEmpty?: boolean
    onCycleMark?: () => void
    // Hover text while the slot is empty, for slots laid over another icon.
    emptyTip?: string
  },
  ) {
    const item = allPickables.find((entry) => entry.id === slotItems[slotKey])
    // Item-check slots can be ticked off with nothing in them, so an empty slot
    // still counts as collected when the option is on and the slot is marked.
    const isCollected = Boolean(collected[slotKey] && (item || options?.canCheckEmpty))
    // Small filler sprites need their own sizing so the town slot does not inflate
    // them off their pixel grid; only the town slots act on this today.
    const isMinorItem = item ? MINOR_ITEM_IDS.has(item.id) : false
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
              : `${label}: ${isCollected ? 'checked' : 'empty'}${blockLabel}. ${options?.canCheckEmpty ? `Left click to mark ${isCollected ? 'unchecked' : 'checked'}, ` : ''}Right click to choose an item.${cycleHint}${blockHint}`
          }
          aria-pressed={item || options?.canCheckEmpty ? isCollected : undefined}
          className={`${isCollected ? 'item-slot item-slot-collected' : 'item-slot'}${block ? ' item-slot-blocked' : ''}${isMinorItem ? ' item-slot-minor' : ''}`}
          // Read by the palace grid's wheel listener, the same way the bosses are.
          data-block-key={options?.canBlock ? slotKey : undefined}
          data-tip={item ? undefined : options?.emptyTip}
          // Middle click clears the item.
          onAuxClick={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              clearItem(slotKey)
            }
          }}
          // Left click marks the item as collected. Item-check slots can be
          // ticked off even while empty.
          onClick={() => {
            if (item || options?.canCheckEmpty) {
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
        data-quest-town={QUEST_ITEM_TOWNS[entry.id]}
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
        data-tip="Left/Right click to select continent"
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
  /** Opens the icon menu on the right-clicked square, anchored to its position. */
  function openMapMenu(cell: HTMLButtonElement, cellKey: string) {
    const section = cell.closest<HTMLElement>('.overworld')
    let x = 0
    let y = 0
    let element: HTMLElement | null = cell

    // offset* are layout pixels, so the anchor is unaffected by the board's zoom.
    while (element && element !== section) {
      x += element.offsetLeft
      y += element.offsetTop
      element = element.offsetParent as HTMLElement | null
    }

    mapMenuOpenerRef.current = cell
    setMapMenu({ cellKey, x, y, size: cell.offsetWidth })
  }

  function clearMapCell(cellKey: string) {
    setOverworldCells((current) => {
      const next = { ...current }
      delete next[cellKey]
      return next
    })
    setMapMenu((current) => (current?.cellKey === cellKey ? null : current))
  }

  /** Puts an icon on a square from the menu, or empties it when `iconId` is null. */
  function chooseMapMenuIcon(iconId: string | null) {
    if (!mapMenu) {
      return
    }

    const { cellKey } = mapMenu
    setOverworldCells((current) => {
      const next = { ...current }

      if (iconId) {
        next[cellKey] = iconId
      } else {
        delete next[cellKey]
      }

      return next
    })
    setMapMenu(null)
    mapMenuOpenerRef.current?.focus({ preventScroll: true })
  }

  function renderMapMenu() {
    if (!mapMenu) {
      return null
    }

    const currentIcon = overworldCells[mapMenu.cellKey]

    const renderIcon = (icon: { id: string; name: string; src: string }) => (
      <button
        aria-label={`${icon.name}${currentIcon === icon.id ? ', placed' : ''}`}
        className={
          currentIcon === icon.id
            ? 'overworld-menu-icon overworld-menu-icon-current'
            : 'overworld-menu-icon'
        }
        data-tip={icon.name}
        key={icon.id}
        onClick={(event) => {
          if (event.shiftKey && DUPLICABLE_MAP_ICONS.has(icon.id)) {
            setHeldIcon({
              icon: icon.id,
              from: null,
              size: mapMenuOpenerRef.current?.getBoundingClientRect().width ?? 16,
              x: event.clientX,
              y: event.clientY,
            })
            setMapMenu(null)
            return
          }

          chooseMapMenuIcon(icon.id)
        }}
        role="menuitem"
        type="button"
      >
        {/* Native 16px, so the palace digits stay crisp. */}
        <Image alt="" height={16} src={icon.src} width={16} />
      </button>
    )

    const showView = (view: CaveMenuView | undefined) =>
      setMapMenu((current) => (current ? { ...current, view } : current))

    if (mapMenu.view) {
      const caveMenu = CAVE_MENUS[mapMenu.view]

      return (
        <div
          aria-label={`${caveMenu.title} caves`}
          className="overworld-menu"
          ref={mapMenuRef}
          role="menu"
        >
          <p className="overworld-menu-title">{`${caveMenu.title} Caves`}</p>
          <div className="overworld-menu-row overworld-menu-row-wrap" role="group">
            {caveMenu.icons.map(renderIcon)}
          </div>
          <button
            className="overworld-menu-clear overworld-menu-items"
            onClick={() => showView(undefined)}
            role="menuitem"
            type="button"
          >
            Back
          </button>
        </div>
      )
    }

    return (
      <div
        aria-label="Place an icon"
        className="overworld-menu"
        ref={mapMenuRef}
        role="menu"
      >
        {OVERWORLD_ICON_COLUMNS.map((group, groupIndex) => (
          <div className="overworld-menu-row" key={groupIndex} role="group">
            {group.map(renderIcon)}
            {groupIndex === 2
              ? (Object.keys(CAVE_MENUS) as CaveMenuView[]).map((view) => (
                  <button
                    aria-haspopup="menu"
                    className="overworld-menu-cave"
                    key={view}
                    onClick={() => showView(view)}
                    role="menuitem"
                    type="button"
                  >
                    {CAVE_MENUS[view].title}
                  </button>
                ))
              : null}
          </div>
        ))}
        <button
          aria-haspopup="dialog"
          className="overworld-menu-clear overworld-menu-items"
          onClick={() => {
            setMapItemPickerCell(mapMenu.cellKey)
            setMapMenu(null)
          }}
          role="menuitem"
          type="button"
        >
          Items and Spells
        </button>
      </div>
    )
  }

  /** The icon riding the cursor, portalled out so the board's zoom transform cannot offset it. */
  function renderHeldIcon(held: HeldMapIcon) {
    const icon = findMapIcon(held.icon)

    if (!icon) {
      return null
    }

    return createPortal(
      <div
        aria-hidden="true"
        className="overworld-held"
        ref={heldIconElementRef}
        style={{
          left: held.x,
          top: held.y,
          transform: `translate(-50%, -50%) scale(${held.size / 16})`,
        }}
      >
        {icon.kind === 'icon' ? (
          <Image alt="" className="overworld-cell-icon" height={16} src={icon.src} width={16} />
        ) : (
          <span className="overworld-cell-icon overworld-cell-item">
            <ItemArt item={icon.item} />
          </span>
        )}
      </div>,
      document.body,
    )
  }

  function placeMapItem(cellKey: string, itemId: string) {
    setOverworldCells((current) => ({
      ...current,
      [cellKey]: `${MAP_ITEM_PREFIX}${itemId}`,
    }))
    setMapItemPickerCell(null)
  }

  function renderItemPicker(
    title: string,
    onPick: (itemId: string) => void,
    onClose: () => void,
  ) {
    const renderOption = (entry: (typeof allPickables)[number]) => (
      <button
        aria-label={entry.name}
        className="item-picker-option"
        key={entry.id}
        onClick={() => onPick(entry.id)}
        type="button"
      >
        <ItemArt item={entry} />
      </button>
    )

    return (
      <div className="item-picker-overlay">
        <button
          aria-label="Close item menu"
          className="item-picker-backdrop"
          onClick={onClose}
          type="button"
        />
        <div
          aria-label={`Choose an item for ${title}`}
          className="item-picker"
          role="dialog"
        >
          {/* The title stays optically centred because the close button
              is taken out of flow rather than sharing the row. */}
          <div className="item-picker-header">
            <p className="item-picker-title">{title}</p>
            <button
              aria-label="Close item menu"
              className="item-picker-close"
              onClick={onClose}
              type="button"
            >
              <span aria-hidden="true">X</span>
            </button>
          </div>
          <div className="item-picker-grid">{items.map(renderOption)}</div>

          {/* Spells get their own labelled section under the items. */}
          {spells.length > 0 ? (
            <>
              <p className="item-picker-subtitle">Spells</p>
              <div className="item-picker-grid">{spells.map(renderOption)}</div>
            </>
          ) : null}
        </div>
      </div>
    )
  }

  function toggleMapMoveMode() {
    setMapMenu(null)
    setMapMove((current) =>
      current ? null : { phase: 'select', worldId: null, from: null, to: null },
    )
  }

  function hoverMapCell(worldId: string, cell: MapCell) {
    setMapMove((current) => {
      if (!current || current.worldId !== worldId) {
        return current
      }

      if (current.phase === 'select') {
        return current.from ? { ...current, to: cell } : current
      }

      return { ...current, hover: cell }
    })
  }

  /**
   * Where the lifted icons would land with the cursor on `hover`, keyed by
   * `row-column`, plus whether every one of them stays on the grid.
   */
  function getMovePreview(worldId: string) {
    if (mapMove?.phase !== 'move' || mapMove.worldId !== worldId) {
      return null
    }

    const rowShift = mapMove.hover.row - mapMove.anchor.row
    const columnShift = mapMove.hover.column - mapMove.anchor.column
    const ghosts = new Map<string, string>()
    const lifted = new Set<string>()
    let isValid = true

    for (const picked of mapMove.picked) {
      lifted.add(`${picked.row}-${picked.column}`)
      const target = {
        row: picked.row + rowShift,
        column: picked.column + columnShift,
      }

      if (isOnOverworld(target)) {
        ghosts.set(`${target.row}-${target.column}`, picked.icon)
      } else {
        isValid = false
      }
    }

    return { ghosts, lifted, isValid }
  }

  /** Puts the lifted icons down around `cell`, then leaves move mode. */
  function dropMovedIcons(worldId: string, cell: MapCell) {
    if (mapMove?.phase !== 'move' || mapMove.worldId !== worldId) {
      return
    }

    const rowShift = cell.row - mapMove.anchor.row
    const columnShift = cell.column - mapMove.anchor.column
    const targets = mapMove.picked.map((picked) => ({
      row: picked.row + rowShift,
      column: picked.column + columnShift,
      icon: picked.icon,
    }))

    // A drop that would push any icon off the edge is refused rather than
    // silently losing that icon.
    if (!targets.every(isOnOverworld)) {
      return
    }

    const { picked } = mapMove
    setOverworldCells((current) => {
      const next = { ...current }

      for (const source of picked) {
        delete next[`${worldId}-${source.row}-${source.column}`]
      }

      for (const target of targets) {
        next[`${worldId}-${target.row}-${target.column}`] = target.icon
      }

      return next
    })
    setMapMove(null)
  }

  function clearTracker() {
    setOverworldCells({ ...OVERWORLD_START_CELLS })
    setMapMenu(null)
    setSlotItems({})
    setCollected({})
    setSlotCounts({})
    setIconMarks({})
    setBlocks({})
    setCountValues({})
    setConnectorEnds({})
    setOpenSlot(null)
    setOpenLimitPicker(null)
    setNotes('')
    setIsNotesOpen(false)
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
    setIsFlagsOpen(false)
  }

  function requestPreset(preset: (typeof PRESETS)[number]) {
    closeMenu()
    if (hasPickedFlags) {
      setPendingPreset(preset)
    } else {
      applyPreset(preset)
    }
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    // The maps describe the seed being played, so a new ruleset empties them
    // along with everything else, back to just the home palace.
    setOverworldCells({ ...OVERWORLD_START_CELLS })
    setMapMenu(null)
    setSlotItems({ ...preset.placements })
    setCollected(collectedFromPreset(preset))
    setSlotCounts({})
    // Seeded from the ruleset rather than emptied, so a week that already knows
    // its palace requirements opens with them showing.
    setIconMarks({ ...preset.marks })
    setBlocks({})
    setCountValues({ ...preset.counts })
    // Seeded like the marks above, so a week that knows its cave, raft and bridge
    // connections opens with them showing rather than blank.
    setConnectorEnds({ ...preset.connectorEnds })
    setActiveFlags(preset.id)
    setHasPickedFlags(true)
    setCustomFlagsName('')
    setIsNamingCustom(preset.id === CUSTOM_FLAGS_ID)
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
    const deltaX = (handle.x * (event.clientX - drag.x)) / canvasWidth
    // Against the board's current height, so a vertical drag moves the scale at
    // the same rate per pixel travelled whether or not the maps are showing.
    const deltaY = (handle.y * (event.clientY - drag.y)) / canvasHeight

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
      // Form fields are exempt: a range input can't be dragged without its default.
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, select')) return
        event.preventDefault()
      }}
      ref={rootRef}
    >
      <div
        className={`tracker-stage${activeHandle ? ' is-resizing' : ''}`}
        style={{
          width: canvasWidth * scale,
          // The grips sit against the stage's edges, so shrinking it with the
          // board is what carries them up when the maps are put away.
          height: canvasHeight * scale,
        }}
      >
        {/* Off while moving map icons, where the tip would sit over the squares
            being aimed at. */}
        <IconTooltip
        delay={hoverDelay}
        enabled={isHoverTextOn && !mapMove}
        showCaveArt={isCaveImageTipsOn}
      />
        <div
          className="tracker-scaler"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            // `zoom` scales during layout, so the sprites rasterize at their
            // final on-screen size. `transform: scale()` instead rasterizes at
            // the base size and stretches that bitmap, which is why the art
            // looked soft until an interaction forced a fresh repaint.
            zoom: scale,
          }}
        >
          <div
            aria-label="Zelda II tracker canvas with an eight-bit frame"
            className={`game-canvas${isLandscape ? ' is-landscape' : ''}${!isMapVisible ? ' maps-hidden' : ''}`}
            role="img"
            // Owned here rather than in the stylesheet: the board has several
            // sizes now, and this is where that choice is already made.
            style={{ width: canvasWidth, height: canvasHeight }}
          >
            <div aria-label="Town locations" className="town-grid">
              {towns.map((town) => {
                const townKey = `town-${town.name}`
                const mark = iconMarks[townKey]

                return (
                  <div className="town-column" data-town={town.name} key={town.name}>
                    <button
                      aria-label={`${town.name} town${mark ? `, marked ${mark}` : ''}. Right click to cycle the location.`}
  className="town-icon icon-toggle"
  data-tip={town.tip ?? town.name}
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
  canCheckEmpty: true,
  emptyTip: town.tip ?? town.name,
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
                          data-tip={BOSS_NAMES[palace.name]}
                          data-tip-image={
                            isPalaceImageTipsOn
                              ? PALACE_TIP_IMAGES[palace.name]
                              : undefined
                          }
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
                            { canBlock: true, canCheckEmpty: true }
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
                        className={`tracker-menu-toggle${hasOpenedMenu ? '' : ' is-hinting'}`}
                        // Closing from the hamburger goes through the same helper
                        // as the backdrop, so the flyout cannot be left open
                        // behind a shut menu.
                        onClick={() => {
                          if (!hasOpenedMenu) markMenuOpened()
                          if (isMenuOpen) closeMenu()
                          else setIsMenuOpen(true)
                        }}
                        type="button"
                      >
                        <Settings aria-hidden="true" className="tracker-menu-gear" />
                      </button>

                      {isMenuOpen ? (
                        <div
                          aria-label="Tracker options"
                          className="tracker-menu"
                          role="menu"
                        >
                          {/* Puts the overworld maps away. A checkbox rather than
                              another radio, since it is not one of the mutually
                              exclusive rulesets above - and set apart from them by
                              the same border Controls uses, so the flags run reads
                              as one group.

                              Left open on click: this is the one entry worth
                              toggling twice to see the board both ways, and
                              closing the menu each time would fight that. */}
                          <button
                            aria-checked={isMapVisible}
                            className="tracker-menu-option"
                            onClick={() => {
                    setMapMove(null)
                    setIsMapVisible((current) => !current)
                  }}
                            role="menuitemcheckbox"
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`tracker-menu-check${isMapVisible ? ' is-checked' : ''}`}
                            />
                            Mapping
                          </button>

                          <button
                            aria-checked={isNotesVisible}
                            className="tracker-menu-option tracker-menu-option-bordered"
                            onClick={() => {
                              setIsNotesOpen(false)
                              setIsNotesVisible((current) => !current)
                            }}
                            role="menuitemcheckbox"
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`tracker-menu-check${isNotesVisible ? ' is-checked' : ''}`}
                            />
                            Notes
                          </button>

                          {isNotesVisible ? (
                            <button
                              aria-checked={isNotesPopout}
                              className="tracker-menu-option"
                              onClick={() => {
                                setIsNotesOpen(false)
                                setIsNotesPopout((current) => !current)
                              }}
                              role="menuitemcheckbox"
                              type="button"
                            >
                              <span
                                aria-hidden="true"
                                className={`tracker-menu-check${isNotesPopout ? ' is-checked' : ''}`}
                              />
                              Open in New Window
                            </button>
                          ) : null}

                          <button
                            aria-checked={isHoverTextOn}
                            className="tracker-menu-option tracker-menu-option-bordered"
                            onClick={() => setIsHoverTextOn((current) => !current)}
                            role="menuitemcheckbox"
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`tracker-menu-check${isHoverTextOn ? ' is-checked' : ''}`}
                            />
                            Tooltips
                          </button>

                          {isHoverTextOn ? (
                            <button
                              aria-checked={isPalaceImageTipsOn}
                              className="tracker-menu-option"
                              onClick={() => setIsPalaceImageTipsOn((current) => !current)}
                              role="menuitemcheckbox"
                              type="button"
                            >
                              <span
                                aria-hidden="true"
                                className={`tracker-menu-check${isPalaceImageTipsOn ? ' is-checked' : ''}`}
                              />
                              Palace Images
                            </button>
                          ) : null}

                          {isHoverTextOn ? (
                            <button
                              aria-checked={isCaveImageTipsOn}
                              className="tracker-menu-option"
                              onClick={() => setIsCaveImageTipsOn((current) => !current)}
                              role="menuitemcheckbox"
                              type="button"
                            >
                              <span
                                aria-hidden="true"
                                className={`tracker-menu-check${isCaveImageTipsOn ? ' is-checked' : ''}`}
                              />
                              Cave Images
                            </button>
                          ) : null}

                          {isHoverTextOn ? (
                            <label className="tracker-menu-slider">
                              <span className="tracker-menu-slider-label">
                                Delay
                                <span className="tracker-menu-slider-value">
                                  {hoverDelay === 0
                                    ? 'Instant'
                                    : `${(hoverDelay / 1000).toFixed(hoverDelay % 1000 === 0 ? 0 : 2).replace(/0$/, '')}s`}
                                </span>
                              </span>
                              <input
                                aria-valuetext={
                                  hoverDelay === 0
                                    ? 'Instant'
                                    : `${hoverDelay / 1000} seconds`
                                }
                                max={3000}
                                min={0}
                                onChange={(event) =>
                                  setHoverDelay(Number(event.target.value))
                                }
                                step={250}
                                type="range"
                                value={hoverDelay}
                              />
                            </label>
                          ) : null}

                          {/* Reflows the board into two columns. A checkbox like
                              Hide maps, and left open on click for the same reason:
                              it is worth toggling twice to compare the two layouts. */}
                          <button
                            aria-checked={isLandscape}
                            className="tracker-menu-option tracker-menu-option-bordered"
                            onClick={() => setIsLandscape((current) => !current)}
                            role="menuitemcheckbox"
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className={`tracker-menu-check${isLandscape ? ' is-checked' : ''}`}
                            />
                            Landscape
                          </button>

                          {/* Opens the controls reference. */}
                          <button
                            className="tracker-menu-option tracker-menu-option-bordered"
                            onClick={() => {
                              closeMenu()
                              setIsShowingControls(true)
                              markControlsSeen()
                            }}
                            role="menuitem"
                            type="button"
                          >
                            {hasSeenControls ? null : (
                              <span aria-hidden="true" className="controls-hint-arrow">
                                {'▶▶▶'}
                              </span>
                            )}
                            Controls
                            {hasSeenControls ? null : (
                              <span aria-hidden="true" className="controls-hint-arrow">
                                {'◀◀◀'}
                              </span>
                            )}
                          </button>

                          <button
                            className="tracker-menu-option"
                            onClick={() => {
                              closeMenu()
                              setUpdatesOpenRequest((count) => count + 1)
                            }}
                            role="menuitem"
                            type="button"
                          >
                            Updates
                          </button>

                          {isInstalled ? null : (
                            <button
                              className="tracker-menu-option tracker-menu-option-bordered tracker-menu-option-install"
                              onClick={() => {
                                closeMenu()
                                void handleInstallApp()
                              }}
                              role="menuitem"
                              type="button"
                            >
                              Install as App
                            </button>
                          )}

                          <button
                            className="tracker-menu-option tracker-menu-option-bordered tracker-menu-option-ai"
                            onClick={() => {
                              closeMenu()
                              setIsShowingAiDisclosure(true)
                            }}
                            role="menuitem"
                            type="button"
                          >
                            AI Disclosure
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
                      data-tip={CONNECTOR_TIPS[index]}
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
                    rowIndex === 2 && isFlagsOpen ? 'location-row-raised' : '',
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
                            ? `${location.name}: complete, collected with the Granny's Basement magic container.`
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
                        {/* The chosen number stays drawn on the sprite even once
                            she is complete, so collecting the item never wipes the
                            count you recorded. It just rides along on the greyed art. */}
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
                  // An empty location check can still be ticked off on its own,
                  // so the checked state no longer requires a placed item.
                  const isCollected = Boolean(collected[slotKey])

                  return (
                    <button
                      aria-haspopup="dialog"
                      aria-label={
                        item
                          ? `${location.name}: ${item.name}${isCollected ? ', collected' : ''}. Left click to mark collected, right click to change, middle click to clear.`
                          : `${location.name}: ${isCollected ? 'checked' : 'empty'}. Left click to mark ${isCollected ? 'unchecked' : 'checked'}, right click to choose an item.`
                      }
                      aria-pressed={isCollected}
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
                        toggleCollected(slotKey)
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
                  <div className="flags-panel-wrap">
                    {isNamingCustom ? (
                      <div className="flags-panel">
                        <label className="flags-panel-label" htmlFor="custom-flags-name">
                          Flags
                        </label>
                        <input
                          autoComplete="off"
                          autoFocus
                          className="flags-panel-value flags-panel-input"
                          id="custom-flags-name"
                          maxLength={CUSTOM_NAME_MAX_LENGTH}
                          onBlur={() => setIsNamingCustom(false)}
                          onFocus={(event) => {
                            const end = event.currentTarget.value.length
                            event.currentTarget.setSelectionRange(end, end)
                          }}
                          style={{ fontSize: customNameFontSize(customFlagsName.length) }}
                          onChange={(event) => setCustomFlagsName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.nativeEvent.isComposing || event.keyCode === 229) return
                            if (event.key === 'Enter' || event.key === 'Escape') {
                              event.preventDefault()
                              setIsNamingCustom(false)
                            }
                          }}
                          placeholder=" "
                          spellCheck={false}
                          type="text"
                          value={customFlagsName}
                        />
                      </div>
                    ) : (
                    <button
                      aria-expanded={isFlagsOpen}
                      aria-haspopup="menu"
                      aria-label={`Flags: ${hasPickedFlags ? flagsDisplayName : 'none selected'}. Right click to select flags. Selecting new flags acts as a clear button.`}
                      className="flags-panel"
                      data-tip={
                        isCustomLoaded
                          ? 'Left click to rename. Selecting new flags acts as a clear button'
                          : 'Selecting new flags acts as a clear button'
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        if (!isCustomLoaded) return
                        setIsFlagsOpen(false)
                        setIsNamingCustom(true)
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setIsMenuOpen(false)
                        setIsUpstartsOpen(false)
                        setIsFlagsOpen((open) => !open)
                      }}
                      type="button"
                    >
                      <span className="flags-panel-label">
                        {hasPickedFlags && activePreset.group === 'upstarts'
                          ? 'Upstarts Flags'
                          : 'Flags'}
                      </span>
                      <span
                        className={`flags-panel-value${hasPickedFlags ? '' : ' is-prompt'}`}
                        style={
                          isCustomLoaded
                            ? {
                                fontSize: customNameFontSize(flagsDisplayName.length),
                                whiteSpace: 'nowrap',
                              }
                            : undefined
                        }
                      >
                        {hasPickedFlags ? flagsDisplayName : 'Right click to select'}
                      </span>
                    </button>
                    )}

                    {isFlagsOpen ? (
                      <div
                        aria-label="Flags"
                        className="tracker-menu flags-menu"
                        role="menu"
                      >
                        <p className="tracker-menu-heading">Flags</p>
                      {NAMED_PRESETS.map((preset) => (
                        <button
                          aria-checked={hasPickedFlags && preset.id === activeFlags}
                          className="tracker-menu-option"
                          key={preset.id}
                          onClick={() => requestPreset(preset)}
                          role="menuitemradio"
                          type="button"
                        >
                          {preset.name}
                        </button>
                      ))}

                      {/* The Upstarts weeks, behind one entry rather
                          than six loose ones: they are a series, and
                          spelling them all out would make the weeks the
                          bulk of the flags flyout. */}
                      <div className="tracker-submenu-wrap">
                        <button
                          aria-expanded={isUpstartsOpen}
                          aria-haspopup="menu"
                          // Gold while one of its weeks is loaded, so a
                          // collapsed submenu still shows where the
                          // active ruleset came from - the job the
                          // entries above do for themselves.
                          aria-checked={hasPickedFlags && isUpstartsActive}
                          className="tracker-menu-option tracker-submenu-toggle"
                          onClick={() =>
                            setIsUpstartsOpen((open) => !open)
                          }
                          role="menuitemradio"
                          type="button"
                        >
                          Upstarts
                          {/* Points the way the panel opens. Drawn with
                              borders so it stays crisp like the gear's
                              glyph rather than softening at zoom. */}
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
                                aria-checked={hasPickedFlags && preset.id === activeFlags}
                                className="tracker-menu-option"
                                key={preset.id}
                                onClick={() => requestPreset(preset)}
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
                          Upstarts submenu. Rendered from its own
                          constant rather than in list order so it stays
                          pinned to the foot of the flags run however
                          many entries appear above it. */}
                      {CUSTOM_PRESET ? (
                        <button
                          aria-checked={hasPickedFlags && CUSTOM_PRESET.id === activeFlags}
                          className="tracker-menu-option tracker-menu-option-bordered"
                          onClick={() => requestPreset(CUSTOM_PRESET)}
                          role="menuitemradio"
                          type="button"
                        >
                          {CUSTOM_PRESET.name}
                        </button>
                      ) : null}
                      {/* Wipes the run but keeps the loaded flags, so it lives
                          at the foot of the flags menu behind a confirm. */}
                      <button
                        className="tracker-menu-option tracker-menu-option-bordered tracker-menu-option-danger"
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
                ) : null}
                {rowIndex === 2 && isNotesVisible ? (
                  <button
                    aria-controls="run-notes"
                    aria-expanded={isNotesOpen || notesWindow !== null}
                    aria-label={notes.trim() ? 'Open notes (has notes)' : 'Open notes'}
                    className={notes.trim() ? 'notes-toggle has-notes' : 'notes-toggle'}
                  data-tip="Notes"
                    onClick={openNotes}
                    type="button"
                  >
                    <NotebookPen aria-hidden="true" size={28} strokeWidth={2.25} />
                  </button>
                ) : null}
              </div>
            ))}

            <div className="section-divider section-divider-locations" />

            {/* Laid over the whole location block rather than floating as a modal,
                so the rest of the board stays readable while notes are typed. */}
            {isNotesVisible && isNotesOpen ? (
              <section
                aria-labelledby="run-notes-title"
                className="notes-panel"
                id="run-notes"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setIsNotesOpen(false)
                }}
              >
                <div className="notes-panel-header">
                  <h2 className="notes-panel-title" id="run-notes-title">
                    Notes <span className="notes-panel-hint">(menu to open in new window)</span>
                  </h2>
                  <button
                    aria-label="Close notes"
                    className="notes-panel-close"
                    onClick={() => setIsNotesOpen(false)}
                    type="button"
                  >
                    <X aria-hidden="true" size={20} strokeWidth={3} />
                  </button>
                </div>
                <label className="sr-only" htmlFor="run-notes-text">
                  Run notes
                </label>
                <textarea
                  className="notes-panel-text"
                  ref={focusAtEnd}
                  id="run-notes-text"
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Type notes for this run..."
                  spellCheck={false}
                  value={notes}
                />
              </section>
            ) : null}

            {notesWindow
              ? createPortal(
                  <section
                    aria-labelledby="popout-notes-title"
                    className="notes-panel is-popout"
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') closeNotesWindow()
                    }}
                  >
                    <div className="notes-panel-header">
                      <h1 className="notes-panel-title" id="popout-notes-title">
                        Notes
                      </h1>
                      <button
                        aria-label="Close notes window"
                        className="notes-panel-close"
                        onClick={closeNotesWindow}
                        type="button"
                      >
                        <X aria-hidden="true" size={20} strokeWidth={3} />
                      </button>
                    </div>
                    <label className="sr-only" htmlFor="popout-notes-text">
                      Run notes
                    </label>
                    <textarea
                      className="notes-panel-text"
                      ref={focusAtEnd}
                      id="popout-notes-text"
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Type notes for this run..."
                      spellCheck={false}
                      value={notes}
                    />
                  </section>,
                  notesWindow.document.body,
                )
              : null}

            {/* The collection + maps are the board's lower half in portrait; in
                landscape they become the right column. Wrapping them in one box
                lets a single CSS rule re-base the whole group into the second
                lane. In portrait the wrapper is `display:contents`, so it emits
                no box and these children position against the canvas as before. */}
            <div className="landscape-col">
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

            {/* Closes the collection off. In portrait/landscape with maps shown it
                brackets the overworld maps below; with maps hidden it still caps
                the collection so the right lane keeps its bottom separator. */}
            <div className="section-divider section-divider-collection" />

            {/* The two overworlds, with the icon palette between them so either
                map is an equally short trip from the icon being placed. Optional,
                since a run that is not mapping the overworld has no use for the
                tallest block on the board. */}
            {isMapVisible ? (
            <>
            <section
              aria-label="Overworld maps"
              className={`overworld${mapMove ? ` overworld-move-${mapMove.phase}` : ''}${heldIcon ? ' overworld-holding' : ''}`}
              // Middle click toggles move mode for the maps.
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  toggleMapMoveMode()
                }
              }}
              // Middle click otherwise triggers autoscroll.
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                }
              }}
            >
              <p aria-live="polite" className="sr-only">
                {mapMove?.phase === 'move'
                  ? `Moving ${mapMove.picked.length} icon${mapMove.picked.length === 1 ? '' : 's'}. Left click a square to place them, or press Escape to cancel.`
                  : mapMove
                    ? 'Move mode. Drag across map squares to select icons. Middle click or Escape to exit.'
                    : ''}
              </p>
              {OVERWORLDS.map((world, worldIndex) => {
                const preview = getMovePreview(world.id)
                const selection =
                  mapMove?.phase === 'select' &&
                  mapMove.worldId === world.id &&
                  mapMove.from &&
                  mapMove.to
                    ? {
                        top: Math.min(mapMove.from.row, mapMove.to.row),
                        bottom: Math.max(mapMove.from.row, mapMove.to.row),
                        left: Math.min(mapMove.from.column, mapMove.to.column),
                        right: Math.max(mapMove.from.column, mapMove.to.column),
                      }
                    : null

                return (
                <Fragment key={world.id}>
                  {/* Labelled on their outer sides, in the open space beside each map,
                      so the band's height stays with the squares. Screen readers get
                      the name from the grid's own label instead. */}
                  {worldIndex === 0 ? (
                    <span aria-hidden="true" className="overworld-side-label">
                      <span className="overworld-side-text">{world.name.toUpperCase()}</span>
                    </span>
                  ) : null}
                  <div
                    aria-label={`${world.name} overworld grid`}
                    className="overworld-grid"
                    role="grid"
                  >
                    {Array.from({ length: OVERWORLD_SIZE }, (_, row) => (
                      <div className="overworld-row" key={row} role="row">
                        {Array.from({ length: OVERWORLD_SIZE }, (_, column) => {
                          const cellKey = `${world.id}-${row}-${column}`
                          const gridKey = `${row}-${column}`
                          const ghostIcon = preview?.ghosts.get(gridKey)
                          const shownIcon =
                            ghostIcon ??
                            (preview?.lifted.has(gridKey) ||
                            heldIcon?.from === cellKey
                              ? undefined
                              : overworldCells[cellKey])
                          const icon = findMapIcon(shownIcon)
                          const isSelected =
                            selection !== null &&
                            row >= selection.top &&
                            row <= selection.bottom &&
                            column >= selection.left &&
                            column <= selection.right
                          const cellClassName = [
                            'overworld-cell',
                            isSelected ? 'overworld-cell-selected' : '',
                            ghostIcon
                              ? preview?.isValid
                                ? 'overworld-cell-ghost'
                                : 'overworld-cell-ghost overworld-cell-ghost-invalid'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')
                          // Grids are read out in the 1-based coordinates a
                          // player would say out loud, not the 0-based indexes.
                          const position = `row ${row + 1}, column ${column + 1}`

                          return (
                            <button
                              aria-label={
                                icon
                                  ? `${world.name} ${position}: ${icon.name}. Right click to change.`
                                  : `${world.name} ${position}: empty. Right click to place an icon.`
                              }
                              aria-haspopup="menu"
                              aria-expanded={mapMenu?.cellKey === cellKey}
                              className={
                                mapMenu?.cellKey === cellKey
                                  ? `${cellClassName} overworld-cell-open`
                                  : cellClassName
                              }
                              data-cell-key={cellKey}
                              data-tip={icon?.name}
                              key={column}
                              // Middle click on an icon removes it. Empty squares,
                              // and any square while move mode is on, let the click
                              // reach the section so it still toggles move mode.
                              onAuxClick={(event) => {
                                if (
                                  event.button !== 1 ||
                                  mapMove ||
                                  !overworldCells[cellKey]
                                ) {
                                  return
                                }

                                event.preventDefault()
                                event.stopPropagation()
                                clearMapCell(cellKey)
                              }}
                              onClick={() => {
                                swallowNextCellClickRef.current = false
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault()

                                if (heldIcon) {
                                  setHeldIcon(null)
                                  return
                                }

                                if (!mapMove) {
                                  openMapMenu(event.currentTarget, cellKey)
                                }
                              }}
                              // In move mode a left press starts the selection
                              // box, or drops the lifted icons. Pressed rather
                              // than clicked, so the release that ends a box
                              // cannot also count as the drop.
                              onMouseDown={(event) => {
                                if (event.button !== 0) {
                                  return
                                }

                                // A held copy drops on the square clicked.
                                if (heldIcon && !heldIcon.from) {
                                  event.preventDefault()
                                  const placed = heldIcon.icon
                                  setOverworldCells((current) => ({
                                    ...current,
                                    [cellKey]: placed,
                                  }))
                                  setHeldIcon(null)
                                  return
                                }

                                swallowNextCellClickRef.current = mapMove !== null

                                if (!mapMove) {
                                  const placed = overworldCells[cellKey]

                                  if (placed) {
                                    // Also stops the browser's own image drag.
                                    event.preventDefault()
                                    const size =
                                      event.currentTarget.getBoundingClientRect().width

                                    if (
                                      event.shiftKey &&
                                      DUPLICABLE_MAP_ICONS.has(placed)
                                    ) {
                                      setHeldIcon({
                                        icon: placed,
                                        from: null,
                                        size,
                                        x: event.clientX,
                                        y: event.clientY,
                                      })
                                    } else {
                                      pendingMapDragRef.current = {
                                        cellKey,
                                        icon: placed,
                                        x: event.clientX,
                                        y: event.clientY,
                                        size,
                                      }
                                    }
                                  }
                                  return
                                }

                                event.preventDefault()

                                if (mapMove.phase === 'select') {
                                  setMapMove({
                                    phase: 'select',
                                    worldId: world.id,
                                    from: { row, column },
                                    to: { row, column },
                                  })
                                } else {
                                  dropMovedIcons(world.id, { row, column })
                                }
                              }}
                              onMouseEnter={() => {
                                if (mapMove) {
                                  hoverMapCell(world.id, { row, column })
                                }
                              }}
                              role="gridcell"
                              type="button"
                            >
                              {icon?.kind === 'icon' ? (
                                <Image
                                  alt=""
                                  className="overworld-cell-icon"
                                  height={16}
                                  src={icon.src}
                                  width={16}
                                />
                              ) : icon?.kind === 'item' ? (
                                <span
                                  aria-hidden="true"
                                  className="overworld-cell-icon overworld-cell-item"
                                >
                                  <ItemArt item={icon.item} />
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
  </div>
  ))}
  </div>
  {worldIndex === OVERWORLDS.length - 1 ? (
    <span aria-hidden="true" className="overworld-side-label">
      <span className="overworld-side-text">{world.name.toUpperCase()}</span>
    </span>
  ) : null}
</Fragment>
                )
              })}
              {renderMapMenu()}
              {heldIcon ? renderHeldIcon(heldIcon) : null}
            </section>
            </>
            ) : null}
            </div>

            {/* Closes the menu on any outside click, since the board takes no
                keystrokes and so has no Escape to fall back on. */}
            {isMenuOpen || isFlagsOpen ? (
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

            {isShowingInstallHelp ? (
              <FramedDialog
                className="framed-controls framed-install"
                onClose={() => setIsShowingInstallHelp(false)}
                title="Install as App"
                titleId="install-title"
              >
                <div className="controls-groups install-groups">
                  <section className="controls-group">
                    <h3 className="controls-group-title">How to install</h3>
                    <dl className="controls-list">
                      {INSTALL_STEPS.map((step) => (
                        <div className="controls-row" key={step.input}>
                          <dt className="controls-input">{step.input}</dt>
                          <dd className="controls-effect">{step.effect}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>
              </FramedDialog>
            ) : null}

            {pendingPreset ? (
              <FramedDialog
                actions={
                  <>
                    <button
                      className="updates-close"
                      onClick={() => setPendingPreset(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      autoFocus
                      className="updates-close"
                      onClick={() => {
                        applyPreset(pendingPreset)
                        setPendingPreset(null)
                      }}
                      type="button"
                    >
                      Yes
                    </button>
                  </>
                }
                className="framed-disclosure framed-confirm"
                onClose={() => setPendingPreset(null)}
                title="Change Flags?"
                titleId="flags-confirm-title"
              >
                <div className="framed-disclosure-body">
                  <p>
                    Loading {pendingPreset.name} will clear your tracker. Are you
                    sure?
                  </p>
                </div>
              </FramedDialog>
            ) : null}

            {isConfirmingClear ? (
              <FramedDialog
                actions={
                  <>
                    <button
                      className="updates-close"
                      onClick={() => setIsConfirmingClear(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      autoFocus
                      className="updates-close"
                      onClick={() => {
                        clearTracker()
                        setHasPickedFlags(false)
                        setIsConfirmingClear(false)
                      }}
                      type="button"
                    >
                      Yes
                    </button>
                  </>
                }
                className="framed-disclosure framed-confirm"
                onClose={() => setIsConfirmingClear(false)}
                title="Clear Tracker?"
                titleId="clear-confirm-title"
              >
                <div className="framed-disclosure-body">
                  <p>
                    This will clear your tracker and your selected flags. Are you
                    sure?
                  </p>
                </div>
              </FramedDialog>
            ) : null}

            {isShowingAiDisclosure ? (
              <FramedDialog
                className="framed-disclosure"
                onClose={() => setIsShowingAiDisclosure(false)}
                title="AI Disclosure"
                titleId="ai-disclosure-title"
              >
                <div className="framed-disclosure-body">
                  <p>
                    This tracker is made with the use of Assistive AI with Vercel.
                    I am not a coder, programmer, or designer, so this tool is
                    critical to my ability to make rapid changes to the tracker.
                  </p>
                  <p>
                    No generative AI was used. All art is pulled from NES sprite
                    sheets found online.
                  </p>
                  <p>
                    I understand if you don&apos;t approve and stop using the
                    tracker.
                  </p>
                  <p>
                    Thanks,
                    <br />
                    Gob
                  </p>
                </div>
              </FramedDialog>
            ) : null}

            {isShowingControls ? (
              <FramedDialog
                className="framed-controls"
                onClose={() => setIsShowingControls(false)}
                title="Controls"
                titleId="controls-title"
              >
                  <div className="controls-groups">
                    {CONTROL_GROUPS.map((group) => (
                      <section
                        className={
                          group.tall
                            ? 'controls-group controls-group-tall'
                            : 'controls-group'
                        }
                        key={group.title}
                      >
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

                        {group.link ? (
                          <a
                            className="controls-link"
                            href={group.link.href}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            {group.link.label}
                          </a>
                        ) : null}
                      </section>
                    ))}
                  </div>
              </FramedDialog>
            ) : null}

            {/* Rendered last so the menu floats over the boss icons and slots. */}
            {openSlot
              ? renderItemPicker(
                  slotLabel(openSlot),
                  (itemId) => assignItem(openSlot, itemId),
                  () => setOpenSlot(null),
                )
              : null}
            {mapItemPickerCell
              ? renderItemPicker(
                  'MAP',
                  (itemId) => placeMapItem(mapItemPickerCell, itemId),
                  () => setMapItemPickerCell(null),
                )
              : null}

            <div className="lane-divider" />
      <div className="frame-rail frame-rail-top" />
            <div className="frame-rail frame-rail-right" />
            <div className="frame-rail frame-rail-bottom" />
            <div className="frame-rail frame-rail-left" />
            <div className="frame-corner frame-corner-top-left" />
            <div className="frame-corner frame-corner-top-right" />
            <div className="frame-corner frame-corner-bottom-right" />
            <div className="frame-corner frame-corner-bottom-left" />
          </div>
          {/* A sibling of the board rather than a child: the board is role="img",
              which would hide the dialog's controls from assistive tech. */}
          <UpdatesDialog openRequest={updatesOpenRequest} />
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
