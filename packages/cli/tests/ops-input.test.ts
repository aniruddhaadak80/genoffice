import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_OPS_BYTES, readOpsInput } from '../src/ops-input'
import { EXIT } from '../src/result'

function ctx(cwd: string) {
  return { cwd, env: { ...process.env, GENOFFICE_ALLOWED_ROOTS: '' } }
}

describe('readOpsInput size cap', () => {
  it('rejects oversized ops files with resource_limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genoffice-ops-'))
    const file = join(dir, 'big.json')
    writeFileSync(file, 'x'.repeat(MAX_OPS_BYTES + 1))
    let err: unknown
    try {
      readOpsInput({ _: [], ops: file } as never, ctx(dir))
    } catch (e) {
      err = e
    }
    expect(err).toMatchObject({ code: EXIT.file, reason: 'resource_limit' })
  })

  it('accepts small ops files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genoffice-ops-'))
    const file = join(dir, 'small.json')
    writeFileSync(file, '{"ops":[]}')
    const r = readOpsInput({ _: [], ops: file } as never, ctx(dir))
    expect(r.text).toBe('{"ops":[]}')
    expect(r.source).toBe(file)
  })
})
