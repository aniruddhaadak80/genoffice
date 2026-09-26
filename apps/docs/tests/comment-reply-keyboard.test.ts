import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import type { CommentInfo } from '@genoffice/docx-engine'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { LocaleProvider, setModuleLang } from '../src/renderer/i18n/locale'
import { CommentsPanel } from '../src/renderer/components/CommentsPanel'

Object.assign(window, { desktop: { onLanguageChanged: () => () => undefined } })

setModuleLang('en')

const noop = () => {}

let actEnv: (value: boolean) => void
beforeAll(() => {
  actEnv = (value: boolean) => {
    ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = value
  }
  actEnv(true)
})
afterAll(() => actEnv(false))

const comments = (): CommentInfo[] =>
  [
    { id: 'c1', author: 'Alice', text: 'parent text', done: false },
    { id: 'r1', author: 'Bob', text: 'reply text', done: false, parentId: 'c1' },
  ] as CommentInfo[]

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
  for (const editor of editors) editor.destroy()
  editors.clear()
})

function mountPanel(handlers: {
  onEdit?: (id: string, text: string) => void
  onDelete?: (id: string) => void
}): HTMLElement {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [{ type: 'docParagraph', content: [{ type: 'text', text: 'hello' }] }],
    },
  })
  editors.add(editor)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() =>
    root?.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(CommentsPanel, {
          comments: comments(),
          docNode: editor.state.doc,
          composing: false,
          onSubmitNew: noop,
          onReply: noop,
          onEdit: handlers.onEdit ?? noop,
          onResolve: noop,
          onCancelNew: noop,
          onDelete: handlers.onDelete ?? noop,
          onClose: noop,
        }),
      }),
    ),
  )
  return container
}

function replyControl(pane: HTMLElement, className: string): HTMLElement {
  const reply = pane.querySelector('.comment-reply')!
  const el = reply.querySelector<HTMLElement>(`.${className}`)
  expect(el).not.toBeNull()
  return el!
}

function press(el: HTMLElement, key: string): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

describe('comment reply keyboard activation', () => {
  it('exposes both reply controls as reachable, labelled buttons', () => {
    const pane = mountPanel({})
    for (const className of ['comment-card-edit', 'comment-card-del']) {
      const el = replyControl(pane, className)
      expect(el.getAttribute('role')).toBe('button')
      expect(el.getAttribute('tabindex')).toBe('0')
      expect(el.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it.each(['Enter', ' '])('opens the reply editor with %j', (key) => {
    const onEdit = vi.fn()
    const pane = mountPanel({ onEdit })

    press(replyControl(pane, 'comment-card-edit'), key)

    const textarea = pane.querySelector<HTMLTextAreaElement>('.comment-reply-compose textarea')
    expect(textarea).not.toBeNull()
    expect(textarea!.value).toBe('reply text')
    const save = [...pane.querySelectorAll<HTMLButtonElement>('button.primary')].find(
      (b) => !b.disabled,
    )!
    act(() => save.click())
    expect(onEdit).toHaveBeenCalledWith('r1', 'reply text')
  })

  it.each(['Enter', ' '])('deletes the reply with %j', (key) => {
    const onDelete = vi.fn()
    const pane = mountPanel({ onDelete })

    press(replyControl(pane, 'comment-card-del'), key)

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith('r1')
  })

  it('leaves other keys to the browser', () => {
    const onDelete = vi.fn()
    const pane = mountPanel({ onDelete })

    press(replyControl(pane, 'comment-card-del'), 'a')
    press(replyControl(pane, 'comment-card-del'), 'Tab')
    press(replyControl(pane, 'comment-card-edit'), 'Escape')

    expect(onDelete).not.toHaveBeenCalled()
    expect(pane.querySelector('.comment-reply-compose')).toBeNull()
  })

  it('keeps the top-level controls on the same keys', () => {
    const onEdit = vi.fn()
    const pane = mountPanel({ onEdit })
    const card = pane.querySelector<HTMLElement>('.comment-card-head .comment-card-edit')!

    press(card, ' ')

    expect(pane.querySelector<HTMLTextAreaElement>('.comment-reply-compose textarea')!.value).toBe(
      'parent text',
    )
  })
})
