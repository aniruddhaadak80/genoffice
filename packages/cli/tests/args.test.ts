import { describe, expect, it } from 'vitest'
import { parseArgs } from '../src/args'

describe('parseArgs', () => {
  it('splits positionals and flags', () => {
    const r = parseArgs(['convert', 'a.pdf', '--to', 'docx', '--force', '--out=x.docx', '-h'])
    expect(r.positionals).toEqual(['convert', 'a.pdf'])
    expect(r.flags).toEqual({ to: 'docx', force: true, out: 'x.docx', help: true })
  })

  it('never lets declared boolean flags swallow the next token', () => {
    const booleans = new Set(['json', 'force'])
    const r = parseArgs(['--json', 'info', 'a.docx'], booleans)
    expect(r.positionals).toEqual(['info', 'a.docx'])
    expect(r.flags).toEqual({ json: true })
    const c = parseArgs(['convert', '--force', 'scan.pdf', '--to', 'docx'], booleans)
    expect(c.positionals).toEqual(['convert', 'scan.pdf'])
    expect(c.flags).toEqual({ force: true, to: 'docx' })
  })

  it('treats a trailing flag as boolean and stops at --', () => {
    const r = parseArgs(['open', '--json', '--', '--weird-name.docx'])
    expect(r.flags).toEqual({ json: true })
    expect(r.positionals).toEqual(['open', '--weird-name.docx'])
  })

  it('rejects empty flag names and never swallows short flags as values', () => {
    expect(() => parseArgs(['--=x'])).toThrow('must not be empty')
    expect(() => parseArgs(['--='])).toThrow('must not be empty')
    const r = parseArgs(['--out', '-h'])
    expect(r.flags).toEqual({ out: true, help: true })
    expect(r.positionals).toEqual([])
    // bare stdin dash still counts as a value
    expect(parseArgs(['--ops', '-']).flags).toEqual({ ops: '-' })
  })
})
