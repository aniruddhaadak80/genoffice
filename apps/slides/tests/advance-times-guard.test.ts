import { describe, expect, it } from 'vitest'
import { MAX_ADVANCE_MS, filterAdvanceTimes } from '../src/main/advance-times-guard'

describe('filterAdvanceTimes', () => {
  it('keeps valid ms and null-clear entries', () => {
    const out = filterAdvanceTimes([
      { slideIndex: 0, ms: 3000 },
      { slideIndex: 1, ms: null },
      { slideIndex: 2, ms: 0 },
      { slideIndex: 3, ms: MAX_ADVANCE_MS },
    ])
    expect(out).toEqual([
      { slideIndex: 0, ms: 3000 },
      { slideIndex: 1, ms: null },
      { slideIndex: 2, ms: 0 },
      { slideIndex: 3, ms: MAX_ADVANCE_MS },
    ])
  })

  it('drops non-finite, negative, and oversized ms', () => {
    const out = filterAdvanceTimes([
      { slideIndex: 0, ms: Number.NaN },
      { slideIndex: 1, ms: Infinity },
      { slideIndex: 2, ms: -1 },
      { slideIndex: 3, ms: MAX_ADVANCE_MS + 1 },
      { slideIndex: 4, ms: '3000' },
      { slideIndex: 5, ms: undefined },
    ])
    expect(out).toEqual([])
  })

  it('drops bad slideIndex and non-object rows', () => {
    const out = filterAdvanceTimes([
      { slideIndex: -1, ms: 100 },
      { slideIndex: 0.5, ms: 100 },
      { slideIndex: Number.NaN, ms: 100 },
      null,
      'x',
      42,
    ])
    expect(out).toEqual([])
  })

  it('returns [] for non-array payloads', () => {
    expect(filterAdvanceTimes(undefined)).toEqual([])
    expect(filterAdvanceTimes(null)).toEqual([])
    expect(filterAdvanceTimes({})).toEqual([])
    expect(filterAdvanceTimes('[]')).toEqual([])
  })

  it('keeps valid rows when mixed with bad ones', () => {
    const out = filterAdvanceTimes([
      { slideIndex: 0, ms: 500 },
      { slideIndex: 1, ms: Number.NaN },
      { slideIndex: 2, ms: null },
    ])
    expect(out).toEqual([
      { slideIndex: 0, ms: 500 },
      { slideIndex: 2, ms: null },
    ])
  })
})
