'use client'

import { useEffect, useRef, useState } from 'react'

// Bump this when the list changes so players who opted out see the new notes once.
const UPDATES_VERSION = '2026-10-notes-tooltips'
const UPDATES_STORAGE_KEY = 'z2-tracker-updates-dismissed'

const UPDATES = [
  'Added Notes section (highlights when text is entered)',
  'Added Tooltips for virtually all tracker icons (can be disabled in gear menu)',
  'Added Palace Image Tooltips (can be disabled in gear menu)',
  'Increased Mapping grid to 11x11 (from 9x9)',
  'Added the ability to select and move icons on your map (middle-click enters/exits, left click to place)',
  'Added Local Browser Save so your settings (Hide Maps, Landscape, etc) will remain as they are when reloading',
]

function isDismissed() {
  try {
    return window.localStorage.getItem(UPDATES_STORAGE_KEY) === UPDATES_VERSION
  } catch {
    // Blocked storage: show the notes, they just can't be silenced.
    return false
  }
}

/** `openRequest` increments each time the menu asks to show the popup again. */
export function UpdatesDialog({ openRequest = 0 }: { openRequest?: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [doNotShowAgain, setDoNotShowAgain] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isDismissed()) setIsOpen(true)
  }, [])

  useEffect(() => {
    if (openRequest === 0) return
    // Mirror the saved choice so closing a manual reopen doesn't undo it.
    setDoNotShowAgain(isDismissed())
    setIsOpen(true)
  }, [openRequest])

  useEffect(() => {
    if (isOpen) closeRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  if (!isOpen) return null

  const close = () => {
    try {
      if (doNotShowAgain) {
        window.localStorage.setItem(UPDATES_STORAGE_KEY, UPDATES_VERSION)
      } else {
        window.localStorage.removeItem(UPDATES_STORAGE_KEY)
      }
    } catch {
      // Storage unavailable; the popup simply returns next visit.
    }
    setIsOpen(false)
  }

  return (
    <div
      className="updates-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        aria-labelledby="updates-title"
        aria-modal="true"
        className="updates-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
          }
        }}
        role="dialog"
      >
        <span aria-hidden="true" className="updates-corner updates-corner-top-left" />
        <span aria-hidden="true" className="updates-corner updates-corner-top-right" />
        <span aria-hidden="true" className="updates-corner updates-corner-bottom-right" />
        <span aria-hidden="true" className="updates-corner updates-corner-bottom-left" />
        <h2 className="updates-title" id="updates-title">
          Updates
        </h2>
        <ul className="updates-list">
          {UPDATES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="updates-footer">
          <label className="updates-checkbox">
            <input
              checked={doNotShowAgain}
              onChange={(event) => setDoNotShowAgain(event.target.checked)}
              type="checkbox"
            />
            Do Not Show Again
          </label>
          <button className="updates-close" onClick={close} ref={closeRef} type="button">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
