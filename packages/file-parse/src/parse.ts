import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { docToText } from './doc'
import { docxToText } from './docx'
import { pdfToText } from './pdf'
import { pptToText } from './ppt'
import { pptxToText } from './pptx'
import { xlsxToText } from './xlsx'

/** Max attachment bytes read: prevents GB .log from OOMing AI ingest. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
/** Max extracted chars kept, with truncation marker. */
export const MAX_EXTRACTED_CHARS = 200_000

export function truncateExtracted(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text
  return text.slice(0, MAX_EXTRACTED_CHARS) + '\n… [truncated]'
}

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

/** parse an attachment into plain text (or flag it as image / unsupported) */
export async function parseFileToText(filePath: string): Promise<ParsedFile> {
  const ext = extname(filePath).slice(1).toLowerCase()
  const imageMime = IMAGE_MIMES[ext]
  if (imageMime) return { ok: true, kind: 'image', mime: imageMime }
  try {
    const size = (await stat(filePath)).size
    if (size > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        kind: 'text',
        error: `File too large: ${size} bytes (cap ${MAX_ATTACHMENT_BYTES})`,
      }
    }
    if (TEXT_EXTS.has(ext)) {
      const text = await readFile(filePath, 'utf-8')
      return { ok: true, kind: 'text', text: truncateExtracted(text) }
    }
    switch (ext) {
      case 'doc':
        return {
          ok: true,
          kind: 'text',
          text: truncateExtracted(await docToText(await readFile(filePath))),
        }
      case 'docx':
        return {
          ok: true,
          kind: 'text',
          text: truncateExtracted(await docxToText(await readFile(filePath))),
        }
      case 'ppt':
        return {
          ok: true,
          kind: 'text',
          text: truncateExtracted(await pptToText(await readFile(filePath))),
        }
      case 'pptx':
        return {
          ok: true,
          kind: 'text',
          text: truncateExtracted(await pptxToText(await readFile(filePath))),
        }
      case 'xlsx':
      case 'xlsm':
        return {
          ok: true,
          kind: 'text',
          text: truncateExtracted(await xlsxToText(await readFile(filePath))),
        }
      case 'pdf':
        return {
          ok: true,
          kind: 'text',
          text: truncateExtracted(await pdfToText(await readFile(filePath))),
        }
    }
  } catch (e) {
    return { ok: false, kind: 'text', error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: false, kind: 'unsupported', error: `Unsupported file type: .${ext || 'unknown'}` }
}
