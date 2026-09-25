import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const LEGACY_USER_DATA_DIR = 'AI Office'
export const MIGRATION_MARKER = '.genoffice-user-data-migrated'
const STAGING_PREFIX = '.genoffice-user-data-migrate-'

export type UserDataMigrationStatus = 'skipped' | 'migrated' | 'deferred'

export interface UserDataMigrationResult {
  status: UserDataMigrationStatus
  /** the directory the legacy tree was staged in, when one was used */
  staging?: string
  /** set when the run was cut short and the next launch must retry */
  error?: string
}

export interface MigrateUserDataOptions {
  appData: string
  userData: string
  legacyDirName?: string
  markerName?: string
}

/**
 * Copies the pre-rename userData tree into place through a sibling staging
 * directory and a final rename, so the live destination is never a half-written
 * copy: an interrupted run leaves the destination empty and the next launch
 * retries. Callers must hold the single-instance lock first, so exactly one
 * process migrates.
 */
export function migrateLegacyUserData(opts: MigrateUserDataOptions): UserDataMigrationResult {
  const legacyDirName = opts.legacyDirName ?? LEGACY_USER_DATA_DIR
  const markerName = opts.markerName ?? MIGRATION_MARKER
  const legacyDir = join(opts.appData, legacyDirName)
  let staging: string | undefined
  try {
    if (!existsSync(legacyDir)) return { status: 'skipped' }
    if (destinationSettled(opts.userData, markerName)) return { status: 'skipped' }
    clearAbandonedStaging(opts.appData)
    staging = join(opts.appData, `${STAGING_PREFIX}${randomBytes(6).toString('hex')}`)
    cpSync(legacyDir, staging, { recursive: true })
    writeFileSync(
      join(staging, markerName),
      `${JSON.stringify({ from: legacyDirName, at: new Date().toISOString() })}\n`,
      'utf-8',
    )
    if (existsSync(opts.userData)) rmSync(opts.userData, { recursive: true, force: true })
    renameSync(staging, opts.userData)
    return { status: 'migrated', staging }
  } catch (err) {
    if (staging) rmSync(staging, { recursive: true, force: true })
    return {
      status: 'deferred',
      ...(staging ? { staging } : {}),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** True when the destination already holds a completed migration or newer state. */
function destinationSettled(userData: string, markerName: string): boolean {
  let entries: string[]
  try {
    entries = existsSync(userData) ? readdirSync(userData) : []
  } catch {
    return true
  }
  return entries.some((name) => name !== markerName)
}

function clearAbandonedStaging(appData: string): void {
  let entries: string[]
  try {
    entries = readdirSync(appData)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.startsWith(STAGING_PREFIX)) continue
    try {
      rmSync(join(appData, name), { recursive: true, force: true })
    } catch {
      /* a staging dir we cannot remove is left for the next run */
    }
  }
}
