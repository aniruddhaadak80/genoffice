import { describe, expect, it } from 'vitest'
import { normalizePastedMath } from '../src/renderer/editor/math'

describe('normalizePastedMath', () => {
  it('converts inline backslash-paren delimiters to dollars', () => {
    expect(normalizePastedMath(String.raw`\(E=mc^2\)`)).toBe('$E=mc^2$')
  })

  it('converts block backslash-bracket delimiters to double dollars', () => {
    expect(normalizePastedMath(String.raw`\[x^2\]`)).toBe('$$x^2$$')
  })

  it('leaves currency amounts untouched', () => {
    expect(normalizePastedMath('paid $5 and $10')).toBe('paid $5 and $10')
  })

  it('ignores empty and multiline inline delimiters', () => {
    expect(normalizePastedMath(String.raw`\(\)`)).toBe(String.raw`\(\)`)
    expect(normalizePastedMath('plain text')).toBe('plain text')
  })
})
