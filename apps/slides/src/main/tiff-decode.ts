/**
 * TIFF → PNG transcoding (main process). Chromium cannot decode TIFF, so pictures
 * embedded as ppt/media/*.tif(f) would render as blank placeholders. Decode with
 * UTIF (pure JS) and re-encode as PNG for display; the original TIFF bytes stay
 * untouched in the package so saving preserves them byte-for-byte.
 */
import UTIF from 'utif2'
import { PNG } from 'pngjs'

export interface DecodedTiff {
  png: Uint8Array
  width: number
  height: number
}

/** Pixel budget: a crafted ppt/media/*.tif with giant IFD dims would OOM
 *  the main process in toRGBA8 (w*h*4 bytes). Fail closed (blank placeholder)
 *  past 64MP or 16384px per side. */
const MAX_TIFF_PIXELS = 64 * 1024 * 1024
const MAX_TIFF_DIM = 16384

function tiffDimsOk(width: unknown, height: unknown): width is number {
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MAX_TIFF_DIM &&
    height <= MAX_TIFF_DIM &&
    width * height <= MAX_TIFF_PIXELS
  )
}

export function tiffToPng(bytes: Uint8Array): DecodedTiff | null {
  try {
    const buf = Buffer.from(bytes)
    const ifds = UTIF.decode(buf)
    if (!ifds.length) return null
    // Multi-page/multi-resolution TIFFs: pick the largest page within budget.
    // Header dims are checked BEFORE decodeImage so a hostile IFD cannot
    // force a gigapixel pixel allocation.
    let page = ifds[0]!
    if (!tiffDimsOk(page.width, page.height)) return null
    for (const ifd of ifds) {
      if (!tiffDimsOk(ifd.width, ifd.height)) continue
      const cur = (ifd.width as number) * (ifd.height as number)
      if (cur > (page.width as number) * (page.height as number)) page = ifd
    }
    UTIF.decodeImage(buf, page)
    const width = page.width as number
    const height = page.height as number
    const rgba = UTIF.toRGBA8(page)
    const png = new PNG({ width, height })
    png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
    return { png: PNG.sync.write(png), width, height }
  } catch {
    return null
  }
}
