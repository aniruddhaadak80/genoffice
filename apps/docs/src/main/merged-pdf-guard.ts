/**
 * Pure guards for docs:save-merged-pdf. The fragment list arrives from the
 * renderer, so the part count and each part's size are bounded before pdf-lib
 * touches them. Electron-free for direct unit tests.
 */

/** Maximum PDF fragments merged in one request. */
export const MAX_MERGED_PDF_PARTS = 200

/** Maximum base64 chars per fragment (~37MB of PDF bytes). */
export const MAX_MERGED_PDF_PART_CHARS = 50 * 1024 * 1024

export function validMergedPdfParts(base64Parts: unknown): base64Parts is string[] {
  return (
    Array.isArray(base64Parts) &&
    base64Parts.length > 0 &&
    base64Parts.length <= MAX_MERGED_PDF_PARTS &&
    base64Parts.every(
      (p) => typeof p === 'string' && p.length > 0 && p.length <= MAX_MERGED_PDF_PART_CHARS,
    )
  )
}
