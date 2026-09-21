import { describe, expect, it } from 'vitest'
import { findInText, MAX_FIND_RESULTS } from '../src/find-text'

const OPTS = { matchCase: true, wholeWord: false }

describe('findInText result cap', () => {
  it('finds normal matches unchanged', () => {
    expect(findInText('ab ab ab', 'ab', OPTS)).toEqual([0, 3, 6])
    expect(findInText('hello', 'z', OPTS)).toEqual([])
    expect(findInText('hello', '', OPTS)).toEqual([])
  })

  it('caps single-character queries over large text', () => {
    const text = 'a'.repeat(1_000_000)
    const start = Date.now()
    const out = findInText(text, 'a', OPTS)
    expect(Date.now() - start).toBeLessThan(10000)
    expect(out).toHaveLength(MAX_FIND_RESULTS)
  })
})
