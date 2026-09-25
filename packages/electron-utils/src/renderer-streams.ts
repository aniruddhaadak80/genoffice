export interface StreamRequester {
  readonly id: number
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

export class RendererStreamRegistry {
  private readonly streams = new Map<number, Map<string, AbortController>>()
  private readonly hooked = new Set<number>()

  begin(requester: StreamRequester, requestId: string): AbortController {
    const controller = new AbortController()
    if (requester.isDestroyed()) {
      controller.abort()
      return controller
    }
    this.attachDestroyHook(requester)
    let owned = this.streams.get(requester.id)
    if (!owned) {
      owned = new Map()
      this.streams.set(requester.id, owned)
    }
    owned.set(requestId, controller)
    return controller
  }

  end(requester: StreamRequester, requestId: string): void {
    const owned = this.streams.get(requester.id)
    if (!owned) return
    owned.delete(requestId)
    if (owned.size > 0) return
    this.streams.delete(requester.id)
    this.hooked.delete(requester.id)
  }

  cancel(requester: StreamRequester, requestId: string): boolean {
    const controller = this.streams.get(requester.id)?.get(requestId)
    if (!controller) return false
    controller.abort()
    return true
  }

  abortAll(requesterId: number): number {
    const owned = this.streams.get(requesterId)
    this.hooked.delete(requesterId)
    if (!owned) return 0
    this.streams.delete(requesterId)
    for (const controller of owned.values()) controller.abort()
    return owned.size
  }

  count(requesterId: number): number {
    return this.streams.get(requesterId)?.size ?? 0
  }

  private attachDestroyHook(requester: StreamRequester): void {
    if (this.hooked.has(requester.id)) return
    this.hooked.add(requester.id)
    requester.once('destroyed', () => this.abortAll(requester.id))
  }
}
