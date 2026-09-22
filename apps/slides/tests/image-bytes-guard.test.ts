import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BASE64_CHARS,
  validImageBytesInput,
  validMediaBytesInput,
  validPxGeometry,
} from '../src/main/image-bytes-guard'

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

describe('image/media byte guards', () => {
  it('accepts normal image payloads', () => {
    expect(validImageBytesInput({ base64: PNG_B64, ext: 'png' })).toBe(true)
    expect(validImageBytesInput({ base64: PNG_B64, ext: 'PNG' })).toBe(true)
    expect(validPxGeometry({ xPx: 10, yPx: 20, wPx: 400, hPx: 80, fitWidthPx: 1280 })).toBe(true)
  })

  it('rejects oversized, malformed, and mistyped payloads', () => {
    expect(
      validImageBytesInput({ base64: 'A'.repeat(MAX_IMAGE_BASE64_CHARS + 4), ext: 'png' }),
    ).toBe(false)
    expect(validImageBytesInput({ base64: '!!!', ext: 'png' })).toBe(false)
    expect(validImageBytesInput({ base64: PNG_B64, ext: 'exe' })).toBe(false)
    expect(validImageBytesInput({ base64: '', ext: 'png' })).toBe(false)
    expect(validMediaBytesInput({ base64: PNG_B64, ext: 'mp4' })).toBe(true)
    expect(validMediaBytesInput({ base64: PNG_B64, ext: 'exe' })).toBe(false)
    expect(validMediaBytesInput({ path: '/tmp/a.mp4', ext: 'mp4' })).toBe(true)
  })

  it('rejects non-finite geometry', () => {
    expect(validPxGeometry({ xPx: NaN, yPx: 0, wPx: 10, hPx: 10, fitWidthPx: 1280 })).toBe(false)
    expect(validPxGeometry({ xPx: 0, yPx: 0, wPx: Infinity, hPx: 10, fitWidthPx: 1280 })).toBe(
      false,
    )
    expect(validPxGeometry({ xPx: 0, yPx: 0, wPx: 0, hPx: 10, fitWidthPx: 1280 })).toBe(false)
  })
})
