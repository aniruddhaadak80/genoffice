import { memo } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'
import { collectHeadings } from '../editor/headings'
import { useI18n } from '../i18n/locale'

/**
 * Docs outline sidebar for long documents (part of #336).
 * Mirrors the PDF OutlinePanel structure but sources entries from the
 * Tiptap heading outline via collectHeadings. Clicking an entry scrolls
 * the editor to that heading. Reuses the existing NavPane heading walk
 * so the panel stays in sync with the document without duplicating logic.
 */
export const OutlinePanel = memo(function OutlinePanel({
  editor,
  doc,
}: {
  editor: Editor
  doc: PmNode
}) {
  const { t } = useI18n()
  const headings = collectHeadings(doc)
  return (
    <aside className="docs-outline" aria-label="Document outline">
      <div className="docs-outline-title">{t('appNavTitle')}</div>
      <div className="docs-outline-list">
        {headings.map((h, i) => (
          <button
            key={`${h.pos}-${i}`}
            className={`docs-outline-item nav-l${Math.min(h.level, 4)}`}
            data-tip={h.text}
            style={{ paddingLeft: 12 + h.level * 12 }}
            onClick={() => {
              const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null
              dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {h.text}
          </button>
        ))}
        {headings.length === 0 && <div className="docs-outline-empty">{t('appNavNoHeadings')}</div>}
      </div>
    </aside>
  )
})
