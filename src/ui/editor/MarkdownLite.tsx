import React, { useRef } from 'react'
import { openPath } from '@tauri-apps/plugin-opener'
import { AsyncImage } from '../AsyncImage'
import { AsyncVideo } from '../AsyncVideo'
import { AsyncYouTube } from '../AsyncYouTube'
import { PdfViewer } from '../media/PdfViewer'
import MdStyles from './MarkdownLite.module.css'

interface Props {
  content: string
  noteId?: string
  lazy?: boolean
}

// ── Private embed components ──────────────────────────────────────────────────

function VideoEmbed({ url, videoIndex, lazy }: { url: string; videoIndex: number; lazy: boolean }) {
  const filename = url.replace('jnana-asset://', '')
  return (
    <div className={MdStyles.noteVideoWrapper} data-video-index={videoIndex}>
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

function PdfEmbed({ url, noteId }: { url: string; noteId: string }) {
  const filename = url.replace('jnana-asset://', '')
  return (
    <div className={MdStyles.notePdfWrapper}>
      <PdfViewer filename={filename} noteId={noteId} />
    </div>
  )
}

function ImageEmbed({ url, altText, lazy }: { url: string; altText: string; lazy: boolean }) {
  if (url.startsWith('jnana-asset://')) {
    const filename = url.replace('jnana-asset://', '')
    return (
      <span className={MdStyles.noteImageWrapper}>
        <AsyncImage filename={filename} alt={altText} className={MdStyles.noteImage} lazy={lazy} />
      </span>
    )
  }
  return (
    <span className={MdStyles.noteImageWrapper}>
      <img src={url} alt={altText} className={MdStyles.noteImage} />
    </span>
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

export function MarkdownLite({ content, noteId = '', lazy = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

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
          elements.push(<PdfEmbed key={key} url={url} noteId={noteId} />)
        } else {
          elements.push(<ImageEmbed key={key} url={url} altText={altText} lazy={lazy} />)
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

    const allMatches: Array<{ index: number; endIndex: number; type: 'indexed' | 'simple'; videoIndex?: number; time: string }> = []

    timestampWithIndexRegex.lastIndex = 0
    while ((match = timestampWithIndexRegex.exec(text)) !== null) {
      allMatches.push({ index: match.index, endIndex: timestampWithIndexRegex.lastIndex, type: 'indexed', videoIndex: parseInt(match[1], 10), time: match[2] })
    }

    simpleTimestampRegex.lastIndex = 0
    while ((match = simpleTimestampRegex.exec(text)) !== null) {
      allMatches.push({ index: match.index, endIndex: simpleTimestampRegex.lastIndex, type: 'simple', time: match[1] })
    }

    allMatches.sort((a, b) => a.index - b.index)

    for (const ts of allMatches) {
      const textBefore = text.substring(lastIndex, ts.index)
      if (textBefore) elements.push(<span key={`text-${offset + lastIndex}`}>{textBefore}</span>)

      const seconds = timeStringToSeconds(ts.time)
      const videoIndex = ts.type === 'indexed' && ts.videoIndex !== undefined ? ts.videoIndex : 0

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

  return <div ref={containerRef}>{renderContent()}</div>
}
