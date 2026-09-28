import { describe, expect, it } from 'vitest'
import { safeName } from '../src/mcp/files'

describe('safeName', () => {
  it('keeps letters of any script and still reduces a name to one safe segment', () => {
    // an ASCII-only class folded these to r_sum_.pdf, collapsing distinct
    // upload names onto the same path segment
    expect(safeName('résumé.pdf')).toBe('résumé.pdf')
    expect(safeName('rçsumé.pdf')).toBe('rçsumé.pdf')
    expect(safeName('résumé.pdf')).not.toBe(safeName('rçsumé.pdf'))
    expect(safeName('報告書 2.docx')).toBe('報告書 2.docx')
    expect(safeName('Q3 rapport (final).docx')).toBe('Q3 rapport (final).docx')
    // path safety is unchanged
    expect(safeName('../../etc/passwd')).toBe('passwd')
    expect(safeName('.bashrc')).toBe('bashrc')
    expect(safeName('we:ird*name?.txt')).toBe('we_ird_name_.txt')
  })
})
