/**
 * Byte-exact scanner for word/document.xml.
 *
 * We never re-serialize the whole XML (parse->serialize would silently change
 * untouched bytes: attribute order, self-closing forms, entity forms...).
 * Instead we locate the exact character range of every top-level element in
 * <w:body> so that patch-save can splice new fragments while copying untouched
 * elements as raw original substrings.
 */

export interface BodyElement {
  /** tag name, e.g. "w:p", "w:tbl", "w:sectPr" */
  name: string
  /** range [start, end) in the document.xml string */
  start: number
  end: number
}

export interface OpaqueRegion {
  start: number
  end: number
}

export interface BodyScan {
  elements: BodyElement[]
  opaqueRegions: OpaqueRegion[]
  /** range [innerStart, innerEnd) spanning from the first top-level element start to the last element end */
  innerStart: number
  innerEnd: number
}

// Matches one XML tag, tolerating '>' inside quoted attribute values.
const TAG_RE = /<\/?(?:[^<>"']|"[^"]*"|'[^']*')*>/g
const NAME_RE = /^<\/?\s*([A-Za-z_][\w:.-]*)/

export function scanBody(documentXml: string): BodyScan {
  const bodyOpenMatch = /<w:body(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?>/.exec(documentXml)
  if (!bodyOpenMatch) {
    throw new Error('document.xml has no <w:body> element')
  }
  const scanFrom = bodyOpenMatch.index + bodyOpenMatch[0].length

  const elements: BodyElement[] = []
  const opaqueRegions: OpaqueRegion[] = []
  let cursor = scanFrom
  let depth = 0
  let currentStart = -1
  let currentName = ''

  while (cursor < documentXml.length) {
    const tagStart = documentXml.indexOf('<', cursor)
    if (tagStart === -1) break
    // Skip comments / CDATA / processing instructions (rare in Word output).
    const opaqueTerminator = documentXml.startsWith('<!--', tagStart)
      ? '-->'
      : documentXml.startsWith('<![CDATA[', tagStart)
        ? ']]>'
        : documentXml.startsWith('<?', tagStart)
          ? '?>'
          : null
    if (opaqueTerminator) {
      const terminatorEnd = documentXml.indexOf(opaqueTerminator, tagStart + 2)
      const end =
        terminatorEnd === -1 ? documentXml.length : terminatorEnd + opaqueTerminator.length
      opaqueRegions.push({ start: tagStart, end })
      cursor = end
      continue
    }
    TAG_RE.lastIndex = tagStart
    const match = TAG_RE.exec(documentXml)
    if (!match || match.index !== tagStart) {
      cursor = tagStart + 1
      continue
    }
    const tag = match[0]
    cursor = match.index + tag.length
    const isClosing = tag.startsWith('</')
    const isSelfClosing = !isClosing && tag.endsWith('/>')
    const name = NAME_RE.exec(tag)?.[1] ?? ''

    if (isClosing) {
      if (depth === 0) {
        if (name === 'w:body') {
          // Word tolerates multiple sibling <w:body> elements (POI
          // MultipleBodyBug.docx) and renders their contents concatenated;
          // keep scanning any later body. Patch-save splices all elements
          // back into the first body, which matches Word's own normalization.
          const nextBody = /<w:body(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?>/g
          nextBody.lastIndex = match.index + tag.length
          const nb = nextBody.exec(documentXml)
          if (!nb) break
          cursor = nb.index + nb[0].length
          continue
        }
        throw new Error(`unexpected closing tag </${name}> at body level`)
      }
      depth--
      if (depth === 0) {
        elements.push({ name: currentName, start: currentStart, end: match.index + tag.length })
      }
    } else if (isSelfClosing) {
      if (depth === 0) {
        elements.push({ name, start: match.index, end: match.index + tag.length })
      }
    } else {
      if (depth === 0) {
        currentStart = match.index
        currentName = name
      }
      depth++
    }
  }

  if (elements.length === 0) {
    return { elements, opaqueRegions, innerStart: scanFrom, innerEnd: scanFrom }
  }
  return {
    elements,
    opaqueRegions,
    innerStart: elements[0].start,
    innerEnd: elements[elements.length - 1].end,
  }
}
