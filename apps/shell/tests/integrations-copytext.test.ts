import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  clipboard: { writeText: vi.fn() },
  dialog: {},
  ipcMain: { handle: vi.fn() },
  BrowserWindow: class {},
  webContents: {},
}))

// The copyText path never touches these; stub them so the test stays
// hermetic (no workspace dist builds required).
vi.mock('@genoffice/cli/agent-skills', () => ({
  bundledSkillFrom: vi.fn(),
  buildSkillZip: vi.fn(),
  detectAgents: vi.fn(() => []),
  installSkill: vi.fn(),
  LEDGER_KEY: 'ledger',
  ledgerFromSettings: vi.fn(() => ({})),
  readInstallState: vi.fn(() => ({})),
  uninstallSkill: vi.fn(),
}))
vi.mock('@genoffice/cli/install', () => ({ inspectCliLink: vi.fn() }))
vi.mock('@genoffice/file-parse', () => ({ parseFileToText: vi.fn() }))
vi.mock('@genoffice/electron-utils', () => ({ showOpenDialogWithMemory: vi.fn() }))

import { clipboard } from 'electron'
import { INTEGRATIONS_CHANNELS } from '../src/shared/integrations-api'
import { MAX_COPY_TEXT_LENGTH, registerIntegrationsIpc } from '../src/main/integrations-ipc'
import { ipcMain } from 'electron'

const writeText = vi.mocked(clipboard.writeText)
const handle = vi.mocked(ipcMain.handle)

function copyTextHandler() {
  handle.mockClear()
  writeText.mockClear()
  registerIntegrationsIpc({
    settingsPath: () => '/tmp/settings.json',
    window: () => null,
    cliDir: '/tmp',
    skillPath: '/tmp/skill.md',
    cliPackageJson: '/tmp/package.json',
  })
  const call = handle.mock.calls.find(([channel]) => channel === INTEGRATIONS_CHANNELS.copyText)
  if (!call) throw new Error('copyText handler not registered')
  return call[1] as (e: unknown, text: unknown) => void
}

describe('integrations copyText guard', () => {
  it('writes normal text and rejects oversized or non-string payloads', () => {
    const fn = copyTextHandler()
    fn({}, 'hello')
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(() => fn({}, 'x'.repeat(MAX_COPY_TEXT_LENGTH + 1))).toThrow('too large')
    expect(() => fn({}, 42 as never)).toThrow()
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
