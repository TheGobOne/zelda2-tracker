'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Tip = {
  text: string
  image?: string
  art?: { src: string; width: number; height: number }
  centerX: number
  iconTop: number
  iconBottom: number
  cursorX: number
  cursorY: number
}

const CURSOR_GAP = 16

// Natural size of the palace identification screenshots, shown at half scale.
const TIP_IMAGE_WIDTH = 258
const TIP_IMAGE_HEIGHT = 210

const TIP_GAP = 8
const EDGE_MARGIN = 6

// Panels with their own text, where an icon tooltip would only cover what the
// player is reading or choosing from.
const EXCLUDED_AREAS = '.tracker-menu, [role="dialog"], .notes-panel'

// Icons that never get a tooltip.
const EXCLUDED_ICONS = '.palace-grid .item-slot'

/**
 * Finds the hover text for an icon. `data-tip` wins when set; otherwise the
 * first sentence of the icon's aria-label is used, which every tracker icon
 * already leads with its name and state (the rest is the click instructions).
 */
function readTipText(element: HTMLElement) {
  const explicit = element.dataset.tip

  if (explicit) {
    return explicit
  }

  const label = element.getAttribute('aria-label')

  if (!label || !element.querySelector('img, svg')) {
    return null
  }

  // Location status ("empty", "checked", the chosen item) is already visible on the icon.
  if (element.classList.contains('location-icon')) {
    return label.split(':')[0]
  }

  // The collected state is already visible on the icon, so the tip only names it.
  return label
    .split('. ')[0]
    .replace(/\.$/, '')
    .replace(/, (not )?collected/, '')
}

/**
 * Cave locations get their own art shown above the name, so a collected cave
 * (greyed, or covered by the item placed there) can still be recognised.
 */
function readCaveArt(element: HTMLElement, text: string) {
  if (!element.classList.contains('location-icon') || !/cave/i.test(text)) {
    return undefined
  }

  const art = element.querySelector<HTMLImageElement>(':scope > img')

  if (!art) {
    return undefined
  }

  const rect = art.getBoundingClientRect()

  return {
    src: art.currentSrc || art.src,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

function findIcon(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const icon = target.closest<HTMLElement>('.game-canvas button, .game-canvas [data-tip]')

  if (!icon || icon.closest(EXCLUDED_AREAS) || icon.matches(EXCLUDED_ICONS)) {
    return null
  }

  return icon
}

export function IconTooltip({
  delay,
  enabled,
  showCaveArt = true,
}: {
  delay: number
  enabled: boolean
  showCaveArt?: boolean
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      setTip(null)
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let current: HTMLElement | null = null
    const pointer = { x: 0, y: 0 }

    function handleMove(event: PointerEvent) {
      pointer.x = event.clientX
      pointer.y = event.clientY

      // Image tips sit beside the cursor, so they follow it across the icon.
      setTip((previous) =>
        previous?.image
          ? { ...previous, cursorX: pointer.x, cursorY: pointer.y }
          : previous,
      )
    }

    function hide() {
      clearTimeout(timer)
      current = null
      setTip(null)
    }

    function show(icon: HTMLElement) {
      const text = readTipText(icon)

      if (!text || !icon.isConnected) {
        return
      }

      const rect = icon.getBoundingClientRect()

      setTip({
        text,
        image: icon.dataset.tipImage,
        art: showCaveArt ? readCaveArt(icon, text) : undefined,
        centerX: rect.left + rect.width / 2,
        iconTop: rect.top,
        iconBottom: rect.bottom,
        cursorX: pointer.x,
        cursorY: pointer.y,
      })
    }

    function handleOver(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        return
      }

      pointer.x = event.clientX
      pointer.y = event.clientY

      const icon = findIcon(event.target)

      if (icon === current) {
        return
      }

      hide()

      if (!icon || !readTipText(icon)) {
        return
      }

      current = icon

      if (delay === 0) {
        show(icon)
      } else {
        timer = setTimeout(() => show(icon), delay)
      }
    }

    function handleOut(event: PointerEvent) {
      if (current && !current.contains(event.relatedTarget as Node | null)) {
        hide()
      }
    }

    // Any click, scroll or keypress changes what the icon says (or moves it),
    // so the tip is dropped rather than left showing stale text.
    document.addEventListener('pointerover', handleOver)
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerout', handleOut)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('wheel', hide, { capture: true, passive: true })
    document.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerover', handleOver)
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerout', handleOut)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('wheel', hide, { capture: true })
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [delay, enabled, showCaveArt])

  // Places the tip once its real size is known: above the icon when it fits
  // inside the tracker, below otherwise, and slid sideways so it never pokes
  // past the tracker's frame.
  useLayoutEffect(() => {
    const element = tipRef.current

    if (!tip || !element) {
      return
    }

    const board = document.querySelector('.game-canvas')?.getBoundingClientRect()
    const bounds = board ?? {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }
    const { width, height } = element.getBoundingClientRect()

    // Image tips go right of the cursor, vertically centred on it, flipping to
    // the left only when the tracker has no room on the right.
    if (tip.image) {
      const rightLeft = tip.cursorX + CURSOR_GAP
      const fitsRight = rightLeft + width <= bounds.right - EDGE_MARGIN
      const imageLeft = fitsRight
        ? rightLeft
        : Math.max(bounds.left + EDGE_MARGIN, tip.cursorX - CURSOR_GAP - width)
      const imageTop = Math.max(
        bounds.top + EDGE_MARGIN,
        Math.min(tip.cursorY - height / 2, bounds.bottom - EDGE_MARGIN - height),
      )

      element.style.left = `${imageLeft}px`
      element.style.top = `${imageTop}px`
      element.style.visibility = 'visible'
      return
    }

    const fitsAbove = tip.iconTop - TIP_GAP - height >= bounds.top + EDGE_MARGIN
    const top = fitsAbove ? tip.iconTop - TIP_GAP - height : tip.iconBottom + TIP_GAP

    const minLeft = bounds.left + EDGE_MARGIN
    const maxLeft = bounds.right - EDGE_MARGIN - width
    const left = Math.max(minLeft, Math.min(tip.centerX - width / 2, maxLeft))

    element.style.left = `${left}px`
    element.style.top = `${top}px`
    element.style.visibility = 'visible'
  }, [tip])

  if (!tip) {
    return null
  }

  return createPortal(
    <div
      aria-hidden="true"
      className={tip.image ? 'icon-tooltip icon-tooltip-image' : 'icon-tooltip'}
      ref={tipRef}
      style={{ left: 0, top: 0, visibility: 'hidden' }}
    >
      {tip.image ? (
        // The screenshot already names the boss, so it replaces the text.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          height={TIP_IMAGE_HEIGHT}
          src={tip.image}
          width={TIP_IMAGE_WIDTH}
        />
      ) : tip.art ? (
        <span className="icon-tooltip-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            height={tip.art.height}
            src={tip.art.src}
            width={tip.art.width}
          />
          {tip.text}
        </span>
      ) : (
        tip.text
      )}
    </div>,
    document.body,
  )
}
