import { describe, expect, it } from 'vitest'
import { cliErrorMessage, createCliRunner, MAX_CLI_OUTPUT_BYTES } from '../src/main/mcp/cli-runner'

describe('createCliRunner output cap', () => {
  it('kills a flooding child and bounds the buffered output', async () => {
    const runner = createCliRunner({ executable: process.execPath, entry: '-e' })
    const start = Date.now()
    // node -e is the entry: emit 10MB on stdout, then hang (kill must end it)
    const outcome = await runner.run(
      [`process.stdout.write('x'.repeat(10 * 1024 * 1024)); setInterval(() => {}, 1000)`],
      { timeoutMs: 60_000 },
    )
    expect(Date.now() - start).toBeLessThan(60_000)
    expect(outcome.ok).toBe(false)
    expect(outcome.stdout.length + outcome.stderr.length).toBeLessThanOrEqual(
      MAX_CLI_OUTPUT_BYTES + 2000,
    )
    expect(outcome.stderr).toContain('truncated')
    expect(cliErrorMessage(outcome)).toContain('genoffice failed')
  }, 60_000)

  it('passes normal runs through uncapped', async () => {
    const runner = createCliRunner({ executable: process.execPath, entry: '-e' })
    const outcome = await runner.run([`console.log(JSON.stringify({ status: 'ok', command: 'x', summary: 'fine' }))`])
    expect(outcome.ok).toBe(true)
    expect(outcome.json).toMatchObject({ status: 'ok' })
  }, 30_000)
})
