import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { collectHeadings } from '../src/renderer/editor/headings'
import { NavPane } from '../src/renderer/components/NavPane'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const editors = new Set<Editor>()
let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  container?.remove()
  container = null
  for (const editor of editors) {
    editor.view.dom.remove()
    editor.destroy()
  }
  editors.clear()
})

const block = (type: string, text: string, attrs?: Record<string, unknown>) => ({
  type,
  ...(attrs ? { attrs } : {}),
  content: [{ type: 'text', text }],
})

function openEditor(): Editor {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        block('docHeading', 'Alpha', { level: 1 }),
        block('docParagraph', 'body one'),
        block('docHeading', 'Beta', { level: 1 }),
        block('docParagraph', 'body two'),
        block('docHeading', 'Gamma', { level: 1 }),
        block('docParagraph', 'body three'),
      ],
    },
  })
  editors.add(editor)
  return editor
}

function renderNavPane(editor: Editor): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root?.render(createElement(NavPane, { editor, doc: editor.state.doc, onClose: () => {} })),
  )
  return container
}

function navItems(pane: HTMLElement): HTMLButtonElement[] {
  return [...pane.querySelectorAll<HTMLButtonElement>('.nav-item')]
}

function caretHeading(editor: Editor): string | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'docHeading') return node.textContent
  }
  return null
}

const flushFrame = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })

describe('NavPane heading clicks', () => {
  it('moves the caret into the clicked heading and focuses the editor', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    const editor = openEditor()
    const pane = renderNavPane(editor)
    const [, beta] = collectHeadings(editor.state.doc)
    expect(navItems(pane).map((b) => b.textContent)).toEqual(['Alpha', 'Beta', 'Gamma'])

    act(() =>
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc))),
    )
    expect(caretHeading(editor)).toBeNull()

    act(() => navItems(pane)[1]!.click())
    await flushFrame()

    expect(caretHeading(editor)).toBe('Beta')
    expect(editor.state.selection.from).toBe(beta!.pos + 1)
    expect(editor.state.selection.empty).toBe(true)
    expect(editor.isFocused).toBe(true)
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('makes the next keystroke land in the clicked heading', () => {
    Element.prototype.scrollIntoView = vi.fn()
    const editor = openEditor()
    const pane = renderNavPane(editor)

    act(() => navItems(pane)[2]!.click())
    act(() => editor.commands.insertContent('typed '))

    const [, , gamma] = collectHeadings(editor.state.doc)
    expect(editor.state.doc.nodeAt(gamma!.pos)!.textContent).toBe('typed Gamma')
  })

  it('still scrolls the clicked heading to the top of the page', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const editor = openEditor()
    const pane = renderNavPane(editor)
    const [, , gamma] = collectHeadings(editor.state.doc)

    act(() => navItems(pane)[2]!.click())

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(editor.view.nodeDOM(gamma!.pos))
    expect(scrollIntoView.mock.calls[0]![0]).toEqual({ behavior: 'smooth', block: 'start' })
  })
})
