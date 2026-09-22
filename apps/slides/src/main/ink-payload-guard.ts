/**
 * Pure validator for the add-ink cNvPr descr payload: the vector-points JSON
 * is file/renderer-controlled, so shape, point count, coordinate finiteness,
 * and total size are bounded before the string is stored in the package.
 * Electron-free for direct unit tests.
 */

/** Maximum decoded points per stroke. */
export const MAX_INK_PAYLOAD_POINTS = 5000
/** Maximum payload string size. */
export const MAX_INK_PAYLOAD_CHARS = 64 * 1024

export function validInkPayload(payload: unknown): payload is string {
  if (typeof payload !== 'string') return false
  if (payload.length === 0 || payload.length > MAX_INK_PAYLOAD_CHARS) return false
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    return false
  }
  if (!data || typeof data !== 'object') return false
  const points = (data as { points?: unknown }).points
  if (!Array.isArray(points) || points.length === 0 || points.length > MAX_INK_PAYLOAD_POINTS) {
    return false
  }
  return points.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      typeof p[0] === 'number' &&
      typeof p[1] === 'number' &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  )
}
