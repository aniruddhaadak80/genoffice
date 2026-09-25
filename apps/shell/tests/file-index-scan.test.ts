import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileIndexer } from '../src/main/file-index/indexer'
import { scanFiles, statResult } from '../src/main/file-index/scan'
import { FileIndexStore } from '../src/main/file-index/store'

let dir = ''

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  dir = ''
})

describe('scanFiles budgets', () => {
  it('stops descending at the depth limit and reports truncation', () => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-scan-depth-'))
    const nested = join(dir, 'one', 'two')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(dir, 'root.md'), 'root')
    writeFileSync(join(nested, 'deep.md'), 'deep')

    const result = scanFiles(dir, {
      maxDepth: 0,
      maxFiles: 10,
      timeBudgetMs: 1_000,
      now: () => 0,
    })

    expect(result.files.map((file) => file.path)).toEqual([join(dir, 'root.md')])
    expect(result.truncated).toBe(true)
  })

  it('stops after the file limit and reports truncation', () => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-scan-files-'))
    writeFileSync(join(dir, 'a.md'), 'a')
    writeFileSync(join(dir, 'b.md'), 'b')
    writeFileSync(join(dir, 'c.md'), 'c')

    const result = scanFiles(dir, {
      maxDepth: 2,
      maxFiles: 2,
      timeBudgetMs: 1_000,
      now: () => 0,
    })

    expect(result.files).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('stops when the time budget expires and reports truncation', () => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-scan-time-'))
    writeFileSync(join(dir, 'a.md'), 'a')
    let tick = 0

    const result = scanFiles(dir, {
      maxDepth: 2,
      maxFiles: 10,
      timeBudgetMs: 5,
      now: () => tick++ * 10,
    })

    expect(result.files).toEqual([])
    expect(result.truncated).toBe(true)
  })
  it('separates confirmed absence from stat errors', () => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-stat-result-'))
    expect(statResult(join(dir, 'missing.md'))).toEqual({ kind: 'missing' })
    expect(statResult('\u0000')).toMatchObject({ kind: 'error' })
  })

  it('marks a directory read error incomplete without calling it truncation', () => {
    const result = scanFiles('\u0000', {
      maxDepth: 2,
      maxFiles: 10,
      timeBudgetMs: 1_000,
      now: () => 0,
    })
    expect(result.files).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.incomplete).toBe(true)
    expect(result.error).toBeTruthy()
  })
})

describe('FileIndexer incomplete scans', () => {
  it('preserves known entries and reports an incomplete scan', async () => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-scan-index-'))
    const store = new FileIndexStore(join(dir, 'index.db'))
    const knownPath = join(dir, 'known.md')
    writeFileSync(knownPath, 'known')
    store.upsert({ path: knownPath, mtimeMs: 1, sizeBytes: 6 }, 'known', 'ok')
    const workerPath = join(dir, 'worker.mjs')
    writeFileSync(
      workerPath,
      `import { parentPort } from 'node:worker_threads'\nparentPort.on('message', (request) => parentPort.postMessage({ id: request.id, type: 'scan', files: [], truncated: false, incomplete: true, error: 'scan failed' }))\n`,
      'utf8',
    )
    const indexer = new FileIndexer(store, workerPath, {
      roots: () => [dir],
      extraPaths: () => [],
    })

    try {
      await indexer.scan()
      expect(store.listAll().has(knownPath)).toBe(true)
      expect(indexer.progress()).toMatchObject({
        truncated: false,
        incomplete: true,
        error: 'scan failed',
      })
    } finally {
      indexer.stop()
      store.close()
    }
  })

  it('preserves known entries when the scan worker exits', async () => {
    dir = mkdtempSync(join(tmpdir(), 'genoffice-scan-worker-'))
    const store = new FileIndexStore(join(dir, 'index.db'))
    const knownPath = join(dir, 'known.md')
    writeFileSync(knownPath, 'known')
    store.upsert({ path: knownPath, mtimeMs: 1, sizeBytes: 6 }, 'known', 'ok')
    const workerPath = join(dir, 'worker.mjs')
    writeFileSync(
      workerPath,
      `import { parentPort } from 'node:worker_threads'\nparentPort.on('message', () => process.exit(1))\n`,
      'utf8',
    )
    const indexer = new FileIndexer(store, workerPath, {
      roots: () => [dir],
      extraPaths: () => [],
    })

    try {
      await indexer.scan()
      expect(store.listAll().has(knownPath)).toBe(true)
      expect(indexer.progress().incomplete).toBe(true)
      expect(indexer.progress().error).toBe('worker exited')
    } finally {
      indexer.stop()
      store.close()
    }
  })
})
