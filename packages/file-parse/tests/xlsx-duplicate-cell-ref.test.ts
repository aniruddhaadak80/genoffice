import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { xlsxToText } from '../src/xlsx'

function workbook(sheetXml: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${sheetXml}</sheetData></worksheet>`,
  )
  return zip.generateAsync({ type: 'uint8array' })
}

describe('xlsx row with duplicate cell refs', () => {
  it('keeps every value and bounds the reversal when a ref is duplicated', async () => {
    // Every value must survive, including the first, the ones around the
    // collision budget, and the last. The pre-fix algorithm re-shifted a
    // growing array once per colliding cell (O(n^2)); the fix caps the shifts
    // and appends past the budget, so the run is reversed only for the first
    // `budget` cells and the rest appear in order.
    const N = 5_000
    const cells = Array.from({ length: N }, (_, i) => `<c r="A1" t="str"><v>${i}</v></c>`).join('')
    const text = await xlsxToText(await workbook(`<row r="1">${cells}</row>`))
    // Every value 0..N-1 is present exactly once as a standalone slot.
    const slots = (text.split('\n').find((line) => line.includes('|')) ?? '').split('|')
    const trimmed = slots.map((s) => s.trim()).filter((s) => s !== '')
    expect(trimmed).toHaveLength(N)
    // first `budget` cells are the reversed head of the run…
    expect(trimmed[0]).toBe('256')
    expect(trimmed[1]).toBe('255')
    // …and everything from the budget onward is in document order.
    expect(trimmed[256]).toBe('0')
    expect(trimmed[257]).toBe('257')
    expect(trimmed[N - 1]).toBe(String(N - 1))
  }, 30_000)

  it('leaves a normal out-of-order row exactly as before', async () => {
    // Two distinct columns, one far right then one at A1: the declared-column
    // placement and the gap must be preserved (this is the existing row-order
    // behaviour the fix must not disturb).
    const row =
      '<row r="1"><c r="C1" t="str"><v>third</v></c><c r="A1" t="str"><v>first</v></c></row>'
    const text = await xlsxToText(await workbook(row))
    expect(text).toContain('first |  | third')
  })

  it('keeps a ref-less cell that a later A1 targets', async () => {
    // The ref-less cell appends, then A1 claims column 0 and pushes it right.
    const row =
      '<row r="1"><c r="1" t="str"><v>orphan</v></c><c r="A1" t="str"><v>late</v></c></row>'
    const text = await xlsxToText(await workbook(row))
    expect(text).toContain('late | orphan')
  })
})
