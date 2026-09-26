import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  inlineImagesForSingleFile,
  localScriptSources,
  localStylesheetSources,
  omittedSingleFileSources,
  singleFileExportBaseName,
} from '../src/main/single-file-html'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

let dir: string
let docPath: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'goff-single-file-'))
  docPath = join(dir, 'page.html')
  await writeFile(docPath, '<!doctype html>', 'utf8')
  await mkdir(join(dir, 'assets'))
  const png = Buffer.from(PNG_BASE64, 'base64')
  await writeFile(join(dir, 'assets', 'logo.png'), png)
  // "save page as, complete" assets carry no extension: the signature types them
  await writeFile(join(dir, 'assets', 'photo'), png)
  await writeFile(join(dir, 'outside.png'), png)
  await writeFile(join(dir, 'style.css'), '.a { color: red; }', 'utf8')
  await writeFile(join(dir, 'app.js'), 'console.log(1)', 'utf8')
  await writeFile(join(dir, 'inter.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('inlineImagesForSingleFile', () => {
  it('inlines img srcs and CSS url() refs, preserving quote style', async () => {
    const html = [
      '<html><head><style>',
      '.hero { background-image: url(assets/logo.png); }',
      '.card { background: url("assets/logo.png") no-repeat; }',
      '</style></head><body>',
      '<img src="assets/logo.png" alt="logo" width="120">',
      `<div style="background-image: url('assets/logo.png')">x</div>`,
      '</body></html>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.inlined).toBe(4)
    expect(r.skipped).toEqual([])
    expect(r.html).toContain(`<img src="${PNG_DATA_URL}" alt="logo" width="120">`)
    expect(r.html).toContain(`background-image: url(${PNG_DATA_URL});`)
    expect(r.html).toContain(`background: url("${PNG_DATA_URL}") no-repeat;`)
    expect(r.html).toContain(`background-image: url('${PNG_DATA_URL}')`)
    expect(r.html).not.toContain('assets/logo.png')
  })

  it('types an extensionless asset from its binary signature', async () => {
    const r = await inlineImagesForSingleFile('<img src="assets/photo">', docPath)
    expect(r.inlined).toBe(1)
    expect(r.html).toContain(PNG_DATA_URL)
  })

  it('leaves external, data: and unresolvable references untouched', async () => {
    const html = [
      '<img src="https://cdn.example/pic.png">',
      '<img src="//cdn.example/pic2.png">',
      `<img src="${PNG_DATA_URL}">`,
      '<img src="assets/missing.png">',
      '<img src="../outside.png">',
      '<style>.a { background: url(https://cdn.example/bg.png); }</style>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.html).toBe(html)
    expect(r.inlined).toBe(0)
    // only the local-looking refs are reported; external URLs are expected to stay
    expect(r.skipped.sort()).toEqual(['../outside.png', 'assets/missing.png'])
  })

  it('returns an unsaved document unchanged (its images are already data URLs)', async () => {
    const html = '<img src="assets/logo.png">'
    const r = await inlineImagesForSingleFile(html, null)
    expect(r.html).toBe(html)
    expect(r.inlined).toBe(0)
  })

  it('inlines every occurrence of a repeated source', async () => {
    const html = '<img src="assets/logo.png"><img src="assets/logo.png">'
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.inlined).toBe(2)
    expect(r.html).not.toContain('assets/logo.png')
  })

  it('inlines indented <img> tags: pretty-printed markup is not a Markdown code block', async () => {
    const html = [
      '<html>',
      '  <body>',
      '    <section>',
      '      <img src="assets/logo.png" alt="four spaces">',
      '\t<img src="assets/photo" alt="tab">',
      '    </section>',
      '    <p>![not an image](assets/logo.png)</p>',
      '  </body>',
      '</html>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.inlined).toBe(2)
    expect(r.skipped).toEqual([])
    expect(r.html).toContain(`      <img src="${PNG_DATA_URL}" alt="four spaces">`)
    expect(r.html).toContain(`\t<img src="${PNG_DATA_URL}" alt="tab">`)
    // Markdown image syntax is literal text in an HTML document
    expect(r.html).toContain('<p>![not an image](assets/logo.png)</p>')
  })
})

describe('assets the single-file export cannot carry', () => {
  it('reports a local stylesheet instead of dropping it silently', async () => {
    const html = [
      '<html><head><link rel="stylesheet" href="style.css"></head>',
      '<body><p>text</p></body></html>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.skipped).toEqual(['style.css'])
    expect(r.inlined).toBe(0)
    expect(r.html).toContain('<link rel="stylesheet" href="style.css">')
  })

  it('reports a local script', async () => {
    const html = '<html><body><script src="app.js"></script></body></html>'
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.skipped).toEqual(['app.js'])
    expect(r.html).toContain('<script src="app.js"></script>')
  })

  it('reports a font referenced from CSS', async () => {
    const html = [
      '<html><head><style>',
      "@font-face { src: url('inter.woff2'); }",
      '</style></head><body></body></html>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.skipped).toEqual(['inter.woff2'])
    expect(r.html).toContain("url('inter.woff2')")
  })

  it('reports every omitted local asset in one export', async () => {
    const html = [
      '<html><head>',
      '<link rel="stylesheet" href="style.css">',
      '<link rel="icon" href="assets/logo.png">',
      '</head><body>',
      '<script src="app.js"></script>',
      '<img src="assets/logo.png" alt="inlined">',
      '</body></html>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.inlined).toBe(1)
    expect(r.skipped.sort()).toEqual(['app.js', 'style.css'])
    expect(r.html).toContain(PNG_DATA_URL)
  })

  it('does not report external or data: stylesheets and scripts', async () => {
    const html = [
      '<html><head>',
      '<link rel="stylesheet" href="https://cdn.example/site.css">',
      '<link rel="stylesheet" href="//cdn.example/site2.css">',
      '</head><body><script src="https://cdn.example/app.js"></script></body></html>',
    ].join('\n')
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.skipped).toEqual([])
    expect(r.html).toBe(html)
  })

  it('ignores links that are not stylesheets', async () => {
    const html = '<html><head><link rel="preload" href="style.css" as="style"></head></html>'
    const r = await inlineImagesForSingleFile(html, docPath)
    expect(r.skipped).toEqual([])
  })

  it('reports nothing for an unsaved document', async () => {
    const html = '<link rel="stylesheet" href="style.css"><script src="app.js"></script>'
    const r = await inlineImagesForSingleFile(html, null)
    expect(r.skipped).toEqual([])
    expect(r.html).toBe(html)
  })
})

describe('local asset scanners', () => {
  it('finds local stylesheets regardless of attribute order or quote style', () => {
    expect(localStylesheetSources('<link href="a.css" rel="stylesheet">')).toEqual(['a.css'])
    expect(localStylesheetSources("<link rel='stylesheet' href='b.css'>")).toEqual(['b.css'])
    expect(localStylesheetSources('<link rel=stylesheet href=c.css>')).toEqual(['c.css'])
    expect(localStylesheetSources('<link rel="stylesheet">')).toEqual([])
  })

  it('finds local scripts regardless of quote style', () => {
    expect(localScriptSources('<script src="a.js"></script>')).toEqual(['a.js'])
    expect(localScriptSources("<script defer src='b.js'>")).toEqual(['b.js'])
    expect(localScriptSources('<script src=c.js>')).toEqual(['c.js'])
    expect(localScriptSources('<script>inline()</script>')).toEqual([])
  })

  it('deduplicates a source referenced more than once', () => {
    const html = [
      '<link rel="stylesheet" href="a.css">',
      '<link rel="stylesheet" href="a.css">',
      '<script src="a.css"></script>',
    ].join('')
    expect(omittedSingleFileSources(html)).toEqual(['a.css'])
  })
})

describe('singleFileExportBaseName', () => {
  it('suffixes the name so the default save path is never the open document', () => {
    expect(singleFileExportBaseName('landing')).toBe('landing.single')
  })

  it('does not stack the suffix when re-exporting an exported copy', () => {
    expect(singleFileExportBaseName('landing.single')).toBe('landing.single')
    expect(singleFileExportBaseName('landing.SINGLE')).toBe('landing.single')
  })
})
