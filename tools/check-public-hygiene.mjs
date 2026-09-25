#!/usr/bin/env node
// Public-repo hygiene gate: scans lines a change adds for content that must not
// ship in a public repository, and fails the build when it finds any.
//
// Added lines only, so pre-existing content is never reported and a checkout
// that predates the gate does not start failing. Every rule has a marker
// escape hatch: a line carrying `public-hygiene: allow` (reviewed and
// intentional) or `public-hygiene: fixture` (test data that must look real) is
// skipped.
//
// CJK is legitimate in locale resources, in the language switcher, and in the
// AI prompt guides that show CJK examples, so those paths are allowed; Han text
// anywhere else in added code is a leak from an internal corpus.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
let baseRef = process.env.FORMAT_BASE_REF || ''
if (args[0] === '--base') {
  args.shift()
  baseRef = args.shift() || ''
}
if (/^0+$/.test(baseRef)) baseRef = ''
if (args.length > 0) {
  console.error(`Unexpected argument: ${args[0]}`)
  process.exit(2)
}

const MARKER = /public-hygiene:\s*(?:allow|fixture)/
const HAN = /[\u3400-\u9fff]/

/** Locale tables and the runtime resources that legitimately carry CJK. */
const CJK_ALLOWED_PATH =
  /(^|\/)(?:i18n|locales?|translations?|ai\/prompts|prompts|fixtures)(\/|$)|(^|\/)(?:strings|locale|locales|messages)\.[jt]sx?$/

/** High-confidence credential shapes. Deliberately narrow: a false positive
    blocks an unrelated contributor, so anything ambiguous is left to review. */
const CREDENTIALS = [
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
]

const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g
/** Names reserved for documentation and testing, which cannot reach a real
    inbox: example.com, foo.example, anything under .test/.invalid/.localhost. */
const RESERVED_NAME = /^(?:example|test|invalid|localhost)$/

const HOME_PATH = /(?:^|[\s"'`=(])((?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[A-Za-z0-9._-]+)/g
/** Account names that are build agents or placeholders, not a person. */
const GENERIC_ACCOUNT = new Set([
  'app',
  'build',
  'ci',
  'code',
  'data',
  'docker',
  'github',
  'home',
  'node',
  'runner',
  'shared',
  'temp',
  'tmp',
  'user',
  'users',
  'vscode',
])

/** @returns a description of each problem on the line, empty when it is clean. */
export function checkLine(path, text) {
  if (MARKER.test(text)) return []
  const found = []
  if (text.includes('\u0000')) found.push('NUL byte')
  for (const re of CREDENTIALS) {
    if (re.test(text)) {
      found.push('credential-shaped string')
      break
    }
  }
  for (const m of text.matchAll(EMAIL)) {
    const labels = m[1].toLowerCase().split('.')
    // reserved when the name itself is reserved (example.com) or any label is
    // (foo.example, x.invalid, a.b.test)
    if (!labels.some((label) => RESERVED_NAME.test(label))) {
      found.push(`e-mail address at ${m[1].toLowerCase()}`)
    }
  }
  for (const m of text.matchAll(HOME_PATH)) {
    const account = m[1].split(/[/\\]/).pop()
    if (account && !GENERIC_ACCOUNT.has(account.toLowerCase())) {
      found.push(`personal home path (${m[1]})`)
    }
  }
  if (HAN.test(text) && !CJK_ALLOWED_PATH.test(path)) found.push('Han text outside a locale table')
  return found
}

/** Extensions whose contents legitimately contain NUL bytes. Anything else that
    gains one is a leak, not a format. */
const BINARY_EXT =
  /\.(?:png|jpe?g|gif|webp|avif|bmp|ico|icns|tiff?|heic|pdf|zip|gz|tgz|bz2|xz|7z|rar|ttf|otf|woff2?|eot|mp3|mp4|m4a|wav|ogg|webm|mov|avi|wasm|so|dll|dylib|exe|bin|dat|class|jar|pyc)$/i

function git(commandArgs, { allowFailure = false } = {}) {
  // stderr is captured rather than inherited so git's own warnings never mix
  // into the messages this gate reports.
  const result = spawnSync('git', commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0 && !allowFailure) {
    process.stderr.write(result.stderr ?? '')
    process.exit(result.status ?? 1)
  }
  return result
}

/** True when the blob at `ref:path` exists and already contained a NUL byte. */
function hadNulAtRef(path) {
  if (!baseRef) return false
  const r = spawnSync('git', ['show', `${baseRef}:${path}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  return r.status === 0 && Buffer.isBuffer(r.stdout) && r.stdout.includes(0)
}

function main() {
  const repoRoot = git(['rev-parse', '--show-toplevel']).stdout.trim()
  const violations = new Map()
  const touched = new Set()

  const flag = (path, line, reasons, text) => {
    violations.set(`${path}:${line}`, { text: text.trim(), reasons })
  }

  const scanDiff = (diffArgs) => {
    const out = git(['diff', '-U0', ...diffArgs]).stdout
    // --name-only also lists a file git now considers binary, which produces no
    // line hunks at all; the NUL transition check below needs those paths.
    for (const p of git(['diff', '--name-only', ...diffArgs]).stdout.split('\n')) {
      if (p) touched.add(p)
    }
    let path = null
    let newLine = 0
    for (const line of out.split('\n')) {
      if (line.startsWith('+++ b/')) {
        path = line.slice(6)
        // a deleted path arrives as /dev/null
        if (path === '/dev/null') path = null
        else touched.add(path)
      } else if (line.startsWith('@@')) {
        const m = /\+(\d+)/.exec(line)
        newLine = m ? Number(m[1]) : 0
      } else if (path && line.startsWith('+') && !line.startsWith('+++')) {
        const text = line.slice(1)
        const reasons = checkLine(path, text)
        if (reasons.length > 0) flag(path, newLine, reasons, text)
        newLine++
      }
    }
  }

  if (baseRef) {
    const verification = git(['rev-parse', '--verify', `${baseRef}^{commit}`], {
      allowFailure: true,
    })
    if (verification.status === 0) scanDiff([`${baseRef}...HEAD`])
    else
      console.warn(
        `Public-hygiene base ${baseRef} is not available in this checkout; ` +
          'checking working-tree changes only.',
      )
  }
  scanDiff([])
  scanDiff(['--cached'])

  // A NUL byte makes git treat the file as binary, and a binary file produces no
  // line diff, so the scan above cannot see one. Compare each touched file
  // against the base to catch exactly that transition, while leaving files that
  // were already binary (images, fonts) alone.
  for (const path of touched) {
    if (BINARY_EXT.test(path)) continue
    const full = join(repoRoot, path)
    if (!existsSync(full)) continue
    if (!readFileSync(full).includes(0)) continue
    if (hadNulAtRef(path)) continue
    flag(path, 1, ['NUL byte'], '(binary content added to a text file)')
  }

  // Untracked files are in no diff yet but are about to be committed.
  for (const file of git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n')) {
    if (!file) continue
    const raw = readFileSync(join(repoRoot, file))
    if (raw.includes(0)) {
      // a new binary asset is the format doing its job; a NUL in a source or
      // text file is not
      if (!BINARY_EXT.test(file)) flag(file, 1, ['NUL byte'], '(NUL byte in a new text file)')
      continue
    }
    raw
      .toString('utf8')
      .split('\n')
      .forEach((text, i) => {
        const reasons = checkLine(file, text)
        if (reasons.length > 0) flag(file, i + 1, reasons, text)
      })
  }

  if (violations.size === 0) {
    console.log('check-public-hygiene: OK')
    return 0
  }
  console.error(
    'Content that must not ship in a public repository was added:\n' +
      '  NUL bytes, credential-shaped strings, personal e-mail addresses or home\n' +
      '  paths, and Han text outside locale tables.\n' +
      'If a line is intentional, mark it with a trailing `public-hygiene: allow`\n' +
      'or `public-hygiene: fixture` comment.\n',
  )
  for (const [where, v] of violations) {
    console.error(`  ${where}  [${v.reasons.join('; ')}]  ${v.text}`)
  }
  return 1
}

// Imported by its test to exercise the rules without spawning git.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main())
}
