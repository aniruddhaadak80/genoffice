import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const trace = vi.hoisted(() => ({ calls: [] as string[], failOpenFlag: null as string | null }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: vi.fn(async (path: string, flags: string) => {
      trace.calls.push(`open:${flags}`)
      if (trace.failOpenFlag === flags) {
        throw Object.assign(new Error(`open ${flags} refused`), { code: 'EACCES' })
      }
      const handle = await actual.open(path, flags)
      const sync = handle.sync.bind(handle)
      const close = handle.close.bind(handle)
      return Object.assign(handle, {
        sync: async () => {
          trace.calls.push('sync')
          return sync()
        },
        close: async () => {
          trace.calls.push('close')
          return close()
        },
      })
    }),
    rename: vi.fn(async (from: string, to: string) => {
      trace.calls.push('rename')
      return actual.rename(from, to)
    }),
  }
})

import { atomicWriteFile } from '../src/main/atomic-write'

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'genoffice-atomic-flush-'))
}

function reset(): void {
  trace.calls.length = 0
  trace.failOpenFlag = null
}

describe('atomicWriteFile durability', () => {
  it('flushes the temporary file before publishing the rename', async () => {
    reset()
    const dir = scratch()
    try {
      await atomicWriteFile(join(dir, 'report.docx'), 'new contents')
      const sync = trace.calls.indexOf('sync')
      const rename = trace.calls.indexOf('rename')
      expect(sync).toBeGreaterThan(-1)
      expect(rename).toBeGreaterThan(-1)
      expect(sync).toBeLessThan(rename)
      expect(trace.calls.slice(0, sync + 1)).toEqual(['open:wx', 'sync'])
      expect(readFileSync(join(dir, 'report.docx'), 'utf8')).toBe('new contents')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flushes the containing directory after the rename', async () => {
    reset()
    const dir = scratch()
    try {
      await atomicWriteFile(join(dir, 'report.docx'), 'new')
      const rename = trace.calls.indexOf('rename')
      const syncsAfter = trace.calls.slice(rename + 1).filter((call) => call === 'sync')
      expect(syncsAfter.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves the destination intact when the temporary file cannot be created', async () => {
    reset()
    trace.failOpenFlag = 'wx'
    const dir = scratch()
    const target = join(dir, 'report.docx')
    writeFileSync(target, 'old')
    try {
      await expect(atomicWriteFile(target, 'new')).rejects.toMatchObject({ code: 'EACCES' })
      expect(readFileSync(target, 'utf8')).toBe('old')
      expect(readdirSync(dir)).toEqual(['report.docx'])
      expect(trace.calls).not.toContain('rename')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves the destination intact when the temp write itself fails', async () => {
    reset()
    const dir = scratch()
    const target = join(dir, 'report.docx')
    writeFileSync(target, 'old')
    try {
      await expect(
        atomicWriteFile(target, { byteLength: -1 } as unknown as Uint8Array),
      ).rejects.toThrow()
      expect(readFileSync(target, 'utf8')).toBe('old')
      expect(readdirSync(dir)).toEqual(['report.docx'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still has no direct destination-write fallback', async () => {
    const source = readFileSync(join(__dirname, '../src/main/atomic-write.ts'), 'utf8')
    expect(source).not.toContain('await writeFile(filePath, data)')
  })
})
