// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GoToDialog } from '../src/renderer/GoToDialog'
import { SubtotalDialog } from '../src/renderer/SubtotalDialog'
import type { PivotField } from '../src/renderer/PivotDialog'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const FIELDS = [
  { colIndex: 0, label: 'Region' },
  { colIndex: 1, label: 'Amount' },
] as unknown as readonly PivotField[]

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

function mount(element: React.ReactElement): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root?.render(element))
  return host
}

function gotoDialog(onClose: () => void): HTMLElement {
  return mount(createElement(GoToDialog, { names: [], onGo: () => null, onClose }))
}

function subtotalDialog(onClose: () => void): HTMLElement {
  return mount(createElement(SubtotalDialog, { fields: FIELDS, onCreate: () => null, onClose }))
}

function dialog(pane: HTMLElement): HTMLElement {
  const el = pane.querySelector<HTMLElement>('[role="dialog"]')
  expect(el).not.toBeNull()
  return el!
}

function press(el: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    el.dispatchEvent(event)
  })
  return event
}

const cases = [
  { name: 'Go To', open: gotoDialog, firstControl: 'input' },
  { name: 'Subtotal', open: subtotalDialog, firstControl: 'button' },
] as const

describe.each(cases)('$name dialog keyboard handling', ({ open, firstControl }) => {
  it('closes on Escape without letting it reach the app', () => {
    const onClose = vi.fn()
    const pane = open(onClose)

    const event = press(dialog(pane), 'Escape')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('moves focus into the dialog on open', () => {
    const pane = open(vi.fn())
    const el = dialog(pane)
    expect(el.contains(document.activeElement)).toBe(true)
    expect(el.querySelector(firstControl)).toBe(document.activeElement)
  })

  it('cycles Tab from the last control back into the dialog', () => {
    const pane = open(vi.fn())
    const el = dialog(pane)
    const focusable = [
      ...el.querySelectorAll<HTMLElement>('button, input, textarea, select'),
    ].filter((node) => !node.hasAttribute('disabled') && node.tabIndex >= 0)
    expect(focusable.length).toBeGreaterThan(1)
    const last = focusable[focusable.length - 1]!
    act(() => {
      last.focus()
    })

    const event = press(el, 'Tab')

    expect(event.defaultPrevented).toBe(true)
    expect(el.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('leaves other keys to the browser', () => {
    const onClose = vi.fn()
    const pane = open(onClose)

    const event = press(dialog(pane), 'a')

    expect(event.defaultPrevented).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
