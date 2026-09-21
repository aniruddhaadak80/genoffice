/**
 * Review → Compare: paragraph-level diff of two documents (pure, unit-testable).
 * Word builds a merged revision document; this lightweight version reports
 * per-paragraph additions / removals / edits for a side panel.
 */
import type { Block } from '@genoffice/docx-engine'

export interface CompareEntry {
  kind: 'same' | 'removed' | 'added' | 'changed'
  /** paragraph text in the current document */
  left?: string
  /** paragraph text in the compared document */
  right?: string
}

/** visible block -> comparable plain text (tables/objects fall back to previews) */
export function blockTexts(blocks: Block[]): string[] {
  return blocks
    .filter((b) => !b.hidden)
    .map((b) => {
      if (b.runs) return b.runs.map((r) => r.text).join('')
      return b.previewText ?? ''
    })
}

/** LCS cell budget: (n+1)*(m+1) past this uses the linear fallback. */
const MAX_LCS_CELLS = 4_000_000

/**
 * Linear multiset-join diff for very large documents: paragraphs present in
 * both are 'same', the rest are 'removed'/'added'. Order-insensitive, but
 * O(n+m) time and memory instead of O(n*m).
 */
function compareParagraphsLarge(left: string[], right: string[]): CompareEntry[] {
  const rightCounts = new Map<string, number>()
  for (const text of right) rightCounts.set(text, (rightCounts.get(text) ?? 0) + 1)
  const out: CompareEntry[] = []
  for (const text of left) {
    const remaining = rightCounts.get(text) ?? 0
    if (remaining > 0) {
      rightCounts.set(text, remaining - 1)
      out.push({ kind: 'same', left: text, right: text })
    } else {
      out.push({ kind: 'removed', left: text })
    }
  }
  for (const [text, remaining] of rightCounts) {
    for (let k = 0; k < remaining; k++) out.push({ kind: 'added', right: text })
  }
  return out
}

/** LCS-based paragraph diff; a removal directly followed by an addition merges into 'changed' */
export function compareParagraphs(left: string[], right: string[]): CompareEntry[] {
  const n = left.length
  const m = right.length
  // The LCS matrix is quadratic: comparing two 20k-paragraph documents would
  // allocate ~400M cells. Past the budget, fall back to a linear multiset
  // join (order-insensitive but bounded and fast).
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) return compareParagraphsLarge(left, right)
  // lcs[i][j] = LCS length of left[i:], right[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const raw: CompareEntry[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      raw.push({ kind: 'same', left: left[i], right: right[j] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      raw.push({ kind: 'removed', left: left[i] })
      i++
    } else {
      raw.push({ kind: 'added', right: right[j] })
      j++
    }
  }
  while (i < n) raw.push({ kind: 'removed', left: left[i++] })
  while (j < m) raw.push({ kind: 'added', right: right[j++] })

  const out: CompareEntry[] = []
  for (const entry of raw) {
    const prev = out[out.length - 1]
    if (entry.kind === 'added' && prev?.kind === 'removed' && prev.right === undefined) {
      prev.kind = 'changed'
      prev.right = entry.right
      continue
    }
    out.push(entry)
  }
  return out
}

export interface CompareSummary {
  added: number
  removed: number
  changed: number
}

export function summarize(entries: CompareEntry[]): CompareSummary {
  return {
    added: entries.filter((e) => e.kind === 'added').length,
    removed: entries.filter((e) => e.kind === 'removed').length,
    changed: entries.filter((e) => e.kind === 'changed').length,
  }
}
