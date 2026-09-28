import { describe, expect, it } from 'vitest'
import { parseFileToText } from '../src/index'
import { resolveTarget } from '../src/opc'
import { writeFixture } from './helpers/fixtures'

describe('parseFileToText: plain-text formats', () => {
  const cases: Array<[string, string]> = [
    ['sample.txt', 'plain text hello'],
    ['sample.md', '# Title\n\nBody paragraph'],
    ['sample.csv', 'a,b,c\n1,2,3'],
    ['sample.tsv', 'a\tb\tc\n1\t2\t3'],
    ['sample.json', '{"key":"value"}'],
    ['sample.xml', '<root><item>value</item></root>'],
    ['sample.html', '<html><body><p>page</p></body></html>'],
    ['sample.py', 'def hello():\n    return "world"'],
  ]

  for (const [name, content] of cases) {
    it(`reads ${name} verbatim`, async () => {
      const path = writeFixture(name, content)
      const result = await parseFileToText(path)
      expect(result).toEqual({ ok: true, kind: 'text', text: content })
    })
  }

  it('is case-insensitive on the extension', async () => {
    const path = writeFixture('UPPER.TXT', 'upper')
    const result = await parseFileToText(path)
    expect(result.ok).toBe(true)
    expect(result.text).toBe('upper')
  })

  it('fails gracefully on a missing file', async () => {
    const result = await parseFileToText('/nonexistent/nowhere.txt')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('strips a UTF-8 BOM from text files', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf])
    const body = Buffer.from('hello world', 'utf-8')
    const path = writeFixture('bom.txt', Buffer.concat([bom, body]))
    const result = await parseFileToText(path)
    expect(result).toEqual({ ok: true, kind: 'text', text: 'hello world' })
  })

  it('decodes UTF-16LE with BOM', async () => {
    const bom = Buffer.from([0xff, 0xfe])
    const body = Buffer.from('hello world', 'utf16le')
    const path = writeFixture('utf16le.txt', Buffer.concat([bom, body]))
    const result = await parseFileToText(path)
    expect(result).toEqual({ ok: true, kind: 'text', text: 'hello world' })
  })

  it('decodes UTF-16BE with BOM', async () => {
    const bom = Buffer.from([0xfe, 0xff])
    const body = Buffer.from('hello world', 'utf16le').swap16()
    const path = writeFixture('utf16be.txt', Buffer.concat([bom, body]))
    const result = await parseFileToText(path)
    expect(result).toEqual({ ok: true, kind: 'text', text: 'hello world' })
  })
})

describe('OPC relationship targets', () => {
  it('decodes percent-encoded targets and normalizes backslashes', () => {
    expect(resolveTarget('ppt/presentation.xml', 'slides/slide%201.xml')).toBe(
      'ppt/slides/slide 1.xml',
    )
    expect(resolveTarget('ppt/slides/slide1.xml', '..\\media\\image%201.png')).toBe(
      'ppt/media/image 1.png',
    )
  })
})

describe('parseFileToText: images and unsupported', () => {
  it('flags png as image without extracting text', async () => {
    const path = writeFixture('pic.png', Buffer.from('89504e47', 'hex'))
    const result = await parseFileToText(path)
    expect(result).toEqual({ ok: true, kind: 'image', mime: 'image/png' })
  })

  it.each([
    ['pic.jpg', 'image/jpeg'],
    ['pic.jpeg', 'image/jpeg'],
    ['pic.gif', 'image/gif'],
    ['pic.webp', 'image/webp'],
  ])('maps %s to mime %s', async (name, mime) => {
    const path = writeFixture(name, Buffer.from([0]))
    const result = await parseFileToText(path)
    expect(result.kind).toBe('image')
    expect(result.mime).toBe(mime)
  })

  it('rejects unknown extensions as unsupported', async () => {
    const path = writeFixture('archive.zip', Buffer.from([0x50, 0x4b]))
    const result = await parseFileToText(path)
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('unsupported')
    expect(result.error).toContain('.zip')
  })
})
