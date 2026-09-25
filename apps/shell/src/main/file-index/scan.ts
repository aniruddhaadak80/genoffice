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

export interface ScanResult {
  files: ScannedFile[]
  truncated: boolean
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

  while (pending.length > 0) {
    if (now() - startedAt >= timeBudgetMs) return { files, truncated: true }
    const current = pending.pop()!
    let dirents: import('node:fs').Dirent[]
    try {
      dirents = readdirSync(current.path, { withFileTypes: true })
    } catch {
      truncated = true
      continue
    }
    for (const entry of dirents) {
      if (now() - startedAt >= timeBudgetMs) return { files, truncated: true }
      const path = join(current.path, entry.name)
      if (entry.isDirectory()) {
        if (isHiddenEntry(current.path, entry.name, true)) continue
        if (current.depth >= maxDepth) {
          truncated = true
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
      if (files.length >= maxFiles) return { files, truncated: true }
      const file = statOrNull(path)
      if (file) files.push(file)
    }
  }
  return { files, truncated }
}

export function statOrNull(path: string): ScannedFile | null {
  try {
    const st = statSync(path)
    return st.isFile() ? { path, mtimeMs: st.mtimeMs, sizeBytes: st.size } : null
  } catch {
    return null
  }
}
