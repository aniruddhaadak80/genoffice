import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LEGACY_USER_DATA_DIR,
  MIGRATION_MARKER,
  migrateLegacyUserData,
} from '../src/main/user-data-migration'

const scratch: string[] = []

function appDataRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'userdata-migration-'))
  scratch.push(dir)
  return dir
}

function legacyTree(appData: string, name = LEGACY_USER_DATA_DIR): string {
  const legacy = join(appData, name)
  mkdirSync(join(legacy, 'Cache'), { recursive: true })
  writeFileSync(join(legacy, 'app-settings.json'), '{"language":"zh"}')
  writeFileSync(join(legacy, 'Cache', 'entry.bin'), 'cached')
  return legacy
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('legacy userData migration', () => {
  it('publishes the legacy tree in one rename and marks it complete', () => {
    const appData = appDataRoot()
    legacyTree(appData)
    const userData = join(appData, 'GenOffice')
    const result = migrateLegacyUserData({ appData, userData })
    expect(result.status).toBe('migrated')
    expect(readFileSync(join(userData, 'app-settings.json'), 'utf-8')).toBe('{"language":"zh"}')
    expect(readFileSync(join(userData, 'Cache', 'entry.bin'), 'utf-8')).toBe('cached')
    expect(existsSync(join(userData, MIGRATION_MARKER))).toBe(true)
    expect(readdirSync(appData).some((n) => n.startsWith('.genoffice-user-data-migrate-'))).toBe(
      false,
    )
  })

  it('never touches a destination that already holds data, and never migrates twice', () => {
    const appData = appDataRoot()
    legacyTree(appData)
    const userData = join(appData, 'GenOffice')
    mkdirSync(userData)
    writeFileSync(join(userData, 'app-settings.json'), '{"language":"en"}')
    expect(migrateLegacyUserData({ appData, userData }).status).toBe('skipped')
    expect(readFileSync(join(userData, 'app-settings.json'), 'utf-8')).toBe('{"language":"en"}')

    const fresh = join(appData, 'GenOffice2')
    expect(migrateLegacyUserData({ appData, userData: fresh }).status).toBe('migrated')
    expect(migrateLegacyUserData({ appData, userData: fresh }).status).toBe('skipped')
  })

  it('keeps the destination empty when the copy is interrupted, so the next launch retries', () => {
    const appData = appDataRoot()
    legacyTree(appData)
    const userData = join(appData, 'GenOffice')
    mkdirSync(userData)
    const source = join(appData, LEGACY_USER_DATA_DIR)
    // a copy that dies halfway: a staging directory with a partial tree, and
    // nothing in the destination
    const staging = join(appData, '.genoffice-user-data-migrate-deadbeef')
    mkdirSync(join(staging, 'Cache'), { recursive: true })
    writeFileSync(join(staging, 'app-settings.json'), '{"language":"')
    expect(migrateLegacyUserData({ appData, userData }).status).toBe('migrated')
    expect(existsSync(staging)).toBe(false)
    expect(readdirSync(userData).sort()).toEqual(
      [MIGRATION_MARKER, 'Cache', 'app-settings.json'].sort(),
    )
    expect(readFileSync(join(userData, 'app-settings.json'), 'utf-8')).toBe('{"language":"zh"}')
    expect(existsSync(source)).toBe(true)
  })

  it('defers instead of throwing when the destination cannot be replaced', () => {
    const appData = appDataRoot()
    legacyTree(appData)
    const result = migrateLegacyUserData({
      appData,
      userData: join(appData, 'locked', 'GenOffice'),
      markerName: MIGRATION_MARKER,
      legacyDirName: LEGACY_USER_DATA_DIR,
    })
    expect(result.status).toBe('deferred')
    expect(result.error).toBeTruthy()
    expect(readdirSync(appData).some((n) => n.startsWith('.genoffice-user-data-migrate-'))).toBe(
      false,
    )
  })

  it('does nothing when there is no legacy tree', () => {
    const appData = appDataRoot()
    expect(migrateLegacyUserData({ appData, userData: join(appData, 'GenOffice') })).toEqual({
      status: 'skipped',
    })
  })
})
