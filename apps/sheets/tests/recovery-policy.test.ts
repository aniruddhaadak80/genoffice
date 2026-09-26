import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  allowsAutomaticWorkbookRecovery,
  MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES,
  pendingRecoveryCopy,
} from '../src/main/recovery-policy'

describe('automatic workbook recovery policy', () => {
  it('allows normal workbooks and older sidecar metadata', () => {
    expect(allowsAutomaticWorkbookRecovery([{ sourceXmlBytes: 8 * 1024 * 1024 }])).toBe(true)
    expect(allowsAutomaticWorkbookRecovery([{}])).toBe(true)
  })

  it('disables background rewriting when any worksheet XML entry is oversized', () => {
    expect(
      allowsAutomaticWorkbookRecovery([
        { sourceXmlBytes: 4 * 1024 * 1024 },
        { sourceXmlBytes: MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES + 1 },
      ]),
    ).toBe(false)
  })

  it('accepts an entry at the memory-safe limit', () => {
    expect(
      allowsAutomaticWorkbookRecovery([
        { sourceXmlBytes: MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES },
      ]),
    ).toBe(true)
  })
})

describe('pending workbook recovery copy', () => {
  let dir: string
  let workbook: string
  let copy: string

  function write(path: string, body: string, mtimeSeconds?: number): void {
    writeFileSync(path, body)
    if (mtimeSeconds !== undefined) utimesSync(path, mtimeSeconds, mtimeSeconds)
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sheets-recovery-'))
    workbook = join(dir, 'Budget.xlsx')
    copy = join(dir, 'Budget.recovery.xlsx')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('has nothing to offer when no copy was written', () => {
    write(workbook, 'saved')
    expect(pendingRecoveryCopy({ copyPath: copy, sourcePath: workbook })).toBe('none')
  })

  it('offers unsaved work from a lost session', () => {
    write(workbook, 'saved', 1_000)
    write(copy, 'edited but never saved', 2_000)
    expect(pendingRecoveryCopy({ copyPath: copy, sourcePath: workbook })).toBe('offer')
  })

  it('still offers the copy when another program only touched the workbook', () => {
    write(workbook, 'edited elsewhere', 3_000)
    write(copy, 'pre-crash edits', 2_000)
    expect(pendingRecoveryCopy({ copyPath: copy, sourcePath: workbook })).toBe('offer')
  })

  it('drops a copy that the workbook already duplicates byte for byte', () => {
    write(workbook, 'same bytes', 3_000)
    write(copy, 'same bytes', 2_000)
    expect(pendingRecoveryCopy({ copyPath: copy, sourcePath: workbook })).toBe('drop-duplicate')
  })
})
