// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockedRename = vi.hoisted(() => vi.fn())
const mockedWrite = vi.hoisted(() => vi.fn())
const real = vi.hoisted(() => ({ fs: null as typeof import('node:fs') | null }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  real.fs = actual
  return {
    ...actual,
    renameSync: mockedRename,
    writeFileSync: mockedWrite,
  }
})

import { readJsonState, writeJsonState } from '../src/main/json-state'

let dir: string
let statePath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-json-state-'))
  statePath = join(dir, 'recent.json')
  mockedRename.mockReset()
  mockedWrite.mockReset()
  mockedRename.mockImplementation((from: string, to: string) => real.fs!.renameSync(from, to))
  mockedWrite.mockImplementation((path: string, data: unknown, options?: unknown) =>
    real.fs!.writeFileSync(path, data as string, options as BufferEncoding),
  )
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function tempFiles(): string[] {
  return readdirSync(dir).filter((name) => name.endsWith('.tmp'))
}

describe('writeJsonState', () => {
  it('round-trips a value through the state file', () => {
    writeJsonState(statePath, ['/a.docx', '/b.xlsx'])
    expect(readJsonState(statePath, [])).toEqual(['/a.docx', '/b.xlsx'])
  })

  it('creates the parent directory', () => {
    const nested = join(dir, 'a', 'b', 'starred.json')
    writeJsonState(nested, ['/a.docx'])
    expect(readJsonState(nested, [])).toEqual(['/a.docx'])
  })

  it('replaces the destination by rename and leaves no temporary file', () => {
    writeJsonState(statePath, ['/a.docx'])
    writeJsonState(statePath, ['/b.docx'])
    expect(mockedRename).toHaveBeenCalledTimes(2)
    expect(tempFiles()).toEqual([])
    expect(readJsonState(statePath, [])).toEqual(['/b.docx'])
  })

  it('keeps the previous state when publishing the rename fails', () => {
    writeJsonState(statePath, ['/a.docx'])
    mockedRename.mockImplementation(() => {
      throw Object.assign(new Error('busy'), { code: 'EPERM' })
    })
    expect(() => writeJsonState(statePath, ['/b.docx'])).toThrow()
    expect(readJsonState(statePath, [])).toEqual(['/a.docx'])
    expect(tempFiles()).toEqual([])
  })

  it('keeps the previous state when the temporary write fails', () => {
    writeJsonState(statePath, ['/a.docx'])
    mockedWrite.mockImplementation((path: string) => {
      if (String(path).endsWith('.tmp')) {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      }
      return
    })
    expect(() => writeJsonState(statePath, ['/b.docx'])).toThrow()
    expect(readJsonState(statePath, [])).toEqual(['/a.docx'])
    expect(tempFiles()).toEqual([])
  })

  it('never truncates the destination in place', () => {
    writeJsonState(statePath, ['/a.docx'])
    const written: string[] = []
    mockedWrite.mockImplementation((path: string, data: unknown, options?: unknown) => {
      written.push(String(path))
      return real.fs!.writeFileSync(path, data as string, options as BufferEncoding)
    })
    writeJsonState(statePath, ['/b.docx'])
    expect(written.every((path) => path.endsWith('.tmp'))).toBe(true)
    expect(written).not.toContain(statePath)
    expect(readJsonState(statePath, [])).toEqual(['/b.docx'])
  })
})

describe('readJsonState', () => {
  it('returns the fallback when the file is missing', () => {
    expect(readJsonState(statePath, ['fallback'])).toEqual(['fallback'])
  })

  it('returns the fallback for a truncated or corrupt file', () => {
    writeFileSync(statePath, '')
    expect(readJsonState(statePath, ['fallback'])).toEqual(['fallback'])
    writeFileSync(statePath, '{broken')
    expect(readJsonState(statePath, ['fallback'])).toEqual(['fallback'])
  })

  it('reads a stored value', () => {
    writeFileSync(statePath, JSON.stringify({ language: 'en' }))
    expect(readJsonState<Record<string, unknown>>(statePath, {})).toEqual({ language: 'en' })
  })
})

describe('docs userData state files', () => {
  const source = readFileSync(join(__dirname, '../src/main/docs-main.ts'), 'utf8')

  it('reads and writes recents, stars, and docs settings through the atomic writer', () => {
    expect(source).toContain(
      "import { readJsonState as readJson, writeJsonState as writeJson } from './json-state'",
    )
    expect(source).not.toMatch(/function writeJson\(/)
  })

  it('no longer truncates a state file in place', () => {
    expect(source).not.toContain('writeFileSync(path, JSON.stringify(')
  })
})
