/**
 * Pure logic for slide shows: playback sequence computation + rehearsal timing accumulation.
 * Extracted from SlideShowView for unit testing (no React/DOM dependency).
 */

/** Custom show: subset of slides in user-specified order (original indexes). App persists it per document to localStorage. */
export interface CustomShow {
  id: string
  name: string
  slideIndices: number[]
}

/**
 * Compute the playback sequence (array of original indexes).
 * - Default: all slides in order, skipping hidden ones (starting from a hidden slide still plays it)
 * - Non-empty customOrder: play in its order (out-of-range slides filtered; hidden slides still skipped, except the start slide)
 * - Fallback: when the result is empty, at least play the start slide
 */
export function computePlayOrder(
  slides: ReadonlyArray<{ hidden?: boolean }>,
  startAt: number,
  customOrder?: readonly number[],
): number[] {
  // A stale startAt (e.g. after slide deletions) must not emit an
  // out-of-range slide: nothing is playable from an invalid start.
  if (!Number.isInteger(startAt) || startAt < 0 || startAt >= slides.length) return []
  const playable = (i: number) => slides[i] != null && (!slides[i]!.hidden || i === startAt)
  const o =
    customOrder && customOrder.length > 0
      ? customOrder.filter(playable)
      : slides.map((_, i) => i).filter(playable)
  return o.length > 0 ? [...o] : [startAt]
}

// ── Rehearsal timing ─────────────────────────────────────────────────────────────

/** Upper bound for the per-page dwell array (a corrupt count must not OOM). */
export const MAX_REHEARSE_SLIDES = 100_000

function finiteOr(value: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** A rehearsal page pointer: a valid 0-based index, or -1 once finished. */
function validRehearseIndex(slideCount: number, index: number): number {
  if (index === -1) return -1
  return Number.isInteger(index) && index >= 0 && index < slideCount ? index : -1
}

/** Rehearsal timing state: perPageMs accumulates dwell milliseconds by original slide index. */
export interface RehearseTiming {
  perPageMs: number[]
  /** Slide currently dwelt on (original index; -1 = finished) */
  currentIndex: number
  /** Timestamp of entering the current slide (ms) */
  enteredAt: number
}

/** Start rehearsal: begin timing from startIndex. */
export function startRehearse(slideCount: number, startIndex: number, now: number): RehearseTiming {
  // slideCount feeds new Array: floor it and cap it so fractional or absurd
  // values cannot throw or exhaust memory.
  const count = Number.isFinite(slideCount)
    ? Math.min(Math.max(0, Math.floor(slideCount)), MAX_REHEARSE_SLIDES)
    : 0
  return {
    perPageMs: new Array(count).fill(0),
    currentIndex: validRehearseIndex(count, startIndex),
    enteredAt: finiteOr(now, 0),
  }
}

/** Page turn: accumulate the current slide's dwell into perPageMs, then switch to nextIndex and restart timing (revisiting a slide keeps accumulating). */
export function switchRehearsePage(
  t: RehearseTiming,
  nextIndex: number,
  now: number,
): RehearseTiming {
  const perPageMs = t.perPageMs.slice()
  // A non-finite clock reading must not poison the accumulator with NaN.
  const at = finiteOr(now, t.enteredAt)
  if (t.currentIndex >= 0 && t.currentIndex < perPageMs.length) {
    const dwell = at - finiteOr(t.enteredAt, at)
    perPageMs[t.currentIndex]! += dwell > 0 && Number.isFinite(dwell) ? dwell : 0
  }
  return { perPageMs, currentIndex: validRehearseIndex(perPageMs.length, nextIndex), enteredAt: at }
}

/** End rehearsal: accumulate the last slide's dwell, then convert to seconds per slide (rounded; visited slides count at least 1 second). */
export function finishRehearse(t: RehearseTiming, now: number): number[] {
  const final = switchRehearsePage(t, -1, now)
  return final.perPageMs.map((ms) =>
    ms > 0 && Number.isFinite(ms) ? Math.max(1, Math.round(ms / 1000)) : 0,
  )
}

/** m:ss clock display (rehearsal timer bar / save confirmation dialog). */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const sec = Math.floor(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
