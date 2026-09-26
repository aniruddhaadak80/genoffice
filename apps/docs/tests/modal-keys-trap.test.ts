import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { trapTab, useModalKeys } from '../src/renderer/components/modal-keys'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

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

function TestModal({ onClose }: { onClose: () => void }) {
  const modalKeys = useModalKeys(onClose)
  return createElement(
    'div',
    {
      ref: modalKeys.ref,
      role: 'dialog',
      'aria-label': 'test',
      onKeyDown: modalKeys.onKeyDown,
    },
    createElement('input', { className: 'first' }),
    createElement('button', { className: 'last' }, 'ok'),
  )
}

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  host?.remove()
  host = null
})

function open(onClose: () => void): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(createElement(TestModal, { onClose })))
  return host
}

describe('useModalKeys', () => {
  it('puts focus on the first control when the modal opens', () => {
    open(vi.fn())
    expect(document.activeElement).toBe(host!.querySelector('.first'))
  })

  it('leaves an autoFocused control alone', () => {
    function AutoFocusModal({ onClose }: { onClose: () => void }) {
      const modalKeys = useModalKeys(onClose)
      return createElement(
        'div',
        { ref: modalKeys.ref, onKeyDown: modalKeys.onKeyDown },
        createElement('input', { className: 'auto', autoFocus: true }),
      )
    }
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root?.render(createElement(AutoFocusModal, { onClose: vi.fn() })))
    expect(document.activeElement).toBe(host!.querySelector('.auto'))
  })

  it('closes on Escape and stops it before global listeners', () => {
    const onClose = vi.fn()
    const modal = open(onClose)
    const dialog = modal.querySelector<HTMLElement>('[role="dialog"]')!
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => {
      dialog.dispatchEvent(event)
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('cycles Tab on the last control back to the first', () => {
    const modal = open(vi.fn())
    const dialog = modal.querySelector<HTMLElement>('[role="dialog"]')!
    const last = modal.querySelector<HTMLElement>('.last')!
    act(() => {
      last.focus()
    })
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => {
      dialog.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(modal.querySelector('.first'))
  })

  it('leaves other keys and mid-list tabs to the browser', () => {
    const onClose = vi.fn()
    const modal = open(onClose)
    const dialog = modal.querySelector<HTMLElement>('[role="dialog"]')!
    const first = modal.querySelector<HTMLElement>('.first')!
    act(() => {
      first.focus()
    })
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => {
      dialog.dispatchEvent(tab)
    })
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    act(() => {
      dialog.dispatchEvent(enter)
    })
    expect(tab.defaultPrevented).toBe(false)
    expect(enter.defaultPrevented).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
