import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isSameFile } from '../src/main/rename-validation'

const source = readFileSync(join(__dirname, '../src/main/index.ts'), 'utf8')

function section(text: string, start: string, end: string): string {
  return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)))
}

function caseInsensitiveVolume(dir: string): boolean {
  const probe = join(dir, 'Probe')
  writeFileSync(probe, 'x')
  const insensitive = existsSync(join(dir, 'probe'))
  rmSync(probe, { force: true })
  return insensitive
}

describe('PDF Save As same-file guard', () => {
  const savePdfAs = section(source, 'async function savePdfAs', 'let exportingPdfDocx')

  it('recognises the destination by file identity, not by path spelling', () => {
    expect(savePdfAs).toContain('isSameFile(picked.filePath, tab.filePath)')
    expect(savePdfAs).not.toContain('picked.filePath === tab.filePath')
  })

  it('guards both the renderer save and the byte copy behind the one check', () => {
    const check = savePdfAs.indexOf('isSameFile(picked.filePath, tab.filePath)')
    expect(check).toBeGreaterThan(-1)
    expect(savePdfAs.indexOf('requestPdfSaveAs')).toBeGreaterThan(check)
    expect(savePdfAs.indexOf('copyFileSync')).toBeGreaterThan(check)
  })
})

describe('isSameFile across path spellings', () => {
  it('matches a case variant on a case-insensitive volume and not on a case-sensitive one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'same-file-'))
    try {
      const file = join(dir, 'Report.pdf')
      writeFileSync(file, 'x')
      const variant = join(dir, 'report.pdf')
      expect(isSameFile(file, file)).toBe(true)
      expect(isSameFile(file, variant)).toBe(caseInsensitiveVolume(dir))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
