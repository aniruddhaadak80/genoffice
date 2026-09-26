import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = join(__dirname, '../../../tools/check-english-comments.mjs')
const HAN = '\u4e2d\u6587'

let repo: string

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
}

function track(rel: string, body: string): void {
  const path = join(repo, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  git('add', rel)
}

function check(): { ok: boolean; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT], { cwd: repo, encoding: 'utf-8' })
  return { ok: r.status === 0, stderr: r.stderr }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'english-comments-'))
  git('init', '-q')
  git('config', 'user.email', 'ci@example.com')
  git('config', 'user.name', 'ci')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('check-english-comments language scope', () => {
  it('passes on a repository whose comments are all English', () => {
    track('src/app.ts', `// counts rows\nconst n = 1\n`)
    track('native/src/lib.rs', `// sums two numbers\nfn add(a: i64, b: i64) -> i64 { a + b }\n`)
    track('tools/build.py', `# builds the font\nprint("ok")\n`)
    track('scripts/after.sh', `#!/bin/sh\n# removes the symlink\nrm -f "$1"\n`)
    expect(check().ok).toBe(true)
  })

  it('scans Rust line and block comments', () => {
    track('native/src/lib.rs', `// ${HAN} sidecar\nfn add(a: i64, b: i64) -> i64 { a + b }\n`)
    expect(check().stderr).toContain('native/src/lib.rs:1')
  })

  it('scans Rust block comment bodies', () => {
    track('native/src/lib.rs', `fn main() {\n    /* ${HAN} */\n}\n`)
    const r = check()
    expect(r.ok).toBe(false)
    expect(r.stderr).toContain('native/src/lib.rs')
  })

  it('scans Python hash comments', () => {
    track('tools/build.py', `# ${HAN} font build\nprint("ok")\n`)
    expect(check().stderr).toContain('tools/build.py:1')
  })

  it('scans shell hash comments', () => {
    track('scripts/after.sh', `#!/bin/sh\n# ${HAN} symlink cleanup\nrm -f "$1"\n`)
    expect(check().stderr).toContain('scripts/after.sh:2')
  })

  it('still scans the JavaScript extension it already covered', () => {
    track('src/app.ts', `// ${HAN} row counter\nconst n = 1\n`)
    expect(check().stderr).toContain('src/app.ts:1')
  })

  it('still scans the documentation extension it already covered', () => {
    track('docs/readme.md', `# ${HAN} title\n`)
    expect(check().stderr).toContain('docs/readme.md:1')
  })

  it('leaves functional CJK string literals alone in every covered language', () => {
    track('src/app.ts', `const label = '${HAN}'\n`)
    track('native/src/lib.rs', `let label = "${HAN}";\n`)
    track('tools/build.py', `label = "${HAN}"\n`)
    track('scripts/after.sh', `label="${HAN}"\n`)
    expect(check().ok).toBe(true)
  })
})
