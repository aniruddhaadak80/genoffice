import { loadDocxZip } from './zip-load'
import { parseStyles } from './parse-styles'
import {
  mergeDefaultFontsXml,
  upsertStyleXml,
  type DefaultFonts,
  type StyleUpsert,
} from './style-upsert'
import type { ParsedDoc } from './types'

/** Resolve live style inheritance without reparsing the document body or its media. */
export async function previewFontSettings(
  parsed: ParsedDoc,
  upserts: StyleUpsert[],
  defaults?: DefaultFonts,
) {
  // a blank or in-memory document has no package bytes to reopen; fall back to
  // the empty styles part instead of failing inside the zip reader
  const zip = parsed.internal.originalBytes
    ? await loadDocxZip(parsed.internal.originalBytes)
    : new JSZip()
  let xml =
    (await zip.file('word/styles.xml')?.async('string')) ??
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>'
  for (const up of upserts) xml = upsertStyleXml(xml, up)
  if (defaults) xml = mergeDefaultFontsXml(xml, defaults)
  zip.file('word/styles.xml', xml)
  return parseStyles(zip, parsed.themeColors, parsed.themeFonts)
}
