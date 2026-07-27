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

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function TrackerFrame() {
  const [scale, setScale] = useState(0.85)
  const dragRef = useRef<{ x: number; y: number; scale: number } | null>(null)

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    dragRef.current = { x: event.clientX, y: event.clientY, scale }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current

    if (!drag) {
      return
    }

    const deltaX = (event.clientX - drag.x) / BASE_WIDTH
    const deltaY = (event.clientY - drag.y) / BASE_HEIGHT

    setScale(clampScale(drag.scale + (deltaX + deltaY)))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = null

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div className="tracker-wrap">
      <label className="tracker-size-control" htmlFor="tracker-size">
        <span className="tracker-size-label">Tracker size</span>
        <input
          className="tracker-size-range"
          id="tracker-size"
          max={MAX_SCALE}
          min={MIN_SCALE}
          onChange={(event) => setScale(clampScale(Number(event.target.value)))}
          step={0.01}
          type="range"
          value={scale}
        />
        <output className="tracker-size-value">{Math.round(scale * 100)}%</output>
      </label>

      <div
        className="tracker-stage"
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

        <button
          aria-label="Drag to resize the tracker"
          className="tracker-resize-handle"
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          type="button"
        >
          <span className="sr-only">Drag to resize the tracker</span>
        </button>
      </div>
    </div>
  )
}
