import { useEffect, useRef, useState } from 'react'
import { VoiceRecorder, type VoiceRecorderHandle } from './VoiceRecorder'
import { toast } from '../../lib/toast'
import { showPromptDialog } from '../../lib/dialog'
import { eventBus } from '../../lib/eventBus'
import styles from './AddContentMenu.module.css'

interface Props {
  onInsertMarkdown: (markdown: string) => void
  onImageUpload: (file: File | undefined, onDone: () => void) => void
  onVideoUpload: () => void
  onAudioUpload: () => void
  onRecordAudio: (blob: Blob) => void
  onRecordingChange?: (recording: boolean) => void
  onDocumentUpload: () => void
  disabled: boolean
}

interface MenuItem {
  icon: string
  label: string
  run: () => void
}

/**
 * A single "+" Add-content button that opens a dropdown of attachment actions —
 * replacing the row of six icon buttons. Voice recording is triggered here but
 * its live ⏹/timer control renders inline (the recorder shows while recording).
 */
export function AddContentMenu({
  onInsertMarkdown,
  onImageUpload,
  onVideoUpload,
  onAudioUpload,
  onRecordAudio,
  onRecordingChange,
  onDocumentUpload,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<VoiceRecorderHandle>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Dashboard quick-actions: "Record audio" / "Import file" drive the composer.
  useEffect(() => {
    const onRecord = () => recorderRef.current?.start()
    const onImport = () => onDocumentUpload()
    eventBus.on('composer:record', onRecord)
    eventBus.on('composer:import', onImport)
    return () => {
      eventBus.off('composer:record', onRecord)
      eventBus.off('composer:import', onImport)
    }
  }, [onDocumentUpload])

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleYouTube = async () => {
    const url = await showPromptDialog({
      title: 'Embed YouTube video',
      message: 'Paste a YouTube link to embed the video in your note.',
      placeholder: 'https://youtube.com/watch?v=…',
      confirmLabel: 'Embed',
    })
    if (!url) return
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    const videoId = shortMatch?.[1] || watchMatch?.[1]
    if (!videoId) {
      toast.error('Could not extract a YouTube video ID from that URL.')
      return
    }
    onInsertMarkdown(`\n![youtube](https://youtube.com/watch?v=${videoId})\n`)
  }

  const handleWebpage = async () => {
    const raw = await showPromptDialog({
      title: 'Embed web page',
      message: 'Paste a link to embed it as a preview card in your note.',
      placeholder: 'https://example.com/article',
      confirmLabel: 'Embed',
    })
    if (!raw) return
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
    onInsertMarkdown(`\n![webpage](${url})\n`)
  }

  const items: MenuItem[] = [
    { icon: '📷', label: 'Image', run: () => fileInputRef.current?.click() },
    { icon: '🎬', label: 'Video', run: onVideoUpload },
    { icon: '🎵', label: 'Audio', run: onAudioUpload },
    { icon: '🎙️', label: 'Voice recording', run: () => recorderRef.current?.start() },
    { icon: '📄', label: 'Document / File', run: onDocumentUpload },
    { icon: '▶️', label: 'YouTube embed', run: () => void handleYouTube() },
    { icon: '🌐', label: 'Web page', run: () => void handleWebpage() },
  ]

  return (
    <div className={styles.wrap} ref={wrapRef}>
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

      {/* The live recording control (idle = hidden; recording = ⏹ + timer). */}
      <VoiceRecorder
        ref={recorderRef}
        hideIdleButton
        className={styles.recording}
        onRecorded={onRecordAudio}
        onRecordingChange={onRecordingChange}
        disabled={disabled}
      />

      <button
        type="button"
        className={`${styles.addBtn} ${open ? styles.addBtnOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add content"
      >
        +
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                setOpen(false)
                item.run()
              }}
            >
              <span className={styles.menuIcon} aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
