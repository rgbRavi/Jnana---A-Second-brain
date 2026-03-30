import React from 'react'
import { AsyncImage } from '../AsyncImage'

interface Props {
  content: string
}

export function MarkdownLite({ content }: Props) {
  // Regex to match markdown images: ![alt text](url)
  const imageRegex = /!\[([^\]]*)\]\((.*?)\)/g

  const elements: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = imageRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index)
    if (textBefore) {
      elements.push(<span key={`text-${lastIndex}`}>{textBefore}</span>)
    }

    const altText = match[1]
    const url = match[2]

    if (url.startsWith('jnana-asset://')) {
      const filename = url.replace('jnana-asset://', '')
      elements.push(
        <span key={`img-${match.index}`} className="note-image-wrapper">
          <AsyncImage filename={filename} alt={altText} className="note-image" />
        </span>
      )
    } else {
      elements.push(
        <span key={`img-${match.index}`} className="note-image-wrapper">
          <img src={url} alt={altText} className="note-image" />
        </span>
      )
    }

    lastIndex = imageRegex.lastIndex
  }

  const textAfter = content.substring(lastIndex)
  if (textAfter) {
    elements.push(<span key={`text-${lastIndex}`}>{textAfter}</span>)
  }

  return <>{elements}</>
}
