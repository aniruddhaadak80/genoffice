import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ProjectStore } from '../src/store.js'

const WRITER_SCRIPT = `
const [root, storeUrl, startAt, ...paths] = process.argv.slice(2)
const { ProjectStore } = await import(storeUrl)
const store = new ProjectStore(root)
while (Date.now() < Number(startAt)) {}
const t0 = Date.now()
for (const p of paths) store.resolveProjectForFile(p)
process.stdout.write('WAITED=' + (Date.now() - t0) + '\\n')
`

const HOLDER_SCRIPT = `
const [lockPath, holdMs] = process.argv.slice(2)
const { closeSync, openSync, unlinkSync } = await import('node:fs')
closeSync(openSync(lockPath, 'wx'))
setTimeout(() => unlinkSync(lockPath), Number(holdMs))
`

const SEED_ENTRIES = 1_000
const WRITER_COUNT = 4
const PER_WRITER = 10

interface WriterResult {
  code: number | null
  waitedMs: number
  stderr: string
}

describe('concurrent writers', () => {
  let tmpDir: string
  let storePath: string
  let storeUrl: string
  let writerPath: string
  let holderPath: string
  let lockPath: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'project-store-concurrent-'))
    storePath = fileURLToPath(new URL('../src/store.ts', import.meta.url))
    storeUrl = pathToFileURL(storePath).href
    writerPath = join(tmpDir, 'writer.mjs')
    holderPath = join(tmpDir, 'holder.mjs')
    lockPath = join(tmpDir, 'projects', '.lock')
    writeFileSync(writerPath, WRITER_SCRIPT, 'utf8')
    writeFileSync(holderPath, HOLDER_SCRIPT, 'utf8')
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  /**
   * Widens the read-modify-write window the way a real store does once it holds
   * thousands of mappings, so the writers actually overlap.
   */
  function seedIndex(entries: number): void {
    const projects = join(tmpDir, 'projects')
    mkdirSync(join(projects, 'default'), { recursive: true })
    const fileMap: Record<string, string> = {}
    for (let i = 0; i < entries; i++) fileMap[join(tmpDir, `seed-${i}.docx`)] = 'default'
    writeFileSync(
      join(projects, 'index.json'),
      JSON.stringify({
        projects: [{ id: 'default', name: 'Default Project', createdAt: '', updatedAt: '' }],
        fileMap,
      }),
      'utf8',
    )
    writeFileSync(
      join(projects, 'default', 'project.json'),
      JSON.stringify({
        id: 'default',
        name: 'Default Project',
        createdAt: '',
        updatedAt: '',
        files: [],
      }),
      'utf8',
    )
  }

  function startWriter(paths: string[], startAt: number) {
    return spawn(process.execPath, [writerPath, tmpDir, storeUrl, String(startAt), ...paths], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }

  function runWriters(batches: string[][], startAt: number): Promise<WriterResult[]> {
    return Promise.all(
      batches.map(
        (batch) =>
          new Promise<WriterResult>((resolve) => {
            const child = startWriter(batch, startAt)
            let stdout = ''
            let stderr = ''
            child.stdout.on('data', (c) => (stdout += String(c)))
            child.stderr.on('data', (c) => (stderr += String(c)))
            child.on('exit', (code) => {
              const match = /WAITED=(\d+)/.exec(stdout)
              resolve({ code, waitedMs: match ? Number(match[1]) : -1, stderr })
            })
          }),
      ),
    )
  }

  function readFileMap(): Record<string, string> {
    const indexPath = join(tmpDir, 'projects', 'index.json')
    return JSON.parse(readFileSync(indexPath, 'utf8')).fileMap ?? {}
  }

  it('keeps every mapping when separate processes resolve files at the same moment', async () => {
    seedIndex(SEED_ENTRIES)

    const writers = WRITER_COUNT
    const perWriter = PER_WRITER
    const batches: string[][] = []
    for (let w = 0; w < writers; w++) {
      batches.push(Array.from({ length: perWriter }, (_, i) => join(tmpDir, `w${w}-doc${i}.docx`)))
    }
    const results = await runWriters(batches, Date.now() + 1_500)

    expect(results.map((r) => r.code)).toEqual([0, 0, 0, 0])

    const fileMap = readFileMap()
    expect(Object.keys(fileMap)).toHaveLength(SEED_ENTRIES + writers * perWriter)
    for (const batch of batches) {
      for (const filePath of batch) expect(fileMap[filePath]).toBe('default')
    }
  }, 60_000)

  it('leaves no temp files or lock behind after writers finish', async () => {
    seedIndex(SEED_ENTRIES)
    const startAt = Date.now() + 1_200
    await runWriters(
      [
        Array.from({ length: 5 }, (_, i) => join(tmpDir, `t${i}.docx`)),
        Array.from({ length: 5 }, (_, i) => join(tmpDir, `u${i}.docx`)),
      ],
      startAt,
    )

    expect(readdirSync(join(tmpDir, 'projects')).filter((f) => f.includes('.tmp'))).toEqual([])
    expect(existsSync(lockPath)).toBe(false)
  }, 60_000)

  it('ignores a stale temp file left behind by a crashed writer', () => {
    const store = new ProjectStore(tmpDir)
    store.ensureDefaultProject()
    writeFileSync(join(tmpDir, 'projects', 'index.json.tmp'), '{ half written', 'utf8')

    store.resolveProjectForFile(join(tmpDir, 'recovered.docx'))
    expect(readFileMap()[join(tmpDir, 'recovered.docx')]).toBe('default')
  })

  it('waits for a lock held by another process before writing', async () => {
    const store = new ProjectStore(tmpDir)
    store.ensureDefaultProject()

    const holder = spawn(process.execPath, [holderPath, lockPath, '1500'], { stdio: 'ignore' })
    const lockDeadline = Date.now() + 10_000
    while (!existsSync(lockPath) && Date.now() < lockDeadline) {
      /* wait for the peer to take the lock */
    }
    expect(existsSync(lockPath)).toBe(true)

    const filePath = join(tmpDir, 'waited.docx')
    const [result] = await runWriters([[filePath]], 0)
    holder.kill()

    expect(result.code).toBe(0)
    expect(result.waitedMs).toBeGreaterThanOrEqual(400)
    expect(readFileMap()[filePath]).toBe('default')
  }, 60_000)

  it('releases the lock when a write fails, so later writes still work', () => {
    const store = new ProjectStore(tmpDir)
    store.ensureDefaultProject()
    const projectJson = join(tmpDir, 'projects', 'default', 'project.json')
    const saved = readFileSync(projectJson, 'utf8')
    rmSync(projectJson, { force: true })
    mkdirSync(projectJson, { recursive: true })

    try {
      store.resolveProjectForFile(join(tmpDir, 'fails.docx'))
    } catch {
      /* the rename onto a directory fails on every platform */
    }
    expect(existsSync(lockPath)).toBe(false)

    rmSync(projectJson, { recursive: true, force: true })
    writeFileSync(projectJson, saved, 'utf8')
    store.resolveProjectForFile(join(tmpDir, 'after-failure.docx'))
    expect(readFileMap()[join(tmpDir, 'after-failure.docx')]).toBe('default')
  })

  it('two instances in one process do not deadlock and both keep their mappings', () => {
    const a = new ProjectStore(tmpDir)
    const b = new ProjectStore(tmpDir)
    a.ensureDefaultProject()
    b.ensureDefaultProject()

    const aPath = join(tmpDir, 'instance-a.docx')
    const bPath = join(tmpDir, 'instance-b.docx')
    a.resolveProjectForFile(aPath)
    b.resolveProjectForFile(bPath)

    const fileMap = readFileMap()
    expect(fileMap[aPath]).toBe('default')
    expect(fileMap[bPath]).toBe('default')
  })
})
