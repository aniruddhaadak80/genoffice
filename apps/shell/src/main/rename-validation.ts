import { basename, dirname } from 'node:path'

/** Name characters Windows forbids (plus controls). Mirrors the PDF
    auto-renamer set (apps/pdf/src/main/pdf-main.ts) — the Home rename gate
    must reject them with a localized error instead of letting renameSync
    throw a raw OS error. */
// eslint-disable-next-line no-control-regex -- the C0 range IS the check: Windows forbids controls in names.
export const RENAME_ILLEGAL_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/

/** Windows device names reserved with or without an extension (CON.pdf is still CON). */
const RENAME_RESERVED_BASE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** True when the trimmed name is usable as a file name. */
export function isValidRenameName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false
  if (RENAME_ILLEGAL_NAME_CHARS.test(name)) return false
  // Windows strips trailing dots/spaces: renaming to "file." lands elsewhere,
  // so reject with the localized gate instead of a surprising rename.
  if (name.endsWith('.')) return false
  if (RENAME_RESERVED_BASE.test(name)) return false
  return true
}

/** True when target names the same file with different letter case only
    (same directory, case-insensitive-equal names). On case-insensitive
    filesystems existsSync(target) sees the source itself, so callers must
    skip the already-exists gate and attempt the rename directly. */
export function isCaseOnlyRename(path: string, target: string): boolean {
  if (target === path) return false
  if (dirname(target) !== dirname(path)) return false
  return basename(target).toLowerCase() === basename(path).toLowerCase()
}
