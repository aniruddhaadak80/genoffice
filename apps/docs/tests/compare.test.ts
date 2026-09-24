import { describe, expect, it } from 'vitest'
import { compareParagraphs, editorTexts, summarize } from '../src/renderer/editor/compare'

describe('compareParagraphs', () => {
  it('reports identical documents as all same', () => {
    const entries = compareParagraphs(['a', 'b'], ['a', 'b'])
    expect(entries.every((e) => e.kind === 'same')).toBe(true)
    expect(summarize(entries)).toEqual({ added: 0, removed: 0, changed: 0 })
  })

  it('detects an added paragraph', () => {
    const entries = compareParagraphs(['a', 'c'], ['a', 'b', 'c'])
    expect(entries.map((e) => e.kind)).toEqual(['same', 'added', 'same'])
    expect(entries[1].right).toBe('b')
  })

  it('detects a removed paragraph', () => {
    const entries = compareParagraphs(['a', 'b', 'c'], ['a', 'c'])
    expect(entries.map((e) => e.kind)).toEqual(['same', 'removed', 'same'])
    expect(entries[1].left).toBe('b')
  })

  it('merges adjacent remove+add into changed', () => {
    const entries = compareParagraphs(
      ['title', 'old content', 'ending'],
      ['title', 'new content', 'ending'],
    )
    expect(entries.map((e) => e.kind)).toEqual(['same', 'changed', 'same'])
    expect(entries[1]).toMatchObject({ left: 'old content', right: 'new content' })
  })

  it('handles empty documents', () => {
    expect(compareParagraphs([], [])).toEqual([])
    expect(compareParagraphs([], ['x'])[0].kind).toBe('added')
    expect(compareParagraphs(['x'], [])[0].kind).toBe('removed')
  })

  it('extracts live editor text including tables and previews', () => {
    expect(
      editorTexts({
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'unsaved' }] },
          { type: 'paragraph' },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [{ type: 'tableCell', content: [{ type: 'text', text: 'cell' }] }],
              },
            ],
          },
          { type: 'docProtected', attrs: { previewText: 'preview' } },
          { type: 'docProtected', attrs: { hidden: true, previewText: 'hidden' } },
        ],
      }),
    ).toEqual(['unsaved', '', 'cell', 'preview'])
  })
})
