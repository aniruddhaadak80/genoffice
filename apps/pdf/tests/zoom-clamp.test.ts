import { describe, expect, it } from 'vitest'
import { clampScale, clampScaleFit, MAX_SCALE, MIN_SCALE } from '../src/renderer/view-config'

describe('clampScale (manual zoom)', () => {
  it('floors at MIN_SCALE and caps at MAX_SCALE', () => {
    expect(clampScale(0.3)).toBe(MIN_SCALE)
    expect(clampScale(0.5)).toBe(0.5)
    expect(clampScale(1)).toBe(1)
    expect(clampScale(4)).toBe(MAX_SCALE)
    expect(clampScale(10)).toBe(MAX_SCALE)
  })
})

describe('clampScaleFit (fit-derived zoom)', () => {
  it('caps at MAX_SCALE but skips the MIN_SCALE floor', () => {
    // A scanned page whose true fit-width is 22% opens at 22%, not 50% (#142).
    expect(clampScaleFit(0.22)).toBe(0.22)
    expect(clampScaleFit(0.1)).toBe(0.1)
    expect(clampScaleFit(0.01)).toBe(0.01)
  })

  it('still caps at MAX_SCALE', () => {
    expect(clampScaleFit(10)).toBe(MAX_SCALE)
    expect(clampScaleFit(MAX_SCALE)).toBe(MAX_SCALE)
  })

  it('passes through normal fit scales unchanged', () => {
    expect(clampScaleFit(0.67)).toBe(0.67)
    expect(clampScaleFit(1)).toBe(1)
    expect(clampScaleFit(1.5)).toBe(1.5)
  })
})
