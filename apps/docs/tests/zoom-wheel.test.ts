import { describe, expect, it } from 'vitest'
import {
  nextWheelZoom,
  wheelDeltaPx,
  ZOOM_MAX,
  ZOOM_MAX_TICK,
  ZOOM_MIN,
} from '../src/renderer/editor/zoom-wheel'

describe('wheel zoom steps', () => {
  it('zooms smoothly for pixel deltas', () => {
    expect(nextWheelZoom(100, -100)).toBeGreaterThan(100)
    expect(nextWheelZoom(100, 100)).toBeLessThan(100)
    expect(nextWheelZoom(100, 0)).toBe(100)
  })

  it('caps a single tick so hi-res wheels cannot jump 50 to 200', () => {
    expect(nextWheelZoom(50, -10000)).toBe(50 + ZOOM_MAX_TICK)
    expect(nextWheelZoom(200, 10000)).toBe(200 - ZOOM_MAX_TICK)
  })

  it('clamps to the zoom bounds and ignores non-finite deltas', () => {
    expect(nextWheelZoom(50, 10000)).toBe(ZOOM_MIN)
    expect(nextWheelZoom(200, -10000)).toBe(ZOOM_MAX)
    expect(nextWheelZoom(100, NaN)).toBe(100)
  })

  it('normalizes line/page delta modes', () => {
    expect(wheelDeltaPx(3, 1)).toBe(48)
    expect(wheelDeltaPx(100, 0)).toBe(100)
    expect(nextWheelZoom(100, 3, 1)).toBeLessThan(100)
  })
})
