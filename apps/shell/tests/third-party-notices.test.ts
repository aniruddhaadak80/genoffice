import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface LicenseTextModule {
  licenseText(name: string, dir: string): string | null
}

describe('third-party license aggregation', () => {
  it('includes the PDFium wrapper and binary redistribution terms', async () => {
    const root = join(__dirname, '../../..')
    const modulePath = pathToFileURL(join(root, 'tools/license-text.mjs')).href
    const { licenseText } = (await import(modulePath)) as LicenseTextModule
    const text = licenseText('@embedpdf/pdfium', join(root, 'node_modules/@embedpdf/pdfium'))

    expect(text).toContain('MIT License')
    expect(text).toContain('Copyright 2014 PDFium Authors')
    expect(text).toContain('Apache License')
  })
})
