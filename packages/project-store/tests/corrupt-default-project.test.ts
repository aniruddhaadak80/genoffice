import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStore } from '../src/store.js'

describe('ensureDefaultProject with an unparseable project.json', () => {
  let tmpDir: string
  let projectJson: string
  let corrupt: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'project-store-corrupt-default-'))
    new ProjectStore(tmpDir).resolveProjectForFile(join(tmpDir, 'registered.txt'))
    projectJson = join(tmpDir, 'projects', 'default', 'project.json')
    // Truncated mid-document, the way an interrupted write leaves it
    corrupt = readFileSync(projectJson, 'utf8').slice(0, -3)
    writeFileSync(projectJson, corrupt)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('moves the corrupt file aside and writes a usable default project', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Every file resolve calls this
    const project = new ProjectStore(tmpDir).resolveProjectForFile(join(tmpDir, 'other.txt'))

    // the store recovers instead of staying permanently degraded
    expect(project).toBe('default')
    expect(() => JSON.parse(readFileSync(projectJson, 'utf8'))).not.toThrow()

    // and the unreadable bytes are still on disk to recover by hand
    const quarantined = readdirSync(join(tmpDir, 'projects', 'default')).filter((f) =>
      f.startsWith('project.json.corrupt-'),
    )
    expect(quarantined).toHaveLength(1)
    expect(readFileSync(join(tmpDir, 'projects', 'default', quarantined[0]!), 'utf8')).toBe(corrupt)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('registers a new file into the recovered project', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new ProjectStore(tmpDir)
    store.resolveProjectForFile(join(tmpDir, 'other.txt'))

    const saved = JSON.parse(readFileSync(projectJson, 'utf8')) as { files: unknown[] }
    // the recovered project is writable, not a dead end that drops every resolve
    expect(saved.files.length).toBeGreaterThan(0)
  })

  it('warns once, not on every resolve', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new ProjectStore(tmpDir)

    store.resolveProjectForFile(join(tmpDir, 'one.txt'))
    store.resolveProjectForFile(join(tmpDir, 'two.txt'))
    store.resolveProjectForFile(join(tmpDir, 'three.txt'))

    // the corrupt file was moved aside, so later calls see a healthy project
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
