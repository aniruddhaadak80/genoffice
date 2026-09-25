export interface SlideIdentity {
  partPath?: string
}

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

export function slidePartPath(slide: SlideIdentity): string | undefined {
  return typeof slide.partPath === 'string' && slide.partPath.length > 0
    ? slide.partPath
    : undefined
}

export function sameSlideIdentity(left: SlideIdentity, right: SlideIdentity): boolean {
  const leftPath = slidePartPath(left)
  return leftPath !== undefined && leftPath === slidePartPath(right)
}

export function remapNotesDraft(
  draft: NotesDraft,
  slides: ReadonlyArray<SlideIdentity>,
): NotesDraft {
  const partPath = slidePartPath(draft)
  if (!partPath) return { ...draft, index: -1, conflict: true }
  const index = slides.findIndex((slide) => slidePartPath(slide) === partPath)
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
