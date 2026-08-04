"""Builds a web font from the Zelda II: The Adventure of Link NES glyph tiles.

The NES stores text as 8x8 monochrome tiles. Each glyph below is transcribed on
that same grid ('#' is a lit pixel), then emitted as real outlines so the font
scales cleanly instead of blurring like an upscaled bitmap.

Run with:  /usr/bin/python3 scripts/generate-zelda2-font.py
Outputs:   public/fonts/zelda2.woff2 and public/fonts/zelda2.woff
"""

import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Zelda II draws uppercase glyphs 6 pixels wide and 7 tall inside an 8x8 cell,
# which is what gives the game's text its wide, airy spacing.
CELL = 8
GLYPH_H = 7
# 8 pixels per em keeps one game pixel on an exact unit boundary.
PX = 128
UPM = CELL * PX

GLYPHS = {
    "space": ("......", "......", "......", "......", "......", "......", "......"),
    "A": (".####.", "#....#", "#....#", "######", "#....#", "#....#", "#....#"),
    "B": ("#####.", "#....#", "#....#", "#####.", "#....#", "#....#", "#####."),
    "C": (".####.", "#....#", "#.....", "#.....", "#.....", "#....#", ".####."),
    "D": ("#####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#####."),
    "E": ("######", "#.....", "#.....", "#####.", "#.....", "#.....", "######"),
    "F": ("######", "#.....", "#.....", "#####.", "#.....", "#.....", "#....."),
    "G": (".####.", "#....#", "#.....", "#..###", "#....#", "#....#", ".####."),
    "H": ("#....#", "#....#", "#....#", "######", "#....#", "#....#", "#....#"),
    "I": ("######", "..##..", "..##..", "..##..", "..##..", "..##..", "######"),
    "J": ("...###", "....#.", "....#.", "....#.", "....#.", "#...#.", ".###.."),
    "K": ("#....#", "#...#.", "#..#..", "###...", "#..#..", "#...#.", "#....#"),
    "L": ("#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "######"),
    "M": ("#....#", "##..##", "#.##.#", "#.##.#", "#....#", "#....#", "#....#"),
    "N": ("#....#", "##...#", "#.#..#", "#..#.#", "#...##", "#....#", "#....#"),
    "O": (".####.", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."),
    "P": ("#####.", "#....#", "#....#", "#####.", "#.....", "#.....", "#....."),
    "Q": (".####.", "#....#", "#....#", "#....#", "#..#.#", "#...#.", ".###.#"),
    "R": ("#####.", "#....#", "#....#", "#####.", "#..#..", "#...#.", "#....#"),
    "S": (".####.", "#....#", "#.....", ".####.", ".....#", "#....#", ".####."),
    "T": ("######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."),
    "U": ("#....#", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."),
    "V": ("#....#", "#....#", "#....#", "#....#", "#....#", ".#..#.", "..##.."),
    "W": ("#....#", "#....#", "#....#", "#.##.#", "#.##.#", "##..##", "#....#"),
    "X": ("#....#", "#....#", ".#..#.", "..##..", ".#..#.", "#....#", "#....#"),
    "Y": ("#....#", "#....#", ".#..#.", "..##..", "..##..", "..##..", "..##.."),
    "Z": ("######", "....#.", "...#..", "..#...", ".#....", "#.....", "######"),
    "zero": (".####.", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."),
    "one": ("..##..", ".###..", "..##..", "..##..", "..##..", "..##..", "######"),
    "two": (".####.", "#....#", ".....#", "....#.", "..##..", ".#....", "######"),
    "three": (".####.", "#....#", ".....#", "..###.", ".....#", "#....#", ".####."),
    "four": ("....#.", "...##.", "..#.#.", ".#..#.", "######", "....#.", "....#."),
    "five": ("######", "#.....", "#.....", "#####.", ".....#", "#....#", ".####."),
    "six": ("..###.", ".#....", "#.....", "#####.", "#....#", "#....#", ".####."),
    "seven": ("######", ".....#", "....#.", "...#..", "..#...", "..#...", "..#..."),
    "eight": (".####.", "#....#", "#....#", ".####.", "#....#", "#....#", ".####."),
    "nine": (".####.", "#....#", "#....#", ".#####", ".....#", "....#.", ".###.."),
    "period": ("......", "......", "......", "......", "......", "..##..", "..##.."),
    "comma": ("......", "......", "......", "......", "..##..", "..##..", ".##..."),
    "hyphen": ("......", "......", "......", ".####.", "......", "......", "......"),
    "colon": ("......", "..##..", "..##..", "......", "..##..", "..##..", "......"),
    "exclam": ("..##..", "..##..", "..##..", "..##..", "..##..", "......", "..##.."),
    "question": (".####.", "#....#", ".....#", "...##.", "..#...", "......", "..#..."),
    "quotesingle": ("..##..", "..##..", "..#...", "......", "......", "......", "......"),
    "slash": (".....#", "....#.", "...#..", "..#...", ".#....", "#.....", "......"),
    "parenleft": ("...##.", "..#...", "..#...", "..#...", "..#...", "..#...", "...##."),
    "parenright": (".##...", "...#..", "...#..", "...#..", "...#..", "...#..", ".##..."),
}

# Maps the glyph names above to the characters they render.
CHARACTERS = {
    "space": " ",
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "period": ".",
    "comma": ",",
    "hyphen": "-",
    "colon": ":",
    "exclam": "!",
    "question": "?",
    "quotesingle": "'",
    "slash": "/",
    "parenleft": "(",
    "parenright": ")",
}


def pixel_runs(rows):
    """Merges lit pixels into horizontal runs so each row is a few rectangles
    rather than one square per pixel."""
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] != "#":
                x += 1
                continue

            start = x
            while x < len(row) and row[x] == "#":
                x += 1

            yield start, x, y


def build_glyph(rows):
    pen = TTGlyphPen(None)

    for x0, x1, y in pixel_runs(rows):
        # Row 0 is the top of the glyph, so flip it into font space where y
        # grows upward from the baseline.
        top = (GLYPH_H - y) * PX
        bottom = top - PX
        left = x0 * PX
        right = x1 * PX

        pen.moveTo((left, bottom))
        pen.lineTo((left, top))
        pen.lineTo((right, top))
        pen.lineTo((right, bottom))
        pen.closePath()

    return pen.glyph()


def main():
    order = [".notdef"] + list(GLYPHS)
    builder = FontBuilder(UPM, isTTF=True)
    builder.setupGlyphOrder(order)
    builder.setupCharacterMap(
        {ord(CHARACTERS.get(name, name)): name for name in GLYPHS}
    )

    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (UPM, 0)}

    for name, rows in GLYPHS.items():
        glyphs[name] = build_glyph(rows)
        # The font is monospaced: every cell advances a full 8 pixels.
        metrics[name] = (UPM, 0)

    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=GLYPH_H * PX, descent=-PX)
    builder.setupNameTable(
        {
            "familyName": "Zelda II NES",
            "styleName": "Regular",
            "psName": "ZeldaIINES-Regular",
        }
    )
    builder.setupOS2(sTypoAscender=GLYPH_H * PX, sTypoDescender=-PX, achVendID="NES ")
    builder.setupPost()

    out = os.path.join(os.path.dirname(__file__), "..", "public", "fonts")
    os.makedirs(out, exist_ok=True)

    for fmt in ("woff2", "woff"):
        builder.font.flavor = fmt
        builder.save(os.path.join(out, f"zelda2.{fmt}"))
        print(f"wrote zelda2.{fmt}")


if __name__ == "__main__":
    main()
