/**
 * A save swaps the sidecar session and opens a fresh journal, so an edit
 * committed while the save's IPC was still pending had nowhere to live: the
 * swap replaced the journal it was recorded in and the write never carried it.
 * The save has to notice the journal moved on and write the difference before
 * it swaps, and keep it pending when it cannot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSave, type SaveContext } from '../src/renderer/save-actions'
import {
  createEditJournal,
  journalSize,
  pendingEdits,
  recordSetRangeValues,
  recordSheetInsert,
  recordStructuralOp,
  recordTableAdd,
  saveBaseline,
  type EditJournal,
} from '../src/renderer/edit-journal'

const saveWorkbookEdits = vi.fn()
const writeWorkbookRecovery = vi.fn()

beforeEach(() => {
  saveWorkbookEdits.mockReset()
  writeWorkbookRecovery.mockReset().mockResolvedValue({ ok: true })
  ;(globalThis as unknown as { window: unknown }).window = {
    desktopApi: { saveWorkbookEdits, writeWorkbookRecovery },
  }
})

const SHEET = 'sheet-1'
const SESSION = '11111111-1111-4111-8111-111111111111'
const AFTER_WRITE = '22222222-2222-4222-8222-222222222222'
const AFTER_REPLAY = '33333333-3333-4333-8333-333333333333'

function ctxWith(): {
  ctx: SaveContext
  journal: EditJournal
  openLazyWorkbook: ReturnType<typeof vi.fn>
} {
  const journal = createEditJournal()
  recordSetRangeValues(journal, SHEET, { 0: { 0: { v: 'first' } } })
  const openLazyWorkbook = vi.fn()
  return {
    journal,
    openLazyWorkbook,
    ctx: {
      univerRef: { current: null },
      stashViewRestore: () => {},
      lazyWorkbookRef: {
        current: {
          editJournal: journal,
          recalc: {
            timer: null,
            generation: 0,
            failed: false,
            formulaCells: new Map(),
            overlay: new Map(),
          },
          flags: { preloadComplete: true },
          file: {
            sessionId: SESSION,
            needsSaveAs: false,
            restoredFromRecovery: false,
          },
        },
      } as never,
      setMessage: () => {},
      openLazyWorkbook,
    },
  }
}

function savedCells(call: number): { row: number; column: number; value: unknown }[] {
  const payload = saveWorkbookEdits.mock.calls[call]![0] as {
    edits: { row: number; column: number; value: unknown }[]
  }
  return payload.edits
}

describe('handleSave with an edit committed while the write is pending', () => {
  it('replays the late edit against the new session before swapping', async () => {
    const { ctx, journal, openLazyWorkbook } = ctxWith()
    saveWorkbookEdits
      .mockImplementationOnce(async () => {
        // The user keeps typing while the first write is in flight.
        recordSetRangeValues(journal, SHEET, { 1: { 1: { v: 'late' } } })
        return { canceled: false, file: { sessionId: AFTER_WRITE, path: '/tmp/a.xlsx' } }
      })
      .mockImplementationOnce(async () => ({
        canceled: false,
        file: { sessionId: AFTER_REPLAY, path: '/tmp/a.xlsx' },
      }))

    const outcome = await handleSave(ctx, 'save')

    expect(outcome.ok).toBe(true)
    // The late edit is written by a second pass, and that pass targets the
    // session the first write opened — the old one no longer exists.
    expect(saveWorkbookEdits).toHaveBeenCalledTimes(2)
    const replay = saveWorkbookEdits.mock.calls[1]![0] as { sessionId: string }
    expect(replay.sessionId).toBe(AFTER_WRITE)
    expect(savedCells(1)).toEqual([expect.objectContaining({ row: 1, column: 1, value: 'late' })])
    // The swap happens once, on the file that now holds both edits, and starts
    // the new session clean.
    expect(openLazyWorkbook).toHaveBeenCalledTimes(1)
    expect(openLazyWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: AFTER_REPLAY }),
      { continueChat: true },
    )
  })

  it('keeps the late edit pending when the replay cannot be written', async () => {
    const { ctx, journal, openLazyWorkbook } = ctxWith()
    saveWorkbookEdits
      .mockImplementationOnce(async () => {
        recordSetRangeValues(journal, SHEET, { 1: { 1: { v: 'late' } } })
        return { canceled: false, file: { sessionId: AFTER_WRITE, path: '/tmp/a.xlsx' } }
      })
      .mockRejectedValueOnce(new Error('disk full'))

    const outcome = await handleSave(ctx, 'save')

    expect(outcome.ok).toBe(false)
    // Adopted onto the session that holds the written file, still carrying the
    // edit, so the next save writes it instead of losing it.
    expect(openLazyWorkbook).toHaveBeenCalledTimes(1)
    const [, opts] = openLazyWorkbook.mock.calls[0] as [
      unknown,
      { continueChat?: boolean; carryJournal?: EditJournal },
    ]
    expect(opts.continueChat).toBe(true)
    expect(journalSize(opts.carryJournal!)).toBe(1)
    expect(savedCells(1)).toEqual([expect.objectContaining({ row: 1, column: 1, value: 'late' })])
  })

  it('a save with nothing committed meanwhile still swaps once', async () => {
    const { ctx, openLazyWorkbook } = ctxWith()
    saveWorkbookEdits.mockResolvedValue({
      canceled: false,
      file: { sessionId: AFTER_WRITE, path: '/tmp/a.xlsx' },
    })

    const outcome = await handleSave(ctx, 'save')

    expect(outcome.ok).toBe(true)
    expect(saveWorkbookEdits).toHaveBeenCalledTimes(1)
    expect(openLazyWorkbook).toHaveBeenCalledTimes(1)
  })

  it('a late re-edit of a cell the write already carried is replayed too', async () => {
    const { ctx, journal, openLazyWorkbook } = ctxWith()
    saveWorkbookEdits
      .mockImplementationOnce(async () => {
        // Same cell, new value: the journal entry is replaced, so this is
        // invisible to a count-based check.
        recordSetRangeValues(journal, SHEET, { 0: { 0: { v: 'rewritten' } } })
        return { canceled: false, file: { sessionId: AFTER_WRITE, path: '/tmp/a.xlsx' } }
      })
      .mockImplementationOnce(async () => ({
        canceled: false,
        file: { sessionId: AFTER_REPLAY, path: '/tmp/a.xlsx' },
      }))

    const outcome = await handleSave(ctx, 'save')

    expect(outcome.ok).toBe(true)
    expect(saveWorkbookEdits).toHaveBeenCalledTimes(2)
    expect(savedCells(1)).toEqual([
      expect.objectContaining({ row: 0, column: 0, value: 'rewritten' }),
    ])
    expect(openLazyWorkbook).toHaveBeenCalledTimes(1)
  })
})

describe('pendingEdits trims what the in-flight write already carried', () => {
  it('drops sent structural, sheet and additive ops but keeps the new ones', () => {
    const journal = createEditJournal()
    recordSetRangeValues(journal, SHEET, { 0: { 0: { v: 'sent' } } })
    recordStructuralOp(journal, SHEET, { kind: 'insert-rows', index: 1, count: 1 })
    recordSheetInsert(journal, 'sheet-2', 'Sent')
    recordTableAdd(journal, {
      sheetId: SHEET,
      name: 'SentTable',
      area: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 },
      columnNames: ['A'],
      bandedRows: true,
    })
    const baseline = saveBaseline(journal)

    // Everything above is now on disk; only what follows is unsaved.
    recordSetRangeValues(journal, SHEET, { 5: { 5: { v: 'unsaved' } } })
    recordStructuralOp(journal, SHEET, { kind: 'insert-rows', index: 9, count: 1 })
    recordSheetInsert(journal, 'sheet-3', 'Unsaved')
    recordTableAdd(journal, {
      sheetId: SHEET,
      name: 'UnsavedTable',
      area: { startRow: 5, startColumn: 5, endRow: 7, endColumn: 7 },
      columnNames: ['F'],
      bandedRows: true,
    })

    const pending = pendingEdits(journal, baseline)

    // The unsaved cell rides along. A cell write is absolute, so carrying an
    // already-sent one is harmless — and a structural op rebuilds the entry
    // objects anyway, so a sent cell can legitimately look new here.
    expect([...pending.cells.get(SHEET)!.values()].map((e) => e.value)).toContain('unsaved')
    // These are not idempotent: replaying a sent one would shift or add twice.
    expect(pending.structuralOps.get(SHEET)).toHaveLength(1)
    expect(pending.structuralOps.get(SHEET)![0]).toMatchObject({ index: 9 })
    expect([...pending.sheets.added.keys()]).toEqual(['sheet-3'])
    expect(pending.tableAdds.map((t) => t.name)).toEqual(['UnsavedTable'])
  })

  it('a re-edited cell is unsent, an untouched one is not', () => {
    const journal = createEditJournal()
    recordSetRangeValues(journal, SHEET, { 0: { 0: { v: 'v1' } }, 1: { 1: { v: 'keep' } } })
    const baseline = saveBaseline(journal)

    recordSetRangeValues(journal, SHEET, { 0: { 0: { v: 'v2' } } })

    const pending = pendingEdits(journal, baseline)
    expect([...pending.cells.get(SHEET)!.values()].map((e) => e.value)).toEqual(['v2'])
  })
})

describe('a split save that is overtaken', () => {
  it('replays the held-back additions instead of treating them as written', async () => {
    const journal = createEditJournal()
    // A new table entangles with the row insert, so the save splits and holds
    // the table back for its second phase.
    recordSetRangeValues(journal, SHEET, { 0: { 0: { v: 'first' } } })
    recordStructuralOp(journal, SHEET, { kind: 'insert-rows', index: 1, count: 1 })
    recordTableAdd(journal, {
      sheetId: SHEET,
      name: 'HeldTable',
      area: { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 },
      columnNames: ['A'],
      bandedRows: true,
    })
    const openLazyWorkbook = vi.fn()
    const ctx: SaveContext = {
      univerRef: { current: null },
      stashViewRestore: () => {},
      lazyWorkbookRef: {
        current: {
          editJournal: journal,
          recalc: {
            timer: null,
            generation: 0,
            failed: false,
            formulaCells: new Map(),
            overlay: new Map(),
          },
          flags: { preloadComplete: true },
          file: { sessionId: SESSION, needsSaveAs: false, restoredFromRecovery: false },
        },
      } as never,
      setMessage: () => {},
      openLazyWorkbook,
    }
    saveWorkbookEdits.mockImplementation(async (request: { mode: string }) => {
      if (request.mode === 'save') {
        // Overtaken while phase one is in flight.
        recordSetRangeValues(journal, SHEET, { 9: { 9: { v: 'late' } } })
      }
      return { canceled: false, file: { sessionId: AFTER_WRITE, path: '/tmp/a.xlsx' } }
    })

    const outcome = await handleSave(ctx, 'save')

    expect(outcome.ok).toBe(true)
    // The held table reaches a later request rather than being written off as
    // already-sent by the first.
    const payloads = saveWorkbookEdits.mock.calls.map(
      (call) => (call[0] as { mode: string; tableAdditions: { name: string }[] }).mode,
    )
    expect(payloads.length).toBeGreaterThan(1)
    const tableNames = saveWorkbookEdits.mock.calls.flatMap(
      (call) => (call[0] as { tableAdditions: { name: string }[] }).tableAdditions,
    )
    expect(tableNames.map((t) => t.name)).toContain('HeldTable')
  })
})
