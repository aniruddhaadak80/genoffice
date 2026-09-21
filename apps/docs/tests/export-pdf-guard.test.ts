import { describe, expect, it } from 'vitest'
import { validExportScale, validExportTwips } from '../src/main/export-pdf-guard'

describe('export-pdf guards', () => {
  it('accepts real page sizes and default scale', () => {
    expect(validExportTwips(12240)).toBe(true)
    expect(validExportTwips(15840)).toBe(true)
    expect(validExportScale(undefined)).toBe(true)
    expect(validExportScale(1)).toBe(true)
  })

  it('rejects non-finite and out-of-range geometry', () => {
    for (const v of [NaN, Infinity, -Infinity, 0, 1000, 50000, 1e12, '12240', null]) {
      expect(validExportTwips(v)).toBe(false)
    }
    for (const s of [NaN, Infinity, 0, 0.05, 5.1, '2']) {
      expect(validExportScale(s)).toBe(false)
    }
  })
})
