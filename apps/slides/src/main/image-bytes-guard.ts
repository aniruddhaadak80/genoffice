/**
 * Pure guards for the image/media/ink IPC byte handlers (add-image-bytes,
 * replace-picture-bytes, add-media-bytes, add-ink). Renderer-supplied base64
 * is validated for size, shape, and extension BEFORE Buffer.from allocates,
 * so a hostile payload cannot OOM the main process. Electron-free for
 * direct unit tests.
 */

/** ~20MB of decoded bytes for still images and ink PNGs. */
export const MAX_IMAGE_BASE64_CHARS = 28 * 1024 * 1024
/** ~100MB of decoded bytes for video/audio. */
export const MAX_MEDIA_BASE64_CHARS = 136 * 1024 * 1024

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'svg'])
const MEDIA_EXTS = new Set([
  'mp4',
  'm4v',
  'mov',
  'webm',
  'avi',
  'mkv',
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'flac',
])
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

function validBase64Payload(base64: unknown, maxChars: number): base64 is string {
  return (
    typeof base64 === 'string' &&
    base64.length > 0 &&
    base64.length <= maxChars &&
    base64.length % 4 === 0 &&
    BASE64_RE.test(base64)
  )
}

function validExt(ext: unknown, allowed: Set<string>): ext is string {
  return typeof ext === 'string' && allowed.has(ext.toLowerCase())
}

/** Finite px geometry for explicit-placement image/ink ops. */
export function validPxGeometry(op: {
  xPx: unknown
  yPx: unknown
  wPx: unknown
  hPx: unknown
  fitWidthPx: unknown
}): boolean {
  const nums = [op.xPx, op.yPx, op.wPx, op.hPx, op.fitWidthPx]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return false
  const [, , w, h, fit] = nums as number[]
  return w > 0 && h > 0 && fit > 0
}

export function validImageBytesInput(op: { base64: unknown; ext: unknown }): boolean {
  return validBase64Payload(op.base64, MAX_IMAGE_BASE64_CHARS) && validExt(op.ext, IMAGE_EXTS)
}

export function validMediaBytesInput(op: {
  base64?: unknown
  path?: unknown
  ext: unknown
}): boolean {
  if (typeof op.path === 'string' && op.path.length > 0 && op.path.length <= 4096) {
    return validExt(op.ext, MEDIA_EXTS)
  }
  return validBase64Payload(op.base64, MAX_MEDIA_BASE64_CHARS) && validExt(op.ext, MEDIA_EXTS)
}
