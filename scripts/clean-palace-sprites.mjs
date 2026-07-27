import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const DIR = 'public/images/palaces'
const SIZE = 64
const WHITE_CUTOFF = 232

async function clean(file) {
  const path = join(DIR, file)

  // Key out the white studio background at full resolution first.
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info

  for (let i = 0; i < data.length; i += channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]

    if (r >= WHITE_CUTOFF && g >= WHITE_CUTOFF && b >= WHITE_CUTOFF) {
      data[i + 3] = 0
    }
  }

  // Trim the now-transparent margin, then downscale to chunky pixel art.
  await sharp(data, { raw: { width, height, channels } })
    .png()
    .trim({ threshold: 0 })
    .resize(SIZE, SIZE, {
      fit: 'contain',
      kernel: 'nearest',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toFile(path)
  console.log(`[v0] cleaned ${file}`)
}

const files = (await readdir(DIR)).filter((f) => f.endsWith('.png'))

await Promise.all(files.map(clean))
