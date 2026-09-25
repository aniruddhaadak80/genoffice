import { describe, expect, it } from 'vitest'

import { RendererStreamRegistry, type StreamRequester } from '../src/index'

function fakeRenderer(id: number): StreamRequester & { destroy(): void } {
  const listeners: Array<() => void> = []
  let destroyed = false
  return {
    id,
    isDestroyed: () => destroyed,
    once: (_event, listener) => {
      listeners.push(listener)
      return undefined
    },
    destroy: () => {
      destroyed = true
      for (const listener of listeners.splice(0)) listener()
    },
  }
}

describe('RendererStreamRegistry', () => {
  it('hands out one controller per request and forgets it on end', () => {
    const registry = new RendererStreamRegistry()
    const renderer = fakeRenderer(1)
    const first = registry.begin(renderer, 'a')
    const second = registry.begin(renderer, 'b')
    expect(first.signal.aborted).toBe(false)
    expect(second).not.toBe(first)
    expect(registry.count(1)).toBe(2)
    registry.end(renderer, 'a')
    expect(registry.count(1)).toBe(1)
    registry.end(renderer, 'b')
    expect(registry.count(1)).toBe(0)
  })

  it('cancels a single request by id', () => {
    const registry = new RendererStreamRegistry()
    const renderer = fakeRenderer(1)
    const first = registry.begin(renderer, 'a')
    const second = registry.begin(renderer, 'b')
    expect(registry.cancel(renderer, 'a')).toBe(true)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    // still tracked until the handler's own cleanup reports the stream finished
    expect(registry.count(1)).toBe(2)
    registry.end(renderer, 'a')
    expect(registry.count(1)).toBe(1)
  })

  it('ignores cancel for unknown ids and for other renderers', () => {
    const registry = new RendererStreamRegistry()
    const renderer = fakeRenderer(1)
    const other = fakeRenderer(2)
    const controller = registry.begin(renderer, 'a')
    expect(registry.cancel(renderer, 'missing')).toBe(false)
    expect(registry.cancel(other, 'a')).toBe(false)
    expect(controller.signal.aborted).toBe(false)
    expect(registry.count(2)).toBe(0)
  })

  it('aborts and clears every request of a destroyed renderer', () => {
    const registry = new RendererStreamRegistry()
    const renderer = fakeRenderer(1)
    const a = registry.begin(renderer, 'a')
    const b = registry.begin(renderer, 'b')
    renderer.destroy()
    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(true)
    expect(registry.count(1)).toBe(0)
  })

  it('leaves other renderers running when one is destroyed', () => {
    const registry = new RendererStreamRegistry()
    const closing = fakeRenderer(1)
    const staying = fakeRenderer(2)
    const closingStream = registry.begin(closing, 'shared-id')
    const stayingStream = registry.begin(staying, 'shared-id')
    closing.destroy()
    expect(closingStream.signal.aborted).toBe(true)
    expect(stayingStream.signal.aborted).toBe(false)
    expect(registry.count(2)).toBe(1)
  })

  it('aborts a request that arrives after the renderer is already gone', () => {
    const registry = new RendererStreamRegistry()
    const renderer = fakeRenderer(1)
    renderer.destroy()
    expect(registry.begin(renderer, 'a').signal.aborted).toBe(true)
    expect(registry.count(1)).toBe(0)
  })

  it('re-arms the destroy hook for a later request on the same renderer', () => {
    const registry = new RendererStreamRegistry()
    const renderer = fakeRenderer(1)
    const first = registry.begin(renderer, 'a')
    registry.end(renderer, 'a')
    const second = registry.begin(renderer, 'b')
    expect(first.signal.aborted).toBe(false)
    renderer.destroy()
    expect(second.signal.aborted).toBe(true)
  })

  it('registers the destroy hook once per renderer', () => {
    const registry = new RendererStreamRegistry()
    const listeners: Array<() => void> = []
    const requester: StreamRequester = {
      id: 7,
      isDestroyed: () => false,
      once: (_event, listener) => {
        listeners.push(listener)
        return undefined
      },
    }
    registry.begin(requester, 'a')
    registry.begin(requester, 'b')
    expect(listeners).toHaveLength(1)
    for (const listener of listeners) listener()
    expect(registry.count(7)).toBe(0)
  })
})
