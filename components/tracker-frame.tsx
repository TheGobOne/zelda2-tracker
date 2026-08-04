'use client'

import { Check } from 'lucide-react'
import Image from 'next/image'
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

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

// Thunderbird guards the Great Palace, so it sits centered below the grid.
const finalBoss = {
  name: 'Thunderbird',
  src: '/images/palaces/thunderbird.png',
}

// Overworld item locations, shown in one row in upload order. Unlike towns and
// palaces these have no separate slot box: the chosen item draws over the art.
const locations = [
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
function ItemArt({ item }: { item: (typeof items)[number] }) {
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

  return <Image alt={item.name} height={32} src={item.src} width={32} />
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
  const [openSlot, setOpenSlot] = useState<string | null>(null)

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

  /** One item holder. Left click marks collected, right click opens the menu,
   *  middle click empties it. Shared by the town and palace grids. */
  function renderItemSlot(slotKey: string, label: string) {
    const item = items.find((entry) => entry.id === slotItems[slotKey])
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
              size={22}
              strokeWidth={4}
            />
          ) : null}
        </button>
      </div>
    )
  }

  function cycleSlots(name: string, maxSlots: number) {
    setSlotCounts((current) => ({
      ...current,
      [name]: ((current[name] ?? 1) % maxSlots) + 1,
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
            transform: `scale(${scale})`,
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
                            <span aria-hidden="true" className="icon-mark">
                              {mark}
                            </span>
                          ) : null}
                          {isBeaten ? (
                            <Check
                              aria-hidden="true"
                              className="item-slot-check"
                              size={22}
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

            <div className="palace-final">
              <button
                aria-label={`${finalBoss.name} palace boss${collected[`boss-${finalBoss.name}`] ? ', defeated' : ''}${iconMarks[`boss-${finalBoss.name}`] ? `, marked ${iconMarks[`boss-${finalBoss.name}`]}` : ''}. Left click to mark defeated, right click to cycle letters.`}
                aria-pressed={Boolean(collected[`boss-${finalBoss.name}`])}
                className={
                  collected[`boss-${finalBoss.name}`]
                    ? 'town-icon icon-toggle boss-toggle-beaten'
                    : 'town-icon icon-toggle'
                }
                onClick={() => toggleCollected(`boss-${finalBoss.name}`)}
                // Right click steps through the requirement letters.
                onContextMenu={(event) => {
                  event.preventDefault()
                  cycleMark(`boss-${finalBoss.name}`)
                }}
                type="button"
              >
                <Image
                  alt={`${finalBoss.name} palace boss`}
                  height={32}
                  src={finalBoss.src}
                  width={32}
                />
                {iconMarks[`boss-${finalBoss.name}`] ? (
                  <span aria-hidden="true" className="icon-mark">
                    {iconMarks[`boss-${finalBoss.name}`]}
                  </span>
                ) : null}
                {collected[`boss-${finalBoss.name}`] ? (
                  <Check
                    aria-hidden="true"
                    className="item-slot-check"
                    size={22}
                    strokeWidth={4}
                  />
                ) : null}
              </button>
            </div>

            <div className="section-divider section-divider-bosses" />

            <div aria-label="Overworld item locations" className="location-row">
              {locations.map((location) => {
                const slotKey = `location-${location.name}`
                const item = items.find(
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
                    <Image
                      alt={location.name}
                      height={32}
                      src={location.src}
                      width={32}
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
                        size={22}
                        strokeWidth={4}
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>

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
                  <p className="item-picker-title">{slotLabel(openSlot)}</p>
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
