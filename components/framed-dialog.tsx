'use client'

import { useEffect, type ReactNode } from 'react'

/**
 * The Updates window's shell - the board's rail border, red corner blocks, gold
 * title and an OK footer - shared by the other read-only panels so they all look
 * like one family.
 */
export function FramedDialog({
  children,
  className,
  onClose,
  title,
  titleId,
}: {
  children: ReactNode
  className?: string
  onClose: () => void
  title: string
  titleId: string
}) {
  // Only mounted while open, so the board never listens for keys otherwise.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="updates-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={className ? `updates-dialog ${className}` : 'updates-dialog'}
        role="dialog"
      >
        <span aria-hidden="true" className="updates-corner updates-corner-top-left" />
        <span aria-hidden="true" className="updates-corner updates-corner-top-right" />
        <span aria-hidden="true" className="updates-corner updates-corner-bottom-right" />
        <span aria-hidden="true" className="updates-corner updates-corner-bottom-left" />
        <h2 className="updates-title" id={titleId}>
          {title}
        </h2>
        {children}
        <div className="updates-footer framed-dialog-footer">
          <button className="updates-close" onClick={onClose} type="button">
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
