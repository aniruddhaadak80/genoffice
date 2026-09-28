import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStore } from '../src/store.js'

const chatsDir = (base: string) => join(base, 'projects', 'default', 'chats')

describe('mergeChatFiles with a non-finite seq in the target', () => {
  let tmpDir: string
  let store: ProjectStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'project-store-merge-seq-'))
    store = new ProjectStore(tmpDir)
    store.ensureDefaultProject()
    mkdirSync(chatsDir(tmpDir), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('renumbers the moved messages instead of writing them with a null seq', () => {
    // 1e999 parses to Infinity, so a writer that emitted it left a record that
    // serializes back as {"seq":null} and is skipped on the next read.
    writeFileSync(
      join(chatsDir(tmpDir), 'target.jsonl'),
      '{"seq":1e999,"ts":"2026-01-01T00:00:00.000Z","role":"user","text":"target"}\n',
    )
    writeFileSync(
      join(chatsDir(tmpDir), 'source.jsonl'),
      '{"seq":0,"ts":"2026-01-01T00:00:01.000Z","role":"user","text":"moved"}\n',
    )

    store.rebindChat('default', 'source', 'target')

    const messages = store.loadChat('default', 'target')
    expect(messages.map((m) => m.text)).toEqual(['moved'])
    expect(messages.every((m) => Number.isFinite(m.seq))).toBe(true)
    // The merge completed, so the source is gone — but nothing was lost on the way
    expect(existsSync(join(chatsDir(tmpDir), 'source.jsonl'))).toBe(false)
  })
})
