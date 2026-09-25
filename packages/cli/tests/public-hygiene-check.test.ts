import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { tempDir } from './helpers'

const SCRIPT = join(__dirname, '../../../tools/check-public-hygiene.mjs')
const REPO_ROOT = join(__dirname, '../../..')

let repo: string

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
}

function write(file: string, content: string | Buffer): void {
  const full = join(repo, file)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function check(): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, '--base', 'HEAD'], {
    cwd: repo,
    encoding: 'utf-8',
  })
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr }
}

beforeEach(() => {
  repo = tempDir()
  git('init', '-q')
  git('config', 'user.email', 'ci@example.com')
  git('config', 'user.name', 'ci')
  write('src/app.ts', 'export const port = 5173\n')
  git('add', '.')
  git('commit', '-q', '-m', 'base')
})

describe('check-public-hygiene rules', () => {
  it('passes an ordinary change', () => {
    write('src/app.ts', 'export const port = 5174\nexport const host = "localhost"\n')
    const r = check()
    expect(r.stderr).toBe('')
    expect(r.ok).toBe(true)
  })

  it('fails a credential pasted into a change', () => {
    write('src/app.ts', 'export const key = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"\n') // public-hygiene: fixture
    const r = check()
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain('credential-shaped string')
  })

  it('fails a private key header', () => {
    write('src/key.pem', '-----BEGIN RSA PRIVATE KEY-----\n') // public-hygiene: fixture
    expect(check().ok).toBe(false)
  })

  it('fails a personal e-mail address', () => {
    write('src/a.ts', 'const contact = "someone@realcompany.co"\n') // public-hygiene: fixture
    expect(check().stderr).toContain('e-mail address')
  })

  it('allows an e-mail at a reserved domain', () => {
    write('src/a.ts', 'const contact = "someone@example.com"\n')
    expect(check().ok).toBe(true)
  })

  it('fails a personal home path', () => {
    write('src/a.ts', 'const dir = "/Users/jsmith/Desktop/report.pdf"\n') // public-hygiene: fixture
    expect(check().stderr).toContain('personal home path')
  })

  it('allows a build agent home path', () => {
    write('src/a.ts', 'const dir = "C:\\\\Users\\\\runner\\\\admin\\\\tool.pdf"\n')
    expect(check().ok).toBe(true)
  })

  it('fails Han text outside a locale table', () => {
    write('src/a.ts', 'const label = "\u4f60\u597d\u4e16\u754c"\n')
    expect(check().stderr).toContain('Han text outside a locale table')
  })

  it('allows Han text in locale resources and on marked lines', () => {
    write('src/i18n/strings.ts', 'const label = "\u4f60\u597d"\n')
    write('README.md', '<!-- lang-switcher \u00b7 public-hygiene: allow -->\n')
    write('src/strings.ts', 'const label = "\u4f60\u597d"\n')
    const r = check()
    expect(r.stderr).toBe('')
    expect(r.ok).toBe(true)
  })

  it('honours the fixture marker for test data that must look real', () => {
    write('src/a.test.ts', 'const name = "\u5c71\u7530\u592a\u90ce" // public-hygiene: fixture\n')
    expect(check().ok).toBe(true)
  })

  it('fails a NUL byte added to a new text file', () => {
    write('src/new.ts', 'const s = "a\u0000b"\n')
    expect(check().stderr).toContain('NUL byte')
  })

  it('fails a NUL byte added to a tracked text file', () => {
    // git stops emitting line hunks once a file looks binary, so this case is
    // invisible to an added-line scan and needs its own comparison.
    write('src/app.ts', 'export const port = 5173\u0000\n')
    expect(check().stderr).toContain('NUL byte')
  })

  it('allows a new binary asset whose NULs are the format', () => {
    write('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]))
    const r = check()
    expect(r.stderr).toBe('')
    expect(r.ok).toBe(true)
  })

  it('reports only added lines, not content already committed', () => {
    write('src/legacy.ts', 'const key = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"\n') // public-hygiene: fixture
    git('add', '.')
    git('commit', '-q', '-m', 'legacy')
    expect(check().ok).toBe(true)
  })

  it('names the file and line of each violation', () => {
    write('src/a.ts', 'export const port = 5173\nconst contact = "someone@realcompany.co"\n') // public-hygiene: fixture
    const r = check()
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain('src/a.ts:2')
  })

  it('rejects an unexpected argument', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--nope'], { cwd: repo, encoding: 'utf-8' })
    expect(r.status).toBe(2)
  })
})

describe('public-hygiene gate wiring', () => {
  const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')

  it('runs the checker unconditionally', () => {
    expect(workflow).toContain('node tools/check-public-hygiene.mjs')
    // A guard that skips when the script is missing turns the gate into a no-op
    // that still reports success, which is how it silently rotted before.
    expect(workflow).not.toMatch(/if \[ -f tools\/check-public-hygiene\.mjs \]/)
    expect(workflow).not.toContain('public-hygiene gate not present in this checkout')
  })

  it('describes only the rules the checker enforces', () => {
    const comment = workflow
      .split('\n')
      .filter((l) => l.includes('check-public-hygiene.mjs'))
      .join(' ')
    expect(comment).not.toMatch(/review-tool|feedback-ledger|sample-corpus|internal PR/)
  })

  it('ships the script the workflow invokes', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toContain('check-public-hygiene: OK')
  })
})
