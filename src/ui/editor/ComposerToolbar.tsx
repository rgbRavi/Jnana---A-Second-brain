import { useRef } from 'react'
import Styles from './NoteCreator.module.css'

interface Props {
  onInsertMarkdown: (markdown: string) => void
  onImageUpload: (file: File | undefined, onDone: () => void) => void
  onVideoUpload: () => void
  onDocumentUpload: () => void
  disabled: boolean
}

export function ComposerToolbar({
  onInsertMarkdown,
  onImageUpload,
  onVideoUpload,
  onDocumentUpload,
  disabled,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleYouTubeEmbed = () => {
    const url = window.prompt('Paste a YouTube URL:')
    if (!url) return
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    const videoId = shortMatch?.[1] || watchMatch?.[1]
    if (!videoId) { alert('Could not extract a YouTube video ID from that URL.'); return }
    onInsertMarkdown(`\n![youtube](https://youtube.com/watch?v=${videoId})\n`)
  }

  return (
    <>
      <input
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={(e) =>
          onImageUpload(e.target.files?.[0], () => {
            if (fileInputRef.current) fileInputRef.current.value = ''
          })
        }
      />
      <button
        className={Styles.composerIconBtn}
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Attach Image"
      >📷</button>
      <button
        className={Styles.composerIconBtn}
        onClick={onVideoUpload}
        disabled={disabled}
        title="Attach Video"
      >🎬</button>
      <button
        className={Styles.composerIconBtn}
        onClick={onDocumentUpload}
        disabled={disabled}
        title="Attach Document"
      >📄</button>
      <button
        className={Styles.composerIconBtn}
        onClick={handleYouTubeEmbed}
        disabled={disabled}
        title="Embed YouTube"
      >▶️</button>
    </>
  )
}
