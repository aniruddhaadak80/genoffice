import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeSidecarProcess extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly killed = false
  kill(): void {}
}

function writtenRequests(fake: FakeSidecarProcess): Record<string, unknown>[] {
  const raw = fake.stdin.read() as Buffer | null
  if (!raw) return []
  return raw
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

const RANGE = {
  sessionId: 's-1',
  sheetId: 'sheet-1',
  range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
}

describe('XlsxSidecarClient restart race', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('a stale child exit leaves the replacement readable and settles its request', async () => {
    const first = new FakeSidecarProcess()
    const second = new FakeSidecarProcess()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const { XlsxSidecarClient } = await import('../src/main/xlsx-sidecar-client')
    const client = new XlsxSidecarClient('/nonexistent/sidecar')

    const abandoned = client.readRange(RANGE).catch(() => undefined)
    client.stop()
    await abandoned

    const replacement = client.readRange(RANGE)
    expect(spawnMock).toHaveBeenCalledTimes(2)

    first.emit('exit', 0, null)

    const [request] = writtenRequests(second)
    second.stdout.write(
      `${JSON.stringify({
        version: 1,
        requestId: request!.requestId,
        ok: true,
        result: { cells: [1] },
      })}\n`,
    )
    await expect(replacement).resolves.toEqual({ cells: [1] })

    const reused = client.readRange(RANGE).catch(() => undefined)
    expect(spawnMock).toHaveBeenCalledTimes(2)
    client.stop()
    await reused
  })

  it('a stale child error leaves the replacement request alone', async () => {
    const first = new FakeSidecarProcess()
    const second = new FakeSidecarProcess()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const { XlsxSidecarClient } = await import('../src/main/xlsx-sidecar-client')
    const client = new XlsxSidecarClient('/nonexistent/sidecar')

    const abandoned = client.readRange(RANGE).catch(() => undefined)
    client.stop()
    await abandoned

    const replacement = client.readRange(RANGE)
    first.emit('error', new Error('old child failed'))

    const [request] = writtenRequests(second)
    second.stdout.write(
      `${JSON.stringify({
        version: 1,
        requestId: request!.requestId,
        ok: true,
        result: { cells: [2] },
      })}\n`,
    )
    await expect(replacement).resolves.toEqual({ cells: [2] })
    client.stop()
  })

  it('the live child still tears the client down on exit', async () => {
    const only = new FakeSidecarProcess()
    spawnMock.mockReturnValueOnce(only)
    const { XlsxSidecarClient } = await import('../src/main/xlsx-sidecar-client')
    const client = new XlsxSidecarClient('/nonexistent/sidecar')

    const pending = client.readRange(RANGE)
    only.emit('exit', 1, null)
    await expect(pending).rejects.toThrow('XLSX sidecar exited with code 1')
  })
})
