import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChatAppendError, MAX_PENDING_OPENING_MESSAGES, ProjectStore } from '../src/store.js'

describe('appendChatMessage failure reporting and buffer preservation', () => {
  let tmpDir: string
  let store: ProjectStore
  let chatsPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'project-store-append-failure-'))
    store = new ProjectStore(tmpDir)
    store.ensureDefaultProject()
    chatsPath = join(tmpDir, 'projects', 'default', 'chats')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function blockChatsDir(): void {
    rmSync(chatsPath, { recursive: true, force: true })
    writeFileSync(chatsPath, 'not a directory', 'utf8')
  }

  function unblockChatsDir(): void {
    rmSync(chatsPath, { recursive: true, force: true })
  }

  it('throws ChatAppendError when the transcript cannot be written', () => {
    store.appendChatMessage('default', 'chatfail', { role: 'user', text: 'q' })
    blockChatsDir()
    expect(() =>
      store.appendChatMessage('default', 'chatfail', { role: 'assistant', text: 'a' }),
    ).toThrow(ChatAppendError)
  })

  it('keeps the buffered user message after a failed write', () => {
    store.appendChatMessage('default', 'chatfail2', { role: 'user', text: 'only copy' })
    blockChatsDir()
    expect(() =>
      store.appendChatMessage('default', 'chatfail2', { role: 'assistant', text: 'a' }),
    ).toThrow(ChatAppendError)
    expect(store.loadChat('default', 'chatfail2').map((m) => m.text)).toEqual(['only copy'])
  })

  it('a retry after the write is restored persists the buffered and retried messages', () => {
    store.appendChatMessage('default', 'chatfail3', { role: 'user', text: 'only copy' })
    blockChatsDir()
    expect(() =>
      store.appendChatMessage('default', 'chatfail3', { role: 'assistant', text: 'a' }),
    ).toThrow(ChatAppendError)

    unblockChatsDir()
    store.appendChatMessage('default', 'chatfail3', { role: 'assistant', text: 'a' })

    const msgs = store.loadChat('default', 'chatfail3')
    expect(msgs.map((m) => m.text)).toEqual(['only copy', 'a'])
    expect(msgs.map((m) => m.seq)).toEqual([0, 1])
  })

  it('reports failure when the chat file path is not writable and keeps the buffer', () => {
    store.appendChatMessage('default', 'chatexists', { role: 'user', text: 'only copy' })
    mkdirSync(join(chatsPath, 'chatexists.jsonl'), { recursive: true })
    expect(existsSync(join(chatsPath, 'chatexists.jsonl'))).toBe(true)

    expect(() =>
      store.appendChatMessage('default', 'chatexists', { role: 'assistant', text: 'a' }),
    ).toThrow(ChatAppendError)
    expect(store.loadChat('default', 'chatexists').map((m) => m.text)).toEqual(['only copy'])
  })

  it('the failed append reuses its seq so a retry does not leave a gap', () => {
    store.appendChatMessage('default', 'chatseq', { role: 'user', text: 'q' })
    store.appendChatMessage('default', 'chatseq', { role: 'assistant', text: 'a' })
    const chatFile = join(chatsPath, 'chatseq.jsonl')
    const transcript = readFileSync(chatFile, 'utf8')

    // A directory at the transcript path makes the append fail while the path still exists
    rmSync(chatFile, { force: true })
    mkdirSync(chatFile, { recursive: true })
    expect(() =>
      store.appendChatMessage('default', 'chatseq', { role: 'user', text: 'q2' }),
    ).toThrow(ChatAppendError)

    rmSync(chatFile, { recursive: true, force: true })
    writeFileSync(chatFile, transcript, 'utf8')
    store.appendChatMessage('default', 'chatseq', { role: 'user', text: 'q2' })
    expect(store.loadChat('default', 'chatseq').map((m) => m.seq)).toEqual([0, 1, 2])
  })

  it('flushPending keeps the buffer when materializing fails, so a later rebind can retry', () => {
    store.appendChatMessage('default', 'unsaved-keep', { role: 'user', text: 'interrupted' })
    blockChatsDir()
    store.rebindChat('default', 'unsaved-keep', 'rebound-id')
    expect(store.loadChat('default', 'unsaved-keep').map((m) => m.text)).toEqual(['interrupted'])

    unblockChatsDir()
    store.rebindChat('default', 'unsaved-keep', 'rebound-id')
    expect(store.loadChat('default', 'rebound-id').map((m) => m.text)).toEqual(['interrupted'])
  })

  it('overflow materialization failure keeps every buffered message readable', () => {
    for (let i = 0; i < MAX_PENDING_OPENING_MESSAGES - 1; i++) {
      store.appendChatMessage('default', 'overflow', { role: 'user', text: `msg${i}` })
    }
    blockChatsDir()
    expect(() =>
      store.appendChatMessage('default', 'overflow', { role: 'user', text: 'overflow' }),
    ).toThrow(ChatAppendError)

    const msgs = store.loadChat('default', 'overflow')
    expect(msgs).toHaveLength(MAX_PENDING_OPENING_MESSAGES - 1)
    expect(msgs[0].text).toBe('msg0')
  })

  it('a successful append still creates no file for user-only messages', () => {
    store.appendChatMessage('default', 'nobuf', { role: 'user', text: 'q' })
    expect(existsSync(join(chatsPath, 'nobuf.jsonl'))).toBe(false)
  })
})
