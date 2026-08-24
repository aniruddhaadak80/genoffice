import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activateFormulaClosure } from '../src/renderer/univer-sync'
import type { LazyWorkbookState, UniverRuntime } from '../src/renderer/univer-state'

type FormulaCall = { sessionId: string; sheetId: string }
type RangeCall = { sessionId: string; sheetId: string; range: Record<string, number> }

function state(): LazyWorkbookState {
  return {
    file: {
      sessionId: 'session-1',
      sheets: [
        {
          id: 's1',
          name: 'Sheet1',
          rowCount: 100,
          columnCount: 10,
          tables: [],
          pivotTables: [],
          columnWidths: [],
        },
      ],
    },
    generation: 1,
    loadedRanges: new Map(),
    loadingKeys: new Map(),
    retryTimers: new Map(),
    appliedMerges: new Map(),
    appliedRowKeys: new Map(),
    sheetProtections: new Map(),
    sheetPageBreaks: new Map(),
    sheetProtectedRanges: new Map(),
    uninstalledDefinedNames: new Set(),
    appliedCfSheets: new Set(),
    appliedFilterSheets: new Set(),
    appliedDvSheets: new Set(),
    decorationsPendingSheets: new Set(),
    hyperlinkTargets: new Map(),
    frozenStripKeys: new Map(),
    filterOrigins: new Map(),
    showFormulaSheets: new Set(),
    formulaMode: false,
    rowColStyleKeys: new Map(),
    editJournal: {
      cells: new Map(),
      structuralOps: new Map(),
    },
    flags: { preloadComplete: false },
    closure: { status: 'idle', pinned: new Map() },
    formulaText: new Map(),
    cachedFormulaValues: new Map(),
    pivotDefinitions: new Map(),
    outline: new Map(),
    recalc: {
      timer: null,
      generation: 0,
      failures: 0,
      formulaCells: new Map(),
      overlay: new Map(),
    },
  } as unknown as LazyWorkbookState
}

function runtime(): UniverRuntime {
  const worksheet = {
    getSheetId: () => 's1',
  }
  const workbook = {
    getSheetBySheetId: (sheetId: string) => (sheetId === 's1' ? worksheet : null),
  }
  return {
    univerAPI: { getActiveWorkbook: () => workbook },
  } as unknown as UniverRuntime
}

describe('activateFormulaClosure: structural edit during install', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { desktopApi: {} })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gives up instead of installing when a structural op lands mid-install', async () => {
    const lazyState = state()
    const desktop = window.desktopApi as unknown as {
      readWorkbookFormulas: (call: FormulaCall) => Promise<unknown>
      readWorkbookRange: (call: RangeCall) => Promise<unknown>
    }
    let rangeCalls = 0
    desktop.readWorkbookFormulas = async () => ({
      cells: [{ row: 0, column: 0, formula: '=B1+1', value: null }],
      indexingComplete: true,
      truncated: false,
    })
    desktop.readWorkbookRange = async (call: RangeCall) => {
      rangeCalls += 1
      // A structural edit lands between the analysis guard passing and this
      // install read — the closure coordinates are now stale.
      const ops = lazyState.editJournal.structuralOps.get('s1') ?? []
      ops.push({ kind: 'insert-rows', index: 3, count: 2 })
      lazyState.editJournal.structuralOps.set('s1', ops)
      return {
        cells: [{ row: 0, column: 0, formula: '=B1+1', value: 2 }],
        rows: [],
        merges: [],
        hyperlinks: [],
        conditionalRules: [],
        dataValidations: [],
        indexingComplete: true,
        indexedThroughRow: call.range.endRow,
      }
    }

    await activateFormulaClosure(runtime(), { current: lazyState }, () => {})

    // The closure must have given up: status unavailable, nothing pinned,
    // no patch installed at stale coordinates.
    expect(lazyState.closure.status).toBe('unavailable')
    expect(lazyState.closure.pinned.size).toBe(0)
  })
})
