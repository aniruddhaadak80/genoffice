import { describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: never[]) => unknown>()
const writeText = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  clipboard: { writeText },
  dialog: {},
  ipcMain: { handle: (channel: string, fn: (...args: never[]) => unknown) => handlers.set(channel, fn) },
}))

import { INTEGRATIONS_CHANNELS } from '../src/shared/integrations-api'
import { MAX_COPY_TEXT_LENGTH, registerIntegrationsIpc } from '../src/main/integrations-ipc'

function copyTextHandler() {
  handlers.clear()
  registerIntegrationsIpc({
    settingsPath: () => '/tmp/settings.json',
    window: () => null,
    cliDir: '/tmp',
    skillPath: '/tmp/skill.md',
    cliPackageJson: '/tmp/package.json',
  })
  const fn = handlers.get(INTEGRATIONS_CHANNELS.copyText)
  if (!fn) throw new Error('copyText handler not registered')
  return fn
}

describe('integrations copyText guard', () => {
  it('writes normal text and rejects oversized or non-string payloads', () => {
    const fn = copyTextHandler()
    writeText.mockClear()
    fn({}, 'hello')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(() => fn({}, 'x'.repeat(MAX_COPY_TEXT_LENGTH + 1))).toThrow('too large')
    expect(() => fn({}, 42 as never)).toThrow()
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
