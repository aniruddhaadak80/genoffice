import { describe, expect, it } from 'vitest'
import { GuidedError, lookup, type Op, type OpContext } from '../src/renderer/edit-ops'

const ctx: OpContext = {
  readOnly: false,
  pageCount: 3,
  deleted: new Set(),
  claimedImages: new Set(),
}

const validate = (op: Op): void => {
  lookup(op.op).validate(op, ctx)
}

/** Runs validate and returns the GuidedError it threw, failing if it did not throw one. */
const guidedErrorFrom = (op: Op): GuidedError => {
  let thrown: unknown
  try {
    validate(op)
  } catch (e) {
    thrown = e
  }
  expect(thrown).toBeInstanceOf(GuidedError)
  return thrown as GuidedError
}

const NON_FINITE: ReadonlyArray<readonly [string, number]> = [
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
]

// Every op that funnels its geometry through the shared `rect` validator.
// `image` is included because bakeImageEdit checks it before the rect.
const RECT_OPS = ['setDrawingRect', 'setImageEditRect', 'bakeImageEdit'] as const

describe('edit-op coordinates reject non-finite values', () => {
  describe('rect components', () => {
    for (const opName of RECT_OPS) {
      for (const [label, bad] of NON_FINITE) {
        for (let slot = 0; slot < 4; slot += 1) {
          it(`${opName} rejects ${label} at rect[${slot}]`, () => {
            const rect: number[] = [10, 20, 200, 50]
            rect[slot] = bad

            const error = guidedErrorFrom({ op: opName, id: 'd1', image: 'png', rect } as Op)

            expect(error.message).toContain('must be [x1,y1,x2,y2] in PDF user space')
          })
        }
      }
    }
  })

  describe('rect on nested op inputs', () => {
    it('putTextEdit rejects NaN in input.rect', () => {
      const op = {
        op: 'putTextEdit',
        input: { pageIndex: 0, rect: [0, 0, Number.NaN, 20], oldText: 'a', newText: 'b' },
      } as Op

      expect(guidedErrorFrom(op).message).toContain('"input.rect" must be [x1,y1,x2,y2]')
    })

    it('addImageEdit rejects Infinity in input.rect', () => {
      const op = {
        op: 'addImageEdit',
        input: {
          kind: 'insertImage',
          pageIndex: 0,
          rect: [0, 0, Number.POSITIVE_INFINITY, 20],
          image: 'x',
        },
      } as Op

      expect(guidedErrorFrom(op).message).toContain('"input.rect" must be [x1,y1,x2,y2]')
    })

    it('addImageEdit rejects NaN in input.oldRect', () => {
      const op = {
        op: 'addImageEdit',
        input: {
          kind: 'replaceImage',
          pageIndex: 0,
          rect: [0, 0, 20, 20],
          oldRect: [0, 0, 20, Number.NaN],
          image: 'x',
        },
      } as Op

      expect(guidedErrorFrom(op).message).toContain('"input.oldRect" must be [x1,y1,x2,y2]')
    })
  })

  describe('moveDrawing deltas', () => {
    for (const [label, bad] of NON_FINITE) {
      it(`moveDrawing rejects dx=${label}`, () => {
        const error = guidedErrorFrom({ op: 'moveDrawing', id: 'd2', dx: bad, dy: 0 } as Op)

        expect(error.message).toBe('"dx" and "dy" must be numbers (PDF user space)')
      })

      it(`moveDrawing rejects dy=${label}`, () => {
        const error = guidedErrorFrom({ op: 'moveDrawing', id: 'd2', dx: 0, dy: bad } as Op)

        expect(error.message).toBe('"dx" and "dy" must be numbers (PDF user space)')
      })
    }

    it('moveDrawing rejects non-numeric deltas with the same GuidedError', () => {
      const error = guidedErrorFrom({ op: 'moveDrawing', id: 'd2', dx: '5', dy: 0 } as Op)

      expect(error.message).toBe('"dx" and "dy" must be numbers (PDF user space)')
    })
  })

  describe('acceptance boundaries this fix must not move', () => {
    it('still accepts fractional coordinates', () => {
      expect(() =>
        validate({ op: 'setDrawingRect', id: 'd3', rect: [10.5, 20.25, 200.125, 50.75] } as Op),
      ).not.toThrow()
    })

    it('still accepts negative coordinates (PDF user space allows them)', () => {
      expect(() =>
        validate({ op: 'setDrawingRect', id: 'd4', rect: [-10, -20, 200, 50] } as Op),
      ).not.toThrow()
    })

    it('still accepts fractional move deltas', () => {
      expect(() =>
        validate({ op: 'moveDrawing', id: 'd5', dx: -0.5, dy: 2.25 } as Op),
      ).not.toThrow()
    })
  })
})
