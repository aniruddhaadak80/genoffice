import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignatureDialog } from '../src/renderer/SignatureDialog'
import type { TFunc } from '../src/renderer/i18n/locale'

const t = ((key: string) => key) as unknown as TFunc

Object.assign(window, { pdfApi: { listSavedSignatures: () => Promise.resolve([]) } })

let root: Root | null = null
let container: HTMLDivElement | null = null

class LoadedImage {
  naturalWidth = 8
  naturalHeight = 4
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

const FAKE_CONTEXT = {
  drawImage: () => {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData: () => {},
  measureText: () => ({
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: 1,
    actualBoundingBoxAscent: 1,
    actualBoundingBoxDescent: 1,
  }),
  fillText: () => {},
  clearRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  font: '',
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: '',
  lineJoin: '',
}

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  vi.stubGlobal('Image', LoadedImage)
  URL.createObjectURL = () => 'blob:signature'
  URL.revokeObjectURL = () => {}
  HTMLCanvasElement.prototype.getContext = (() =>
    FAKE_CONTEXT) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA'
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
  vi.unstubAllGlobals()
})

async function renderDialog(onCancel: () => void) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(SignatureDialog, { color: [0, 0, 0], t, onCancel, onConfirm: () => {} }),
    )
    await Promise.resolve()
  })
  return container
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function openImageMode(dialog: HTMLElement): Promise<void> {
  const imageTab = [...dialog.querySelectorAll<HTMLButtonElement>('.pdf-sign-tab')].find(
    (b) => b.textContent === 'signImage',
  )!
  await act(async () => {
    imageTab.click()
    await Promise.resolve()
  })
}

async function chooseFile(dialog: HTMLElement): Promise<void> {
  const file = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(file, 'files', {
    value: [new File(['sig'], 'sig.png', { type: 'image/png' })],
    configurable: true,
  })
  await act(async () => {
    file.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

describe('SignatureDialog a11y', () => {
  it('exposes dialog semantics labelled by the existing title key', async () => {
    const dialog = await renderDialog(() => {})
    const node = dialog.querySelector('[role="dialog"]')
    expect(node).not.toBeNull()
    expect(node!.getAttribute('aria-modal')).toBe('true')
    expect(node!.getAttribute('aria-label')).toBe('signTitle')
  })

  it('closes on Escape and on backdrop click', async () => {
    const onCancel = vi.fn()
    const dialog = await renderDialog(onCancel)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await Promise.resolve()
    })
    expect(onCancel).toHaveBeenCalledTimes(1)
    const mask = dialog.querySelector<HTMLElement>('.pdf-modal-mask')!
    await act(async () => {
      mask.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('focuses the first control on mount and returns focus on unmount', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'opener'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)
    try {
      const dialog = await renderDialog(() => {})
      const node = dialog.querySelector('[role="dialog"]')!
      const active = document.activeElement
      expect(active).not.toBeNull()
      expect(node.contains(active)).toBe(true)
      await act(async () => root!.unmount())
      root = null
      expect(document.activeElement).toBe(opener)
    } finally {
      opener.remove()
    }
  })

  it('offers the empty upload as a real button that opens the file picker', async () => {
    const dialog = await renderDialog(() => {})
    await openImageMode(dialog)

    const upload = dialog.querySelector<HTMLElement>('.pdf-sign-imgbox')!
    expect(upload.tagName).toBe('BUTTON')
    expect(upload.getAttribute('type')).toBe('button')
    expect(upload.tabIndex).toBe(0)

    const file = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    const opened = vi.fn()
    file.addEventListener('click', opened)
    await act(async () => {
      upload.click()
      await Promise.resolve()
    })
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('keeps the upload a real button once an image is loaded', async () => {
    const dialog = await renderDialog(() => {})
    await openImageMode(dialog)
    await chooseFile(dialog)
    expect(dialog.querySelector('img.pdf-sign-img')).not.toBeNull()

    const upload = dialog.querySelector<HTMLElement>('.pdf-sign-imgbox')!
    expect(upload.tagName).toBe('BUTTON')
    expect(upload.getAttribute('type')).toBe('button')
    expect(upload.tabIndex).toBe(0)
    expect(upload.getAttribute('aria-label')).toBe('signAddImage')
    expect(upload.querySelector('img')!.getAttribute('alt')).toBe('')
  })
})
