import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createI18n } from '@genoffice/i18n'
import { normalizeRecentQuery, pageRecentPaths } from '../src/main/recent-files'
import { fileCountKey, timelineCountKey, visiblePageCount } from '../src/renderer/src/counts'
import { strings } from '../src/renderer/src/strings'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('home visible counts', () => {
  it('uses the filtered total for the sidebar count', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-counts-'))
    tempDirs.push(dir)
    const docPath = join(dir, 'notes.docx')
    const slidePath = join(dir, 'deck.pptx')
    writeFileSync(docPath, 'doc')
    writeFileSync(slidePath, 'slide')

    const page = pageRecentPaths(
      [docPath, slidePath],
      { ext: 'docx', offset: 0, limit: 50 },
      new Set(),
    )

    expect(page.totalAll).toBe(2)
    expect(page.total).toBe(1)
    expect(page.entries.map((entry) => entry.path)).toEqual([docPath])
    expect(visiblePageCount(page)).toBe(1)
  })

  it('counts .xlsm under the sheets (xlsx) filter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-counts-'))
    tempDirs.push(dir)
    const bookPath = join(dir, 'book.xlsx')
    const macroPath = join(dir, 'macro.xlsm')
    const docPath = join(dir, 'notes.docx')
    writeFileSync(bookPath, 'sheet')
    writeFileSync(macroPath, 'sheet')
    writeFileSync(docPath, 'doc')

    const page = pageRecentPaths(
      [bookPath, macroPath, docPath],
      { ext: 'xlsx', offset: 0, limit: 50 },
      new Set(),
    )

    expect(page.total).toBe(2)
    expect(page.entries.map((entry) => entry.path)).toEqual([bookPath, macroPath])
  })

  it('counts legacy .xls under the sheets (xlsx) filter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-counts-'))
    tempDirs.push(dir)
    const bookPath = join(dir, 'book.xlsx')
    const legacyPath = join(dir, 'legacy.xls')
    const docPath = join(dir, 'notes.docx')
    writeFileSync(bookPath, 'sheet')
    writeFileSync(legacyPath, 'sheet')
    writeFileSync(docPath, 'doc')

    const page = pageRecentPaths(
      [bookPath, legacyPath, docPath],
      { ext: 'xlsx', offset: 0, limit: 50 },
      new Set(),
    )

    expect(page.total).toBe(2)
    expect(page.entries.map((entry) => entry.path)).toEqual([bookPath, legacyPath])
  })

  it('keeps unavailable paths listed at their position, flagged missing (r158)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-counts-'))
    tempDirs.push(dir)
    const existingPath = join(dir, 'existing.xlsx')
    const missingPath = join(dir, 'missing.xlsx')
    writeFileSync(existingPath, 'sheet')

    const page = pageRecentPaths([missingPath, existingPath], {}, new Set())

    // a transiently unstat-able file (disconnected drive, pending mount) must
    // not vanish from the list — it renders dimmed with an unavailable state
    expect(page.total).toBe(2)
    expect(page.totalAll).toBe(2)
    expect(page.entries.map((entry) => [entry.path, entry.missing === true])).toEqual([
      [missingPath, true],
      [existingPath, false],
    ])
    expect(page.entries[0].mtimeMs).toBe(0)
    expect(page.entries[0].ext).toBe('xlsx')
  })
})

describe('recent query ext normalization', () => {
  it('trims whitespace, strips leading dots, and lowercases the filter', () => {
    expect(normalizeRecentQuery({ ext: '.XLSX' }).ext).toBe('xlsx')
    expect(normalizeRecentQuery({ ext: ' xlsx ' }).ext).toBe('xlsx')
    expect(normalizeRecentQuery({ ext: '...md' }).ext).toBe('md')
    expect(normalizeRecentQuery({ ext: '...' }).ext).toBeUndefined()
    expect(normalizeRecentQuery({ ext: '' }).ext).toBeUndefined()
    expect(normalizeRecentQuery({}).ext).toBeUndefined()
  })

  it('applies the normalized filter to the page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-counts-'))
    tempDirs.push(dir)
    const bookPath = join(dir, 'book.xlsx')
    writeFileSync(bookPath, 'sheet')

    const page = pageRecentPaths([bookPath], { ext: '.XLSX', limit: 50 }, new Set())
    expect(page.total).toBe(1)
    expect(page.entries.map((entry) => entry.path)).toEqual([bookPath])
  })

  it('shares the sheets/html families with the starred view (same helper)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shell-counts-'))
    tempDirs.push(dir)
    const htmPath = join(dir, 'page.htm')
    const htmlPath = join(dir, 'page.html')
    const legacyPath = join(dir, 'legacy.xls')
    writeFileSync(htmPath, 'html')
    writeFileSync(htmlPath, 'html')
    writeFileSync(legacyPath, 'sheet')
    // pageRecentPaths is the recents helper; starred now calls the same
    // matchesExtFamily, so assert the family includes both spellings
    expect(
      pageRecentPaths([htmPath, legacyPath], { ext: 'html', limit: 50 }, new Set()).total,
    ).toBe(1)
    expect(
      pageRecentPaths([htmPath, legacyPath], { ext: 'xlsx', limit: 50 }, new Set()).total,
    ).toBe(1)
    expect(pageRecentPaths([htmlPath], { ext: 'htm', limit: 50 }, new Set()).total).toBe(0)
  })
})

describe('count labels', () => {
  const translate = createI18n(strings)
  const files = (lang: Parameters<typeof fileCountKey>[0], n: number) =>
    translate(lang, fileCountKey(lang, n), { n })
  const items = (lang: Parameters<typeof timelineCountKey>[0], n: number) =>
    translate(lang, timelineCountKey(lang, n), { n })

  it('uses singular and plural file labels', () => {
    expect(files('en', 1)).toBe('1 file')
    expect(files('en', 2)).toBe('2 files')
  })

  it('uses singular and plural activity item labels', () => {
    expect(items('en', 1)).toBe('1 item')
    expect(items('en', 2)).toBe('2 items')
  })

  it('picks the singular form in every locale with plural inflection', () => {
    expect(files('fr', 1)).toBe('1 fichier')
    expect(files('de', 1)).toBe('1 Datei')
    expect(files('zh', 1)).toBe('1 个文件')
  })

  it('uses the French singular for zero instead of the generic plural', () => {
    expect(files('fr', 0)).toBe('0 fichier')
    expect(items('fr', 0)).toBe('0 élément')
    expect(fileCountKey('fr', 0)).toBe('fileCountOne')
  })

  it('separates the Russian few category from many', () => {
    expect(files('ru', 1)).toBe('1 файл')
    expect(files('ru', 2)).toBe('2 файла')
    expect(files('ru', 5)).toBe('Файлов: 5')
    expect(fileCountKey('ru', 2)).toBe('fileCountFew')
    expect(fileCountKey('ru', 5)).toBe('fileCountMany')
  })

  it('separates the Polish and Czech few categories', () => {
    expect(files('pl', 2)).toBe('2 pliki')
    expect(files('pl', 5)).toBe('Pliki: 5')
    expect(files('cs', 2)).toBe('2 soubory')
    expect(files('cs', 5)).toBe('5 souborů')
  })

  it('reaches the Arabic zero, two, few and many categories', () => {
    expect(fileCountKey('ar', 0)).toBe('fileCountZero')
    expect(fileCountKey('ar', 1)).toBe('fileCountOne')
    expect(fileCountKey('ar', 2)).toBe('fileCountTwo')
    expect(fileCountKey('ar', 3)).toBe('fileCountFew')
    expect(fileCountKey('ar', 11)).toBe('fileCountMany')
    expect(files('ar', 1)).toBe('ملف واحد')
    expect(files('ar', 2)).toBe('ملفان')
  })

  it('reaches the Hebrew dual category', () => {
    expect(fileCountKey('he', 1)).toBe('fileCountOne')
    expect(fileCountKey('he', 2)).toBe('fileCountTwo')
    expect(files('he', 2)).toBe('שני קבצים')
  })

  it('keeps one form for languages without inflection', () => {
    for (const lang of ['zh', 'zh-TW', 'ja', 'ko', 'th', 'id', 'ms'] as const) {
      for (const n of [0, 1, 2, 5, 100])
        expect(fileCountKey(lang, n), `${lang} ${n}`).toBe('fileCountOther')
    }
    expect(files('ja', 3)).toBe('3 個のファイル')
  })
})
