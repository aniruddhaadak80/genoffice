import { describe, expect, it } from 'vitest'
import { nextEnabledIndex } from '../src/dropdown'

describe('Dropdown keyboard navigation', () => {
  const options = [{ disabled: true }, {}, { disabled: true }, {}]

  it('skips disabled options in both directions', () => {
    expect(nextEnabledIndex(options, 0, 1)).toBe(1)
    expect(nextEnabledIndex(options, 2, -1)).toBe(1)
  })

  it('finds the enabled Home and End targets and reports none when all are disabled', () => {
    expect(nextEnabledIndex(options, 0, 1)).toBe(1)
    expect(nextEnabledIndex(options, options.length - 1, -1)).toBe(3)
    expect(nextEnabledIndex([{ disabled: true }], 0, 1)).toBe(-1)
  })
})
