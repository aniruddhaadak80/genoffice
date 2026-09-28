import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileIndexer } from '../src/main/file-index/indexer'
import { FileIndexStore } from '../src/main/file-index/store'

let dir: string
let store: FileIndexStore
let indexer: FileIndexer

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-indexer-'))
  const workerPath = join(dir, 'worker.mjs')
  writeFileSync(workerPath, 'onmessage = () => {}\n')
  store = new FileIndexStore(join(dir, 'index.db'))
  indexer = new FileIndexer(store, workerPath, {
    roots: () => [dir],
    extraPaths: () => [],
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  indexer.stop()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('FileIndexer', () => {
  it('resolves a scan when the worker request cannot be sent, leaving the index intact', async () => {
    store.upsert({ path: join(dir, 'a.md'), mtimeMs: 1, sizeBytes: 10 }, 'new energy report', 'ok')
    vi.spyOn(Worker.prototype, 'postMessage').mockImplementation(() => {
      throw new Error('ERR_WORKER_MESSAGING_FAILED')
    })

    // refresh() enters scan() via void: a rejection here surfaces as an unhandled
    // rejection and leaves search stale until an unrelated file arrives
    await expect(indexer.scan()).resolves.toBeUndefined()
    expect(store.search('new energy').total).toBe(1)
  })
})
