import { describe, expect, it } from 'vitest'
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

  it('inserts a space between same-line words with a gap', async () => {
    const stream = 'BT /F1 24 Tf 72 720 Td (Hello) Tj 200 0 Td (World) Tj ET'
    const bodies = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let out = '%PDF-1.4\n'
    const offsets: number[] = [0]
    for (let i = 0; i < bodies.length; i++) {
      offsets.push(out.length)
      out += `${i + 1} 0 obj\n${bodies[i]}\nendobj\n`
    }
    const xrefStart = out.length
    out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
    for (let i = 1; i <= bodies.length; i++) {
      out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    }
    out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    const bytes = new TextEncoder().encode(out)
    const path = writeFixture('gap.pdf', bytes)
    const result = await parseFileToText(path)
    expect(result.ok).toBe(true)
    expect(result.text).toContain('Hello World')
  })
})
