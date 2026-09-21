/**
 * Pure guards for docs:export-pdf. Page geometry arrives from the renderer
 * (section sizes via parseFloat can be NaN) and reaches Chromium printToPDF
 * verbatim, so it is range-checked here. Electron-free for direct unit tests.
 */

/** Printable page dimension in twips: 1in .. 22in (covers all Word sizes). */
export const MIN_EXPORT_TWIPS = 1440
export const MAX_EXPORT_TWIPS = 31680

export function validExportTwips(v: unknown): v is number {
  return (
    typeof v === 'number' && Number.isFinite(v) && v >= MIN_EXPORT_TWIPS && v <= MAX_EXPORT_TWIPS
  )
}

/** Export scale factor: 0.1 .. 5 (undefined = Chromium default). */
export function validExportScale(scale: unknown): boolean {
  return (
    scale === undefined ||
    (typeof scale === 'number' && Number.isFinite(scale) && scale >= 0.1 && scale <= 5)
  )
}
