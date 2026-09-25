import { describe, expect, it, vi } from 'vitest'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  createAnnotCountCache,
  createOcrQueue,
  createSearchIndexCache,
} from '../src/renderer/lazy-scan'

interface FakeDoc {
  doc: PDFDocumentProxy
  calls: { getPage: number[]; getTextContent: number[] }
}

const textItems = (text: string) => [
  { str: text, transform: [1, 0, 0, 1, 10, 10], width: 4, height: 12, hasEOL: true },
]

function fakeDoc(numPages: number, text = 'Quarterly revenue by region'): FakeDoc {
  const calls = { getPage: [] as number[], getTextContent: [] as number[] }
  const getPage = vi.fn(async (n: number) => {
    calls.getPage.push(n)
    return {
      getTextContent: vi.fn(async () => {
        calls.getTextContent.push(n)
        return { items: textItems(text) }
      }),
      getViewport: () => ({ width: 1, height: 1 }),
    }
  })
  return { doc: { numPages, getPage } as unknown as PDFDocumentProxy, calls }
}

describe('createSearchIndexCache', () => {
  it('extracts nothing until the index is asked for', async () => {
    const { doc, calls } = fakeDoc(50)
    const cache = createSearchIndexCache()
    expect(cache.peek(doc)).toBeNull()
    expect(calls.getPage).toEqual([])

    const index = await cache.get(doc)
    expect(index).toHaveLength(50)
    expect(calls.getPage).toHaveLength(50)
  })

  it('builds the index once and shares the in-flight promise', async () => {
    const { doc, calls } = fakeDoc(3)
    const cache = createSearchIndexCache()
    const first = cache.get(doc)
    const second = cache.get(doc)
    expect(second).toBe(first)
    expect(cache.peek(doc)).toBe(first)
    await Promise.all([first, second])
    expect(calls.getTextContent).toHaveLength(3)
  })

  it('peeking reuses an in-flight build without starting a second one', async () => {
    const { doc, calls } = fakeDoc(3)
    const cache = createSearchIndexCache()
    const first = cache.get(doc)
    expect(cache.peek(doc)).toBe(first)
    await first
    expect(calls.getTextContent).toHaveLength(3)
  })

  it('rebuilds for a different document and forgets the previous one', async () => {
    const a = fakeDoc(2)
    const b = fakeDoc(4)
    const cache = createSearchIndexCache()
    expect(await cache.get(a.doc)).toHaveLength(2)
    expect(cache.peek(a.doc)).not.toBeNull()
    expect(await cache.get(b.doc)).toHaveLength(4)
    expect(cache.peek(b.doc)).not.toBeNull()
    expect(cache.peek(a.doc)).toBeNull()
  })
})

describe('createAnnotCountCache', () => {
  const loader = (threadsPerPage: number[], markupsPerPage: number[]) =>
    vi.fn(async (_doc: PDFDocumentProxy, i: number) => ({
      notes: Array.from({ length: threadsPerPage[i] ?? 0 }, (_x, r) => ({
        inReplyTo: r === 0 ? null : 'P1',
      })),
      markups: Array.from({ length: markupsPerPage[i] ?? 0 }),
    }))

  it('reads no annotations until the counts are asked for', async () => {
    const { doc } = fakeDoc(30)
    const loadPage = loader([2], [1])
    const cache = createAnnotCountCache(loadPage)
    expect(cache.peek(doc)).toBeNull()
    expect(loadPage).not.toHaveBeenCalled()
  })

  it('counts threads and markups per page on first use', async () => {
    const { doc } = fakeDoc(2)
    const cache = createAnnotCountCache(loader([2, 0], [1, 3]))
    const counts = await cache.get(doc)
    expect(counts).toEqual({ threads: [1, 0], markups: [1, 3] })
  })

  it('scans the document once across repeated asks', async () => {
    const { doc } = fakeDoc(5)
    const loadPage = loader([1], [1])
    const cache = createAnnotCountCache(loadPage)
    const first = cache.get(doc)
    expect(cache.get(doc)).toBe(first)
    await first
    await cache.get(doc)
    expect(loadPage).toHaveBeenCalledTimes(5)
  })

  it('rescans for a new document', async () => {
    const a = fakeDoc(2)
    const b = fakeDoc(3)
    const loadPage = loader([1], [0])
    const cache = createAnnotCountCache(loadPage)
    await cache.get(a.doc)
    await cache.get(b.doc)
    expect(loadPage).toHaveBeenCalledTimes(5)
    expect(cache.peek(a.doc)).toBeNull()
  })
})

describe('createOcrQueue', () => {
  /** Resolves only when the test says so, to observe serialization. */
  function gate() {
    const releases: (() => void)[] = []
    const started: number[] = []
    let concurrent = 0
    let maxConcurrent = 0
    const runPage = (origIdx: number) => {
      started.push(origIdx)
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      return new Promise<void>((resolve) => {
        releases.push(() => {
          concurrent--
          resolve()
        })
      })
    }
    return {
      runPage,
      started,
      get maxConcurrent() {
        return maxConcurrent
      },
      release: () => releases.shift()?.(),
      pending: () => releases.length,
    }
  }

  it('recognizes pages one at a time, never two at once', async () => {
    const g = gate()
    const queue = createOcrQueue(g.runPage)
    queue.push([1, 2, 3])
    await Promise.resolve()
    expect(g.started).toEqual([1])
    expect(queue.busy).toBe(true)

    g.release()
    await vi.waitFor(() => expect(g.started).toEqual([1, 2]))
    g.release()
    await vi.waitFor(() => expect(g.started).toEqual([1, 2, 3]))
    g.release()
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(g.maxConcurrent).toBe(1)
  })

  it('recognizes each page once across repeated pushes', async () => {
    const runPage = vi.fn(async () => undefined)
    const queue = createOcrQueue(runPage)
    queue.push([0, 1])
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    queue.push([0, 1, 1])
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(runPage).toHaveBeenCalledTimes(2)
    expect(queue.has(0)).toBe(true)
  })

  it('drops pages already queued instead of running them twice', async () => {
    const g = gate()
    const queue = createOcrQueue(g.runPage)
    queue.push([4])
    queue.push([4])
    queue.push([4])
    await Promise.resolve()
    expect(g.started).toEqual([4])
    g.release()
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(g.started).toEqual([4])
  })

  it('abandons queued pages on stop', async () => {
    const g = gate()
    const queue = createOcrQueue(g.runPage)
    queue.push([1, 2, 3])
    await Promise.resolve()
    expect(g.started).toEqual([1])
    queue.stop()
    g.release()
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(g.started).toEqual([1])
  })

  it('keeps draining after a page fails', async () => {
    const runPage = vi.fn(async (i: number) => {
      if (i === 0) throw new Error('render failed')
    })
    const queue = createOcrQueue(runPage)
    queue.push([0, 1])
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(runPage).toHaveBeenCalledTimes(2)
  })

  it('reset clears history so a new document is scanned again', async () => {
    const runPage = vi.fn(async () => undefined)
    const queue = createOcrQueue(runPage)
    queue.push([0])
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(queue.has(0)).toBe(true)
    queue.push([0])
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(runPage).toHaveBeenCalledTimes(1)

    queue.reset()
    expect(queue.has(0)).toBe(false)
    queue.push([0])
    await vi.waitFor(() => expect(queue.busy).toBe(false))
    expect(runPage).toHaveBeenCalledTimes(2)
  })
})
