import { useState, useEffect } from 'react'
import { getAssetBlob } from '../core/notes'

interface Props {
  filename: string
  alt?: string
  className?: string
}

export function AsyncImage({ filename, alt, className }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null

    getAssetBlob(filename)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch((err) => {
        console.error('Failed to load image asset:', err)
      })

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [filename])

  if (!src) return <span className="image-loading">Loading image...</span>

  return <img src={src} alt={alt || 'Note attachment'} className={className} />
}
