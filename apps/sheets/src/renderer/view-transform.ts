/// Screen ↔ file coordinate mapping for streamed sheets with journaled
/// structural operations. "File" space is the original xlsx the sidecar
/// reads; "screen" space is Univer's post-operation model. Viewport requests
/// translate screen → file, streamed results translate file → screen; rows
/// and columns inserted this session have no file backing (`null`).

import type { StructuralOp } from '../gateway/xlsx-structure'
import type { WorkbookRangeResult } from '../shared/desktop-api'

export type Axis = 'row' | 'column'

interface CellArea {
  readonly startRow: number
  readonly endRow: number
  readonly startColumn: number
  readonly endColumn: number
}

type RowColumnOp = Extract<StructuralOp, { index: number }>

function axisOf(op: RowColumnOp): Axis {
  return op.kind === 'insert-cols' || op.kind === 'remove-cols' ? 'column' : 'row'
}

/// The two adjacent pre-move blocks a move swaps: `first` then `second`,
/// with `second` immediately following `first`.
function swapBlocks(op: Extract<RowColumnOp, { before: number }>): {
  first: { start: number; end: number }
  second: { start: number; end: number }
} {
  const first =
    op.before > op.index
      ? { start: op.index, end: op.index + op.count - 1 }
      : { start: op.before, end: op.index - 1 }
  const second =
    op.before > op.index
      ? { start: op.index + op.count, end: op.before - 1 }
      : { start: op.index, end: op.index + op.count - 1 }
  return { first, second }
}

/// The two blocks a move swaps, in the coordinate space the map operates on:
/// pre-move blocks for the forward map, their post-move images (split at
/// `first.start + secondLength`) for the inverse.
function swapImageBlocks(
  op: Extract<RowColumnOp, { before: number }>,
  forward: boolean,
): [{ start: number; end: number }, { start: number; end: number }] {
  const { first, second } = swapBlocks(op)
  const secondLength = second.end - second.start + 1
  return forward
    ? [first, second]
    : [
        { start: first.start, end: first.start + secondLength - 1 },
        { start: first.start + secondLength, end: second.end },
      ]
}

/// A move as the two adjacent blocks that swap places; `forward` maps
/// pre-move → post-move, its inverse swaps the (equal-length) images back.
function swapMap(
  position: number,
  op: Extract<RowColumnOp, { before: number }>,
  forward: boolean,
): number {
  const [a, b] = swapImageBlocks(op, forward)
  if (position >= a.start && position <= a.end) {
    return position + (b.end - b.start + 1)
  }
  if (position >= b.start && position <= b.end) {
    return position - (a.end - a.start + 1)
  }
  return position
}

function isInsert(op: RowColumnOp): boolean {
  return op.kind === 'insert-rows' || op.kind === 'insert-cols'
}

function rowColumnOps(ops: readonly StructuralOp[], axis: Axis): RowColumnOp[] {
  return ops.filter((op): op is RowColumnOp => 'index' in op && axisOf(op) === axis)
}

/// Where a file line sits on screen after all operations, or null when a
/// removal deleted it.
export function fileToScreen(
  ops: readonly StructuralOp[],
  axis: Axis,
  index: number,
): number | null {
  let position = index
  for (const op of rowColumnOps(ops, axis)) {
    if ('before' in op) {
      position = swapMap(position, op, true)
    } else if (isInsert(op)) {
      if (position >= op.index) position += op.count
    } else {
      if (position >= op.index && position < op.index + op.count) return null
      if (position >= op.index + op.count) position -= op.count
    }
  }
  return position
}

/// Which file line backs a screen position, or null when the line was
/// inserted this session (journal-owned, nothing to stream).
export function screenToFile(
  ops: readonly StructuralOp[],
  axis: Axis,
  index: number,
): number | null {
  let position = index
  const relevant = rowColumnOps(ops, axis)
  for (let step = relevant.length - 1; step >= 0; step -= 1) {
    const op = relevant[step]
    if (!op) continue
    if ('before' in op) {
      position = swapMap(position, op, false)
    } else if (isInsert(op)) {
      if (position >= op.index && position < op.index + op.count) return null
      if (position >= op.index + op.count) position -= op.count
    } else if (position >= op.index) {
      position += op.count
    }
  }
  return position
}

/// Net size change of an axis: screen extent = file extent + delta.
export function netAxisDelta(ops: readonly StructuralOp[], axis: Axis): number {
  let delta = 0
  for (const op of rowColumnOps(ops, axis)) {
    if ('before' in op) continue
    delta += isInsert(op) ? op.count : -op.count
  }
  return delta
}

interface Span {
  start: number
  end: number
}

/// The image of a span after structural ops, as a sorted list of disjoint
/// intervals. A single bounding box cannot represent it: a move tears a span
/// into pieces, and a later removal can delete one piece while sparing
/// another — the box would then claim survivors that no longer exist.
type SpanList = { start: number; end: number }[]

/// Insert `count` lines at `index`: a monotone shift of everything at/after it.
function insertEnvelopeList(list: SpanList, index: number, count: number): SpanList {
  return list.map((seg) => ({
    start: seg.start >= index ? seg.start + count : seg.start,
    end: seg.end >= index ? seg.end + count : seg.end,
  }))
}

/// Remove `count` lines at `index`: intervals overlapping the block are cut
/// in place; survivors right of it shift left. Empty pieces vanish.
function removeEnvelopeList(list: SpanList, index: number, count: number): SpanList {
  const result: SpanList = []
  for (const seg of list) {
    if (seg.end < index) {
      result.push(seg)
      continue
    }
    if (seg.start >= index + count) {
      result.push({ start: seg.start - count, end: seg.end - count })
      continue
    }
    const leftEnd = Math.min(seg.end, index - 1)
    if (seg.start <= leftEnd) result.push({ start: seg.start, end: leftEnd })
    const rightStart = Math.max(seg.start, index + count)
    if (rightStart <= seg.end) {
      result.push({ start: rightStart - count, end: seg.end - count })
    }
  }
  return result
}

/// Image of one interval through one move: the map is piecewise (shift by
/// +len(second) inside the first block, -len(first) inside the second,
/// identity elsewhere), so the interval is split at block boundaries and
/// each piece shifts. Pieces are appended in order; the caller keeps the
/// list sorted because moves can reorder pieces.
function moveEnvelopeSegment(seg: Span, a: Span, b: Span, forward: boolean, out: SpanList): void {
  // Cut points inside the segment where the mapping changes.
  const cuts: number[] = [seg.start]
  for (const boundary of [a.start, a.end + 1, b.start, b.end + 1]) {
    if (boundary > seg.start && boundary <= seg.end) cuts.push(boundary)
  }
  cuts.push(seg.end + 1)
  const unique = [...new Set(cuts)].sort((x, y) => x - y)
  const secondLength = b.end - b.start + 1
  const firstLength = a.end - a.start + 1
  for (let i = 0; i < unique.length - 1; i += 1) {
    const subStart = unique[i] ?? seg.start
    const subEnd = (unique[i + 1] ?? seg.end + 1) - 1
    const mid = (subStart + subEnd) >> 1
    let mappedStart = subStart
    let mappedEnd = subEnd
    if (mid >= a.start && mid <= a.end) {
      // Original swapMap: inside a → position + len(b) (forward) or the
      // inverse's a-block (the post-image of second) → position + len(b).
      mappedStart = subStart + secondLength
      mappedEnd = subEnd + secondLength
    } else if (mid >= b.start && mid <= b.end) {
      mappedStart = subStart - firstLength
      mappedEnd = subEnd - firstLength
    }
    if (mappedStart <= mappedEnd) out.push({ start: mappedStart, end: mappedEnd })
  }
}

/// Image of a whole interval list through one move.
function moveEnvelopeList(
  list: SpanList,
  op: Extract<RowColumnOp, { before: number }>,
  forward: boolean,
): SpanList {
  const [a, b] = swapImageBlocks(op, forward)
  const out: SpanList = []
  for (const seg of list) moveEnvelopeSegment(seg, a, b, forward, out)
  out.sort((x, y) => x.start - y.start)
  return out
}

/// Envelope of a span's image through the whole op sequence (`forward` =
/// file → screen). Moves make the composite non-monotonic, so the image is
/// tracked op by op as an interval list: each op's blocks are evaluated in
/// the intermediate coordinate space that op actually ran in. Over-reading
/// within the surviving extremes is safe, tearing is not; an empty list
/// means nothing in the span survives the mapping.
function spanEnvelopeList(
  ops: readonly StructuralOp[],
  axis: Axis,
  span: Span,
  forward: boolean,
): SpanList {
  const relevant = rowColumnOps(ops, axis)
  if (!forward) relevant.reverse()
  let current: SpanList = [{ start: span.start, end: span.end }]
  for (const op of relevant) {
    if (current.length === 0) return current
    if ('before' in op) {
      current = moveEnvelopeList(current, op, forward)
    } else if (isInsert(op) === forward) {
      // Inserts applied forward and removals inverted both shift lines apart.
      current = insertEnvelopeList(current, op.index, op.count)
    } else {
      current = removeEnvelopeList(current, op.index, op.count)
    }
  }
  return current
}

/// Bounding box of a span image. Null when nothing survives — the fix for
/// the phantom-range bug: a box tracked op-by-op can keep claiming survivors
/// after a later removal deleted the last real occupant.
function spanEnvelope(
  ops: readonly StructuralOp[],
  axis: Axis,
  span: Span,
  forward: boolean,
): Span | null {
  const image = spanEnvelopeList(ops, axis, span, forward)
  const first = image[0]
  const last = image[image.length - 1]
  if (!first || !last) return null
  return { start: first.start, end: last.end }
}

/// File-space range backing a screen-space range. The result may span file
/// lines that were deleted (they map back to nothing and are dropped on
/// install). Null when no line in the range has file backing.
export function screenRangeToFileRange(
  ops: readonly StructuralOp[],
  range: CellArea,
): CellArea | null {
  const rows = spanEnvelope(ops, 'row', { start: range.startRow, end: range.endRow }, false)
  const columns = spanEnvelope(
    ops,
    'column',
    { start: range.startColumn, end: range.endColumn },
    false,
  )
  if (!rows || !columns) return null
  return {
    startRow: rows.start,
    endRow: rows.end,
    startColumn: columns.start,
    endColumn: columns.end,
  }
}

/// Screen-space extent of a file-space range; null when every line in the
/// range was deleted.
export function fileRangeToScreenRange(
  ops: readonly StructuralOp[],
  range: CellArea,
): CellArea | null {
  const rows = spanEnvelope(ops, 'row', { start: range.startRow, end: range.endRow }, true)
  const columns = spanEnvelope(
    ops,
    'column',
    { start: range.startColumn, end: range.endColumn },
    true,
  )
  if (!rows || !columns) return null
  return {
    startRow: rows.start,
    endRow: rows.end,
    startColumn: columns.start,
    endColumn: columns.end,
  }
}

/// Screen position of the indexing cutoff: the last screen row whose file
/// row is indexed. Screen rows above it are either indexed or inserted.
export function indexedThroughScreenRow(
  ops: readonly StructuralOp[],
  indexedThroughFileRow: number | null,
): number | null {
  if (indexedThroughFileRow === null) return null
  for (let fileRow = indexedThroughFileRow; fileRow >= 0; fileRow -= 1) {
    const screenRow = fileToScreen(ops, 'row', fileRow)
    if (screenRow !== null) return screenRow
  }
  return -1
}

/// Translates a sidecar range result (file coordinates) into screen
/// coordinates. Cells, row properties, and hyperlinks on deleted lines are
/// dropped; merges with a deleted edge are skipped (display-only loss —
/// the save side reshapes merges through the same operation stream).
export function mapRangeResultToScreen(
  ops: readonly StructuralOp[],
  result: WorkbookRangeResult,
): Pick<WorkbookRangeResult, 'cells' | 'rows' | 'merges' | 'hyperlinks'> {
  const cells: WorkbookRangeResult['cells'] = []
  for (const cell of result.cells) {
    const row = fileToScreen(ops, 'row', cell.row)
    const column = fileToScreen(ops, 'column', cell.column)
    if (row === null || column === null) continue
    cells.push({ ...cell, row, column })
  }
  const rows: WorkbookRangeResult['rows'] = []
  for (const rowProperty of result.rows) {
    const row = fileToScreen(ops, 'row', rowProperty.row)
    if (row === null) continue
    rows.push({ ...rowProperty, row })
  }
  const merges: WorkbookRangeResult['merges'] = []
  for (const merge of result.merges) {
    const startRow = fileToScreen(ops, 'row', merge.startRow)
    const endRow = fileToScreen(ops, 'row', merge.endRow)
    const startColumn = fileToScreen(ops, 'column', merge.startColumn)
    const endColumn = fileToScreen(ops, 'column', merge.endColumn)
    if (startRow === null || endRow === null || startColumn === null || endColumn === null) continue
    merges.push({ startRow, endRow, startColumn, endColumn })
  }
  const hyperlinks: WorkbookRangeResult['hyperlinks'] = []
  for (const hyperlink of result.hyperlinks) {
    const row = fileToScreen(ops, 'row', hyperlink.row)
    const column = fileToScreen(ops, 'column', hyperlink.column)
    if (row === null || column === null) continue
    hyperlinks.push({ ...hyperlink, row, column })
  }
  return { cells, rows, merges, hyperlinks }
}
