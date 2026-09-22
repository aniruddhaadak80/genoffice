import { describe, expect, it } from 'vitest'
import { fitCropPreview } from '../src/renderer/components/PictureDialogs'

describe('crop preview sizing', () => {
  it('contains wide and tall images within both available dimensions', () => {
    expect(fitCropPreview(4000, 1000, 500, 300)).toEqual({ w: 500, h: 125 })
    expect(fitCropPreview(1000, 4000, 500, 300)).toEqual({ w: 75, h: 300 })
  })

  it('does not enlarge small images', () => {
    expect(fitCropPreview(120, 80, 500, 300)).toEqual({ w: 120, h: 80 })
  })

  it('falls back to 1x1 for broken-image dimensions instead of NaN', () => {
    for (const args of [
      [0, 0],
      [NaN, 100],
      [100, NaN],
      [Infinity, 100],
      [1920, 1080, NaN, NaN],
      [1920, 1080, 0, 300],
      [-5, 100],
    ] as Array<[number, number, number?, number?]>) {
      const out = fitCropPreview(...args)
      expect(Number.isFinite(out.w) && Number.isFinite(out.h)).toBe(true)
      expect(out.w).toBeGreaterThanOrEqual(1)
      expect(out.h).toBeGreaterThanOrEqual(1)
    }
    expect(fitCropPreview(0, 0)).toEqual({ w: 1, h: 1 })
  })
})
