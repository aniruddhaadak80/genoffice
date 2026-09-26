import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileIdentitySync, recoveryCopyAction, sameContent } from '../src/recovery-copy'

let dir: string
let source: string
let copy: string

function write(path: string, body: string, mtimeSeconds?: number): void {
  writeFileSync(path, body)
  if (mtimeSeconds !== undefined) utimesSync(path, mtimeSeconds, mtimeSeconds)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'recovery-copy-'))
  source = join(dir, 'document.docx')
  copy = join(dir, 'document.recovery.docx')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('recovery copy decision', () => {
  it('offers a copy that is newer than the file, whatever it holds', () => {
    write(source, 'saved bytes')
    write(copy, 'unsaved work', 2_000)
    expect(
      recoveryCopyAction({ copyPath: copy, sourcePath: source, copyNewerThanSource: true }),
    ).toBe('offer')
  })

  it('offers a copy the file only looks newer than, never deleting it on mtime alone', () => {
    write(source, 'touched by another program', 2_000)
    write(copy, 'pre-crash edits', 1_000)
    expect(
      recoveryCopyAction({ copyPath: copy, sourcePath: source, copyNewerThanSource: false }),
    ).toBe('offer')
  })

  it('offers a copy of a different length that shares the file mtime', () => {
    write(source, 'aaaa', 1_000)
    write(copy, 'aaaaa', 1_000)
    expect(
      recoveryCopyAction({ copyPath: copy, sourcePath: source, copyNewerThanSource: false }),
    ).toBe('offer')
  })

  it('drops a copy only when the file holds the very same bytes', () => {
    write(source, 'identical', 2_000)
    write(copy, 'identical', 1_000)
    expect(
      recoveryCopyAction({ copyPath: copy, sourcePath: source, copyNewerThanSource: false }),
    ).toBe('drop-duplicate')
  })

  it('reuses a caller-supplied source identity instead of re-reading the file', () => {
    write(source, 'identical', 2_000)
    write(copy, 'identical', 1_000)
    const identity = fileIdentitySync(source)
    expect(identity).not.toBeNull()
    expect(
      recoveryCopyAction({
        copyPath: copy,
        sourcePath: join(dir, 'never-read.docx'),
        copyNewerThanSource: false,
        sourceIdentity: identity!,
      }),
    ).toBe('drop-duplicate')
  })

  it('offers rather than guesses when either file cannot be read', () => {
    write(source, 'identical', 2_000)
    write(copy, 'identical', 1_000)
    expect(
      recoveryCopyAction({
        copyPath: join(dir, 'missing-copy.docx'),
        sourcePath: source,
        copyNewerThanSource: false,
      }),
    ).toBe('offer')
    expect(
      recoveryCopyAction({
        copyPath: copy,
        sourcePath: join(dir, 'missing-source.docx'),
        copyNewerThanSource: false,
      }),
    ).toBe('offer')
  })
})

describe('file identity', () => {
  it('is null for a path that cannot be read', () => {
    expect(fileIdentitySync(join(dir, 'nope'))).toBeNull()
  })

  it('treats size and digest as one comparison and never matches null', () => {
    expect(sameContent({ size: 3, digest: 'a' }, { size: 3, digest: 'a' })).toBe(true)
    expect(sameContent({ size: 3, digest: 'a' }, { size: 4, digest: 'a' })).toBe(false)
    expect(sameContent({ size: 3, digest: 'a' }, { size: 3, digest: 'b' })).toBe(false)
    expect(sameContent(null, { size: 3, digest: 'a' })).toBe(false)
    expect(sameContent({ size: 3, digest: 'a' }, null)).toBe(false)
    expect(sameContent(null, null)).toBe(false)
  })

  it('changes with the bytes', () => {
    write(source, 'one')
    const first = fileIdentitySync(source)
    write(source, 'two')
    expect(sameContent(first, fileIdentitySync(source))).toBe(false)
  })
})
