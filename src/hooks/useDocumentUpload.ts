// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useDocumentUpload.ts
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { importMedia, convertToPdf, extractText, readTableFile, registerMediaRef, getAssetPath } from '../core/media'
import { parseCsv, serializeCsv, buildTableBlock } from '../core/table'
import { toast } from '../lib/toast'
import { showChoiceDialog } from '../lib/dialog'
import { log } from '../lib/logger'

// The inline table grid stays pleasant up to roughly this size; past it we warn
// in the import dialog (mirrors the grid's own caps in NoteEmbeds).
const TABLE_SOFT_ROWS = 50
const TABLE_SOFT_COLS = 20

interface UseDocumentUploadProps {
  noteId: string
  onUploadStart: () => void
  onUploadFinish: () => void
  onInsertMarkdown: (markdown: string) => void
  onRegisterPendingMedia?: (filename: string, type: 'video' | 'pdf') => void
}

export function useDocumentUpload({
  noteId,
  onUploadStart,
  onUploadFinish,
  onInsertMarkdown,
  onRegisterPendingMedia,
}: UseDocumentUploadProps) {
  const [uploading, setUploading] = useState(false)

  const handleDocumentUpload = async () => {
    try {
      onUploadStart()
      setUploading(true)
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Document', extensions: ['pdf', 'doc', 'docx', 'odt', 'csv', 'xlsx', 'xls'] }],
      })

      if (!selected || typeof selected !== 'string') return

      const ext = selected.split('.').pop()?.toLowerCase() || ''

      if (ext === 'pdf') {
        const filename = await importMedia(selected, noteId)
        if (onRegisterPendingMedia) {
          onRegisterPendingMedia(filename, 'pdf')
        } else {
          registerMediaRef(noteId, 'pdf', filename).catch((e) => log.error('registerMediaRef failed', e))
        }
        onInsertMarkdown(`\n\n![pdf](jnana-asset://${filename})`)
      } else if (['doc', 'docx', 'odt'].includes(ext)) {
        // Ask how to handle the document via an in-app modal.
        const choice = await showChoiceDialog({
          title: `Import ${ext.toUpperCase()} file`,
          message: 'How would you like to add this document to your note?',
          options: [
            { value: 'pdf', label: 'Convert to PDF', description: 'Best for highlighting & annotations', icon: '📄', primary: true },
            { value: 'text', label: 'Extract text into note', description: 'Insert the document’s plain text inline', icon: '📝' },
            { value: 'link', label: 'Link as external file', description: 'Opens in your default app', icon: '🔗' },
          ],
        })

        if (choice === 'pdf') {
          // Convert to PDF
          try {
            const tempPdfPath = await convertToPdf(selected)
            const filename = await importMedia(tempPdfPath, noteId)
            if (onRegisterPendingMedia) {
              onRegisterPendingMedia(filename, 'pdf')
            } else {
              registerMediaRef(noteId, 'pdf', filename).catch((e) => log.error('registerMediaRef failed', e))
            }
            onInsertMarkdown(`\n\n![pdf](jnana-asset://${filename})`)
          } catch (err) {
            toast.error(`PDF conversion failed: ${err}\n\nPlease ensure LibreOffice or Pandoc is installed.`)
          }
        } else if (choice === 'text') {
          // Extract Text
          try {
            const text = await extractText(selected)
            onInsertMarkdown(`\n${text}\n`)
          } catch (err) {
            toast.error(`Text extraction failed: ${err}\n\nPlease ensure Pandoc is installed.`)
          }
        } else if (choice === 'link') {
          // Copy file into Jnana's assets dir so it is always available,
          // then open it from there via the Tauri opener plugin.
          try {
            const originalName = selected.split(/[\\/]/).pop() || 'document'
            const filename = await importMedia(selected, noteId)
            // Register so the file is cleaned up when the note is deleted
            registerMediaRef(noteId, 'document', filename).catch((e) => log.error('registerMediaRef failed', e))
            const assetPath = await getAssetPath(filename)
            onInsertMarkdown(`\n[External: ${originalName}](external://${encodeURIComponent(assetPath)})\n`)
          } catch (err) {
            toast.error(`Failed to copy document: ${err}`)
          }
        }
      } else if (['csv', 'xlsx', 'xls'].includes(ext)) {
        // Spreadsheet/data files → either an editable table (parsed into a
        // `table` block) or an "open externally" chip (like a linked DOCX).
        // Read the data first (xlsx goes through a LibreOffice → CSV convert) so
        // the dialog can show the resulting table size; if that fails (e.g. no
        // LibreOffice), only the external-link option is offered.
        let rows: string[][] = []
        try {
          rows = parseCsv(await readTableFile(selected))
        } catch (e) {
          log.error('readTableFile failed', e)
        }
        const nRows = rows.length
        const nCols = rows[0]?.length ?? 0
        const canTable = nRows > 0
        const large = nRows > TABLE_SOFT_ROWS || nCols > TABLE_SOFT_COLS
        const sizeNote =
          `${nRows} row${nRows === 1 ? '' : 's'} × ${nCols} column${nCols === 1 ? '' : 's'}` +
          (large ? ' — large; may be slow to edit' : '')

        const choice = await showChoiceDialog({
          title: `Import ${ext.toUpperCase()} file`,
          message: 'How would you like to add this to your note?',
          options: [
            ...(canTable
              ? [{ value: 'table', label: 'Insert as editable table', description: sizeNote, icon: '▦', primary: true } as const]
              : []),
            { value: 'link', label: 'Link as external file', description: canTable ? 'Opens in your default app' : 'Opens in your default app (could not read it as a table)', icon: '🔗', primary: !canTable },
          ],
        })

        if (choice === 'table' && canTable) {
          // Never sacrifice the first data row to be the header — prepend an
          // empty header row and keep every imported row as data. (The blank
          // header can be filled in, or deleted to promote the real one.)
          const emptyHeader = Array(nCols).fill('')
          const block = buildTableBlock(serializeCsv([emptyHeader, ...rows]))
          onInsertMarkdown(`\n\n${block}\n\n`)
        } else if (choice === 'link') {
          try {
            const originalName = selected.split(/[\\/]/).pop() || `spreadsheet.${ext}`
            const filename = await importMedia(selected, noteId)
            registerMediaRef(noteId, 'document', filename).catch((e) => log.error('registerMediaRef failed', e))
            const assetPath = await getAssetPath(filename)
            onInsertMarkdown(`\n[External: ${originalName}](external://${encodeURIComponent(assetPath)})\n`)
          } catch (err) {
            toast.error(`Failed to import ${ext.toUpperCase()} file: ${err}`)
          }
        }
      }
    } catch (err) {
      toast.error('Failed to upload document: ' + String(err))
    } finally {
      setUploading(false)
      onUploadFinish()
    }
  }

  return { handleDocumentUpload, uploading }
}
