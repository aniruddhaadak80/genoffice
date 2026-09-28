import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { docToText } from './doc'
import { docxToText } from './docx'
import { pdfToText } from './pdf'
import { pptToText } from './ppt'
import { pptxToText } from './pptx'
import { xlsxToText } from './xlsx'

export type ParsedFileKind = 'text' | 'image' | 'unsupported'

export interface ParsedFile {
  ok: boolean
  text?: string
  kind: ParsedFileKind
  mime?: string
  error?: string
}

/** No text extraction for images: callers read raw bytes and go multimodal (see @genoffice/ai-provider images support) */
const IMAGE_MIMES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'xml',
  'html',
  'htm',
  'log',
  'py',
])

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const UTF16LE_BOM = Buffer.from([0xff, 0xfe])
const UTF16BE_BOM = Buffer.from([0xfe, 0xff])

function decodeText(bytes: Buffer): string {
  if (bytes.subarray(0, 3).equals(UTF8_BOM)) return bytes.subarray(3).toString('utf-8')
  if (bytes.subarray(0, 2).equals(UTF16LE_BOM)) return bytes.subarray(2).toString('utf16le')
  if (bytes.subarray(0, 2).equals(UTF16BE_BOM)) {
    const swapped = Buffer.from(bytes.subarray(2))
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const t = swapped[i]
      swapped[i] = swapped[i + 1]
      swapped[i + 1] = t
    }
    return swapped.toString('utf16le')
  }
  return bytes.toString('utf-8')
}

type BinaryKind = 'zip' | 'pdf' | 'ole2' | 'unknown'

function sniffBinary(bytes: Buffer): BinaryKind {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
    return 'pdf'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  )
    return 'ole2'
  return 'unknown'
}

/** parse an attachment into plain text (or flag it as image / unsupported) */
export async function parseFileToText(filePath: string): Promise<ParsedFile> {
  const ext = extname(filePath).slice(1).toLowerCase()
  const imageMime = IMAGE_MIMES[ext]
  if (imageMime) return { ok: true, kind: 'image', mime: imageMime }
  try {
    if (TEXT_EXTS.has(ext)) {
      const bytes = await readFile(filePath)
      return { ok: true, kind: 'text', text: decodeText(bytes) }
    }
    const bytes = await readFile(filePath)
    const sniffed = sniffBinary(bytes)
    if (ext === 'pdf' && sniffed !== 'pdf') {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .pdf file has ${sniffed} magic bytes`,
      }
    }
    if (
      (ext === 'docx' || ext === 'pptx' || ext === 'xlsx' || ext === 'xlsm') &&
      sniffed !== 'zip'
    ) {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .${ext} file has ${sniffed} magic bytes`,
      }
    }
    if ((ext === 'doc' || ext === 'ppt') && sniffed !== 'ole2') {
      return {
        ok: false,
        kind: 'text',
        error: `Content mismatch: .${ext} file has ${sniffed} magic bytes`,
      }
    }
    switch (ext) {
      case 'doc':
        return { ok: true, kind: 'text', text: await docToText(bytes) }
      case 'docx':
        return { ok: true, kind: 'text', text: await docxToText(bytes) }
      case 'ppt':
        return { ok: true, kind: 'text', text: await pptToText(bytes) }
      case 'pptx':
        return { ok: true, kind: 'text', text: await pptxToText(bytes) }
      case 'xlsx':
      case 'xlsm':
        return { ok: true, kind: 'text', text: await xlsxToText(bytes) }
      case 'pdf':
        return { ok: true, kind: 'text', text: await pdfToText(bytes) }
    }
  } catch (e) {
    return { ok: false, kind: 'text', error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: false, kind: 'unsupported', error: `Unsupported file type: .${ext || 'unknown'}` }
}
