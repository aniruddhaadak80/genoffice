import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isHiddenEntry, isSupportedTreeFile } from '../folder-tree'

export interface ScannedFile {
  path: string
  mtimeMs: number
  sizeBytes: number
}

export interface ScanOptions {
  maxDepth?: number
  maxFiles?: number
  timeBudgetMs?: number
  now?: () => number
}

export type StatResult =
  { kind: 'file'; file: ScannedFile } | { kind: 'missing' } | { kind: 'error'; error: string }

export interface ScanResult {
  files: ScannedFile[]
  truncated: boolean
  incomplete: boolean
  error?: string
}

export const SCAN_MAX_DEPTH = 32
export const SCAN_MAX_FILES = 50_000
export const SCAN_TIME_BUDGET_MS = 10_000

export function scanFiles(root: string, options: ScanOptions = {}): ScanResult {
  const maxDepth = Math.max(0, Math.floor(options.maxDepth ?? SCAN_MAX_DEPTH))
  const maxFiles = Math.max(0, Math.floor(options.maxFiles ?? SCAN_MAX_FILES))
  const timeBudgetMs = Math.max(0, options.timeBudgetMs ?? SCAN_TIME_BUDGET_MS)
  const now = options.now ?? Date.now
  const startedAt = now()
  const files: ScannedFile[] = []
  const pending = [{ path: root, depth: 0 }]
  let truncated = false
  let incomplete = false
  let error: string | undefined

  while (pending.length > 0) {
    if (now() - startedAt >= timeBudgetMs) {
      return { files, truncated: true, incomplete: true, error }
    }
    const current = pending.pop()!
    let dirents: import('node:fs').Dirent[]
    try {
      dirents = readdirSync(current.path, { withFileTypes: true })
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code ?? ''
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        incomplete = true
        error ??= cause instanceof Error ? cause.message : String(cause)
      }
      continue
    }
    for (const entry of dirents) {
      if (now() - startedAt >= timeBudgetMs) {
        return { files, truncated: true, incomplete: true, error }
      }
      const path = join(current.path, entry.name)
      if (entry.isDirectory()) {
        if (isHiddenEntry(current.path, entry.name, true)) continue
        if (current.depth >= maxDepth) {
          truncated = true
          incomplete = true
          continue
        }
        pending.push({ path, depth: current.depth + 1 })
        continue
      }
      if (
        !entry.isFile() ||
        !isSupportedTreeFile(entry.name) ||
        isHiddenEntry(current.path, entry.name, false)
      ) {
        continue
      }
      if (files.length >= maxFiles) {
        return { files, truncated: true, incomplete: true, error }
      }
      const result = statResult(path)
      if (result.kind === 'file') files.push(result.file)
      else if (result.kind === 'error') {
        incomplete = true
        error ??= result.error
      }
    }
  }
  return { files, truncated, incomplete, error }
}

export function statResult(path: string): StatResult {
  try {
    const st = statSync(path)
    return st.isFile()
      ? { kind: 'file', file: { path, mtimeMs: st.mtimeMs, sizeBytes: st.size } }
      : { kind: 'missing' }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? ''
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'missing' }
    return { kind: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}
