import { describe, expect, it } from 'vitest'
import { parseDocx, saveDocx } from '../src/index'
import { scanBody } from '../src/scan'
import { buildDocx } from './helpers/build-docx'

describe('scanBody with multiple <w:body> elements', () => {
  it('keeps scanning past </w:body> into later sibling bodies (POI MultipleBodyBug)', () => {
    const xml =
      '<w:document>' +
      '<w:body><w:p><w:r><w:t>BODY 1</w:t></w:r></w:p></w:body>' +
      '<w:body><w:p><w:r><w:t>BODY 2</w:t></w:r></w:p></w:body>' +
      '<w:body><w:p><w:r><w:t>BODY 3</w:t></w:r></w:p></w:body>' +
      '</w:document>'
    const scan = scanBody(xml)
    expect(scan.elements.map((e) => e.name)).toEqual(['w:p', 'w:p', 'w:p'])
    expect(xml.slice(scan.elements[2].start, scan.elements[2].end)).toContain('BODY 3')
    expect(scan.innerEnd).toBe(scan.elements[2].end)
  })

  it('single body still terminates at its closing tag', () => {
    const xml = '<w:document><w:body><w:p/></w:body></w:document>'
    expect(scanBody(xml).elements.map((e) => e.name)).toEqual(['w:p'])
  })
})

describe('opaque body regions', () => {
  const opaque =
    '<!-- <w:p><w:r><w:t>PHANTOM</w:t></w:r></w:p> </w:body> -->' +
    '<![CDATA[<w:p><w:r><w:t>CDATA</w:t></w:r></w:p> </w:body>]]>' +
    '<?probe <w:p><w:r><w:t>PI</w:t></w:r></w:p>?>'
  const before = '<w:p><w:r><w:t>before</w:t></w:r></w:p>'
  const after = '<w:p><w:r><w:t>after</w:t></w:r></w:p>'

  it('does not scan tags or body terminators inside comments, CDATA, or processing instructions', () => {
    const xml = `<w:document><w:body>${opaque}${before}</w:body></w:document>`
    const scan = scanBody(xml)

    expect(scan.elements).toHaveLength(1)
    expect(scan.elements[0].name).toBe('w:p')
    expect(xml.slice(scan.elements[0].start, scan.elements[0].end)).toBe(before)
    expect(scan.innerStart).toBe(xml.indexOf(before))
    expect(scan.innerEnd).toBe(xml.indexOf(before) + before.length)
  })

  it('preserves opaque regions when splicing an edited body', async () => {
    const source = await buildDocx({ bodyXml: before + opaque + after })
    const doc = await parseDocx(source)
    expect(
      doc.blocks.filter((block) => !block.hidden).map((block) => block.runs?.[0]?.text),
    ).toEqual(['before', 'after'])

    const saved = await saveDocx(doc, [
      { kind: 'original', docxIndex: 0 },
      {
        kind: 'generated',
        block: { type: 'paragraph', runs: [{ text: 'edited' }] },
      },
    ])
    const reparsed = await parseDocx(saved)

    expect(reparsed.internal.documentXml).toContain(opaque)
    expect(
      reparsed.blocks.filter((block) => !block.hidden).map((block) => block.runs?.[0]?.text),
    ).toEqual(['before', 'edited'])
  })
})
