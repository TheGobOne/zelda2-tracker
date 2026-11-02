'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import {
  MENU_SHAPES,
  OPPOSITE,
  PALACE_PAGES,
  PALACE_ROWS,
  ROLES,
  SHAPE_NAMES,
  SIDES,
  STEP,
  joinExits,
  joinFacingNeighbours,
  parsePalaceLinks,
  parsePalaceRooms,
  pickDeadEnd,
  requiredExit,
  roomKey,
  rotateExits,
  sameEnd,
  shapeOf,
  touches,
  withRequiredExit,
  type PalaceLink,
  type PalaceLinkEnd,
  type PalacePage,
  type PalaceRole,
  type PalaceRoom,
  type Shape,
  type Side,
} from '@/lib/palace-logic'

export { PALACE_PAGES, parsePalaceLinks, parsePalaceRooms }
export type { PalaceLink, PalaceLinkEnd, PalacePage, PalaceRoom }

const LINK_COLOUR = '#e52a08'

const WHITE = '#f5f5f5'
const GOLD = '#f2b21c'

/** One square's art, drawn on a 24-unit square so the doorways meet the neighbours' own. */
function RoomArt({ room }: { room: PalaceRoom }) {
  const has = (side: Side) => room.exits.includes(side)

  return (
    <svg aria-hidden="true" className="palace-cell-art" viewBox="0 0 24 17">
      {has('N') ? <rect fill={WHITE} height="9" width="4" x="10" y="-0.5" /> : null}
      {has('S') ? <rect fill={WHITE} height="9" width="4" x="10" y="8.5" /> : null}
      {has('W') ? <rect fill={WHITE} height="4" width="12.5" x="-0.5" y="6.5" /> : null}
      {has('E') ? <rect fill={WHITE} height="4" width="12.5" x="12" y="6.5" /> : null}
      <rect
        fill={room.role === 'boss' ? '#780800' : '#19193c'}
        height="12"
        stroke={room.role === 'boss' ? '#e52a08' : WHITE}
        strokeWidth="1.5"
        width="16"
        x="4"
        y="2.5"
      />
      {room.role === 'up' || room.role === 'down' ? (
        <>
          <path d="M6.5 4.5h6v2h-4v1.5h3v2h-3v1.5h4v2h-6z" fill={GOLD} />
          <polygon
            fill={GOLD}
            points={room.role === 'up' ? '17,5 14.8,9.5 19.2,9.5' : '17,12 14.8,7.5 19.2,7.5'}
          />
        </>
      ) : null}
      {room.role === 'item' ? (
        <path d="M9.5 4.5h5v2H13v4h1.5v2h-5v-2H11v-4H9.5z" fill={GOLD} />
      ) : null}
      {room.role === 'boss' ? (
        <>
          <circle cx="12" cy="7.3" fill={WHITE} r="3.6" />
          <rect fill={WHITE} height="2.4" width="3.6" x="10.2" y="9.6" />
          <circle cx="10.4" cy="6.8" fill="#101010" r="1" />
          <circle cx="13.6" cy="6.8" fill="#101010" r="1" />
        </>
      ) : null}
    </svg>
  )
}

type LinkMetrics = {
  x0: number
  y0: number
  width: number
  height: number
  pitchX: number
  pitchY: number
}
type LinkPoint = { x: number; y: number; side: Side | null }

/** Where a doorway meets the edge of its square, in the wrapper's own pixels. */
function endPoint(metrics: LinkMetrics, end: PalaceLinkEnd): LinkPoint {
  const halfWidth = metrics.width / 2
  const halfHeight = metrics.height / 2
  const centreX = metrics.x0 + end.column * metrics.pitchX + halfWidth
  const centreY = metrics.y0 + end.row * metrics.pitchY + halfHeight
  const step = STEP[end.side]
  return {
    x: centreX + step.column * halfWidth,
    y: centreY + step.row * halfHeight,
    side: end.side,
  }
}

/** A curve that leaves each doorway in the direction it faces, so it reads as a passage. */
function LinkLine({ from, to }: { from: LinkPoint; to: LinkPoint }) {
  const reach = Math.max(24, Math.hypot(to.x - from.x, to.y - from.y) * 0.4)
  const lead = (point: LinkPoint) =>
    point.side
      ? { x: point.x + STEP[point.side].column * reach, y: point.y + STEP[point.side].row * reach }
      : { x: point.x, y: point.y }
  const first = lead(from)
  const second = lead(to)

  return (
    <>
      <path
        d={`M${from.x} ${from.y} C${first.x} ${first.y} ${second.x} ${second.y} ${to.x} ${to.y}`}
        fill="none"
        stroke={LINK_COLOUR}
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx={from.x} cy={from.y} fill={LINK_COLOUR} r="2.5" />
      {to.side ? <circle cx={to.x} cy={to.y} fill={LINK_COLOUR} r="2.5" /> : null}
    </>
  )
}

function describeRoom(room: PalaceRoom | undefined) {
  if (!room) return 'empty'
  const role = ROLES.find((entry) => entry.id === room.role)?.label
  const shape = SHAPE_NAMES[shapeOf(room.exits)]
  return `${role ? `${role}, ` : ''}${shape}, exits ${room.exits || 'none'}`
}

type PalaceMenu = { row: number; column: number; left: number; top: number; size: number }

/**
 * A palace's rooms on a fresh grid. Left click turns a room, right click opens
 * the menu to place or change one, middle click clears it. Rooms with doorways
 * that face each other join by themselves.
 */
export function PalaceGrid({
  links,
  onChange,
  onLinksChange,
  page,
  rooms,
}: {
  links: PalaceLink[]
  onChange: (rooms: Record<string, PalaceRoom>) => void
  onLinksChange: (links: PalaceLink[]) => void
  page: PalacePage
  rooms: Record<string, PalaceRoom>
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<PalaceMenu | null>(null)
  // Where the squares sit inside the wrapper, for drawing links over them.
  const [metrics, setMetrics] = useState<LinkMetrics | null>(null)
  // A link being dragged out of a doorway: its start, and where the pointer is now.
  const [drag, setDrag] = useState<{ from: PalaceLinkEnd; x: number; y: number } | null>(null)
  const swallowClickRef = useRef(false)
  const pageLinks = links.filter((link) => link.page === page.id)

  // Measured after every render rather than once per page, so the links follow the
  // squares however the layout changes (a new size, a font loading, a popout window).
  useLayoutEffect(() => {
    const cells = wrapRef.current?.querySelectorAll<HTMLElement>('.palace-cell')
    if (!cells || cells.length < 2) return

    const next: LinkMetrics = {
      x0: cells[0].offsetLeft,
      y0: cells[0].offsetTop,
      width: cells[0].offsetWidth,
      height: cells[0].offsetHeight,
      pitchX: cells[1].offsetLeft - cells[0].offsetLeft,
      pitchY: (cells[page.columns]?.offsetTop ?? cells[0].offsetTop) - cells[0].offsetTop,
    }
    setMetrics((current) =>
      current && (Object.keys(next) as (keyof LinkMetrics)[]).every((key) => current[key] === next[key])
        ? current
        : next,
    )
  })

  // A different page is a different set of squares.
  useEffect(() => setMenu(null), [page.id])

  useLayoutEffect(() => {
    const element = menuRef.current
    const wrap = wrapRef.current
    if (!menu || !element || !wrap) return

    // A whole square of clearance, so the rooms right beside the one being placed stay
    // in view: a dead end's direction depends on them.
    const gap = menu.size + 4
    // The menu is wider than the grid, so it may stick out beside it, but only as far
    // as the maps section reaches.
    const section = wrap.offsetParent as HTMLElement | null
    const minLeft = section ? 4 - wrap.offsetLeft : -Infinity
    const maxLeft = section
      ? section.offsetWidth - wrap.offsetLeft - element.offsetWidth - 4
      : Infinity
    let left = menu.left + menu.size + gap
    if (left > maxLeft) {
      left = menu.left - element.offsetWidth - gap
    }
    left = Math.max(minLeft, Math.min(left, maxLeft))
    const top = Math.max(
      0,
      Math.min(menu.top + menu.size / 2 - element.offsetHeight / 2, wrap.offsetHeight - element.offsetHeight),
    )
    element.style.left = `${left}px`
    element.style.top = `${top}px`
    // The menu itself takes focus, not its first button, which would draw a focus box on Dead end.
    element.focus({ preventScroll: true })
  }, [menu])

  const isMenuOpen = menu !== null
  useEffect(() => {
    const doc = wrapRef.current?.ownerDocument
    if (!isMenuOpen || !doc) return

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    doc.addEventListener('mousedown', onPointerDown)
    doc.addEventListener('keydown', onKeyDown)
    return () => {
      doc.removeEventListener('mousedown', onPointerDown)
      doc.removeEventListener('keydown', onKeyDown)
    }
  }, [isMenuOpen])

  function setRoom(row: number, column: number, room: PalaceRoom | null) {
    const next = { ...rooms }
    const key = roomKey(page.id, row, column)
    if (room) next[key] = room
    else delete next[key]
    onChange(next)
  }

  /** Drops links from a room's doorways that it no longer has. */
  function pruneLinks(row: number, column: number, exits: string) {
    const kept = links.filter(
      (link) =>
        link.page !== page.id ||
        ![link.a, link.b].some(
          (end) => end.row === row && end.column === column && !exits.includes(end.side),
        ),
    )
    if (kept.length !== links.length) onLinksChange(kept)
  }

  function removeLinksAt(row: number, column: number) {
    const kept = links.filter((link) => link.page !== page.id || !touches(link, row, column))
    if (kept.length !== links.length) onLinksChange(kept)
  }

  function sideAt(cell: Element, clientX: number, clientY: number): Side {
    const box = cell.getBoundingClientRect()
    const dx = clientX - (box.left + box.width / 2)
    const dy = clientY - (box.top + box.height / 2)
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N'
  }

  /** Starts a possible drag from a room; it only becomes a link once released on another room. */
  function beginDrag(event: ReactMouseEvent<HTMLButtonElement>, row: number, column: number) {
    const wrap = wrapRef.current
    const doc = wrap?.ownerDocument
    if (!wrap || !doc) return

    event.preventDefault()
    const from: PalaceLinkEnd = {
      row,
      column,
      side: sideAt(event.currentTarget, event.clientX, event.clientY),
    }
    const startX = event.clientX
    const startY = event.clientY
    let moved = false

    function toWrap(clientX: number, clientY: number) {
      const box = wrap!.getBoundingClientRect()
      const scale = box.width / wrap!.offsetWidth || 1
      return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale }
    }
    function onMove(move: MouseEvent) {
      if (!moved && Math.hypot(move.clientX - startX, move.clientY - startY) < 5) return
      moved = true
      setDrag({ from, ...toWrap(move.clientX, move.clientY) })
    }
    function onUp(up: MouseEvent) {
      doc!.removeEventListener('mousemove', onMove)
      doc!.removeEventListener('mouseup', onUp)
      setDrag(null)
      if (!moved) return

      swallowClickRef.current = true
      const target = (up.target as Element | null)?.closest<HTMLElement>('.palace-cell')
      const toRow = Number(target?.dataset.row)
      const toColumn = Number(target?.dataset.column)
      if (!target || (toRow === row && toColumn === column)) return
      if (!rooms[roomKey(page.id, toRow, toColumn)]) return

      // A passage is walked out of one side and in through the other: left to right,
      // or up to down. Anything else is not a link.
      const side = sideAt(target, up.clientX, up.clientY)
      if (side !== OPPOSITE[from.side]) return

      addLink(from, { row: toRow, column: toColumn, side })
    }
    doc.addEventListener('mousemove', onMove)
    doc.addEventListener('mouseup', onUp)
  }

  /** Joins two doorways, giving either room the doorway if it did not have it yet. */
  function addLink(a: PalaceLinkEnd, b: PalaceLinkEnd) {
    const next = { ...rooms }
    for (const end of [a, b]) {
      const key = roomKey(page.id, end.row, end.column)
      const room = next[key]
      if (room && !room.exits.includes(end.side)) {
        next[key] = { ...room, exits: joinExits([...room.exits, end.side] as Side[]) }
      }
    }
    onChange(next)
    const exists = pageLinks.some(
      (link) =>
        (sameEnd(link.a, a) && sameEnd(link.b, b)) || (sameEnd(link.a, b) && sameEnd(link.b, a)),
    )
    if (!exists) onLinksChange([...links, { page: page.id, a, b }])
  }

  /** What a menu shape would become on the open square once its neighbours join it. */
  function shapeExits(shape: (typeof MENU_SHAPES)[number]) {
    if (!menu) return { base: '', joined: '' }
    const role = rooms[roomKey(page.id, menu.row, menu.column)]?.role
    const base = withRequiredExit(
      shape.exits
        ? joinExits(shape.exits)
        : pickDeadEnd(rooms, page.id, menu.row, menu.column, role),
      role,
    )
    return {
      base,
      joined: joinFacingNeighbours(base, rooms, page.id, menu.row, menu.column),
    }
  }

  function chooseShape(shape: (typeof MENU_SHAPES)[number]) {
    if (!menu) return
    const current = rooms[roomKey(page.id, menu.row, menu.column)]
    const exits = shapeExits(shape).joined
    setRoom(menu.row, menu.column, current?.role ? { exits, role: current.role } : { exits })
    pruneLinks(menu.row, menu.column, exits)
    setMenu(null)
  }

  function chooseRole(role: PalaceRole) {
    if (!menu) return
    const current = rooms[roomKey(page.id, menu.row, menu.column)]
    const exits = joinFacingNeighbours(
      withRequiredExit(
        current?.exits ?? pickDeadEnd(rooms, page.id, menu.row, menu.column, role),
        role,
      ),
      rooms,
      page.id,
      menu.row,
      menu.column,
    )
    setRoom(menu.row, menu.column, { exits, role })
    pruneLinks(menu.row, menu.column, exits)
    setMenu(null)
  }

  const current = menu ? rooms[roomKey(page.id, menu.row, menu.column)] : undefined

  return (
    <div className="palace-map" ref={wrapRef}>
      <div
        aria-label={`${page.name} map grid`}
        className="overworld-grid"
        role="grid"
      >
        {Array.from({ length: PALACE_ROWS }, (_, row) => (
          <div className="overworld-row" key={row} role="row">
            {Array.from({ length: page.columns }, (_, column) => {
              const key = roomKey(page.id, row, column)
              const room = rooms[key]
              const position = `row ${row + 1}, column ${column + 1}`

              return (
                <button
                  aria-expanded={menu?.row === row && menu.column === column}
                  aria-haspopup="menu"
                  aria-label={`${page.name} ${position}: ${describeRoom(room)}. Left click to turn, right click to change.`}
                  className={`overworld-cell palace-cell${
                    menu?.row === row && menu.column === column ? ' overworld-cell-open' : ''
                  }`}
                  data-column={column}
                  data-row={row}
                  key={column}
                  onAuxClick={(event) => {
                    if (event.button !== 1 || !room) return
                    event.preventDefault()
                    setRoom(row, column, null)
                    removeLinksAt(row, column)
                  }}
                  onClick={() => {
                    // The release that ends a link drag lands as a click on its first room.
                    if (swallowClickRef.current) {
                      swallowClickRef.current = false
                      return
                    }
                    if (!room || !room.exits) return
                    const exits = rotateExits(room.exits, room.role)
                    setRoom(row, column, { ...room, exits })
                    pruneLinks(row, column, exits)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    const cell = event.currentTarget
                    setMenu({
                      row,
                      column,
                      left: cell.offsetLeft,
                      top: cell.offsetTop,
                      size: cell.offsetWidth,
                    })
                  }}
                  onMouseDown={(event) => {
                    // Middle click otherwise starts the browser's autoscroll.
                    if (event.button === 1) event.preventDefault()
                    if (event.button === 0 && room) beginDrag(event, row, column)
                  }}
                  role="gridcell"
                  type="button"
                >
                  {room ? <RoomArt room={room} /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {metrics ? (
        <svg aria-hidden="true" className="palace-links">
          {pageLinks.map((link) => (
            <LinkLine
              from={endPoint(metrics, link.a)}
              key={`${link.a.row}-${link.a.column}-${link.a.side}-${link.b.row}-${link.b.column}-${link.b.side}`}
              to={endPoint(metrics, link.b)}
            />
          ))}
          {drag ? (
            <LinkLine from={endPoint(metrics, drag.from)} to={{ x: drag.x, y: drag.y, side: null }} />
          ) : null}
        </svg>
      ) : null}
      {menu ? (
        <div className="overworld-menu palace-menu" ref={menuRef} role="menu" tabIndex={-1}>
          <div className="palace-menu-columns">
          <div>
          <p className="overworld-menu-title">Room</p>
          <div className="palace-menu-group">
            {MENU_SHAPES.map((shape) => (
              <button
                className={`palace-menu-button${
                  current &&
                  (shape.exits
                    ? joinExits(shape.exits) === current.exits
                    : shapeOf(current.exits) === 'dead' &&
                      !MENU_SHAPES.some(
                        (fixed) => fixed.exits && joinExits(fixed.exits) === current.exits,
                      ))
                    ? ' palace-menu-button-current'
                    : ''
                }`}
                key={shape.id}
                onClick={() => chooseShape(shape)}
                role="menuitem"
                type="button"
              >
                {shape.label}
              </button>
            ))}
          </div>
          </div>
          <div>
          <p className="overworld-menu-title">Marker</p>
          <div className="palace-menu-group">
            {ROLES.map((role) => (
              <button
                className={`palace-menu-button${
                  current?.role === role.id ? ' palace-menu-button-current' : ''
                }`}
                key={role.id}
                onClick={() => chooseRole(role.id)}
                role="menuitem"
                type="button"
              >
                {role.label}
              </button>
            ))}
            {current?.role ? (
              <button
                className="palace-menu-button"
                onClick={() => {
                  setRoom(menu.row, menu.column, { exits: current.exits })
                  setMenu(null)
                }}
                role="menuitem"
                type="button"
              >
                No marker
              </button>
            ) : null}
          </div>
          </div>
          </div>
          {pageLinks.some((link) => touches(link, menu.row, menu.column)) ? (
            <button
              className="overworld-menu-clear"
              onClick={() => {
                removeLinksAt(menu.row, menu.column)
                setMenu(null)
              }}
              role="menuitem"
              type="button"
            >
              Unlink
            </button>
          ) : null}
          <button
            className="overworld-menu-clear"
            onClick={() => {
              setRoom(menu.row, menu.column, null)
              removeLinksAt(menu.row, menu.column)
              setMenu(null)
            }}
            role="menuitem"
            type="button"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  )
}
