import { describe, expect, it } from 'vitest'
import { trapTab } from '../src/renderer/components/modal-keys'

function keydown(
  key: string,
  shiftKey = false,
): { key: string; shiftKey: boolean; prevented: boolean; preventDefault: () => void } {
  const e = {
    key,
    shiftKey,
    prevented: false,
    preventDefault() {
      e.prevented = true
    },
  }
  return e
}

function modal(): { root: HTMLDivElement; buttons: HTMLButtonElement[]; cleanup: () => void } {
  const root = document.createElement('div')
  const buttons = [document.createElement('button'), document.createElement('button')]
  for (const b of buttons) root.appendChild(b)
  document.body.appendChild(root)
  return { root, buttons, cleanup: () => root.remove() }
}

describe('trapTab', () => {
  it('wraps Tab on the last control back to the first', () => {
    const { root, buttons, cleanup } = modal()
    try {
      buttons[1]!.focus()
      const e = keydown('Tab')
      trapTab(root, e)
      expect(e.prevented).toBe(true)
      expect(document.activeElement).toBe(buttons[0])
    } finally {
      cleanup()
    }
  })

  it('wraps Shift+Tab on the first control to the last', () => {
    const { root, buttons, cleanup } = modal()
    try {
      buttons[0]!.focus()
      const e = keydown('Tab', true)
      trapTab(root, e)
      expect(e.prevented).toBe(true)
      expect(document.activeElement).toBe(buttons[1])
    } finally {
      cleanup()
    }
  })

  it('leaves mid-list tabs and other keys alone', () => {
    const { root, buttons, cleanup } = modal()
    try {
      buttons[0]!.focus()
      const plain = keydown('Tab')
      trapTab(root, plain)
      expect(plain.prevented).toBe(false)
      const other = keydown('Enter')
      trapTab(root, other)
      expect(other.prevented).toBe(false)
    } finally {
      cleanup()
    }
  })

  it('prevents tabbing out of an empty modal', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    try {
      const e = keydown('Tab')
      trapTab(root, e)
      expect(e.prevented).toBe(true)
    } finally {
      root.remove()
    }
  })
})
