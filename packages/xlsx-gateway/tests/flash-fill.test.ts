import { describe, expect, it } from 'vitest'
import {
  applyFlashFillTemplate,
  inferFlashFillTemplate,
} from '../src/domain/flash-fill'

describe('inferFlashFillTemplate budgets', () => {
  it('infers a normal concatenation template', () => {
    const template = inferFlashFillTemplate([
      { source: ['John', 'Doe'], output: 'John Doe' },
      { source: ['Jane', 'Smith'], output: 'Jane Smith' },
    ])
    expect(template).not.toBeNull()
    expect(applyFlashFillTemplate(template!, ['John', 'Doe'])).toBe('John Doe')
  })

  it('returns null fast past the input budgets', () => {
    const start = Date.now()
    expect(
      inferFlashFillTemplate([{ source: ['ab'], output: 'x'.repeat(1_000_000) }]),
    ).toBeNull()
    expect(
      inferFlashFillTemplate(
        Array.from({ length: 10_000 }, () => ({ source: ['ab'], output: 'ab' })),
      ),
    ).toBeNull()
    expect(
      inferFlashFillTemplate([
        { source: Array.from({ length: 500 }, () => 'ab'), output: 'ab' },
      ]),
    ).toBeNull()
    expect(Date.now() - start).toBeLessThan(10000)
  })
})
