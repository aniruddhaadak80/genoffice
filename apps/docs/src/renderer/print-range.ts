/**
 * Parse a Word-style print range ("1,3,5-8") into sorted 0-based page indices.
 * Accepts CJK/ASCII separators and dashes: hyphen, en-dash, em-dash, tilde,
 * fullwidth tilde and wave dash (Word IME users often type ～/〜 instead of -);
 * returns null on any invalid or out-of-bounds part (same semantics as the slides print dialog).
 */
export function parsePrintRange(text: string, max: number): number[] | null {
  const out = new Set<number>()
  const tokenRe = /\d+\s*[-–—~～〜]\s*\d+|\d+/g
  const parts = text.match(tokenRe) ?? []
  if (parts.length === 0) return null
  if (text.replace(tokenRe, '').replace(/[,，、;；\s]/g, '') !== '') return null
  for (const part of parts) {
    const m = /^(\d+)\s*[-–—~～〜]\s*(\d+)$|^(\d+)$/.exec(part)
    if (!m) return null
    const a = Number(m[1] ?? m[3])
    const b = Number(m[2] ?? m[3])
    if (a < 1 || b > max || a > b) return null
    // A pasted 1-1000000 range would push a million entries and freeze the
    // dialog: reject spans and totals past the page-selection budget.
    if (b - a > MAX_PRINT_RANGE_SPAN || out.size + (b - a + 1) > MAX_PRINT_RANGE_SPAN) return null
    for (let i = a; i <= b; i++) out.add(i - 1)
  }
  return [...out].sort((x, y) => x - y)
}

/** Largest page selection a print range may expand to. */
export const MAX_PRINT_RANGE_SPAN = 5000
