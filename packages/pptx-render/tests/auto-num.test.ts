import { describe, expect, it } from 'vitest'
import { formatAutoNum } from '../src/auto-num'

describe('formatAutoNum', () => {
  it('clamps a buAutoNum startAt of 0 or less up to the first number', () => {
    // startAt="0" and a negative startAt are both legal, but the helpers return ''
    // or undefined for them, which rendered as "()" / a bare ")" / "undefined."
    expect(formatAutoNum(0, 'alphaLcParenBoth')).toBe('(a)')
    expect(formatAutoNum(-3, 'alphaLcParenBoth')).toBe('(a)')
    expect(formatAutoNum(0, 'alphaUcParenBoth')).toBe('(A)')
    expect(formatAutoNum(0, 'romanLcParenR')).toBe('i)')
    expect(formatAutoNum(0, 'arabicPeriod')).toBe('1.')
    expect(formatAutoNum(0, 'arabicDbPeriod')).toBe('１.')
    expect(formatAutoNum(0, 'ea1ChsPeriod')).toBe('一.')
    expect(formatAutoNum(-3, 'ea1ChsPeriod')).toBe('一.')
    expect(formatAutoNum(0, 'circleNumWdWhitePlain')).toBe('①')
  })

  it('leaves numbering at or above 1 alone', () => {
    expect(formatAutoNum(1, 'arabicPeriod')).toBe('1.')
    expect(formatAutoNum(7, 'alphaLcParenBoth')).toBe('(g)')
    expect(formatAutoNum(14, 'romanLcParenR')).toBe('xiv)')
    expect(formatAutoNum(11, 'circleNumWdWhitePlain')).toBe('⑪')
    expect(formatAutoNum(25, 'arabicPeriod')).toBe('25.')
  })
})
