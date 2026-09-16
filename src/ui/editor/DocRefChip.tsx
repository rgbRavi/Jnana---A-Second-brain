// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { eventBus } from '../../lib/eventBus'
import { nthPdfFilename } from '../../core/markdown/pdfRef'
import MdStyles from './MarkdownLite.module.css'

/** Inline `📄 p.N` chip for a `[D<n>::p<page>@x,y]` reference. Clicking opens
 *  the note's nth PDF at that page + point via the global pdf:open host. */
export function DocRefChip({
  pdfIndex, page, x, y, noteId, content,
}: {
  pdfIndex: number
  page: number
  x: number
  y: number
  noteId: string
  content: string
}) {
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const filename = nthPdfFilename(content, pdfIndex)
    if (!filename) return
    eventBus.emit('pdf:open', { filename, noteId, page, x, y })
  }
  return (
    <button type="button" className={MdStyles.docRefChip} onClick={onClick} title={`Jump to page ${page}`}>
      📄 p.{page}
    </button>
  )
}
