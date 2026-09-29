import { describe, expect, it } from 'vitest'
import { styleTokens } from '../src/sfnt'

describe('styleTokens', () => {
  it('tokenizes demibold as demibold, not bold', () => {
    expect(styleTokens('demibold')).toEqual(['demibold'])
  })

  it('tokenizes demi as demi', () => {
    expect(styleTokens('demi')).toEqual(['demi'])
  })

  it('still tokenizes semibold and extrabold before bold', () => {
    expect(styleTokens('semibold')).toEqual(['semibold'])
    expect(styleTokens('extrabold')).toEqual(['extrabold'])
  })

  it('tokenizes bold as bold', () => {
    expect(styleTokens('bold')).toEqual(['bold'])
  })
})
