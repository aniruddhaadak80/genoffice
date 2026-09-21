import { describe, expect, it } from 'vitest'
import { parseFileToText } from '../src/index'
import { MAX_EXTRACTED_CHARS } from '../src/parse'
import { MAX_PDF_RAW_CHARS } from '../src/pdf'
import { buildPdfFixture, writeFixture } from './helpers/fixtures'

describe('parseFileToText: pdf', () => {
  it('extracts page text via pdfjs', async () => {
    const path = writeFixture('doc.pdf', buildPdfFixture('Hello PDF parsing'))
    const result = await parseFileToText(path)
    expect(result.ok).toBe(true)
    expect(result.kind).toBe('text')
    expect(result.text).toContain('Hello PDF parsing')
  })

  it('fails gracefully on a corrupt pdf', async () => {
    const path = writeFixture('broken.pdf', Buffer.from('%PDF-1.4 garbage'))
    const result = await parseFileToText(path)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('stops page iteration above the downstream truncation cap', () => {
    // Output is truncated to MAX_EXTRACTED_CHARS, so breaking raw
    // extraction above that cap keeps parsed output byte-identical.
    expect(MAX_PDF_RAW_CHARS).toBeGreaterThan(MAX_EXTRACTED_CHARS)
  })
})
