import { describe, expect, it } from 'vitest'

import { buildHeaderFooterXml } from '@genoffice/xlsx-gateway/gateway/xlsx-page-setup'

describe('page-setup header amp', () => {
  it('doubles a literal ampersand so R&D stays literal', () => {
    expect(buildHeaderFooterXml({ center: 'R&D' }, null)).toBe(
      '<headerFooter><oddHeader>&amp;CR&amp;&amp;D</oddHeader></headerFooter>',
    )
  })
})
