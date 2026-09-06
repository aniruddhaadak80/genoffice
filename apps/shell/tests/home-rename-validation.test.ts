import { describe, expect, it } from 'vitest'

import { isCaseOnlyRename, isValidRenameName } from '../src/main/rename-validation'

describe('home rename validation', () => {
  it('rejects every Windows-illegal name character with the localized gate', () => {
    for (const bad of ['\\', '/', ':', '*', '?', '"', '<', '>', '|', 'a\0b', 'a\x01b']) {
      expect(isValidRenameName(`report${bad}.pdf`)).toBe(false)
    }
    expect(isValidRenameName('')).toBe(false)
    expect(isValidRenameName('quarterly report (final).pdf')).toBe(true)
    expect(isValidRenameName('ski⛷report.pdf')).toBe(true)
  })

  it('recognizes case-only renames so the exists gate can be skipped', () => {
    expect(isCaseOnlyRename('/d/Report.pdf', '/d/report.pdf')).toBe(true)
    expect(isCaseOnlyRename('/d/report.pdf', '/d/report.pdf')).toBe(false)
    expect(isCaseOnlyRename('/d/report.pdf', '/d/other.pdf')).toBe(false)
    expect(isCaseOnlyRename('/d/report.pdf', '/e/report.pdf')).toBe(false)
  })

  it('rejects Windows reserved names, trailing dots, and overlong names', () => {
    for (const bad of [
      'CON',
      'con.pdf',
      'PRN.docx',
      'aux',
      'NUL.txt',
      'COM1',
      'com9.pdf',
      'LPT1',
      'lpt9.xlsx',
    ]) {
      expect(isValidRenameName(bad)).toBe(false)
    }
    expect(isValidRenameName('report.')).toBe(false)
    expect(isValidRenameName('.')).toBe(false)
    expect(isValidRenameName('a'.repeat(256))).toBe(false)
    expect(isValidRenameName('com10.pdf')).toBe(true)
    expect(isValidRenameName('my CON file.pdf')).toBe(true)
    expect(isValidRenameName('a'.repeat(255))).toBe(true)
  })
})
