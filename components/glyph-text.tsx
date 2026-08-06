/**
 * Renders short strings by slicing glyphs straight out of the uploaded Zelda II
 * font sheet, so marks show the exact plate art rather than the webfont
 * recreation of it.
 *
 * Sheet geometry was measured from the file itself: 8x8 glyphs on a 16px pitch,
 * with the first cell's ink starting at (6, 2).
 */

const SHEET_SRC = '/images/font/zelda2-sheet.png'
const SHEET_WIDTH = 260
const SHEET_HEIGHT = 45
const GLYPH_SIZE = 8
const ORIGIN_X = 6
const ORIGIN_Y = 2
const PITCH = 16

/**
 * Characters in sheet order, one array per row. The two leading cells are
 * punctuation the tracker never renders, so they are left empty rather than
 * guessed at. Row 2 ends after the dash; the rest of that row is blank.
 */
const SHEET_ROWS: string[][] = [
  ['', '', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D'],
  ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y', 'Z', '-'],
]

const GLYPH_CELLS = new Map<string, { row: number; col: number }>()
SHEET_ROWS.forEach((row, rowIndex) => {
  row.forEach((char, colIndex) => {
    if (char) {
      GLYPH_CELLS.set(char, { row: rowIndex, col: colIndex })
    }
  })
})

type GlyphTextProps = {
  /** Text to render. Uppercased, and unmapped characters are skipped. */
  children: string
  /** Screen pixels per sheet pixel. 3 keeps a two-letter mark inside a 56px icon. */
  scale?: number
  className?: string
}

export function GlyphText({ children, scale = 3, className }: GlyphTextProps) {
  const glyphs = children
    .toUpperCase()
    .split('')
    .map((char, index) => ({ char, cell: GLYPH_CELLS.get(char), key: `${char}-${index}` }))
    .filter((glyph) => glyph.cell)

  if (glyphs.length === 0) {
    return null
  }

  return (
    // Decorative: every caller already names the value in its own aria-label.
    <span
      aria-hidden="true"
      className={className ? `glyph-text ${className}` : 'glyph-text'}
      style={{ gap: `${scale}px` }}
    >
      {glyphs.map(({ cell, key }) => (
        <span
          className="glyph-text-cell"
          key={key}
          style={{
            width: `${GLYPH_SIZE * scale}px`,
            height: `${GLYPH_SIZE * scale}px`,
            backgroundImage: `url(${SHEET_SRC})`,
            backgroundSize: `${SHEET_WIDTH * scale}px ${SHEET_HEIGHT * scale}px`,
            backgroundPosition: `-${(ORIGIN_X + (cell?.col ?? 0) * PITCH) * scale}px -${
              (ORIGIN_Y + (cell?.row ?? 0) * PITCH) * scale
            }px`,
          }}
        />
      ))}
    </span>
  )
}
