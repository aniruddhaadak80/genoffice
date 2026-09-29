import assert from 'node:assert/strict'
import { TabStopType } from 'docx'
import { test } from 'vitest'

import { tabStopsFor } from '../src/generate/word-utils'

const CONTEXT = { contentDxa: 9000 }

test('clamps a negative tabFrac to a non-negative tab stop', () => {
  // A separator measured left of the text column. w:pos is a tab offset from
  // the left margin, so a negative one is out of range for Word.
  assert.deepEqual(tabStopsFor(CONTEXT, [{ text: 'Total\t-12', tabFrac: -0.4 }]), [
    { type: TabStopType.LEFT, position: 0 },
  ])
  // A fraction inside the column still reproduces the measured column.
  assert.deepEqual(tabStopsFor(CONTEXT, [{ text: 'Total\t12', tabFrac: 0.5 }]), [
    { type: TabStopType.LEFT, position: 4500 },
  ])
  // Past the 75% threshold it is a right-aligned tail, as before.
  assert.deepEqual(tabStopsFor(CONTEXT, [{ text: 'Total\t12', tabFrac: 0.8 }]), [
    { type: TabStopType.RIGHT, position: 9000 },
  ])
})
