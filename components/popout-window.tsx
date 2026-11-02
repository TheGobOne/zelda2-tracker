'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders its children into a popup window's body, or in place when there is
 * no popup. The children's React state and handlers stay with the board, so the
 * popup is just another view of the same tracker.
 *
 * The target is passed as a getter rather than an element: in development React
 * walks prop values to log render diffs, and walking a popup's DOM node reaches
 * its cross-origin frame properties and throws.
 */
export function PopoutHost({
  getTarget,
  children,
}: {
  getTarget: (() => HTMLElement | null) | null
  children: ReactNode
}) {
  const target = getTarget ? getTarget() : null
  return target ? createPortal(children, target) : <>{children}</>
}

/**
 * Gives a freshly opened blank popup the board's look: its stylesheets, theme
 * classes and font, with a body class for popout-specific rules.
 */
function preparePopupWindow(popup: Window, title: string, bodyClass: string) {
  const doc = popup.document
  doc.title = title
  doc.head
    .querySelectorAll('style, link[rel="stylesheet"]')
    .forEach((node) => node.remove())
  document
    .querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
      'style, link[rel="stylesheet"]',
    )
    .forEach((node) => {
      const clone = doc.importNode(node, true) as HTMLStyleElement | HTMLLinkElement
      if (node instanceof HTMLLinkElement) (clone as HTMLLinkElement).href = node.href
      doc.head.appendChild(clone)
    })
  doc.documentElement.className = document.documentElement.className
  doc.body.replaceChildren()
  doc.body.className = `${document.body.className} ${bodyClass}`
  const canvas = document.querySelector('.game-canvas')
  if (canvas) doc.body.style.fontFamily = getComputedStyle(canvas).fontFamily
}

/**
 * Chrome keeps a popup on the screen its opener is on, whatever position it was asked
 * for, unless the site may manage windows on all displays. So when the remembered
 * place is on another monitor, the window is moved there once it has opened.
 *
 * The permission question needs a click, and opening a window uses that click up,
 * so the question is asked first and the window opened straight after.
 */
function askForOtherScreens(left: number, top: number): Promise<unknown> | null {
  const screenInfo = window.screen as Screen & { availLeft?: number; availTop?: number }
  const originX = screenInfo.availLeft ?? 0
  const originY = screenInfo.availTop ?? 0
  const isElsewhere =
    left < originX ||
    left >= originX + screenInfo.availWidth ||
    top < originY ||
    top >= originY + screenInfo.availHeight
  const manage = (window as Window & { getScreenDetails?: () => Promise<unknown> })
    .getScreenDetails
  if (!isElsewhere || !manage) return null

  // Refused, or no click to ask from: the window stays where it opened.
  return manage.call(window).catch(() => null)
}

function placeOnSavedScreen(
  popup: Window,
  left: number,
  top: number,
  access: Promise<unknown> | null,
) {
  // Only a window meant for another monitor is moved. One on the opener's own screen is
  // already where window.open put it, and moving it again can land it somewhere else
  // when the monitors scale differently.
  access?.then((details) => {
    if (details && !popup.closed) popup.moveTo(left, top)
  })
}

const WINDOWS_STORAGE_KEY = 'z2-tracker-windows'
const MIN_SAVED_SIZE = 100

type SavedWindow = {
  open: boolean
  width: number
  height: number
  left: number
  top: number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function readSavedWindows(): Record<string, Partial<SavedWindow>> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WINDOWS_STORAGE_KEY) ?? 'null')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSavedWindow(id: string, patch: Partial<SavedWindow>) {
  try {
    const all = readSavedWindows()
    window.localStorage.setItem(
      WINDOWS_STORAGE_KEY,
      JSON.stringify({ ...all, [id]: { ...all[id], ...patch } }),
    )
  } catch {
    // Blocked storage only means the window is not remembered.
  }
}

type PopoutWindowOptions = {
  id: string
  title: string
  bodyClass: string
  defaultWidth: number
  defaultHeight: number
  /** The window is closed whenever this turns false. */
  enabled: boolean
  /** Reopening a remembered window waits until the settings it depends on are loaded. */
  restoreReady: boolean
  onOpened?: () => void
  onBlocked?: () => void
}

/**
 * Owns a popup window for the board: opening, closing, and remembering whether
 * it was open together with its size and position, so the next visit puts it
 * back where the player left it.
 *
 * Browsers only allow a popup from a user gesture. A remembered window is first
 * tried straight away, and if the browser blocks that it opens on the player's
 * first click or key press instead.
 */
export function usePopoutWindow(options: PopoutWindowOptions) {
  const { id, enabled, restoreReady } = options
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const [win, setWin] = useState<Window | null>(null)
  // A remembered window the browser would not reopen on its own, waiting for a click.
  const [isPending, setIsPending] = useState(false)
  const winRef = useRef<Window | null>(null)
  // Closing the board closes its popups, which must not count as the player
  // putting them away - they should come back next time.
  const isUnloadingRef = useRef(false)

  const getBody = useCallback(() => (win ? win.document.body : null), [win])

  const saveBounds = useCallback(
    (popup: Window) => {
      if (
        popup.closed ||
        popup.innerWidth < MIN_SAVED_SIZE ||
        popup.innerHeight < MIN_SAVED_SIZE ||
        // A window being minimised or torn down reports a position far off screen.
        popup.screenX < -10000 ||
        popup.screenY < -10000
      ) {
        return
      }
      writeSavedWindow(id, {
        width: popup.innerWidth,
        height: popup.innerHeight,
        left: popup.screenX,
        top: popup.screenY,
      })
    },
    [id],
  )

  const open = useCallback(
    (silent = false) => {
      const existing = winRef.current
      if (existing && !existing.closed) {
        existing.focus()
        return true
      }
      const { title, bodyClass, defaultWidth, defaultHeight } = optionsRef.current
      const saved = readSavedWindows()[id] ?? {}
      const width =
        isFiniteNumber(saved.width) && saved.width >= MIN_SAVED_SIZE
          ? Math.round(saved.width)
          : defaultWidth
      const height =
        isFiniteNumber(saved.height) && saved.height >= MIN_SAVED_SIZE
          ? Math.round(saved.height)
          : defaultHeight
      let features = `popup,width=${width},height=${height}`
      if (isFiniteNumber(saved.left) && isFiniteNumber(saved.top)) {
        features += `,left=${Math.round(saved.left)},top=${Math.round(saved.top)}`
      }

      const access =
        isFiniteNumber(saved.left) && isFiniteNumber(saved.top)
          ? askForOtherScreens(Math.round(saved.left), Math.round(saved.top))
          : null
      const popup = window.open('', `z2-tracker-${id}`, features)
      if (!popup) {
        if (!silent) optionsRef.current.onBlocked?.()
        return false
      }
      preparePopupWindow(popup, title, bodyClass)
      if (isFiniteNumber(saved.left) && isFiniteNumber(saved.top)) {
        placeOnSavedScreen(popup, Math.round(saved.left), Math.round(saved.top), access)
      }
      popup.addEventListener('pagehide', () => {
        if (winRef.current === popup) {
          winRef.current = null
          setWin(null)
        }
        if (!isUnloadingRef.current) writeSavedWindow(id, { open: false })
      })
      winRef.current = popup
      writeSavedWindow(id, { open: true })
      setIsPending(false)
      setWin(popup)
      optionsRef.current.onOpened?.()
      popup.focus()
      return true
    },
    [id, saveBounds],
  )

  const close = useCallback(() => {
    const popup = winRef.current
    if (popup) saveBounds(popup)
    winRef.current = null
    setIsPending(false)
    setWin(null)
    writeSavedWindow(id, { open: false })
    if (popup && !popup.closed) popup.close()
  }, [id, saveBounds])

  useEffect(() => {
    if (!enabled && winRef.current) close()
  }, [enabled, close])

  useEffect(() => {
    isUnloadingRef.current = false
    const closeWithBoard = () => {
      const popup = winRef.current
      if (!popup) return
      isUnloadingRef.current = true
      saveBounds(popup)
      popup.close()
    }
    // Flagged as early as the browser allows: a popup that unloads before the board's
    // own pagehide runs would otherwise look like the player closing it, and the
    // window would not come back after a refresh.
    const markUnloading = () => {
      isUnloadingRef.current = true
    }
    window.addEventListener('beforeunload', markUnloading)
    window.addEventListener('pagehide', closeWithBoard)
    return () => {
      window.removeEventListener('beforeunload', markUnloading)
      window.removeEventListener('pagehide', closeWithBoard)
      const popup = winRef.current
      if (popup && !popup.closed) {
        isUnloadingRef.current = true
        winRef.current = null
        popup.close()
      }
    }
  }, [saveBounds])

  // There is no move event for a window, so its position is polled while open.
  useEffect(() => {
    if (!win) return
    const save = () => saveBounds(win)
    win.addEventListener('resize', save)
    const timer = window.setInterval(save, 1000)
    return () => {
      win.removeEventListener('resize', save)
      window.clearInterval(timer)
    }
  }, [win, saveBounds])

  useEffect(() => {
    if (!restoreReady || !enabled || winRef.current) return
    if (!readSavedWindows()[id]?.open) return
    if (open(true)) return

    setIsPending(true)
    const events = ['click', 'keydown'] as const
    const startWaiting = () =>
      events.forEach((name) => document.addEventListener(name, retry, true))
    const stopWaiting = () =>
      events.forEach((name) => document.removeEventListener(name, retry, true))
    function retry() {
      stopWaiting()
      if (!readSavedWindows()[id]?.open) {
        setIsPending(false)
        return
      }
      // A browser lets one click open one popup. When another window took this
      // click, keep waiting for the next one rather than giving up.
      if (!open(true)) startWaiting()
    }
    startWaiting()
    return stopWaiting
  }, [restoreReady, enabled, id, open])

  return { win, getBody, open, close, isPending }
}
