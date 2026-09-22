import { describe, expect, it, vi } from 'vitest'

/**
 * sanitizeDiagramSvg (diagrams.ts): renderer diagram SVG lands in the DOM
 * via dangerouslySetInnerHTML, so scripts/handlers/foreignObject must go.
 * mermaid/wavedrom are not installed in every checkout, so both renderer
 * modules are mocked — the sanitizer itself is dependency-free.
 */
vi.mock('../src/renderer/editor/wavedrom', () => ({
  WAVEDROM_LANGUAGE: 'wavedrom',
  renderWavedrom: vi.fn(),
}))

vi.mock('../src/renderer/editor/mermaid', () => ({
  MERMAID_LANGUAGE: 'mermaid',
  renderMermaid: vi.fn(),
  loadMermaid: vi.fn(),
}))

import { sanitizeDiagramSvg } from '../src/renderer/editor/diagrams'

describe('sanitizeDiagramSvg', () => {
  it('strips scripts, handlers, foreignObject, and javascript: hrefs', () => {
    const svg =
      '<svg viewBox="0 0 10 10" onload="evil()">' +
      '<script>alert(1)</script>' +
      '<script src="x"/> ' +
      '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=evil()></body></foreignObject>' +
      '<a xlink:href="javascript:evil()"><text onclick="evil()" fill="red">ok</text></a>' +
      '<a href="https://example.com"><text>link</text></a>' +
      '</svg>'
    const out = sanitizeDiagramSvg(svg)
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onload')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('<foreignObject')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('>ok<')
  })

  it('keeps benign diagram markup untouched', () => {
    const svg =
      '<svg viewBox="0 0 200 100"><g class="node"><rect width="10"/><text>hi</text></g></svg>'
    expect(sanitizeDiagramSvg(svg)).toBe(svg)
    expect(sanitizeDiagramSvg(42 as never)).toBe('')
  })
})
