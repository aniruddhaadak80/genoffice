import { Worker } from 'node:worker_threads'
import type { Extracted } from './extract'
import type { WorkerRequest, WorkerResponse } from './extract-worker'
import { isSupportedTreeFile } from '../folder-tree'
import { SCAN_MAX_FILES, SCAN_TIME_BUDGET_MS, statResult, type ScannedFile } from './scan'
import type { FileIndexStore } from './store'

export interface IndexProgress {
  /** files currently in the index */
  indexed: number
  /** files waiting for extraction */
  pending: number
  scanning: boolean
  truncated: boolean
  incomplete: boolean
  error?: string
}

export interface IndexerSources {
  /** the folders walked recursively: the save folder and every added root */
  roots: () => readonly string[]
  /** files outside the roots that should still be searchable (recents, starred) */
  extraPaths: () => readonly string[]
}

const RESCAN_DEBOUNCE_MS = 1500

/**
 * Keeps the store in step with the disk: a scan diffs mtime/size against the
 * index, changed files queue for extraction on the worker one at a time, and
 * vanished files are dropped. Scans coalesce; extraction is sequential so the
 * user's foreground work keeps the CPU.
 */
export class FileIndexer {
  private worker: Worker | null = null
  private nextId = 1
  private readonly waiting = new Map<
    number,
    { type: WorkerRequest['type']; resolve: (response: WorkerResponse) => void }
  >()
  private readonly queue: ScannedFile[] = []
  private readonly queued = new Set<string>()
  private draining = false
  private scanning = false
  private scanRequested = false
  private rescanTimer: NodeJS.Timeout | null = null
  private lastScanAt = 0
  private scanTruncated = false
  private scanIncomplete = false
  private scanError: string | undefined
  private stopped = false

  constructor(
    private readonly store: FileIndexStore,
    private readonly workerPath: string,
    private readonly sources: IndexerSources,
  ) {}

  progress(): IndexProgress {
    return {
      indexed: this.store.count(),
      pending: this.queue.length,
      scanning: this.scanning,
      truncated: this.scanTruncated,
      incomplete: this.scanIncomplete,
      error: this.scanError,
    }
  }

  /** schedule a scan soon; repeated calls within the debounce window fold into one */
  refresh(): void {
    if (this.stopped) return
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
    this.rescanTimer = setTimeout(() => {
      this.rescanTimer = null
      void this.scan()
    }, RESCAN_DEBOUNCE_MS)
  }

  /** scan now unless one ran within `maxAgeMs` */
  refreshIfStale(maxAgeMs: number): void {
    if (Date.now() - this.lastScanAt >= maxAgeMs) void this.scan()
  }

  private markIncomplete(error?: string): void {
    this.scanIncomplete = true
    if (error) this.scanError ??= error
  }

  async scan(): Promise<void> {
    if (this.stopped) return
    if (this.scanning) {
      this.scanRequested = true
      return
    }
    this.scanning = true
    this.scanTruncated = false
    this.scanIncomplete = false
    this.scanError = undefined
    try {
      const seen = new Map<string, ScannedFile>()
      const deadline = Date.now() + SCAN_TIME_BUDGET_MS
      let complete = true
      for (const root of this.sources.roots()) {
        const maxFiles = SCAN_MAX_FILES - seen.size
        const timeBudgetMs = deadline - Date.now()
        if (maxFiles <= 0 || timeBudgetMs <= 0) {
          complete = false
          this.scanTruncated = true
          this.markIncomplete('scan budget exhausted')
          break
        }
        let res: WorkerResponse
        try {
          res = await this.ask({ id: 0, type: 'scan', root, maxFiles, timeBudgetMs })
        } catch (cause) {
          complete = false
          this.markIncomplete(cause instanceof Error ? cause.message : String(cause))
          break
        }
        if (res.type !== 'scan') {
          complete = false
          this.markIncomplete('worker returned an unexpected response')
          break
        }
        for (const file of res.files) seen.set(file.path, file)
        if (res.truncated) {
          complete = false
          this.scanTruncated = true
          this.markIncomplete('scan truncated')
        }
        if (res.incomplete) {
          complete = false
          this.markIncomplete(res.error ?? 'scan incomplete')
        }
      }
      const result = this.diff(seen, complete)
      if (result.incomplete) this.markIncomplete(result.error)
    } catch (cause) {
      this.markIncomplete(cause instanceof Error ? cause.message : String(cause))
    } finally {
      this.scanning = false
      this.lastScanAt = Date.now()
    }
    if (this.scanRequested) {
      this.scanRequested = false
      void this.scan()
    }
  }

  private diff(
    seen: Map<string, ScannedFile>,
    complete: boolean,
  ): { incomplete: boolean; error?: string } {
    let incomplete = false
    let error: string | undefined
    for (const p of this.sources.extraPaths()) {
      if (seen.has(p) || !isSupportedTreeFile(p)) continue
      const result = statResult(p)
      if (result.kind === 'file') seen.set(p, result.file)
      else if (result.kind === 'error') {
        incomplete = true
        error ??= result.error
      }
    }
    const known = this.store.listAll()
    if (complete && !incomplete) {
      const gone: string[] = []
      for (const path of known.keys()) if (!seen.has(path)) gone.push(path)
      this.store.remove(gone)
    }
    for (const f of seen.values()) {
      const k = known.get(f.path)
      if (k && k.status !== 'error' && k.mtimeMs === f.mtimeMs && k.sizeBytes === f.sizeBytes) {
        continue
      }
      this.enqueue(f)
    }
    return { incomplete, error }
  }

  private enqueue(f: ScannedFile): void {
    if (this.queued.has(f.path)) return
    this.queued.add(f.path)
    this.queue.push(f)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length && !this.stopped) {
        const f = this.queue.shift()!
        this.queued.delete(f.path)
        const result = statResult(f.path)
        if (result.kind === 'missing') {
          this.store.remove([f.path])
          continue
        }
        if (result.kind === 'error') {
          this.markIncomplete(result.error)
          continue
        }
        let response: WorkerResponse
        try {
          response = await this.ask({ id: 0, type: 'extract', path: result.file.path })
        } catch (cause) {
          this.markIncomplete(cause instanceof Error ? cause.message : String(cause))
          continue
        }
        if (response.type !== 'extract') {
          this.markIncomplete('worker returned an unexpected response')
          continue
        }
        this.apply(result.file, response.result)
      }
    } catch (cause) {
      this.markIncomplete(cause instanceof Error ? cause.message : String(cause))
    } finally {
      this.draining = false
    }
  }

  private apply(f: ScannedFile, r: Extracted): void {
    try {
      if (r.kind === 'text') this.store.upsert(f, r.text, 'ok')
      else if (r.kind === 'name-only') this.store.upsert(f, null, 'name-only')
      else this.store.upsert(f, null, 'error')
    } catch {
      // a corrupt row must not stall the queue; the next scan retries it
    }
  }

  private ask(req: WorkerRequest): Promise<WorkerResponse> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { type: req.type, resolve })
      try {
        this.ensureWorker().postMessage({ ...req, id })
      } catch (error) {
        this.waiting.delete(id)
        reject(error)
      }
    })
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(this.workerPath)
    w.on('message', (msg: WorkerResponse) => {
      const pending = this.waiting.get(msg.id)
      if (!pending) return
      this.waiting.delete(msg.id)
      pending.resolve(msg)
    })
    const drop = () => {
      if (this.worker === w) this.worker = null
      const pending = [...this.waiting]
      this.waiting.clear()
      for (const [id, request] of pending) {
        if (request.type === 'scan') {
          request.resolve({
            id,
            type: 'scan',
            files: [],
            truncated: false,
            incomplete: true,
            error: 'worker exited',
          })
        } else {
          request.resolve({
            id,
            type: 'extract',
            result: { kind: 'error', error: 'worker exited' },
          })
        }
      }
    }
    w.on('error', drop)
    w.on('exit', drop)
    this.worker = w
    return w
  }

  stop(): void {
    this.stopped = true
    if (this.rescanTimer) clearTimeout(this.rescanTimer)
    this.queue.length = 0
    this.queued.clear()
    void this.worker?.terminate()
    this.worker = null
  }
}
