import { open } from '@tauri-apps/plugin-dialog'
import { importMedia, registerMediaRef } from '../core/media'
import { uploadAsset } from '../core/notes'

interface UseNoteAttachmentsProps {
  noteId: string
  onUploadStart: () => void
  onUploadFinish: () => void
  onInsertMarkdown: (markdown: string) => void
  onFocus?: () => void
  onRegisterPendingMedia?: (filename: string, type: 'video' | 'pdf') => void
}

export function useNoteAttachments({
  noteId,
  onUploadStart,
  onUploadFinish,
  onInsertMarkdown,
  onFocus,
  onRegisterPendingMedia,
}: UseNoteAttachmentsProps) {
  const handleImageUpload = async (
    file: File | null | undefined,
    clearInput?: () => void,
  ) => {
    if (!file) return

    onUploadStart()
    try {
      const arrayBuffer = await file.arrayBuffer()
      const extension = file.name.split('.').pop() || 'png'
      const assetUrl = await uploadAsset(new Uint8Array(arrayBuffer), extension)
      onInsertMarkdown(`\n![${file.name}](${assetUrl})\n`)
    } catch (err) {
      console.error('Failed to upload image:', err)
      alert('Failed to upload image: ' + String(err))
    } finally {
      clearInput?.()
      onUploadFinish()
      onFocus?.()
    }
  }

  const handleVideoUpload = async () => {
    onUploadStart()
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] }],
      })

      if (!selected || typeof selected !== 'string') return

      const filename = await importMedia(selected, noteId)

      if (onRegisterPendingMedia) {
        onRegisterPendingMedia(filename, 'video')
      } else {
        registerMediaRef(noteId, 'video', filename).catch(console.error)
      }

      onInsertMarkdown(`\n![video](jnana-asset://${filename})\n`)
    } catch (err) {
      console.error('Failed to upload video:', err)
      alert('Failed to upload video: ' + String(err))
    } finally {
      onUploadFinish()
      onFocus?.()
    }
  }

  return { handleImageUpload, handleVideoUpload }
}
