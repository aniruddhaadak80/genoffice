/**
 * Modal dialog semantics: a dismissable modal must announce itself to assistive
 * technology. Every Slides modal carries role="dialog" + aria-modal="true" and
 * is named via aria-labelledby pointing at its visible heading.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { RenderSlide } from '@genoffice/pptx-render'

vi.mock('../src/renderer/SlideThumb', () => ({ SlideThumb: () => null }))

import { ChartDataDialog } from '../src/renderer/components/ChartDataDialog'
import { ChartTypeDialog } from '../src/renderer/components/ChartTypeDialog'
import { CutoutDialog } from '../src/renderer/components/CutoutDialog'
import {
  EquationDialog,
  HeaderFooterDialog,
  LinkDialog,
  TableInsertDialog,
} from '../src/renderer/components/InsertDialogs'
import { ZoomDialog } from '../src/renderer/components/ZoomDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<{ root: Root; container: HTMLElement }> = []
afterEach(() => {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

async function mount(Component: ComponentType<never>, props: unknown) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(
        Component as ComponentType<Record<string, unknown>>,
        props as Record<string, unknown>,
      ),
    )
  })
  roots.push({ root, container })
  return container
}

const noop = () => {}

const cases: Array<{ name: string; Component: ComponentType<never>; props: unknown }> = [
  {
    name: 'hyperlink',
    Component: LinkDialog as ComponentType<never>,
    props: { initial: null, slideCount: 3, currentSlide: 0, onApply: noop, onClose: noop },
  },
  {
    name: 'header and footer',
    Component: HeaderFooterDialog as ComponentType<never>,
    props: {
      initial: { footer: null, slideNum: false, date: null },
      onApply: noop,
      onClose: noop,
    },
  },
  {
    name: 'equation',
    Component: EquationDialog as ComponentType<never>,
    props: { onInsert: noop, onClose: noop },
  },
  {
    name: 'insert table',
    Component: TableInsertDialog as ComponentType<never>,
    props: { onInsert: noop, onClose: noop },
  },
  {
    name: 'change chart type',
    Component: ChartTypeDialog as ComponentType<never>,
    props: { current: 'bar', onConfirm: noop, onClose: noop },
  },
  {
    name: 'edit chart data',
    Component: ChartDataDialog as ComponentType<never>,
    props: {
      init: { categories: ['A', 'B'], series: [{ name: 'S1', values: [1, 2] }] },
      onConfirm: noop,
      onClose: noop,
    },
  },
  {
    name: 'zoom',
    Component: ZoomDialog as ComponentType<never>,
    props: {
      mode: 'slide',
      slides: [{ widthPx: 1280, heightPx: 720, scale: 1, nodes: [] }] as unknown as RenderSlide[],
      images: new Map(),
      sections: [],
      currentSlide: 0,
      onInsert: noop,
      onClose: noop,
    },
  },
  {
    name: 'remove background',
    Component: CutoutDialog as ComponentType<never>,
    props: { dataUrl: 'data:image/png;base64,AA==', onApply: noop, onCancel: noop },
  },
]

describe('Slides modal dialog semantics', () => {
  for (const { name, Component, props } of cases) {
    it(`announces the ${name} dialog and names it`, async () => {
      const container = await mount(Component, props)
      const modal = container.querySelector('[role="dialog"]')
      expect(modal).not.toBeNull()

      const dialog = modal as HTMLElement
      expect(dialog.getAttribute('aria-modal')).toBe('true')

      const labelledBy = dialog.getAttribute('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      const label = container.querySelector(`#${labelledBy}`)
      expect(label).not.toBeNull()
      expect(label!.textContent?.trim()).not.toBe('')
      // The label lives inside the dialog it names
      expect(dialog.contains(label)).toBe(true)
    })
  }

  it('does not leave a dismissable modal without dialog semantics', async () => {
    for (const { Component, props } of cases) {
      const container = await mount(Component, props)
      const backdrops = container.querySelectorAll('.modal-backdrop')
      expect(backdrops.length).toBeGreaterThan(0)
      for (const backdrop of backdrops) {
        const modal = backdrop.firstElementChild as HTMLElement | null
        expect(modal, 'backdrop must wrap a modal element').not.toBeNull()
        expect(modal!.getAttribute('role')).toBe('dialog')
        expect(modal!.getAttribute('aria-modal')).toBe('true')
      }
    }
  })

  it('keeps dialog ids unique across the open modals', async () => {
    const containers: HTMLElement[] = []
    for (const { Component, props } of cases) {
      containers.push(await mount(Component, props))
    }
    const ids = containers.flatMap((c) =>
      [...c.querySelectorAll<HTMLElement>('[role="dialog"]')].map((d) =>
        d.getAttribute('aria-labelledby'),
      ),
    )
    expect(ids.length).toBe(cases.length)
    expect(ids.every((id) => !!id)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
