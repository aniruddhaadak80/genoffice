/**
 * Vertical layout for the WPS-style comments margin: each card wants to sit level
 * with its pin, cards must not overlap, and the anchored card (active thread or the
 * draft being typed) keeps its exact pin-aligned position while the others yield.
 */

/** Offset from a pin's center down to the card row its leader line attaches to */
export const CARD_PIN_ALIGN = 14

export interface MarginLayoutEntry {
  key: string
  /** Pin center y, relative to the margin column top */
  pinY: number
}

/**
 * Compute card tops. Entries are laid out in pin order (top to bottom). Without an
 * anchor a single downward pass pushes overlapping cards down. With an anchor, the
 * anchored card is fixed at its pin-aligned top, cards above it are pushed up and
 * cards below pushed down as needed.
 */
export function layoutMarginCards(
  entries: MarginLayoutEntry[],
  height: (key: string) => number,
  anchorKey: string | null,
  gap = 10,
  minTop = 4,
): Map<string, number> {
  // Corrupt geometry must not poison the layout: entries with non-finite pins
  // cannot be placed, and a hostile height/gap callback must not inject NaN.
  const saneGap = Number.isFinite(gap) ? Math.max(0, gap) : 10
  const saneMinTop = Number.isFinite(minTop) ? minTop : 4
  const saneHeight = (key: string): number => {
    const h = height(key)
    return Number.isFinite(h) && h > 0 ? h : 0
  }
  const sorted = [...entries]
    .filter((e) => e && typeof e.key === 'string' && Number.isFinite(e.pinY))
    .sort((a, b) => a.pinY - b.pinY)
  const desired = (e: MarginLayoutEntry) => Math.max(saneMinTop, e.pinY - CARD_PIN_ALIGN)
  const tops = new Array<number>(sorted.length)

  const anchorIdx = anchorKey === null ? -1 : sorted.findIndex((e) => e.key === anchorKey)
  if (anchorIdx < 0) {
    for (let i = 0; i < sorted.length; i++) {
      const min = i === 0 ? saneMinTop : tops[i - 1]! + saneHeight(sorted[i - 1]!.key) + saneGap
      tops[i] = Math.max(desired(sorted[i]!), min)
    }
  } else {
    tops[anchorIdx] = desired(sorted[anchorIdx]!)
    // Above the anchor: pull cards up when they would collide (may go past minTop —
    // avoiding overlap wins over staying inside the top edge)
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const max = tops[i + 1]! - saneGap - saneHeight(sorted[i]!.key)
      tops[i] = Math.min(desired(sorted[i]!), max)
    }
    for (let i = anchorIdx + 1; i < sorted.length; i++) {
      const min = tops[i - 1]! + saneHeight(sorted[i - 1]!.key) + saneGap
      tops[i] = Math.max(desired(sorted[i]!), min)
    }
  }

  const out = new Map<string, number>()
  for (let i = 0; i < sorted.length; i++) out.set(sorted[i]!.key, tops[i]!)
  return out
}
