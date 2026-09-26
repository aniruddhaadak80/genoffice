import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStore } from '../src/store.js'

/** Recreates a file at a path so its creation time cannot match the previous one. */
function recreateFile(filePath: string, contents: string): void {
  const previousBirth = statSync(filePath).birthtimeMs
  rmSync(filePath, { force: true })
  while (Date.now() <= previousBirth) {
    /* wait for the clock to move past the previous creation time */
  }
  writeFileSync(filePath, contents, 'utf8')
}

describe('reused path does not inherit the previous file history', () => {
  let tmpDir: string
  let store: ProjectStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'project-store-incarnation-'))
    store = new ProjectStore(tmpDir)
    store.ensureDefaultProject()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('mints a fresh chat when an unrelated file takes over a path', () => {
    const filePath = join(tmpDir, 'plan.docx')
    writeFileSync(filePath, 'original', 'utf8')

    const first = store.resolveChatForFile(filePath)
    store.appendChatMessage(first.projectId, first.chatId, { role: 'user', text: 'old question' })
    store.appendChatMessage(first.projectId, first.chatId, {
      role: 'assistant',
      text: 'old answer',
    })
    expect(store.loadChat(first.projectId, first.chatId)).toHaveLength(2)

    recreateFile(filePath, 'unrelated document')

    const second = store.resolveChatForFile(filePath)
    expect(second.projectId).toBe(first.projectId)
    expect(second.chatId).not.toBe(first.chatId)
    expect(store.loadChat(second.projectId, second.chatId)).toEqual([])
  })

  it('appends after a reuse go to the new chat only', () => {
    const filePath = join(tmpDir, 'plan.docx')
    writeFileSync(filePath, 'original', 'utf8')
    const first = store.resolveChatForFile(filePath)
    store.appendChatMessage(first.projectId, first.chatId, { role: 'user', text: 'old' })
    store.appendChatMessage(first.projectId, first.chatId, { role: 'assistant', text: 'old reply' })

    recreateFile(filePath, 'unrelated document')
    const second = store.resolveChatForFile(filePath)
    store.appendChatMessage(second.projectId, second.chatId, { role: 'user', text: 'new' })
    store.appendChatMessage(second.projectId, second.chatId, {
      role: 'assistant',
      text: 'new reply',
    })

    expect(store.loadChat(second.projectId, second.chatId).map((m) => m.text)).toEqual([
      'new',
      'new reply',
    ])
    // The previous document's transcript is untouched, just no longer reachable
    // through the path.
    expect(store.loadChat(first.projectId, first.chatId).map((m) => m.text)).toEqual([
      'old',
      'old reply',
    ])
  })

  it('keeps the same chat when the file at the path is unchanged', () => {
    const filePath = join(tmpDir, 'stable.docx')
    writeFileSync(filePath, 'doc', 'utf8')
    const first = store.resolveChatForFile(filePath)
    store.appendChatMessage(first.projectId, first.chatId, { role: 'user', text: 'q' })
    store.appendChatMessage(first.projectId, first.chatId, { role: 'assistant', text: 'a' })

    // Saving the same document rewrites its contents, mtime and size
    writeFileSync(filePath, 'saved again with more content', 'utf8')

    const second = store.resolveChatForFile(filePath)
    expect(second.chatId).toBe(first.chatId)
    expect(store.loadChat(second.projectId, second.chatId)).toHaveLength(2)
  })

  it('resolving the same file twice never changes the chat', () => {
    const filePath = join(tmpDir, 'twice.docx')
    writeFileSync(filePath, 'doc', 'utf8')
    const a = store.resolveChatForFile(filePath)
    const b = store.resolveChatForFile(filePath)
    const c = store.resolveChatForFile(filePath)
    expect(b.chatId).toBe(a.chatId)
    expect(c.chatId).toBe(a.chatId)
  })

  it('a rename keeps the history instead of looking like a reused path', () => {
    const filePath = join(tmpDir, 'before.docx')
    writeFileSync(filePath, 'doc', 'utf8')
    const first = store.resolveChatForFile(filePath)
    store.appendChatMessage(first.projectId, first.chatId, { role: 'user', text: 'q' })
    store.appendChatMessage(first.projectId, first.chatId, { role: 'assistant', text: 'a' })

    const renamed = join(tmpDir, 'after.docx')
    writeFileSync(renamed, readFileSync(filePath))
    rmSync(filePath, { force: true })
    store.fileRenamed(filePath, renamed)

    const second = store.resolveChatForFile(renamed)
    expect(second.chatId).toBe(first.chatId)
    expect(store.loadChat(second.projectId, second.chatId).map((m) => m.text)).toEqual(['q', 'a'])
  })

  it('keeps a chat recorded before identities were tracked', () => {
    const filePath = join(tmpDir, 'upgraded.docx')
    writeFileSync(filePath, 'doc', 'utf8')
    const key = filePath
    const chatId = ProjectStore.chatIdForFile(filePath)
    const chatsDir = join(tmpDir, 'projects', 'default', 'chats')
    mkdirSync(chatsDir, { recursive: true })
    writeFileSync(
      join(chatsDir, `${chatId}.jsonl`),
      `${JSON.stringify({ seq: 0, ts: new Date().toISOString(), role: 'user', text: 'kept' })}\n`,
      'utf8',
    )
    const indexPath = join(tmpDir, 'projects', 'index.json')
    const index = JSON.parse(readFileSync(indexPath, 'utf8'))
    index.fileMap[key] = 'default'
    index.chatIdByPath = { [key]: chatId }
    writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8')

    const resolved = store.resolveChatForFile(filePath)
    expect(resolved.chatId).toBe(chatId)
    expect(store.loadChat(resolved.projectId, resolved.chatId).map((m) => m.text)).toEqual(['kept'])
  })

  it('the project timeline does not attribute the old transcript to a reused path', () => {
    const filePath = join(tmpDir, 'plan.docx')
    writeFileSync(filePath, 'original', 'utf8')
    const first = store.resolveChatForFile(filePath)
    store.appendChatMessage(first.projectId, first.chatId, { role: 'user', text: 'old question' })
    store.appendChatMessage(first.projectId, first.chatId, {
      role: 'assistant',
      text: 'old answer',
    })

    recreateFile(filePath, 'unrelated document')
    const second = store.resolveChatForFile(filePath)
    store.appendChatMessage(second.projectId, second.chatId, { role: 'user', text: 'new question' })
    store.appendChatMessage(second.projectId, second.chatId, {
      role: 'assistant',
      text: 'new answer',
    })

    const timeline = store.getProjectTimeline('default')
    const forPath = timeline.filter((e) => e.filePath === filePath)
    expect(forPath.map((e) => e.chatId)).toEqual([second.chatId, second.chatId])
    expect(forPath.map((e) => e.preview)).toEqual(['new answer', 'new question'])
  })

  it('a chatId stays a valid 16 hex id after a reuse', () => {
    const filePath = join(tmpDir, 'plan.docx')
    writeFileSync(filePath, 'original', 'utf8')
    store.resolveChatForFile(filePath)
    recreateFile(filePath, 'unrelated document')
    const second = store.resolveChatForFile(filePath)
    expect(second.chatId).toMatch(/^[0-9a-f]{16}$/)
  })
})
