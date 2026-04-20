// src/hooks/useDocumentUpload.ts
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { importMedia, convertToPdf, extractText, registerMediaRef, getAssetPath } from '../core/media'

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
          registerMediaRef(noteId, 'pdf', filename).catch(console.error)
        }
        onInsertMarkdown(`\n![pdf](jnana-asset://${filename})\n`)
      } else if (['doc', 'docx', 'odt'].includes(ext)) {
        // Prompt user for handling option
        const choice = window.prompt(
          `How would you like to handle this ${ext.toUpperCase()} file?\n\n` +
          `1: Convert to PDF (Best for Annotations)\n` +
          `2: Extract plain text to note\n` +
          `3: Link as external file (Open in default app)\n\n` +
          `Enter 1, 2, or 3:`,
          "1"
        )

        if (choice === '1') {
          // Convert to PDF
          try {
            const tempPdfPath = await convertToPdf(selected)
            const filename = await importMedia(tempPdfPath, noteId)
            if (onRegisterPendingMedia) {
              onRegisterPendingMedia(filename, 'pdf')
            } else {
              registerMediaRef(noteId, 'pdf', filename).catch(console.error)
            }
            onInsertMarkdown(`\n![pdf](jnana-asset://${filename})\n`)
          } catch (err) {
            alert(`PDF conversion failed: ${err}\n\nPlease ensure LibreOffice or Pandoc is installed.`)
          }
        } else if (choice === '2') {
          // Extract Text
          try {
            const text = await extractText(selected)
            onInsertMarkdown(`\n${text}\n`)
          } catch (err) {
            alert(`Text extraction failed: ${err}\n\nPlease ensure Pandoc is installed.`)
          }
        } else if (choice === '3') {
          // Copy file into Jnana's assets dir so it is always available,
          // then open it from there via the Tauri opener plugin.
          try {
            const originalName = selected.split(/[\\/]/).pop() || 'document'
            const filename = await importMedia(selected, noteId)
            // Register so the file is cleaned up when the note is deleted
            registerMediaRef(noteId, 'document', filename).catch(console.error)
            const assetPath = await getAssetPath(filename)
            onInsertMarkdown(`\n[External: ${originalName}](external://${encodeURIComponent(assetPath)})\n`)
          } catch (err) {
            alert(`Failed to copy document: ${err}`)
          }
        }
      }
    } catch (err) {
      alert('Failed to upload document: ' + String(err))
    } finally {
      setUploading(false)
      onUploadFinish()
    }
  }

  return { handleDocumentUpload, uploading }
}
