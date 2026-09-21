import { describe, expect, it } from 'vitest'
import {
  MAX_MERGED_PDF_PART_CHARS,
  MAX_MERGED_PDF_PARTS,
  validMergedPdfParts,
} from '../src/main/merged-pdf-guard'

describe('merged PDF fragment guard', () => {
  it('accepts a normal fragment list', () => {
    expect(validMergedPdfParts(['AAA', 'BBB'])).toBe(true)
  })

  it('rejects hostile shapes without loading pdf-lib', () => {
    expect(validMergedPdfParts('AAA')).toBe(false)
    expect(validMergedPdfParts([])).toBe(false)
    expect(validMergedPdfParts(new Array(MAX_MERGED_PDF_PARTS + 1).fill('A'))).toBe(false)
    expect(validMergedPdfParts(['A'.repeat(MAX_MERGED_PDF_PART_CHARS + 1)])).toBe(false)
    expect(validMergedPdfParts(['ok', 42])).toBe(false)
    expect(validMergedPdfParts(null)).toBe(false)
  })
})
