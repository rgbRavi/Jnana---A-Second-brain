import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { openPath } from '@tauri-apps/plugin-opener'
import { useNotesContext } from '../../context/NotesContext'
import { eventBus } from '../../lib/eventBus'
import { AsyncImage } from '../AsyncImage'
import { AsyncVideo } from '../AsyncVideo'
import { AsyncYouTube } from '../AsyncYouTube'
import { PdfViewer } from '../media/PdfViewer'
import MdStyles from './MarkdownLite.module.css'

interface Props {
  content: string
  noteId?: string
  lazy?: boolean
  /** Enables fullscreen expand for PDF and image embeds (use in modal context) */
  fullscreen?: boolean
}

// ── Private embed components ──────────────────────────────────────────────────

function VideoEmbed({ url, videoIndex, lazy }: { url: string; videoIndex: number; lazy: boolean }) {
  const filename = url.replace('jnana-asset://', '')
  return (
    <div
      className={MdStyles.noteVideoWrapper}
      data-video-index={videoIndex}
      onClick={(e) => e.stopPropagation()}
    >
      <AsyncVideo filename={filename} className={MdStyles.noteVideo} controls preload="metadata" lazy={lazy} />
    </div>
  )
}

function YouTubeEmbed({ url, lazy }: { url: string; lazy: boolean }) {
  const videoId =
    url.match(/[?&]v=([a-zA-Z0-9_-]+)/)?.[1] ||
    url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!videoId) return null
  return (
    <div className={MdStyles.noteYoutubeWrapper}>
      <AsyncYouTube videoId={videoId} className={MdStyles.noteYoutube} lazy={lazy} />
    </div>
  )
}

function PdfEmbed({ url, noteId, fullscreen }: { url: string; noteId: string; fullscreen: boolean }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const filename = url.replace('jnana-asset://', '')
  return (
    <>
      <div className={MdStyles.notePdfWrapper}>
        {fullscreen && (
          <button
            className={MdStyles.pdfExpandBtn}
            onClick={(e) => { e.stopPropagation(); setIsFullscreen(true) }}
            title="View full screen"
          >
            ⛶ Full screen
          </button>
        )}
        <PdfViewer filename={filename} noteId={noteId} />
      </div>
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

function ImageEmbed({ url, altText, lazy, fullscreen }: { url: string; altText: string; lazy: boolean; fullscreen: boolean }) {
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
        style={fullscreen ? { cursor: 'zoom-in' } : undefined}
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

function ExternalDocLink({ name, path }: { name: string; path: string }) {
  const displayName = name.replace(/^External:\s*/i, '')
  return (
    <div className={MdStyles.noteExternalDoc}>
      <span className={MdStyles.noteExternalDocIcon}>📄</span>
      <span className={MdStyles.noteExternalDocName}>{displayName}</span>
      <button
        className={MdStyles.noteExternalDocBtn}
        onClick={() => openPath(path).catch(console.error)}
      >
        Open
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarkdownLite({ content, noteId = '', lazy = true, fullscreen = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { notes } = useNotesContext()

  const wikilinkRegex = /\[\[(.*?)\]\]/g
  const imageRegex = /!\[([^\]]*)\]\((.*?)\)/g
  const externalLinkRegex = /\[([^\]]+)\]\((external:\/\/[^)]+)\)/g
  const timestampWithIndexRegex = /\[V(\d+)::(\d{2}:\d{2}:\d{2})\]/g
  const simpleTimestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g

  let videoCount = 0

  const renderContent = () => {
    const elements: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    type EmbedMatch =
      | { kind: 'image'; index: number; endIndex: number; altText: string; url: string }
      | { kind: 'external'; index: number; endIndex: number; name: string; path: string }

    const allMatches: EmbedMatch[] = []

    imageRegex.lastIndex = 0
    while ((match = imageRegex.exec(content)) !== null) {
      allMatches.push({ kind: 'image', index: match.index, endIndex: imageRegex.lastIndex, altText: match[1], url: match[2] })
    }

    externalLinkRegex.lastIndex = 0
    while ((match = externalLinkRegex.exec(content)) !== null) {
      allMatches.push({
        kind: 'external',
        index: match.index,
        endIndex: externalLinkRegex.lastIndex,
        name: match[1],
        path: decodeURIComponent(match[2].replace('external://', '')),
      })
    }

    allMatches.sort((a, b) => a.index - b.index)

    for (const m of allMatches) {
      const textBefore = content.substring(lastIndex, m.index)
      if (textBefore) elements.push(renderTextWithTimestamps(textBefore, lastIndex))

      if (m.kind === 'external') {
        elements.push(<ExternalDocLink key={`ext-${m.index}`} name={m.name} path={m.path} />)
      } else {
        const { altText, url } = m
        const key = `embed-${m.index}`

        if (altText === 'video') {
          elements.push(<VideoEmbed key={key} url={url} videoIndex={videoCount++} lazy={lazy} />)
        } else if (altText === 'youtube') {
          elements.push(<YouTubeEmbed key={key} url={url} lazy={lazy} />)
        } else if (altText === 'pdf') {
          elements.push(<PdfEmbed key={key} url={url} noteId={noteId} fullscreen={fullscreen} />)
        } else {
          elements.push(<ImageEmbed key={key} url={url} altText={altText} lazy={lazy} fullscreen={fullscreen} />)
        }
      }

      lastIndex = m.endIndex
    }

    const textAfter = content.substring(lastIndex)
    if (textAfter) elements.push(renderTextWithTimestamps(textAfter, lastIndex))

    return elements
  }

  const renderTextWithTimestamps = (text: string, offset: number): React.ReactNode => {
    const elements: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    type InlineMatch =
      | { index: number; endIndex: number; type: 'indexed'; videoIndex: number; time: string }
      | { index: number; endIndex: number; type: 'simple'; time: string }
      | { index: number; endIndex: number; type: 'wikilink'; title: string }

    const allMatches: InlineMatch[] = []

    timestampWithIndexRegex.lastIndex = 0
    while ((match = timestampWithIndexRegex.exec(text)) !== null) {
      allMatches.push({ index: match.index, endIndex: timestampWithIndexRegex.lastIndex, type: 'indexed', videoIndex: parseInt(match[1], 10), time: match[2] })
    }

    simpleTimestampRegex.lastIndex = 0
    while ((match = simpleTimestampRegex.exec(text)) !== null) {
      allMatches.push({ index: match.index, endIndex: simpleTimestampRegex.lastIndex, type: 'simple', time: match[1] })
    }

    wikilinkRegex.lastIndex = 0
    while ((match = wikilinkRegex.exec(text)) !== null) {
      if (match[1].trim()) {
        allMatches.push({ index: match.index, endIndex: wikilinkRegex.lastIndex, type: 'wikilink', title: match[1].trim() })
      }
    }

    allMatches.sort((a, b) => a.index - b.index)

    for (const ts of allMatches) {
      const textBefore = text.substring(lastIndex, ts.index)
      if (textBefore) elements.push(<span key={`text-${offset + lastIndex}`}>{textBefore}</span>)

      if (ts.type === 'wikilink') {
        const foundNote = notes.find(n => n.title.toLowerCase() === ts.title.toLowerCase())
        elements.push(
          <button
            key={`wl-${offset + ts.index}`}
            className={foundNote ? MdStyles.wikilinkBtn : MdStyles.wikilinkBtnMissing}
            onClick={foundNote && fullscreen ? (e) => {
              e.stopPropagation()
              if (window.confirm(`Open note "${foundNote.title}"?`)) {
                eventBus.emit('note:navigate', foundNote)
              }
            } : undefined}
            style={foundNote && !fullscreen ? { cursor: 'default' } : undefined}
            title={foundNote ? foundNote.title : `Note not found: ${ts.title}`}
          >
            {ts.title}
          </button>
        )
      } else {
        const seconds = timeStringToSeconds(ts.time)
        const videoIndex = ts.type === 'indexed' ? ts.videoIndex : 0
        elements.push(
          <button
            key={`ts-${offset + ts.index}`}
            className={MdStyles.timestampBtn}
            onClick={() => handleTimestampClick(videoIndex, seconds)}
            title={`Seek to ${ts.time}`}
          >
            {ts.time}
          </button>
        )
      }
      lastIndex = ts.endIndex
    }

    const remaining = text.substring(lastIndex)
    if (remaining) elements.push(<span key={`text-final-${offset + lastIndex}`}>{remaining}</span>)

    return elements.length > 0 ? <span key={`text-group-${offset}`}>{elements}</span> : null
  }

  const handleTimestampClick = (videoIndex: number, seconds: number) => {
    if (!containerRef.current) return
    const wrapper = containerRef.current.querySelector(`[data-video-index="${videoIndex}"]`) as HTMLElement | null
    if (!wrapper) return
    const video = wrapper.querySelector('video') as HTMLVideoElement | null
    if (!video) return
    video.currentTime = seconds
    video.play()
    video.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return <div ref={containerRef} className={MdStyles.root}>{renderContent()}</div>
}
