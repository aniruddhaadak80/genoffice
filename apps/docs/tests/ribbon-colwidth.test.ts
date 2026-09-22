import { describe, expect, it } from 'vitest'
import { clampColumnWidthCm } from '../src/renderer/components/Ribbon'

describe('clampColumnWidthCm', () => {
  it('passes sane widths through', () => {
    expect(clampColumnWidthCm(2.5, 16)).toBe(2.5)
    expect(clampColumnWidthCm(16, 16)).toBe(16)
  })

  it('clamps to the content width instead of blowing the grid', () => {
    expect(clampColumnWidthCm(9999, 16)).toBe(16)
    expect(clampColumnWidthCm(1e12, 16)).toBe(16)
  })

  it('rejects non-finite and non-positive input', () => {
    expect(clampColumnWidthCm(NaN, 16)).toBeNull()
    expect(clampColumnWidthCm(Infinity, 16)).toBeNull()
    expect(clampColumnWidthCm(0, 16)).toBeNull()
    expect(clampColumnWidthCm(-3, 16)).toBeNull()
    expect(clampColumnWidthCm(5, NaN)).toBeNull()
    expect(clampColumnWidthCm(5, 0)).toBeNull()
  })
})
