/**
 * Lazy whole-document scans for the PDF viewer.
 *
 * Opening a document used to walk every page three times over: once to count
 * saved annotations for the AI context, once to extract text for the search
 * index, and once more to decide which pages need OCR — the OCR pass called
 * buildSearchIndex itself, so the first real search paid for a second
 * extraction. None of that work is needed to look at a page.
 *
 * These caches hold no state of their own beyond one in-flight promise per
 * loaded document, so they can be created once per viewer instance and simply
 * start empty: nothing runs until a caller asks.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { buildSearchIndex, type SearchIndex } from './search'

/** Whole-document text index, built at most once per loaded document. */
export interface SearchIndexCache {
  /** The index, starting the extraction on first use. */
  get(doc: PDFDocumentProxy): Promise<SearchIndex>
  /** The index only if it has already been started, so a caller can reuse an
      in-flight build without being the one that triggers it. */
  peek(doc: PDFDocumentProxy): Promise<SearchIndex> | null
}

export function createSearchIndexCache(): SearchIndexCache {
  let current: { doc: PDFDocumentProxy; promise: Promise<SearchIndex> } | null = null
  return {
    get(doc) {
      if (current?.doc !== doc) current = { doc, promise: buildSearchIndex(doc) }
      return current.promise
    },
    peek(doc) {
      return current?.doc === doc ? current.promise : null
    },
  }
}

/** Saved note-thread and text-markup counts per page, for the AI context. */
export interface AnnotCounts {
  threads: number[]
  markups: number[]
}

export interface AnnotCountCache {
  get(doc: PDFDocumentProxy): Promise<AnnotCounts>
  peek(doc: PDFDocumentProxy): Promise<AnnotCounts> | null
}

/**
 * `loadPage` reads one page's saved annotations; the cache keeps the whole
 * document scan to a single run per loaded document, on first use.
 */
export function createAnnotCountCache(
  loadPage: (
    doc: PDFDocumentProxy,
    origIdx: number,
  ) => Promise<{ markups: unknown[]; notes: readonly { inReplyTo: unknown }[] }>,
): AnnotCountCache {
  let current: { doc: PDFDocumentProxy; promise: Promise<AnnotCounts> } | null = null
  const countAll = async (doc: PDFDocumentProxy): Promise<AnnotCounts> => {
    const threads: number[] = []
    const markups: number[] = []
    for (let i = 0; i < doc.numPages; i++) {
      const page = await loadPage(doc, i)
      threads.push(page.notes.filter((n) => n.inReplyTo === null).length)
      markups.push(page.markups.length)
    }
    return { threads, markups }
  }
  return {
    get(doc) {
      if (current?.doc !== doc) current = { doc, promise: countAll(doc) }
      return current.promise
    },
    peek(doc) {
      return current?.doc === doc ? current.promise : null
    },
  }
}

/**
 * Runs page recognition one page at a time.
 *
 * Scroll position changes arrive faster than recognition finishes, so pages
 * are queued and drained sequentially: two passes never overlap, a page is
 * never recognized twice, and `stop` abandons the rest of the queue when the
 * document goes away.
 */
export interface OcrQueue {
  /** Enqueue pages to recognize; resolves nothing, work drains in the background. */
  push(pages: readonly number[]): void
  /** Abandon pending work (the in-flight page still finishes). */
  stop(): void
  /** Forget everything, for a newly loaded document. */
  reset(): void
  /** True while a page is being recognized. */
  readonly busy: boolean
  /** Pages already recognized, so a caller can skip them. */
  has(index: number): boolean
}

export function createOcrQueue(runPage: (origIdx: number) => Promise<unknown>): OcrQueue {
  let running = false
  let stopped = false
  const pending: number[] = []
  const started = new Set<number>()
  const done = new Set<number>()

  const drain = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      while (!stopped && pending.length > 0) {
        const page = pending.shift()!
        // queued again by a later scroll before this pass finished
        if (done.has(page) || started.has(page)) continue
        started.add(page)
        try {
          await runPage(page)
          done.add(page)
        } catch {
          // a page that fails recognition is not retried; the rest continue
        }
      }
    } finally {
      running = false
    }
  }

  return {
    push(pages) {
      if (stopped) return
      for (const page of pages) {
        if (done.has(page) || started.has(page) || pending.includes(page)) continue
        pending.push(page)
      }
      void drain()
    },
    stop() {
      stopped = true
      pending.length = 0
    },
    reset() {
      stopped = false
      pending.length = 0
      started.clear()
      done.clear()
    },
    get busy() {
      return running
    },
    has: (index) => done.has(index),
  }
}
