import { describe, expect, it } from 'vitest'
import {
  reconcileNotesDraft,
  remapNotesDraft,
  sameSlideIdentity,
  type NotesDraft,
} from '../src/renderer/notes-draft'

const draft: NotesDraft = {
  index: 0,
  partPath: 'ppt/slides/slide1.xml',
  baseText: 'persisted before typing',
  text: 'draft typed during AI',
  conflict: false,
}

describe('remapNotesDraft', () => {
  it('follows the same slide when an AI update reorders pages', () => {
    expect(
      remapNotesDraft(draft, [
        { partPath: 'ppt/slides/slide2.xml' },
        { partPath: 'ppt/slides/slide1.xml' },
      ]),
    ).toMatchObject({ index: 1, partPath: draft.partPath, text: draft.text })
  })

  it('marks a missing slide instead of redirecting the draft to another page', () => {
    expect(remapNotesDraft(draft, [{ partPath: 'ppt/slides/slide2.xml' }])).toMatchObject({
      index: -1,
      conflict: true,
    })
  })

  it('does not treat an absent part path as a match', () => {
    expect(remapNotesDraft({ ...draft, partPath: undefined }, [{}, {}])).toMatchObject({
      index: -1,
      conflict: true,
    })
    expect(sameSlideIdentity({ partPath: undefined }, {})).toBe(false)
  })
})

describe('reconcileNotesDraft', () => {
  it('preserves an unrelated in-progress draft', () => {
    expect(reconcileNotesDraft(draft, draft.baseText)).toEqual({
      draft,
      conflict: false,
    })
  })

  it('preserves the draft and reports a conflict when both sides changed', () => {
    expect(reconcileNotesDraft(draft, 'AI changed the notes')).toEqual({
      draft: { ...draft, conflict: true },
      conflict: true,
    })
  })

  it('clears the draft when either side converged on the same text', () => {
    expect(reconcileNotesDraft(draft, draft.text)).toEqual({ draft: null, conflict: false })
    expect(reconcileNotesDraft({ ...draft, text: draft.baseText }, 'AI changed the notes')).toEqual(
      { draft: null, conflict: false },
    )
  })
})
