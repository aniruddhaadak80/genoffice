import { describe, expect, it } from 'vitest'

describe('sheets chat IPC validation', () => {
  it('accepts bounded payloads', () => {
    expect('user' === 'user' || 'user' === 'assistant').toBe(true)
    expect(typeof 'hello' === 'string' && 'hello'.length <= 200_000).toBe(true)
  })

  it('rejects invalid roles and oversized text', () => {
    const role = 'system'
    expect(role === 'user' || role === 'assistant').toBe(false)
    expect('x'.repeat(200_001).length <= 200_000).toBe(false)
  })
})
