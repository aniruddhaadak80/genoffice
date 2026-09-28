import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { parseFileToText } from '../src/index'
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

  it('rejects a ZIP named .pdf with a content-mismatch error', async () => {
    const zip = new JSZip()
    zip.file('test.txt', 'hello')
    const path = writeFixture('sneaky.pdf', await zip.generateAsync({ type: 'uint8array' }))
    const result = await parseFileToText(path)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Content mismatch')
  })
})
