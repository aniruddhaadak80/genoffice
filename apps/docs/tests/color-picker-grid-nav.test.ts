import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  ColorPicker,
  colorGridStep,
  rovingTabIndex,
  STANDARD_COLORS,
  THEME_COLORS,
  THEME_COLOR_SHADES,
  type ColorPickerStrings,
} from '@genoffice/ui'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const STRINGS: ColorPickerStrings = {
  themeColors: 'Theme Colors',
  standardColors: 'Standard Colors',
  recentColors: 'Recent Colors',
  moreColors: 'More Colors…',
  auto: 'Automatic',
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

function render(value: string | null, recent?: readonly string[]): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root?.render(
      createElement(ColorPicker, {
        value,
        strings: STRINGS,
        recentColors: recent,
        onPick: () => {},
      }),
    ),
  )
  return host
}

function group(pane: HTMLElement, label: string): HTMLElement {
  const el = pane.querySelector<HTMLElement>(`[role="listbox"][aria-label="${label}"]`)
  expect(el).not.toBeNull()
  return el!
}

function options(pane: HTMLElement, label: string): HTMLButtonElement[] {
  return [...group(pane, label).querySelectorAll<HTMLButtonElement>('[role="option"]')]
}

function press(el: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => {
    el.dispatchEvent(event)
  })
  return event
}

const THEME_COUNT = THEME_COLORS.length + THEME_COLOR_SHADES.flat().length

describe('colorGridStep', () => {
  it('moves within a 10-column row and refuses to leave it', () => {
    expect(colorGridStep('ArrowRight', 0, 60)).toBe(1)
    expect(colorGridStep('ArrowRight', 9, 60)).toBeNull()
    expect(colorGridStep('ArrowLeft', 9, 60)).toBe(8)
    expect(colorGridStep('ArrowLeft', 10, 60)).toBeNull()
  })

  it('moves a whole row up and down, stopping at the edges', () => {
    expect(colorGridStep('ArrowDown', 3, 60)).toBe(13)
    expect(colorGridStep('ArrowUp', 13, 60)).toBe(3)
    expect(colorGridStep('ArrowUp', 3, 60)).toBeNull()
    expect(colorGridStep('ArrowDown', 55, 60)).toBeNull()
  })

  it('jumps to the row ends but not past a short last row', () => {
    expect(colorGridStep('Home', 14, 60)).toBe(10)
    expect(colorGridStep('Home', 10, 60)).toBeNull()
    expect(colorGridStep('End', 10, 60)).toBe(19)
    expect(colorGridStep('End', 19, 60)).toBeNull()
    expect(colorGridStep('End', 10, 12)).toBe(11)
    expect(colorGridStep('ArrowRight', 11, 12)).toBeNull()
  })

  it('ignores keys that are not grid navigation', () => {
    for (const key of ['Enter', ' ', 'a', 'Tab', 'Escape']) {
      expect(colorGridStep(key, 0, 60)).toBeNull()
    }
    expect(colorGridStep('ArrowRight', -1, 60)).toBeNull()
    expect(colorGridStep('ArrowRight', 0, 0)).toBeNull()
  })
})

describe('rovingTabIndex', () => {
  it('keeps one tab stop on the roving cell, then on the selection, then the first', () => {
    expect([0, 1, 2].map((i) => rovingTabIndex(1, i, 2))).toEqual([-1, 0, -1])
    expect([0, 1, 2].map((i) => rovingTabIndex(null, i, 2))).toEqual([-1, -1, 0])
    expect([0, 1, 2].map((i) => rovingTabIndex(null, i, -1))).toEqual([0, -1, -1])
  })
})

describe('ColorPicker keyboard grid', () => {
  it('exposes each swatch group as a labelled listbox of options', () => {
    const pane = render(null)
    expect(options(pane, 'Theme Colors')).toHaveLength(THEME_COUNT)
    expect(options(pane, 'Standard Colors')).toHaveLength(STANDARD_COLORS.length)
    for (const option of options(pane, 'Standard Colors')) {
      expect(option.getAttribute('role')).toBe('option')
      expect(option.getAttribute('aria-selected')).toBe('false')
      expect(option.getAttribute('type')).toBe('button')
    }
  })

  it('has exactly one tab stop per group instead of one per swatch', () => {
    const pane = render(null)
    const stops = (label: string) =>
      options(pane, label).filter((o) => o.getAttribute('tabindex') === '0')
    expect(stops('Theme Colors')).toHaveLength(1)
    expect(stops('Standard Colors')).toHaveLength(1)
    expect(options(pane, 'Theme Colors').filter((o) => o.tabIndex === 0)).toHaveLength(1)
  })

  it('puts the group tab stop on the selected color', () => {
    const pane = render(THEME_COLOR_SHADES[2]![4])
    const themeOptions = options(pane, 'Theme Colors')
    const selected = themeOptions.filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected.length).toBeGreaterThanOrEqual(1)
    for (const option of selected) {
      expect(option.getAttribute('title')).toBe(`#${THEME_COLOR_SHADES[2]![4]}`)
    }
    expect(selected[0]!.tabIndex).toBe(0)
    expect(themeOptions.filter((o) => o.tabIndex === 0)).toEqual([selected[0]])
  })

  it('moves the roving focus with the arrow keys and keeps one tab stop', () => {
    const pane = render(null)
    const themeOptions = options(pane, 'Theme Colors')
    const first = themeOptions[0]!
    act(() => {
      first.focus()
    })
    expect(document.activeElement).toBe(first)

    press(first, 'ArrowRight')
    expect(document.activeElement).toBe(themeOptions[1])
    expect(themeOptions.filter((o) => o.tabIndex === 0)).toEqual([themeOptions[1]])

    press(themeOptions[1]!, 'ArrowDown')
    expect(document.activeElement).toBe(themeOptions[11])
    press(themeOptions[11]!, 'End')
    expect(document.activeElement).toBe(themeOptions[19])
    press(themeOptions[19]!, 'ArrowRight')
    expect(document.activeElement).toBe(themeOptions[19])
    expect(themeOptions.filter((o) => o.tabIndex === 0)).toEqual([themeOptions[19]])
  })

  it('does not steal the group arrow key from a swatch at the row edge', () => {
    const pane = render(null)
    const themeOptions = options(pane, 'Theme Colors')
    const atRowEnd = themeOptions[9]!
    act(() => {
      atRowEnd.focus()
    })
    const event = press(atRowEnd, 'ArrowRight')
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(atRowEnd)
  })

  it('keeps the groups independent', () => {
    const pane = render(null)
    const standard = options(pane, 'Standard Colors')
    act(() => {
      standard[0]!.focus()
    })
    press(standard[0]!, 'ArrowRight')
    expect(document.activeElement).toBe(standard[1])
    const themeOptions = options(pane, 'Theme Colors')
    expect(themeOptions.filter((o) => o.tabIndex === 0)).toEqual([themeOptions[0]])
  })

  it('announces the picked color as the selected option', () => {
    const onPick = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() =>
      root?.render(createElement(ColorPicker, { value: '#FF0000', strings: STRINGS, onPick })),
    )
    const standard = [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')].filter(
      (o) => o.getAttribute('aria-selected') === 'true',
    )
    expect(standard).toHaveLength(1)
    expect(standard[0]!.getAttribute('title')).toBe('Red')
  })
})
