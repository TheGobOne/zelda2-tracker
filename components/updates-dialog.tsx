'use client'

import { useEffect, useRef, useState } from 'react'

const UPDATES_STORAGE_KEY = 'z2-tracker-updates-dismissed'

type UpdateRelease = {
  /** Unique per release; the newest one decides whether opted-out players see the popup again. */
  id: string
  date: string
  intro?: string
  lines: string[]
}

// Newest first. Add a new release at the top to publish new notes.
const UPDATE_RELEASES: UpdateRelease[] = [
  {
    id: '2026-10-22-windows',
    date: '10/22/26',
    lines: [
      'Added Mapping pop-out: turn on Open in New Window under Mapping in the gear menu to move your map into its own window. Resize it however you like and the map scales to fit',
 'Pop-out windows now remember where you put them and how big they are, and reopen in the same spot when you reload',

      'Fixed the Updates popup being cut off in landscape layout',
    ],
  },
  {
    id: '2026-10-17-mapping',
    date: '10/17/26',
    intro: 'Mapping has been completely reworked. Changes below:',
    lines: [
      'Added Map Highlighting: hover an icon on your map to highlight it in the tracker above and dim everything else',
      'Added drag and drop: drag any icon on your map to move it to another square',
      'West menu button now uses Parapa (P), Jump (J), and Fairy (F) icons and includes the West item caves',
      'East menu button includes the East item caves and includes renamed East connector caves A, B, C, D to Passthrough caves T1, T2, T3, T4',
      'Added duplicate placement: shift click a Parapa, Jump, Fairy, or Passthrough cave (in the menu or on your map) to pick up a copy, then click a square to place it',
      'Updated the Controls section with the new mapping controls',
  'Added Save/Autosave: your entire run (tracker and maps) saves automatically in your browser and is restored on reload. Export and Import a save file from the gear menu',
    ],
  },
  {
    id: '2026-10-13-flags',
    date: '10/13/26',
    lines: [
      'Moved Flags selection to the Flags section of the tracker. Picking new flags clears your tracker',
      'Added Custom flags: type your own flagset name (up to 20 characters)',
      'Added Beginner flags preset and renamed Standard to Normal to match the Z2R app',
      'Added Spell Quest highlighting: hover a spell quest item (Trophy, Child, Mirror, Water, Medicine) to highlight its town, or hover a town to highlight its item',
      'Added the option to open Notes in a new window',
      'Added an AI Disclosure',
      'Various visual adjustments',
    ],
  },
  {
    id: '2026-10-sprites',
    date: '10/11/26',
    lines: [
      'Added Notes section (highlights when text is entered)',
      'Added Tooltips for virtually all tracker icons (can be disabled in gear menu)',
      'Added Palace Image Tooltips (can be disabled in gear menu)',
      'Increased Mapping grid to 11x11 (from 9x9)',
      'Added the ability to select and move icons on your map (middle click enters/exits move mode, left click to place selected icons)',
      'Added Local Browser Save so your settings (Hide Maps, Landscape, etc) will remain as they are when reloading',
      "Matched Mirror/Water/Bagu's Letter sprites to in-game sprites",
    ],
  },
]

const UPDATES_VERSION = UPDATE_RELEASES[0].id

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
  const [releaseIndex, setReleaseIndex] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isDismissed()) setIsOpen(true)
  }, [])

  useEffect(() => {
    if (openRequest === 0) return
    // Mirror the saved choice so closing a manual reopen doesn't undo it.
    setDoNotShowAgain(isDismissed())
    setReleaseIndex(0)
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

  const release = UPDATE_RELEASES[releaseIndex]
  const hasOlder = releaseIndex < UPDATE_RELEASES.length - 1
  const hasNewer = releaseIndex > 0

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
        <div className="updates-header">
          <button
            aria-label="Older updates"
            className="updates-nav"
            disabled={!hasOlder}
            onClick={() => setReleaseIndex((index) => index + 1)}
            type="button"
          >
            <span aria-hidden="true">{'<'}</span>
          </button>
          <h2 aria-live="polite" className="updates-title" id="updates-title">
            Updates ({release.date})
          </h2>
          <button
            aria-label="Newer updates"
            className="updates-nav"
            disabled={!hasNewer}
            onClick={() => setReleaseIndex((index) => index - 1)}
            type="button"
          >
            <span aria-hidden="true">{'>'}</span>
          </button>
        </div>
        {release.intro && <p className="updates-intro">{release.intro}</p>}
        <ul className="updates-list">
          {release.lines.map((line) => (
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
