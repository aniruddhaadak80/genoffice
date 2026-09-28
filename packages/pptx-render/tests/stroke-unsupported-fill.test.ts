import { describe, it, expect } from 'vitest'
import { resolveStroke } from '../src/fill'
import { makeViewport } from '../src/coords'
import type { Stroke } from '@genoffice/pptx-engine'

const vp = makeViewport({ cx: 9525 * 1000, cy: 9525 * 1000 }, 1000)

describe('unsupported stroke fills', () => {
  it('returns undefined for image/pattern line fills', () => {
    const img: Stroke = { fill: { type: 'image', mediaRef: 'ppt/media/a.png' }, width: 12700 }
    const pat: Stroke = {
      fill: { type: 'pattern', fg: '#111', bg: '#fff', preset: 'dot' },
      width: 12700,
    }
    expect(resolveStroke(img, vp)).toBeUndefined()
    expect(resolveStroke(pat, vp)).toBeUndefined()
  })
})
