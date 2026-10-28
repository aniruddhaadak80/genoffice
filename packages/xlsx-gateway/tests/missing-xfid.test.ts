import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import type { ChangePlan } from '../src/domain/workbook.types'
import { addMissingXfIds } from '../src/gateway/xlsx-styles'
import { applyCellEditsToXlsx, applyPlanToXlsx } from '../src/gateway/xlsx-gateway'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

/// A foreign stylesheet in the shape other generators write: <xf> entries
/// without the optional xfId (ECMA-376 CT_Xf default 0), one mixed-in entry
/// that already carries it.
const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf applyProtection="1"><protection locked="0"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`

const WORKSHEET = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1"><v>3</v></c><c r="B1"/></row></sheetData>
</worksheet>`

async function fixture(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', PACKAGE_RELS)
  zip.file('xl/workbook.xml', WORKBOOK)
  zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS)
  zip.file('xl/styles.xml', STYLES)
  zip.file('xl/worksheets/sheet1.xml', WORKSHEET)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function stylesXmlOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return (await zip.file('xl/styles.xml')!.async('string')).replaceAll('\n', '')
}

function valuePlan(from: CellStateValue, to: CellStateValue): ChangePlan {
  return {
    transactionId: `t-${from}-${to}`,
    baseRevision: 0,
    sheetRenames: [],
    structuralChanges: [],
    formatChanges: [],
    warnings: [],
    cellChanges: [{ sheetId: '1', address: 'A1', before: { value: from }, after: { value: to } }],
  }
}
type CellStateValue = number

describe('styles missing the optional xfId', () => {
  it('addMissingXfIds fills every <xf> that lacks the attribute and keeps the rest verbatim', () => {
    const normalized = addMissingXfIds(STYLES)
    expect(normalized).toContain(
      '<cellStyleXfs count="1"><xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    )
    // a paired <xf> with a child element and one that already carried xfId
    expect(normalized).toContain('<xf xfId="0" applyProtection="1"><protection locked="0"/></xf>')
    expect(normalized).toContain('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>')
    // idempotent
    expect(addMissingXfIds(normalized)).toBe(normalized)
  })

  it('a cell edit on such a workbook saves a stylesheet the formula engine can import', async () => {
    const mutation = await applyCellEditsToXlsx(await fixture(), [
      {
        sheetName: 'Sheet1',
        row: 0,
        column: 1,
        writeValue: true,
        cell: { value: null, formula: '=A1*2' },
      },
    ])
    const styles = await stylesXmlOf(mutation.buffer)
    // every <xf> now carries xfId; the section counts stay put
    const cellXfs = /<cellXfs count="3">([\s\S]*?)<\/cellXfs>/.exec(styles)![1]!
    expect(cellXfs.match(/<xf\b(?![^>]*\bxfId=)[^>]*>/g)).toBeNull()
    const cellStyleXfs = /<cellStyleXfs count="1">([\s\S]*?)<\/cellStyleXfs>/.exec(styles)![1]!
    expect(cellStyleXfs.match(/<xf\b(?![^>]*\bxfId=)[^>]*>/g)).toBeNull()
    expect(styles).toContain('count="3"')
  })

  it('the plan path normalizes the preserved foreign stylesheet too', async () => {
    const mutation = await applyPlanToXlsx(await fixture(), valuePlan(3, 4), { '1': 'Sheet1' })
    const styles = await stylesXmlOf(mutation.buffer)
    expect(styles.match(/<xf\b(?![^>]*\bxfId=)[^>]*>/g)).toBeNull()
  })

  it('a stylesheet that already carries every xfId is written back byte-identical', async () => {
    const first = await applyPlanToXlsx(await fixture(), valuePlan(3, 4), { '1': 'Sheet1' })
    const styles = await stylesXmlOf(first.buffer)
    expect(styles.match(/<xf\b(?![^>]*\bxfId=)[^>]*>/g)).toBeNull()
    // re-saving the normalized file changes nothing further in the part
    const second = await applyPlanToXlsx(first.buffer, valuePlan(4, 5), { '1': 'Sheet1' })
    expect(await stylesXmlOf(second.buffer)).toBe(styles)
  })
})
