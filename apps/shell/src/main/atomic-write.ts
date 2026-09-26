import { randomBytes } from 'node:crypto'
import { open, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { FileHandle } from 'node:fs/promises'

const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_RETRIES = 4
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function writeTempFile(tmp: string, data: Uint8Array): Promise<void> {
  const handle = await open(tmp, 'wx')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncDir(dir: string): Promise<void> {
  let handle: FileHandle | undefined
  try {
    handle = await open(dir, 'r')
    await handle.sync()
  } catch {
    /* directory fsync unsupported on this platform or filesystem */
  } finally {
    if (handle) await handle.close().catch(() => {})
  }
}

export async function atomicWriteFile(filePath: string, data: Uint8Array): Promise<void> {
  const dir = dirname(filePath)
  const tmp = join(dir, `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeTempFile(tmp, data)
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(tmp, filePath)
        await syncDir(dir)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? ''
        if (!RETRYABLE_RENAME_CODES.has(code) || attempt >= RENAME_RETRIES) throw error
        await sleep(50 * 2 ** attempt)
      }
    }
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}
