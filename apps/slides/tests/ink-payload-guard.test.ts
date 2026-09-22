import { describe, expect, it } from 'vitest'
import { MAX_INK_PAYLOAD_POINTS, validInkPayload } from '../src/main/ink-payload-guard'

const good = JSON.stringify({
  points: [
    [0, 0],
    [1, 2],
    [10, 20],
  ],
})

describe('validInkPayload', () => {
  it('accepts a normal points payload', () => {
    expect(validInkPayload(good)).toBe(true)
  })

  it('rejects non-strings, bad JSON, and empty payloads', () => {
    expect(validInkPayload(null)).toBe(false)
    expect(validInkPayload(42)).toBe(false)
    expect(validInkPayload('not json')).toBe(false)
    expect(validInkPayload('')).toBe(false)
    expect(validInkPayload('{}')).toBe(false)
    expect(validInkPayload(JSON.stringify({ points: [] }))).toBe(false)
    expect(validInkPayload(JSON.stringify({ points: 'x' }))).toBe(false)
  })

  it('rejects oversized point arrays and non-finite coordinates', () => {
    const many = { points: Array.from({ length: MAX_INK_PAYLOAD_POINTS + 1 }, () => [1, 1]) }
    expect(validInkPayload(JSON.stringify(many))).toBe(false)
    expect(validInkPayload(JSON.stringify({ points: [[NaN, 0]] }))).toBe(false)
    expect(validInkPayload(JSON.stringify({ points: [[Infinity, 0]] }))).toBe(false)
    expect(validInkPayload(JSON.stringify({ points: [[1]] }))).toBe(false)
    expect(validInkPayload(JSON.stringify({ points: [['1', 2]] }))).toBe(false)
  })

  it('rejects payloads beyond the char budget', () => {
    const points = Array.from({ length: MAX_INK_PAYLOAD_POINTS }, () => [123456789, 987654321])
    const blob = JSON.stringify({ points })
    if (blob.length > 64 * 1024) {
      expect(validInkPayload(blob)).toBe(false)
    } else {
      expect(validInkPayload(blob)).toBe(true)
    }
  })
})
