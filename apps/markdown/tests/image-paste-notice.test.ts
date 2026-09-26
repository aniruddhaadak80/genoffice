import { afterEach, describe, expect, it, vi } from 'vitest'
import { Slice } from '@tiptap/pm/model'
import { setToastEmitter, type ToastData } from '../src/renderer/components/toast-bus'
import { MAX_PASTED_IMAGE_BYTES } from '../src/renderer/editor/localImage'
import { strings } from '../src/renderer/i18n/strings'

// Undestroyed views leave DOMObserver flush timers that fire after jsdom teardown
// ("document is not defined" unhandled error) — destroy every editor we create.
const editors: import('@tiptap/core').Editor[] = []
let toasts: ToastData[] = []
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy()
  setToastEmitter(null)
  toasts = []
  vi.restoreAllMocks()
})

function stubSaveImage(result: string | null) {
  Object.defineProperty(window, 'markdownApi', {
    configurable: true,
    value: { saveImage: vi.fn(async () => result) },
  })
}

async function newEditor() {
  const { Editor } = await import('@tiptap/core')
  const { buildExtensions } = await import('../src/renderer/editor/extensions')
  const editor = new Editor({
    extensions: buildExtensions({
      slashController: { onOpen() {}, onUpdate() {}, onKeyDown: () => false, onClose() {} },
      slashItems: () => [],
    }),
    content: '',
  })
  editors.push(editor)
  return editor
}

/** Invoke the editor's handlePaste props with a synthetic clipboard payload.
 * Mirrors ProseMirror semantics: first handler returning truthy wins.
 * getData is stubbed because CodeBlock's paste handler reads text/html. */
function paste(editor: import('@tiptap/core').Editor, files: File[]): boolean {
  const clipboardData = {
    files,
    getData: () => '',
  } as unknown as DataTransfer
  const event = { clipboardData } as unknown as ClipboardEvent
  let handled = false
  editor.view.someProp('handlePaste', (fn) => {
    if (handled) return
    handled = fn(editor.view, event, Slice.empty) === true
  })
  return handled
}

const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

function pngFile(bytes: Uint8Array = PNG_HEADER): File {
  return new File([bytes], 'shot.png', { type: 'image/png' })
}

describe('image paste into an untitled document', () => {
  it('toasts instead of silently dropping when the image cannot be persisted', async () => {
    stubSaveImage(null)
    setToastEmitter((toast) => toasts.push(toast))
    const editor = await newEditor()

    const handled = paste(editor, [pngFile()])
    expect(handled).toBe(true)

    await vi.waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0]).toEqual({ text: strings.zh.imageNeedsSavedDocument, kind: 'error' })
    expect(editor.state.doc.toString()).not.toContain('image')
    expect(window.markdownApi.saveImage).toHaveBeenCalledOnce()
  })

  it('inserts the image node when persistence succeeds, without a toast', async () => {
    stubSaveImage('assets/shot.png')
    setToastEmitter((toast) => toasts.push(toast))
    const editor = await newEditor()

    paste(editor, [pngFile()])

    await vi.waitFor(() => {
      let found: string | null = null
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'image') found = String(node.attrs.src)
        return true
      })
      expect(found).toBe('assets/shot.png')
    })
    expect(toasts).toHaveLength(0)
  })

  it('ignores clipboards without image files', async () => {
    stubSaveImage('assets/shot.png')
    const editor = await newEditor()
    const text = new File(['plain'], 'notes.txt', { type: 'text/plain' })
    expect(paste(editor, [text])).toBe(false)
    expect(window.markdownApi.saveImage).not.toHaveBeenCalled()
  })
})

describe('pasted image payload is bounded and sniffed before IPC', () => {
  it('rejects an oversized image without reading it or calling saveImage', async () => {
    stubSaveImage('assets/shot.png')
    setToastEmitter((toast) => toasts.push(toast))
    const editor = await newEditor()
    const oversize = new File([PNG_HEADER], 'huge.png', { type: 'image/png' })
    Object.defineProperty(oversize, 'size', { value: MAX_PASTED_IMAGE_BYTES + 1 })

    expect(paste(editor, [oversize])).toBe(true)

    await vi.waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0]).toEqual({ text: strings.zh.imageRejected, kind: 'error' })
    expect(window.markdownApi.saveImage).not.toHaveBeenCalled()
    expect(editor.state.doc.toString()).not.toContain('image')
  })

  it('rejects a non-image payload that only claims an image MIME type', async () => {
    stubSaveImage('assets/shot.png')
    setToastEmitter((toast) => toasts.push(toast))
    const editor = await newEditor()
    const disguised = new File(
      [new TextEncoder().encode('<html>not an image</html>')],
      'fake.png',
      {
        type: 'image/png',
      },
    )

    expect(paste(editor, [disguised])).toBe(true)

    await vi.waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0]).toEqual({ text: strings.zh.imageRejected, kind: 'error' })
    expect(window.markdownApi.saveImage).not.toHaveBeenCalled()
  })

  it('rejects an empty image payload', async () => {
    stubSaveImage('assets/shot.png')
    setToastEmitter((toast) => toasts.push(toast))
    const editor = await newEditor()
    expect(paste(editor, [new File([], 'empty.png', { type: 'image/png' })])).toBe(true)
    await vi.waitFor(() => expect(toasts).toHaveLength(1))
    expect(window.markdownApi.saveImage).not.toHaveBeenCalled()
  })

  it('accepts real png, jpeg and gif payloads', async () => {
    const { isAcceptableImageFile } = await import('../src/renderer/editor/localImage')
    const file = (bytes: number[], type: string, name: string) =>
      new File([new Uint8Array(bytes)], name, { type })
    expect(await isAcceptableImageFile(file([...PNG_HEADER], 'image/png', 'a.png'))).toBe(true)
    expect(await isAcceptableImageFile(file([0xff, 0xd8, 0xff, 0xe0], 'image/jpeg', 'a.jpg'))).toBe(
      true,
    )
    expect(
      await isAcceptableImageFile(file([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif', 'a.gif')),
    ).toBe(true)
  })

  it('accepts a file exactly at the cap and rejects one byte over', async () => {
    const { isAcceptableImageFile } = await import('../src/renderer/editor/localImage')
    const build = (size: number) => {
      const file = new File([PNG_HEADER], 'a.png', { type: 'image/png' })
      Object.defineProperty(file, 'size', { value: size })
      return file
    }
    expect(await isAcceptableImageFile(build(MAX_PASTED_IMAGE_BYTES))).toBe(true)
    expect(await isAcceptableImageFile(build(MAX_PASTED_IMAGE_BYTES + 1))).toBe(false)
  })

  it('rejects a truncated png signature', async () => {
    const { isAcceptableImageFile } = await import('../src/renderer/editor/localImage')
    const short = new File([new Uint8Array([137, 80, 78])], 'a.png', { type: 'image/png' })
    expect(await isAcceptableImageFile(short)).toBe(false)
  })
})
