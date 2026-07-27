'use client'

import Image from 'next/image'
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'

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

// The six palace bosses fill a 2-column grid, reading left to right, top to bottom.
const palaces = [
  { name: 'Horsehead', src: '/images/palaces/horsehead.png' },
  { name: 'Helmethead', src: '/images/palaces/helmethead.png' },
  { name: 'Rebonack', src: '/images/palaces/rebonack.png' },
  { name: 'Karock', src: '/images/palaces/karock.png' },
  { name: 'Gooma', src: '/images/palaces/gooma.png' },
  { name: 'Barba', src: '/images/palaces/barba.png' },
]

// Thunderbird guards the Great Palace, so it sits centered below the grid.
const finalBoss = {
  name: 'Thunderbird',
  src: '/images/palaces/thunderbird.png',
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
            <h1 className="canvas-title">TOWNS</h1>

            <div aria-label="Town locations" className="town-grid">
              {towns.map((town) => (
                <div className="town-column" key={town.name}>
                  <div className="town-icon">
                    <Image
                      alt={`${town.name} town`}
                      height={32}
                      src={town.src}
                      width={32}
                    />
                  </div>
                  <Image
                    alt={`${town.name} wizard`}
                    className="town-wizard"
                    height={32}
                    src="/images/z2-wizard.png"
                    width={32}
                  />
                </div>
              ))}
            </div>

            <div className="section-divider" />

            <h2 className="canvas-title canvas-title-palaces">PALACES</h2>

            <div aria-label="Palace locations" className="palace-grid">
              {palaces.map((palace) => (
                <div className="town-column" key={palace.name}>
                  <div className="town-icon">
                    <Image
                      alt={`${palace.name} palace boss`}
                      height={32}
                      src={palace.src}
                      width={32}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="palace-final">
              <div className="town-icon">
                <Image
                  alt={`${finalBoss.name} palace boss`}
                  height={32}
                  src={finalBoss.src}
                  width={32}
                />
              </div>
            </div>

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
