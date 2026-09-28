import { describe, expect, it } from 'vitest'

import { applyDvRules } from '@genoffice/xlsx-gateway/gateway/xlsx-dv'

const SHEET =
  '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'

describe('dv quotes', () => {
  it('doubles embedded quotes in list literals', () => {
    const xml = applyDvRules(SHEET, [
      {
        ranges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }],
        rule: { type: 'list', formula1: 'a"b,c' },
      },
    ])
    expect(xml).toContain('<formula1>"a""b,c"</formula1>')
  })
})
