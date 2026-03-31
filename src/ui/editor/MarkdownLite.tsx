import React, { useRef } from 'react'
import { AsyncImage } from '../AsyncImage'
import { VideoPlayer } from '../media/VideoPlayer'
import { AsyncYouTube } from '../AsyncYouTube'
type PlyrInstance = InstanceType<typeof import('plyr').default>

interface Props {
  content: string
  lazy?: boolean
}

// Helper function to extract YouTube video ID from various URL formats
function extractYouTubeId(url: string): string | null {
  try {
    // Handle youtu.be/ID format
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
    if (shortMatch) return shortMatch[1]

    // Handle youtube.com/watch?v=ID format
    const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
    if (watchMatch) return watchMatch[1]

    // Handle direct video ID (already extracted)
    if (/^[a-zA-Z0-9_-]+$/.test(url) && url.length === 11) {
      return url
    }
  } catch (e) {
    console.error('Error extracting YouTube ID:', e)
  }
  return null
}

// Helper function to convert HH:MM:SS or MM:SS string to seconds
function timeStringToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1]
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

export function MarkdownLite({ content, lazy = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Map from video index → Plyr instance, populated via onReady callbacks
  const playerRefs = useRef<Map<number, PlyrInstance>>(new Map())

  // Regex to match markdown images: ![alt text](url)
  const imageRegex = /!\[([^\]]*)\]\((.*?)\)/g
  // Regex to match timestamp with video index: [V1::01:02:03]
  const timestampWithIndexRegex = /\[V(\d+)::(\d{2}:\d{2}:\d{2})\]/g
  // Regex to match simple timestamp: [01:02:03] or [01:02]
  const simpleTimestampRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g

  // Track video count during rendering
  let videoCount = 0

  // For rendering, we need to split content by both images and timestamps
  const renderContent = () => {
    const elements: React.ReactNode[] = []
    let lastIndex = 0

    // First pass: handle all markdown images and videos
    let match: RegExpExecArray | null

    // Reset regex lastIndex
    imageRegex.lastIndex = 0

    const imageMatches: Array<{
      index: number
      endIndex: number
      altText: string
      url: string
      isVideo: boolean
      isYouTube: boolean
      youtubeId?: string
    }> = []

    // Find all image matches (regular images, videos, and YouTube)
    while ((match = imageRegex.exec(content)) !== null) {
      const altText = match[1]
      const url = match[2]
      const isVideo = altText === 'video'
      const isYouTube = altText === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')
      const youtubeId = isYouTube ? extractYouTubeId(url) ?? undefined : undefined

      imageMatches.push({
        index: match.index,
        endIndex: imageRegex.lastIndex,
        altText,
        url,
        isVideo,
        isYouTube: isYouTube && youtubeId !== null,
        youtubeId,
      })
    }

    // Process images and videos first
    for (const imgMatch of imageMatches) {
      const textBefore = content.substring(lastIndex, imgMatch.index)

      // Process timestamps in text before image
      if (textBefore) {
        elements.push(renderTextWithTimestamps(textBefore, lastIndex))
      }

      const { altText, url, isVideo, isYouTube, youtubeId } = imgMatch

      if (isYouTube && youtubeId) {
        elements.push(
          <div key={`youtube-${imgMatch.index}`} className="note-youtube-wrapper">
            <AsyncYouTube
              videoId={youtubeId}
              title={altText || 'YouTube Video'}
              className="note-youtube"
              lazy={lazy}
            />
          </div>
        )
      } else if (isVideo) {
        const filename = url.startsWith('jnana-asset://') ? url.replace('jnana-asset://', '') : url
        const currentVideoIndex = videoCount
        videoCount++

        elements.push(
          <div key={`video-${imgMatch.index}`} className="note-video-wrapper">
            <VideoPlayer
              filename={filename}
              className="note-video"
              lazy={lazy}
              onReady={(player) => {
                playerRefs.current.set(currentVideoIndex, player)
              }}
            />
          </div>
        )
      } else if (url.startsWith('jnana-asset://')) {
        const filename = url.replace('jnana-asset://', '')
        elements.push(
          <span key={`img-${imgMatch.index}`} className="note-image-wrapper">
            <AsyncImage filename={filename} alt={altText} className="note-image" lazy={lazy} />
          </span>
        )
      } else {
        elements.push(
          <span key={`img-${imgMatch.index}`} className="note-image-wrapper">
            <img src={url} alt={altText} className="note-image" />
          </span>
        )
      }

      lastIndex = imgMatch.endIndex
    }

    // Process remaining text with timestamps
    const textAfter = content.substring(lastIndex)
    if (textAfter) {
      elements.push(renderTextWithTimestamps(textAfter, lastIndex))
    }

    return elements
  }

  const renderTextWithTimestamps = (text: string, offset: number): React.ReactNode => {
    const elements: React.ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    // Collect all timestamp matches
    const allMatches: Array<{
      index: number
      endIndex: number
      type: 'indexed' | 'simple'
      videoIndex?: number
      time: string
    }> = []

    // Find indexed timestamps [V1::01:02:03]
    timestampWithIndexRegex.lastIndex = 0
    while ((match = timestampWithIndexRegex.exec(text)) !== null) {
      allMatches.push({
        index: match.index,
        endIndex: timestampWithIndexRegex.lastIndex,
        type: 'indexed',
        videoIndex: parseInt(match[1], 10),
        time: match[2],
      })
    }

    // Find simple timestamps [01:02:03] or [01:02]
    simpleTimestampRegex.lastIndex = 0
    while ((match = simpleTimestampRegex.exec(text)) !== null) {
      allMatches.push({
        index: match.index,
        endIndex: simpleTimestampRegex.lastIndex,
        type: 'simple',
        time: match[1],
      })
    }

    // Sort matches by index
    allMatches.sort((a, b) => a.index - b.index)

    // Render text segments and timestamp buttons
    for (const ts of allMatches) {
      const textBefore = text.substring(lastIndex, ts.index)
      if (textBefore) {
        elements.push(
          <span key={`text-${offset + lastIndex}`}>{textBefore}</span>
        )
      }

      const seconds = timeStringToSeconds(ts.time)
      const videoIndex = ts.type === 'indexed' && ts.videoIndex !== undefined ? ts.videoIndex : 0

      elements.push(
        <button
          key={`timestamp-${offset + ts.index}`}
          className="timestamp-btn"
          onClick={() => handleTimestampClick(videoIndex, seconds)}
          title={`Seek to ${ts.time}`}
        >
          {ts.time}
        </button>
      )

      lastIndex = ts.endIndex
    }

    const textAfterTimestamps = text.substring(lastIndex)
    if (textAfterTimestamps) {
      elements.push(
        <span key={`text-final-${offset + lastIndex}`}>
          {textAfterTimestamps}
        </span>
      )
    }

    return elements.length > 0 ? (
      <span key={`text-group-${offset}`}>{elements}</span>
    ) : null
  }

  const handleTimestampClick = (videoIndex: number, seconds: number) => {
    const player = playerRefs.current.get(videoIndex)
    if (player) {
      player.currentTime = seconds
      player.play()
    }
  }

  return <div ref={containerRef}>{renderContent()}</div>
}
