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

function foldTextWithMap(text: string): { text: string; starts: number[]; ends: number[] } {
  let folded = ''
  const starts: number[] = []
  const ends: number[] = []
  let offset = 0
  for (const ch of text) {
    const normalized = ch.normalize('NFKC').toLowerCase()
    for (let i = 0; i < normalized.length; i += 1) {
      starts.push(offset)
      ends.push(offset + ch.length)
    }
    folded += normalized
    offset += ch.length
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
