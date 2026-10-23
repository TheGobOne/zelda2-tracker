'use client'

import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders its children into a popup window's body, or in place when there is
 * no popup. The children's React state and handlers stay with the board, so the
 * popup is just another view of the same tracker.
 */
export function PopoutHost({
  target,
  children,
}: {
  target: HTMLElement | null
  children: ReactNode
}) {
  return target ? createPortal(children, target) : <>{children}</>
}

/**
 * Gives a freshly opened blank popup the board's look: its stylesheets, theme
 * classes and font, with a body class for popout-specific rules.
 */
export function preparePopupWindow(popup: Window, title: string, bodyClass: string) {
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
