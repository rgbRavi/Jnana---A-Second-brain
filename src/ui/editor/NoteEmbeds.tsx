// Shared embed/token components, rendered identically by the read-mode
// renderer (MarkdownLite.tsx) and the live editor's inline widgets
// (LiveEditor.decorations.tsx) — one home so the two surfaces never drift
// visually. Behavior is otherwise unchanged from the original MarkdownLite.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import type { Note } from '../../types'
import { useNotesContext } from '../../context/NotesContext'
import { useTranscription } from '../../context/TranscriptionContext'
import { eventBus } from '../../lib/eventBus'
import { showConfirmDialog } from '../../lib/dialog'
import { highlightCode } from '../../core/markdown/highlight'
import { mediaLayoutStyle, type MediaLayout } from '../../core/mediaLayout'
import { AsyncImage } from '../AsyncImage'
import { AsyncVideo } from '../AsyncVideo'
import { AsyncAudio } from '../AsyncAudio'
import { AsyncYouTube } from '../AsyncYouTube'
import { PdfViewer } from '../media/PdfViewer'
import { PdfThumbnail } from '../media/PdfThumbnail'
import MdStyles from './MarkdownLite.module.css'

function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

export function VideoEmbed({
  url,
  videoIndex,
  lazy,
  layout,
}: {
  url: string
  videoIndex: number
  lazy: boolean
  layout?: MediaLayout
}) {
  const filename = url.replace('jnana-asset://', '')
  return (
    <div
      className={MdStyles.noteVideoWrapper}
      data-video-index={videoIndex}
      style={mediaLayoutStyle(layout)}
      onClick={(e) => e.stopPropagation()}
    >
      <AsyncVideo filename={filename} className={MdStyles.noteVideo} controls preload="metadata" lazy={lazy} />
    </div>
  )
}

export function AudioEmbed({
  url,
  audioIndex,
  noteId,
  lazy,
  layout,
}: {
  url: string
  audioIndex: number
  noteId: string
  lazy: boolean
  layout?: MediaLayout
}) {
  const filename = url.replace('jnana-asset://', '')
  const { notes } = useNotesContext()
  const { jobs, transcribe } = useTranscription()
  const busy = jobs.some((j) => j.filename === filename && j.status === 'running')
  const title = notes.find((n) => n.id === noteId)?.title?.trim() || 'Untitled'

  return (
    <div
      className={MdStyles.noteAudioWrapper}
      data-audio-index={audioIndex}
      style={mediaLayoutStyle(layout)}
      onClick={(e) => e.stopPropagation()}
    >
      <AsyncAudio filename={filename} className={MdStyles.noteAudio} controls preload="metadata" lazy={lazy} />
      {noteId && (
        <button
          className={MdStyles.noteAudioTranscribe}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            transcribe(noteId, title, filename)
          }}
          title="Transcribe this audio to text in the background"
        >
          {busy ? 'Transcribing…' : '📝 Transcribe'}
        </button>
      )}
    </div>
  )
}

export function YouTubeEmbed({ url, lazy, layout }: { url: string; lazy: boolean; layout?: MediaLayout }) {
  const videoId =
    url.match(/[?&]v=([a-zA-Z0-9_-]+)/)?.[1] ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!videoId) return null
  return (
    <div className={MdStyles.noteYoutubeWrapper} style={mediaLayoutStyle(layout)}>
      <AsyncYouTube videoId={videoId} className={MdStyles.noteYoutube} lazy={lazy} />
    </div>
  )
}

/** Always a small first-page thumbnail (cards and the modal's read view alike
 *  — a full multi-page viewer is too tall for a preview); click opens the
 *  full PdfViewer in a fullscreen overlay. Not part of the resizable-media
 *  layout system — its thumbnail size is intentionally fixed. */
export function PdfEmbed({ url, noteId }: { url: string; noteId: string }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const filename = url.replace('jnana-asset://', '')
  return (
    <>
      <span className={MdStyles.notePdfWrapper} onClick={(e) => e.stopPropagation()}>
        <PdfThumbnail filename={filename} onClick={() => setIsFullscreen(true)} />
      </span>
      {isFullscreen && createPortal(
        <div className={MdStyles.fullscreenOverlay} onClick={() => setIsFullscreen(false)}>
          <div className={MdStyles.fullscreenContent} onClick={(e) => e.stopPropagation()}>
            <button className={MdStyles.fullscreenClose} onClick={() => setIsFullscreen(false)}>✕</button>
            <PdfViewer filename={filename} noteId={noteId} />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function ImageEmbed({
  url,
  altText,
  lazy,
  fullscreen,
  layout,
}: {
  url: string
  altText: string
  lazy: boolean
  fullscreen: boolean
  layout?: MediaLayout
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const handleClick = fullscreen ? (e: React.MouseEvent) => { e.stopPropagation(); setIsFullscreen(true) } : undefined

  const imgEl = url.startsWith('jnana-asset://')
    ? <AsyncImage filename={url.replace('jnana-asset://', '')} alt={altText} className={MdStyles.noteImage} lazy={lazy} />
    : <img src={url} alt={altText} className={MdStyles.noteImage} />

  return (
    <>
      <span
        className={MdStyles.noteImageWrapper}
        onClick={handleClick}
        style={{ ...mediaLayoutStyle(layout), ...(fullscreen ? { cursor: 'zoom-in' } : undefined) }}
      >
        {imgEl}
      </span>
      {isFullscreen && createPortal(
        <div className={MdStyles.fullscreenOverlay} onClick={() => setIsFullscreen(false)}>
          <div className={MdStyles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button className={MdStyles.fullscreenClose} onClick={() => setIsFullscreen(false)}>✕</button>
            {url.startsWith('jnana-asset://')
              ? <AsyncImage filename={url.replace('jnana-asset://', '')} alt={altText} className={MdStyles.lightboxImage} lazy={false} />
              : <img src={url} alt={altText} className={MdStyles.lightboxImage} />
            }
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export function ExternalDocLink({ name, path }: { name: string; path: string }) {
  const displayName = name.replace(/^External:\s*/i, '')
  return (
    <div className={MdStyles.noteExternalDoc}>
      <span className={MdStyles.noteExternalDocIcon}>📄</span>
      <span className={MdStyles.noteExternalDocName}>{displayName}</span>
      <button
        className={MdStyles.noteExternalDocBtn}
        onClick={() => invoke('open_asset', { path }).catch(console.error)}
      >
        Open
      </button>
    </div>
  )
}

/** Fenced code block. Renders plain styled mono text today; `highlightCode`
 *  is the seam for lazily wiring up a real highlighter later (see core/markdown/highlight.ts). */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void highlightCode(code, lang).then((result) => {
      if (!cancelled) setHtml(result)
    })
    return () => {
      cancelled = true
    }
  }, [code, lang])

  return (
    <pre className={MdStyles.pre}>
      {html ? (
        <code className={MdStyles.code} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code className={MdStyles.code}>{code}</code>
      )}
    </pre>
  )
}

/** `allowNavigate` gates clicking through to the linked note (confirm dialog
 *  first) — false in contexts where navigating away doesn't make sense, e.g.
 *  an unsaved draft in NoteCreator. */
export function WikilinkButton({ title, notes, allowNavigate }: { title: string; notes: Note[]; allowNavigate: boolean }) {
  const foundNote = notes.find((n) => n.title.toLowerCase() === title.toLowerCase())
  return (
    <button
      className={foundNote ? MdStyles.wikilinkBtn : MdStyles.wikilinkBtnMissing}
      onClick={foundNote && allowNavigate ? async (e) => {
        e.stopPropagation()
        if (await showConfirmDialog({ title: 'Open linked note?', message: `Open “${foundNote.title}”?`, confirmLabel: 'Open note' })) {
          eventBus.emit('note:navigate', foundNote)
        }
      } : undefined}
      style={foundNote && !allowNavigate ? { cursor: 'default' } : undefined}
      title={foundNote ? foundNote.title : `Note not found: ${title}`}
    >
      {title}
    </button>
  )
}

export function TimestampButton({
  kind,
  index,
  time,
  onSeek,
}: {
  kind: 'video' | 'audio'
  index: number
  time: string
  onSeek: (kind: 'video' | 'audio', index: number, seconds: number) => void
}) {
  return (
    <button
      className={MdStyles.timestampBtn}
      onClick={() => onSeek(kind, index, timeStringToSeconds(time))}
      title={`Seek to ${time}`}
    >
      {time}
    </button>
  )
}
