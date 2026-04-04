// src/hooks/useDocumentUpload.ts
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { importMedia, convertToPdf, extractText } from '../core/media'

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
        if (onRegisterPendingMedia) onRegisterPendingMedia(filename, 'pdf')
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
            if (onRegisterPendingMedia) onRegisterPendingMedia(filename, 'pdf')
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
          // External Link
          const filename = selected.split(/[\\/]/).pop() || 'document'
          onInsertMarkdown(`\n[External: ${filename}](external://${encodeURIComponent(selected)})\n`)
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
