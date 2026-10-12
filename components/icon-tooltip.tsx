'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Tip = { text: string; centerX: number; iconTop: number; iconBottom: number }

const TIP_GAP = 8
const EDGE_MARGIN = 6

// Panels with their own text, where an icon tooltip would only cover what the
// player is reading or choosing from.
const EXCLUDED_AREAS = '.tracker-menu, [role="dialog"], .notes-panel'

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

  return label.split('. ')[0].replace(/\.$/, '')
}

function findIcon(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const icon = target.closest<HTMLElement>('.game-canvas button, .game-canvas [data-tip]')

  if (!icon || icon.closest(EXCLUDED_AREAS)) {
    return null
  }

  return icon
}

export function IconTooltip({
  delay,
  enabled,
}: {
  delay: number
  enabled: boolean
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
        centerX: rect.left + rect.width / 2,
        iconTop: rect.top,
        iconBottom: rect.bottom,
      })
    }

    function handleOver(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        return
      }

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
    document.addEventListener('pointerout', handleOut)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('wheel', hide, { capture: true, passive: true })
    document.addEventListener('keydown', hide, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerover', handleOver)
      document.removeEventListener('pointerout', handleOut)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('wheel', hide, { capture: true })
      document.removeEventListener('keydown', hide, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [delay, enabled])

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
      className="icon-tooltip"
      ref={tipRef}
      style={{ left: 0, top: 0, visibility: 'hidden' }}
    >
      {tip.text}
    </div>,
    document.body,
  )
}
