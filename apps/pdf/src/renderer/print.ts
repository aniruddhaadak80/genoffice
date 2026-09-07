import type { PDFDocumentProxy } from 'pdfjs-dist'

const PRINT_SCALE = 300 / 72

/**
 * Sequentially render pages as PNG images into a print-only container (canvas discarded
 * immediately to avoid keeping full-doc hi-res bitmaps in memory), then hand off to the
 * system print dialog; clean up after it closes (including cancel).
 * Caller flushes unsaved changes and re-getDocument first — rotations/deleted pages are
 * already in the file.
 *
 * Uses 300 DPI with lossless PNG for maximum text clarity (issue #211).
 */
export async function printPdf(doc: PDFDocumentProxy): Promise<void> {
  const root = document.createElement('div')
  root.className = 'pdf-print-root'
  const canvas = document.createElement('canvas')
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: PRINT_SCALE })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, viewport }).promise
    const img = document.createElement('img')
    // Use lossless PNG at 300 DPI for maximum text quality (issue #211)
    img.src = canvas.toDataURL('image/png')
    root.appendChild(img)
  }
  canvas.width = 0
  canvas.height = 0
  document.body.appendChild(root)
  try {
    await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode()))
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener('afterprint', done)
        resolve()
      }
      window.addEventListener('afterprint', done)
      window.print()
    })
  } finally {
    root.remove()
  }
}
