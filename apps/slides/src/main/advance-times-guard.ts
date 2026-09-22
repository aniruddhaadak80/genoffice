/**
 * Pure validation for the slides:set-advance-times IPC payload
 * (SetAdvanceTimesOp). advTm is xsd:unsignedInt (0..4294967295); the main
 * process must not forward NaN/Infinity/oversized values into sessionTxn,
 * and one bad entry must not abort the whole rehearsal-save batch.
 * Electron-free for direct unit tests.
 */

/** xsd:unsignedInt upper bound written into <p:transition advTm>. */
export const MAX_ADVANCE_MS = 4294967295

export interface AdvanceTimeEntry {
  slideIndex: number
  ms: number | null
}

function validEntry(raw: unknown): raw is AdvanceTimeEntry {
  if (!raw || typeof raw !== 'object') return false
  const t = raw as { slideIndex?: unknown; ms?: unknown }
  if (typeof t.slideIndex !== 'number' || !Number.isInteger(t.slideIndex) || t.slideIndex < 0) {
    return false
  }
  if (t.ms === null) return true
  return typeof t.ms === 'number' && Number.isFinite(t.ms) && t.ms >= 0 && t.ms <= MAX_ADVANCE_MS
}

/**
 * Keep only well-formed entries. Invalid slideIndex/ms values are dropped so
 * a single hostile or corrupt row cannot reject the entire batch (sessionTxn
 * is atomic). Non-array input yields [].
 */
export function filterAdvanceTimes(times: unknown): AdvanceTimeEntry[] {
  if (!Array.isArray(times)) return []
  return times.filter(validEntry)
}
