import { describe, expect, it } from 'vitest'

function inRange(index: number, count: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < count
}

describe('deck page index range', () => {
  it('accepts valid indices', () => {
    expect(inRange(0, 8)).toBe(true)
    expect(inRange(7, 8)).toBe(true)
  })

  it('rejects negative, fractional, and out-of-range', () => {
    expect(inRange(-1, 8)).toBe(false)
    expect(inRange(1.5, 8)).toBe(false)
    expect(inRange(NaN, 8)).toBe(false)
    expect(inRange(8, 8)).toBe(false)
  })
})
