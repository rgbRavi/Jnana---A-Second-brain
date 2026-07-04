// src/hooks/useDocumentUpload.ts
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { importMedia, convertToPdf, extractText, registerMediaRef, getAssetPath } from '../core/media'
import { toast } from '../lib/toast'
import { showChoiceDialog } from '../lib/dialog'
import { log } from '../lib/logger'

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
        filters: [{ name: 'Document', extensions: ['pdf', 'doc', 'docx', 'odt'] }],
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
