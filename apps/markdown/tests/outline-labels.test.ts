import { describe, expect, it } from 'vitest'

import { strings } from '../src/renderer/i18n/strings'

/**
 * Outline view toggle (Ribbon.tsx) must speak the UI language like the
 * zoom controls do — never hardcoded English labels. zh defines the key
 * set; every locale carries real ribbonOutlineView/ribbonOutlineViewTip
 * content.
 */

const locales = Object.keys(strings) as Array<keyof typeof strings>

describe('markdown outline view labels', () => {
  it.each(locales)('locale %s labels the outline view toggle', (locale) => {
    const table = strings[locale] as Record<string, unknown>
    for (const key of ['ribbonOutlineView', 'ribbonOutlineViewTip']) {
      expect(typeof table[key]).toBe('string')
      expect((table[key] as string).trim().length).toBeGreaterThan(0)
    }
  })
})
