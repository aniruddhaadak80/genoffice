import { describe, expect, it, vi } from 'vitest'
import { runGuardedCandidate, runGuardedDocumentAction } from '../src/renderer/doc-dirty'
import { findDocxPath } from '../src/shared/open-file'

describe('findDocxPath', () => {
  it('finds Finder and Explorer document arguments case-insensitively', () => {
    expect(findDocxPath(['/Applications/GenOffice Docs.app', '/tmp/Quarterly Plan.docx'])).toBe(
      '/tmp/Quarterly Plan.docx',
    )
    expect(findDocxPath(['GenOffice Docs.exe', 'C:\\Users\\Me\\REPORT.DOCX'])).toBe(
      'C:\\Users\\Me\\REPORT.DOCX',
    )
  })

  it('ignores Electron switches and unrelated files', () => {
    expect(findDocxPath(['GenOffice Docs', '--inspect=document.docx', '/tmp/notes.txt'])).toBeNull()
  })
})

describe('runGuardedCandidate', () => {
  it('guards before choosing or committing a candidate', async () => {
    const calls: string[] = []

    await expect(
      runGuardedCandidate(
        async () => {
          calls.push('guard')
          return true
        },
        async () => {
          calls.push('choose')
          return { path: '/tmp/candidate.docx' }
        },
        async (candidate) => {
          calls.push(`commit:${candidate.path}`)
        },
      ),
    ).resolves.toBe(true)

    expect(calls).toEqual(['guard', 'choose', 'commit:/tmp/candidate.docx'])
  })

  it('does not choose a candidate when the replacement is rejected', async () => {
    const choose = vi.fn(async () => ({ path: '/tmp/candidate.docx' }))
    const commit = vi.fn()

    await expect(runGuardedCandidate(async () => false, choose, commit)).resolves.toBe(false)
    expect(choose).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('runGuardedDocumentAction', () => {
  it('keeps the current document when the replacement guard is canceled', async () => {
    const replace = vi.fn()

    await expect(runGuardedDocumentAction(async () => false, replace)).resolves.toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('runs the replacement only after the guard accepts', async () => {
    const calls: string[] = []

    await expect(
      runGuardedDocumentAction(
        async () => {
          calls.push('guard')
          return true
        },
        async () => {
          calls.push('replace')
        },
      ),
    ).resolves.toBe(true)
    expect(calls).toEqual(['guard', 'replace'])
  })
})
