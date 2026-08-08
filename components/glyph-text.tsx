/**
 * Renders short strings using the letterforms from the uploaded Zelda II font
 * sheet at `public/images/font/zelda2-sheet.png`.
 *
 * The sheet paints each glyph as white ink plus a baked-in blue drop shadow on a
 * transparent background, so it cannot be recoloured as an image. Instead the
 * white ink of every glyph was traced off the sheet into the 8x8 bitmaps below
 * (one hex byte per row, high bit leftmost), which lets each letter be drawn as
 * a shape and filled to taste while keeping the exact sheet letterforms.
 *
 * Regenerating: sample the sheet on its measured grid of 8x8 glyphs at a 16px
 * pitch with the first cell's ink at (6, 2), keeping only the white pixels.
 */

const GLYPH_SIZE = 8

/** Traced white ink for every glyph the sheet provides. */
const GLYPH_BITMAPS: Record<string, string> = {
  '0': '7cc6c6c6c67c0000',
  '1': '18381818187e0000',
  '2': '7cc61c78e0fe0000',
  '3': '7e183c06c67c0000',
  '4': '1c3c6cccfe0c0000',
  '5': 'fcc0fc06c67c0000',
  '6': '7cc0fcc6c67c0000',
  '7': 'fec60c1830300000',
  '8': '7cc67cc6c67c0000',
  '9': '7cc67e060c780000',
  A: '386cc6c6fec6c600',
  B: 'fcc6c6fcc6c6fc00',
  C: '3c66c0c0c0663c00',
  D: 'f8ccc6c6c6ccf800',
  E: 'fec0c0fcc0c0fe00',
  F: 'fec0c0fcc0c0c000',
  G: '3e60c0cec6663e00',
  H: 'c6c6c6fec6c6c600',
  I: '7e18181818187e00',
  J: '1e060606c6c67c00',
  K: 'c6ccd8f0f8dcce00',
  L: '6060606060607e00',
  M: 'c6eefefed6c6c600',
  N: 'c6e6f6fedecec600',
  O: '7cc6c6c6c6c67c00',
  P: 'fcc6c6c6fcc0c000',
  Q: '7cc6c6c6decc7a00',
  R: 'fcc6c6cef8dcce00',
  S: '78ccc07c06c67c00',
  T: '7e18181818181800',
  U: 'c6c6c6c6c6c67c00',
  V: 'c6c6c6ee7c381000',
  W: 'c6c6d6fefeeec600',
  X: 'c6ee7c387ceec600',
  Y: '6666663c18181800',
  Z: 'fe0e1c3870e0fe00',
  '-': '0000003c00000000',
}

/**
 * Turns a bitmap into one square per lit pixel. Every subpath winds the same
 * way, so the pixels merge into a single silhouette that can be stroked as one
 * outline instead of showing a seam on every internal pixel edge.
 */
function bitmapToPath(hex: string): string {
  let path = ''

  for (let row = 0; row < GLYPH_SIZE; row += 1) {
    const bits = Number.parseInt(hex.slice(row * 2, row * 2 + 2), 16)

    for (let column = 0; column < GLYPH_SIZE; column += 1) {
      if (bits & (1 << (GLYPH_SIZE - 1 - column))) {
        path += `M${column} ${row}h1v1h-1z`
      }
    }
  }

  return path
}

const GLYPH_PATHS = new Map(
  Object.entries(GLYPH_BITMAPS).map(([char, hex]) => [char, bitmapToPath(hex)]),
)

type GlyphTextProps = {
  /** Text to render. Uppercased, and unmapped characters are skipped. */
  children: string
  /** Screen pixels per glyph pixel. 3 keeps a two-letter mark inside a 56px icon. */
  scale?: number
  className?: string
}

export function GlyphText({ children, scale = 3, className }: GlyphTextProps) {
  const glyphs = children
    .toUpperCase()
    .split('')
    .map((char, index) => ({ path: GLYPH_PATHS.get(char), key: `${char}-${index}` }))
    .filter((glyph) => glyph.path)

  if (glyphs.length === 0) {
    return null
  }

  // One spare unit around the glyph gives the outline somewhere to sit.
  const boxSize = (GLYPH_SIZE + 2) * scale

  return (
    // Decorative: every caller already names the value in its own aria-label.
    <span
      aria-hidden="true"
      className={className ? `glyph-text ${className}` : 'glyph-text'}
    >
      {glyphs.map(({ path, key }, index) => (
        <svg
          className="glyph-text-cell"
          height={boxSize}
          key={key}
          style={{
            width: `${boxSize}px`,
            height: `${boxSize}px`,
            /* Pull each glyph back onto the sheet's 8px advance. The boxes
               overlap only where both hold outline, so nothing is clipped. */
            marginLeft: index === 0 ? undefined : `-${2 * scale}px`,
          }}
          viewBox={`-1 -1 ${GLYPH_SIZE + 2} ${GLYPH_SIZE + 2}`}
          width={boxSize}
        >
          <path d={path} />
        </svg>
      ))}
    </span>
  )
}
