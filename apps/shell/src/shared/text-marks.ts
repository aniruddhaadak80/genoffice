export interface TextMark {
  text: string
  hit: boolean
}

const WORD_CHAR = /^[\p{L}\p{N}\p{M}]$/u
const CJK_START =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u

/** NFKC folds fullwidth forms and compatibility ideographs onto their base; same fold as the index */
export function foldText(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

/**
 * Merged [start, end) spans of every needle in `hay`. A Latin/digit needle
 * must begin at a word start (the index only matches whole words and their
 * prefixes, so "is" inside "minneapolis" is not a hit); a CJK needle may sit
 * anywhere. Overlapping spans fuse so adjacent bigram hits read as one run.
 */
export function findRanges(hay: string, needles: readonly string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const n of needles) {
    if (!n) continue
    const wordStart = !CJK_START.test(n) && WORD_CHAR.test(String.fromCodePoint(n.codePointAt(0)!))
    let at = hay.indexOf(n)
    while (at !== -1) {
      if (!wordStart || at === 0 || !WORD_CHAR.test(hay[at - 1]!)) ranges.push([at, at + n.length])
      at = hay.indexOf(n, at + 1)
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

interface SourceRange {
  readonly start: number
  readonly end: number
}

const graphemeSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function isContinuation(ch: string): boolean {
  return /^[\p{M}\u200d\uFE00-\uFE0F]$/u.test(ch)
}

function sourceRanges(text: string): SourceRange[] {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), ({ index, segment }) => ({
      start: index,
      end: index + segment.length,
    }))
  }
  const ranges: SourceRange[] = []
  let offset = 0
  let start = 0
  for (const ch of text) {
    if (offset > 0 && !isContinuation(ch)) {
      ranges.push({ start, end: offset })
      start = offset
    }
    offset += ch.length
  }
  if (offset > 0) ranges.push({ start, end: offset })
  return ranges
}

function foldTextWithMap(text: string): { text: string; starts: number[]; ends: number[] } {
  const folded = text.normalize('NFKC').toLowerCase()
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const { start, end } of sourceRanges(text)) {
    const length = text.slice(start, end).normalize('NFKC').toLowerCase().length
    const nextOffset = Math.min(folded.length, offset + length)
    for (let i = offset; i < nextOffset; i += 1) {
      starts.push(start)
      ends.push(end)
    }
    offset = nextOffset
  }
  while (offset < folded.length) {
    starts.push(0)
    ends.push(text.length)
    offset += 1
  }
  return { text: folded, starts, ends }
}

export function findMappedRanges(text: string, needles: readonly string[]): Array<[number, number]> {
  const folded = foldTextWithMap(text)
  const ranges = findRanges(folded.text, needles.map(foldText))
  const mapped = ranges.map(([start, end]) => {
    const first = folded.starts[start] ?? text.length
    const last = end === folded.text.length ? text.length : (folded.ends[end - 1] ?? text.length)
    return [first, Math.max(first, last)] as [number, number]
  })
  mapped.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of mapped) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }
  return merged
}

export function markText(text: string, needles: readonly string[]): TextMark[] {
  const ranges = findMappedRanges(text, needles)
  if (ranges.length === 0) return [{ text, hit: false }]
  const out: TextMark[] = []
  let cursor = 0
  for (const [s, e] of ranges) {
    if (s > cursor) out.push({ text: text.slice(cursor, s), hit: false })
    out.push({ text: text.slice(s, e), hit: true })
    cursor = e
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false })
  return out
}
