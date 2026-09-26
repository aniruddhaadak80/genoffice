import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** What two files must match before one can stand in for the other. */
export interface FileIdentity {
  size: number
  digest: string
}

export type RecoveryCopyAction = 'offer' | 'drop-duplicate'

/** `null` when the file cannot be read at all, which is never proof of sameness. */
export function fileIdentitySync(path: string): FileIdentity | null {
  try {
    const bytes = readFileSync(path)
    return { size: bytes.length, digest: createHash('sha256').update(bytes).digest('hex') }
  } catch {
    return null
  }
}

export function sameContent(a: FileIdentity | null, b: FileIdentity | null): boolean {
  return a !== null && b !== null && a.size === b.size && a.digest === b.digest
}

/**
 * A crash-recovery copy is offered to the user; it is dropped without asking
 * only when the file it shadows already holds exactly the same bytes. An mtime
 * comparison may not delete one: a document touched by another program looks
 * newer than the copy while the copy still carries the only pre-crash edits.
 */
export function recoveryCopyAction(input: {
  copyPath: string
  sourcePath: string
  copyNewerThanSource: boolean
  sourceIdentity?: FileIdentity
}): RecoveryCopyAction {
  if (input.copyNewerThanSource) return 'offer'
  const copy = fileIdentitySync(input.copyPath)
  const source = input.sourceIdentity ?? fileIdentitySync(input.sourcePath)
  return sameContent(copy, source) ? 'drop-duplicate' : 'offer'
}
