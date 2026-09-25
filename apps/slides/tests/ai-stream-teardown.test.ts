import { describe, expect, it, vi } from 'vitest'
import type { AiStreamRequest } from '../src/shared/ipc'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

const handlers = new Map<string, IpcHandler>()
const streamCalls: Array<{ signal: AbortSignal }> = []

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\tmp', getVersion: () => '0.0.0-test', once: vi.fn() },
  ipcMain: {
    handle: (channel: string, fn: IpcHandler) => handlers.set(channel, fn),
  },
  nativeImage: { createFromBuffer: vi.fn() },
  net: { fetch: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

vi.mock('@genoffice/ai-provider', () => ({
  AiCreditsError: class extends Error {},
  AiTimeoutError: class extends Error {},
  isAiNetworkError: () => false,
  isAiOverloadedError: () => false,
  activeProvider: (s: { provider: string }) => s.provider,
  defaultAiSettings: () => ({ provider: 'openai', providers: {} }),
  maxOutputTokensOf: () => 1024,
  resolveAiSettings: (s: unknown) => s,
  setAiUserAgent: vi.fn(),
  setRescueFetch: vi.fn(),
  streamForProvider: (
    _provider: string,
    _config: unknown,
    _system: string,
    _messages: unknown,
    _tools: unknown,
    _maxTokens: number,
    options: { signal: AbortSignal },
  ) => {
    streamCalls.push({ signal: options.signal })
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      )
    })
  },
}))

vi.mock('@genoffice/ai-provider/codex-app-server', () => ({ shutdownCodexAppServers: vi.fn() }))
vi.mock('@genoffice/ai-search', () => ({
  webSearchTool: vi.fn(),
  imageSearchTool: vi.fn(),
  ensureGenofficeLogin: vi.fn(),
  gskApiKey: () => '',
  generateImageTool: vi.fn(),
  analyzeMediaTool: vi.fn(),
  gskLoginInfo: vi.fn(),
  hasGskAuth: () => false,
}))
vi.mock('@genoffice/pptx-engine', () => ({
  addPicture: vi.fn(),
  editPictureSrcRect: vi.fn(),
  replacePictureBytes: vi.fn(),
}))
vi.mock('@genoffice/pptx-engine/identity', () => ({ matchesElementRef: () => false }))
vi.mock('@genoffice/pipelines/slides', () => ({ coverCropFractions: () => null }))
vi.mock('@genoffice/pptx-render', () => ({ EMU_PER_PX_96: 9525 }))
vi.mock('../src/main/i18n-main', () => ({ tm: (key: string) => key }))
vi.mock('../src/main/session-state', () => ({
  pushHistory: vi.fn(),
  rebuildSlide: vi.fn(),
  scheduleHistoryNotify: vi.fn(),
  sessions: new Map(),
}))

import { registerAiIpc } from '../src/main/ai-ipc'

function fakeSender(id: number) {
  const listeners = new Map<string, () => void>()
  let destroyed = false
  return {
    id,
    isDestroyed: () => destroyed,
    once: (event: string, listener: () => void) => listeners.set(event, listener),
    send: vi.fn(),
    destroy: () => {
      destroyed = true
      listeners.get('destroyed')?.()
    },
  }
}

function streamRequest(requestId: string): AiStreamRequest {
  return {
    requestId,
    system: 'sys',
    messages: [{ role: 'user', text: 'hi' }],
    settings: {
      provider: 'openai',
      providers: { openai: { apiKey: 'key', model: 'gpt-test', baseUrl: 'https://x.test/v1' } },
    },
  } as unknown as AiStreamRequest
}

async function startStream(sender: ReturnType<typeof fakeSender>, requestId: string) {
  const handler = handlers.get('ai:stream')
  if (!handler) throw new Error('ai:stream handler not registered')
  return handler({ sender }, streamRequest(requestId)) as Promise<void>
}

describe('slides ai:stream renderer teardown', () => {
  it('aborts the provider stream when the requesting renderer is destroyed', async () => {
    handlers.clear()
    streamCalls.length = 0
    registerAiIpc()
    const sender = fakeSender(11)
    const running = startStream(sender, 'req-1')
    await Promise.resolve()
    await Promise.resolve()
    expect(streamCalls).toHaveLength(1)
    expect(streamCalls[0]!.signal.aborted).toBe(false)
    sender.destroy()
    await running
    expect(streamCalls[0]!.signal.aborted).toBe(true)
  })

  it('leaves another renderer’s stream running', async () => {
    handlers.clear()
    streamCalls.length = 0
    registerAiIpc()
    const closing = fakeSender(21)
    const staying = fakeSender(22)
    const closingRun = startStream(closing, 'shared-id')
    const stayingRun = startStream(staying, 'shared-id')
    await Promise.resolve()
    await Promise.resolve()
    expect(streamCalls).toHaveLength(2)
    closing.destroy()
    await closingRun
    expect(streamCalls[0]!.signal.aborted).toBe(true)
    expect(streamCalls[1]!.signal.aborted).toBe(false)
    staying.destroy()
    await stayingRun
  })

  it('ai:stream-cancel only cancels the calling renderer’s request', async () => {
    handlers.clear()
    streamCalls.length = 0
    registerAiIpc()
    const first = fakeSender(31)
    const second = fakeSender(32)
    const firstRun = startStream(first, 'req-a')
    const secondRun = startStream(second, 'req-b')
    await Promise.resolve()
    await Promise.resolve()
    const cancel = handlers.get('ai:stream-cancel')
    if (!cancel) throw new Error('ai:stream-cancel handler not registered')
    await cancel({ sender: second }, 'req-a')
    expect(streamCalls[0]!.signal.aborted).toBe(false)
    expect(streamCalls[1]!.signal.aborted).toBe(false)
    await cancel({ sender: first }, 'req-a')
    expect(streamCalls[0]!.signal.aborted).toBe(true)
    expect(streamCalls[1]!.signal.aborted).toBe(false)
    first.destroy()
    second.destroy()
    await Promise.all([firstRun, secondRun])
  })
})
