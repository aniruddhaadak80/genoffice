import { describe, expect, it, vi } from 'vitest'
import { solveGoalSeek } from '../src/renderer/goal-seek'

function runtimeWith(setValue: ReturnType<typeof vi.fn>) {
  const range = {
    getFormula: () => '=A1*2',
    getValue: () => 5,
    setValue,
  }
  const sheet = { getRange: () => range }
  return {
    univerAPI: { getActiveWorkbook: () => ({ getActiveSheet: () => sheet }) },
  } as never
}

describe('solveGoalSeek target validation', () => {
  it('rejects non-finite targets before any grid write', async () => {
    for (const toValue of [NaN, Infinity, -Infinity]) {
      const setValue = vi.fn()
      await expect(
        solveGoalSeek(runtimeWith(setValue), { setCell: 'B1', toValue, byCell: 'A1' }),
      ).rejects.toThrow()
      expect(setValue).not.toHaveBeenCalled()
    }
  })
})
