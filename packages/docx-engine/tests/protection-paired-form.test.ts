import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { parseDocx, saveDocx, type DocProtection, type SaveBlock } from '../src/index'
import { buildDocx } from './helpers/build-docx'

const BODY = '<w:p><w:r><w:t>body</w:t></w:r></w:p>'
const SETTINGS_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

const settingsPart = (inner: string) => `${XML_DECL}<w:settings ${W_NS}>${inner}</w:settings>`

/** the legal paired spelling of w:documentProtection, as a producer may emit it */
const PAIRED = '<w:documentProtection w:edit="readOnly" w:enforcement="1"></w:documentProtection>'
const SELF_CLOSING = '<w:documentProtection w:edit="readOnly" w:enforcement="1"/>'

async function settingsOf(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file('word/settings.xml')!.async('string')
}

const count = (xml: string, tag: string): number =>
  (xml.match(new RegExp(`<${tag}`, 'g')) ?? []).length

async function sourceWith(settingsInner: string): Promise<Uint8Array> {
  return buildDocx({
    bodyXml: BODY,
    extraParts: [
      { path: 'word/settings.xml', xml: settingsPart(settingsInner), contentType: SETTINGS_TYPE },
    ],
  })
}

type ParsedDoc = Awaited<ReturnType<typeof parseDocx>>

const asOriginal = (doc: ParsedDoc): SaveBlock[] =>
  doc.blocks.filter((b) => !b.hidden).map((b) => ({ kind: 'original', docxIndex: b.docxIndex! }))

async function saveWith(settingsInner: string, protection: DocProtection | null): Promise<string> {
  const parsed = await parseDocx(await sourceWith(settingsInner))
  const saved = await saveDocx(parsed, [{ kind: 'original', docxIndex: 0 }], { protection })
  return settingsOf(saved)
}

describe('documentProtection written as an element pair', () => {
  // <w:documentProtection></w:documentProtection> is legal OOXML and this repo's
  // own reader accepts it (parse-package matches "(?:/>|>)"). The removal in
  // applyProtection matched only the self-closing form, so the paired element
  // survived a save: clearing protection did nothing at all, and setting a new
  // one appended a second element, leaving two w:documentProtection children in
  // a CT_Settings sequence that allows one (schema-invalid) with protection
  // still switched on. This is the same asymmetry applySettingsFlag already
  // fixed for the on/off flags.
  it('removes a paired documentProtection when protection is set to null', async () => {
    const xml = await saveWith(PAIRED, null)
    expect(count(xml, 'w:documentProtection')).toBe(0)
    expect(xml).not.toContain('</w:documentProtection>')
    expect(xml).not.toContain('w:enforcement')
  })

  it('leaves exactly one documentProtection when a new one replaces a paired form', async () => {
    const xml = await saveWith(PAIRED, { edit: 'comments', enforced: true })
    expect(count(xml, 'w:documentProtection')).toBe(1)
    expect(xml).not.toContain('</w:documentProtection>')
    expect(xml).not.toContain('w:edit="readOnly"')
    expect(xml).toContain('w:edit="comments"')
  })

  it('still handles the self-closing spelling unchanged', async () => {
    expect(count(await saveWith(SELF_CLOSING, null), 'w:documentProtection')).toBe(0)
    expect(
      count(
        await saveWith(SELF_CLOSING, { edit: 'comments', enforced: true }),
        'w:documentProtection',
      ),
    ).toBe(1)
  })

  // Round-trip fidelity: drive the real save path, then re-open the bytes and
  // read protection back through the parser, so the assertion covers the
  // writer/reader pair rather than a string match alone.
  it('round-trips replace-then-clear through parse -> save -> parse', async () => {
    const parsed = await parseDocx(await sourceWith(PAIRED))
    expect(parsed.protection).toEqual({ edit: 'readOnly', enforced: true })

    const replaced = await saveDocx(parsed, asOriginal(parsed), {
      protection: { edit: 'trackedChanges', enforced: false },
    })
    const afterReplace = await parseDocx(replaced)
    expect(afterReplace.protection).toEqual({ edit: 'trackedChanges', enforced: false })
    expect(count(await settingsOf(replaced), 'w:documentProtection')).toBe(1)

    const cleared = await saveDocx(afterReplace, asOriginal(afterReplace), { protection: null })
    const afterClear = await parseDocx(cleared)
    expect(afterClear.protection).toBeNull()
    expect(count(await settingsOf(cleared), 'w:documentProtection')).toBe(0)

    // the body survived both saves
    expect(afterClear.blocks.some((b) => b.type === 'paragraph' && b.runs?.length)).toBe(true)
  })
})
