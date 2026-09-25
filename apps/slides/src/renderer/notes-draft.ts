export interface NotesDraft {
  index: number
  partPath: string | undefined
  baseText: string
  text: string
  conflict: boolean
}

export interface NotesDraftReconciliation {
  draft: NotesDraft | null
  conflict: boolean
}

export function remapNotesDraft(
  draft: NotesDraft,
  slides: ReadonlyArray<{ partPath?: string }>,
): NotesDraft {
  const index = slides.findIndex((slide) => slide.partPath === draft.partPath)
  if (index === draft.index) return draft
  return { ...draft, index, conflict: draft.conflict || index < 0 }
}

export function reconcileNotesDraft(
  draft: NotesDraft | null,
  persistedText: string,
): NotesDraftReconciliation {
  if (!draft) return { draft: null, conflict: false }
  if (draft.text === draft.baseText || persistedText === draft.text) {
    return { draft: null, conflict: false }
  }
  if (persistedText === draft.baseText) {
    return { draft: { ...draft, conflict: false }, conflict: false }
  }
  return { draft: { ...draft, conflict: true }, conflict: true }
}
