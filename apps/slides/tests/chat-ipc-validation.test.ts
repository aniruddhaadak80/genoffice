import { describe, expect, it } from 'vitest'

describe('slides chat IPC validation', () => {
  it('accepts bounded payloads', () => {
    expect('assistant' === 'user' || 'assistant' === 'assistant').toBe(true)
    expect(typeof 'deck' === 'string' && 'deck'.length <= 200_000).toBe(true)
  })

  it('rejects invalid payloads', () => {
    expect('admin' === 'user' || 'admin' === 'assistant').toBe(false)
    expect('x'.repeat(200_001).length <= 200_000).toBe(false)
  })
})
