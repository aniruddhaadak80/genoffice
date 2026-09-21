/** Wheel-zoom step for ctrl/meta+wheel over the editor. */

/** Zoom bounds shared with the zoom control (percent). */
export const ZOOM_MIN = 50
export const ZOOM_MAX = 200
/** Largest single-tick zoom change: high-resolution wheels otherwise jump 50→200. */
export const ZOOM_MAX_TICK = 15
/** Wheel factor: zoom points per pixel of delta. */
const ZOOM_PER_DELTA_PX = 0.6
/** Line-mode delta (deltaMode 1) carries lines, not pixels; page mode uses the viewport. */
const LINE_PX = 16

/** Normalize a wheel delta to pixels (deltaMode 0 = pixels already). */
export function wheelDeltaPx(deltaY: number, deltaMode: number, viewportH = 800): number {
  if (!Number.isFinite(deltaY)) return 0
  if (deltaMode === 1) return deltaY * LINE_PX
  if (deltaMode === 2) return deltaY * viewportH
  return deltaY
}

/** Next zoom after one wheel tick, clamped to bounds with a per-tick step cap. */
export function nextWheelZoom(zoom: number, deltaY: number, deltaMode = 0): number {
  const step = Math.max(-ZOOM_MAX_TICK, Math.min(ZOOM_MAX_TICK, -wheelDeltaPx(deltaY, deltaMode) * ZOOM_PER_DELTA_PX))
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + step))
}
