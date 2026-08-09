'use client'

import { Check } from 'lucide-react'
import Image from 'next/image'
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { GlyphText } from '@/components/glyph-text'

const BASE_WIDTH = 600
const BASE_HEIGHT = 1200
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

// The six palace bosses sit in two columns of three, pushed to opposite edges.
const palaceColumns = [
  {
    id: 'left',
    // Mirrored so the left column faces inward, toward the right column.
    flipped: true,
    bosses: [
      { name: 'Palace 1', src: '/images/palaces/horsehead.png', maxSlots: 2 },
      { name: 'Palace 2', src: '/images/palaces/helmethead.png', maxSlots: 2 },
      { name: 'Palace 3', src: '/images/palaces/rebonack.png', maxSlots: 2 },
    ],
  },
  {
    id: 'right',
    bosses: [
      { name: 'Palace 4', src: '/images/palaces/karock.png', maxSlots: 2 },
      { name: 'Palace 5', src: '/images/palaces/gooma.png', maxSlots: 3 },
      { name: 'Palace 6', src: '/images/palaces/barba.png', maxSlots: 3 },
    ],
  },
]

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

const locationRows: LocationEntry[][] = [locationRowOne, locationRowTwo]

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
    id: 'sgl',
    name: 'SGL',
    collectedIds: ['candle', 'cross', 'fire-spell'],
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

// Requirement letters a town or boss can be tagged with. The empty entry is
// the starting state, so a full cycle returns the icon to having no letter.
const ICON_MARKS = ['', 'W', 'E', 'MI', 'DV']

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

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function TrackerFrame() {
  const [scale, setScale] = useState(0.85)
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  // Every boss starts with a single slot; middle click cycles up to its max.
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({})

  // Which item sits in each slot, keyed by boss name and slot index.
  const [slotItems, setSlotItems] = useState<Record<string, string>>({})
  // Slots marked as collected: their art dims and a green check appears.
  const [collected, setCollected] = useState<Record<string, boolean>>({})
  // Requirement letter shown over a town or boss; right click steps through
  // them. Keys are namespaced ("town-"/"boss-") so names cannot collide.
  const [iconMarks, setIconMarks] = useState<Record<string, string>>({})
  // Number shown in a counter slot, stepped through by left click.
  const [countValues, setCountValues] = useState<Record<string, string>>({})
  // Destination tagged on each connector end, keyed by row index and side. An
  // absent key means the end is still unknown and shows the "?" marker.
  const [connectorEnds, setConnectorEnds] = useState<Record<string, string>>({})
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  // Clearing is destructive, so it waits on a confirmation dialog.
  const [isConfirmingClear, setIsConfirmingClear] = useState(false)
  // Clear and the presets now live behind one hamburger button, so a single
  // flag covers the whole menu rather than just the preset list.
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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

  useEffect(() => {
    if (!openSlot) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenSlot(null)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => window.removeEventListener('keydown', handleEscape)
  }, [openSlot])

  // Escape backs out of the confirm dialog and the hamburger menu too.
  useEffect(() => {
    if (!(isConfirmingClear || isMenuOpen)) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsConfirmingClear(false)
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => window.removeEventListener('keydown', handleEscape)
  }, [isConfirmingClear, isMenuOpen])

  /** One item holder. Left click marks collected, right click opens the menu,
   *  middle click empties it. Shared by the town and palace grids. */
  function renderItemSlot(slotKey: string, label: string) {
    const item = allPickables.find((entry) => entry.id === slotItems[slotKey])
    const isCollected = Boolean(item && collected[slotKey])

    return (
      <div className="item-slot-wrap" key={slotKey}>
        <button
          aria-haspopup="dialog"
          aria-label={
            item
              ? `${label}: ${item.name}${isCollected ? ', collected' : ''}. Left click to mark collected, right click to change, middle click to clear.`
              : `${label}: empty. Right click to choose an item.`
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
          // Right click opens the item menu.
          onContextMenu={(event) => {
            event.preventDefault()
            setOpenSlot(openSlot === slotKey ? null : slotKey)
          }}
          onKeyDown={(event) => {
            // Enter opens the menu, Space marks collected.
            if (event.key === 'Enter') {
              event.preventDefault()
              setOpenSlot(openSlot === slotKey ? null : slotKey)
            }

            if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault()
              clearItem(slotKey)
            }
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

    return (
      <button
        aria-label={`${entry.name}${isCollected ? ', collected' : ', not collected'}`}
        aria-pressed={isCollected}
        className={
          isCollected
            ? 'collection-slot collection-slot-collected'
            : 'collection-slot'
        }
        key={entry.id}
        onClick={() =>
          isCollected ? clearCollectedItem(entry.id) : toggleCollected(slotKey)
        }
        type="button"
      >
        <ItemArt item={entry} />
      </button>
    )
  }

  /**
   * Steps a boss through its slot counts. The cycle runs 1 up to the max and
   * then wraps through zero, so a boss can show no item slots at all.
   */
  function cycleSlots(name: string, maxSlots: number) {
    setSlotCounts((current) => ({
      ...current,
      [name]: ((current[name] ?? 1) + 1) % (maxSlots + 1),
    }))
  }

  /** Steps an icon through the requirement letters, then back to none. */
  function cycleMark(iconKey: string) {
    setIconMarks((current) => {
      const next = { ...current }
      const index = ICON_MARKS.indexOf(current[iconKey] ?? '')
      const mark = ICON_MARKS[(index + 1) % ICON_MARKS.length]

      if (mark) {
        next[iconKey] = mark
      } else {
        delete next[iconKey]
      }

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
  function clearTracker() {
    setSlotItems({})
    setCollected({})
    setSlotCounts({})
    setIconMarks({})
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
    const nextCollected: Record<string, boolean> = {}

    for (const itemId of preset.collectedIds) {
      nextCollected[`collection-${itemId}`] = true
    }

    setSlotItems({ ...preset.placements })
    setCollected(nextCollected)
    setSlotCounts({})
    setIconMarks({})
    setCountValues({ ...preset.counts })
    setConnectorEnds({})
    setIsMenuOpen(false)
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      setScale((current) => clampScale(current + 0.05))
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setScale((current) => clampScale(current - 0.05))
    }
  }

  return (
    <div className="tracker-wrap">
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
                        cycleMark(townKey)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          cycleMark(townKey)
                        }
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
                        <span aria-hidden="true" className="icon-mark">
                          {mark}
                        </span>
                      ) : null}
                    </button>
                    {renderItemSlot(townKey, `${town.name} item`)}
                  </div>
                )
              })}
            </div>

            <div className="section-divider section-divider-towns" />

            <div aria-label="Palace locations" className="palace-grid">
              {palaceColumns.map((column) => (
                <div
                  className={`town-column palace-column-${column.id}${column.flipped ? ' town-column-flipped' : ''}`}
                  key={column.id}
                >
                  {column.bosses.map((palace) => {
                    const slots = slotCounts[palace.name] ?? 1
                    const bossKey = `boss-${palace.name}`
                    const isBeaten = Boolean(collected[bossKey])
                    const mark = iconMarks[bossKey]

                    return (
                      <div className="palace-row" key={palace.name}>
                        <button
                          aria-label={`${palace.name} palace boss${isBeaten ? ', defeated' : ''}${mark ? `, marked ${mark}` : ''}, ${slots} of ${palace.maxSlots} item slots. Left click to mark defeated, right click to cycle letters, middle click to cycle slots.`}
                          aria-pressed={isBeaten}
                          className={
                            isBeaten
                              ? 'town-icon icon-toggle boss-toggle-beaten'
                              : 'town-icon icon-toggle'
                          }
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
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') {
                              return
                            }

                            event.preventDefault()

                            // Shift+Enter steps through the letters, plain
                            // Enter cycles slots. Space marks defeated.
                            if (event.shiftKey) {
                              cycleMark(bossKey)
                            } else {
                              cycleSlots(palace.name, palace.maxSlots)
                            }
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
                  rowIndex === 0
                    ? 'location-row'
                    : 'location-row location-row-second'
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
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          setOpenSlot(openSlot === slotKey ? null : slotKey)
                        }

                        if (
                          event.key === 'Delete' ||
                          event.key === 'Backspace'
                        ) {
                          event.preventDefault()
                          clearItem(slotKey)
                        }
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

            {/* Run controls, collapsed behind one hamburger button in the
                bottom-left corner so they stay clear of the board. */}
            <div className="tracker-toolbar">
              {/* The menu opens upward, since the button sits at the frame edge
                  and there is no room below it. */}
              <div className="tracker-menu-wrap">
                {isMenuOpen ? (
                  <div
                    aria-label="Tracker options"
                    className="tracker-menu"
                    role="menu"
                  >
                    {PRESETS.map((preset) => (
                      <button
                        className="tracker-menu-option"
                        key={preset.id}
                        onClick={() => applyPreset(preset)}
                        role="menuitem"
                        type="button"
                      >
                        {preset.name}
                      </button>
                    ))}

                    {/* Clearing wipes the board, so it is set apart from the
                        presets above it and tinted with the frame's red. */}
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

                <button
                  aria-expanded={isMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Tracker options"
                  className="tracker-menu-toggle"
                  onClick={() => setIsMenuOpen((current) => !current)}
                  type="button"
                >
                  {/* Three chunky bars, drawn as blocks to match the pixel art
                      rather than a thin vector icon. */}
                  <span aria-hidden="true" className="tracker-menu-bar" />
                  <span aria-hidden="true" className="tracker-menu-bar" />
                  <span aria-hidden="true" className="tracker-menu-bar" />
                </button>
              </div>
            </div>

            {/* Closes the menu on any outside click. */}
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
            onKeyDown={handleKeyDown}
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
