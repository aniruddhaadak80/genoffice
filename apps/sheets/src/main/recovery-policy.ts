/**
 * The current xlsx patcher materializes worksheet XML as JavaScript strings.
 * Rewriting a large entry can therefore require several times its uncompressed
 * size in the Electron main process. Automatic recovery is best-effort and
 * must not make an otherwise responsive workbook crash in the background.
 *
 * The second half of this file decides what happens to a crash-recovery copy
 * found while opening a workbook.
 */
import { existsSync, statSync } from 'node:fs'
import { recoveryCopyAction, type RecoveryCopyAction } from '@genoffice/electron-utils'

export const MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES = 64 * 1024 * 1024

export function allowsAutomaticWorkbookRecovery(
  sheets: readonly { readonly sourceXmlBytes?: number | undefined }[],
): boolean {
  return sheets.every(
    (sheet) =>
      sheet.sourceXmlBytes === undefined ||
      sheet.sourceXmlBytes <= MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES,
  )
}

/** 'none' when there is no copy to consider, so the open proceeds untouched. */
export type PendingRecoveryCopy = 'none' | RecoveryCopyAction

/**
 * A recovery copy newer than the workbook is unsaved work from a lost session.
 * A workbook that is only newer by mtime is not proof of the opposite: another
 * program may have touched it while the copy still holds the only pre-crash
 * edits, so the copy is offered instead of dropped. It is dropped without
 * prompting only when the workbook already holds exactly the same bytes.
 */
export function pendingRecoveryCopy(input: {
  copyPath: string
  sourcePath: string
}): PendingRecoveryCopy {
  if (!existsSync(input.copyPath)) return 'none'
  const copyNewerThanSource = statSync(input.copyPath).mtimeMs > statSync(input.sourcePath).mtimeMs
  return recoveryCopyAction({ ...input, copyNewerThanSource })
}
