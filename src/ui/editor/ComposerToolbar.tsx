// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useRef } from 'react'
import { VoiceRecorder } from './VoiceRecorder'
import { toast } from '../../lib/toast'
import { showPromptDialog } from '../../lib/dialog'
import { Image, Film, Headphones, FileText, Play } from 'lucide-react'
import Styles from './FormatToolbar.module.css'

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

export function ComposerToolbar({
  onInsertMarkdown,
  onImageUpload,
  onVideoUpload,
  onAudioUpload,
  onRecordAudio,
  onRecordingChange,
  onDocumentUpload,
  disabled,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleYouTubeEmbed = async () => {
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
    if (!videoId) { toast.error('Could not extract a YouTube video ID from that URL.'); return }
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
        className={Styles.btn}
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        title="Attach Image"
      ><Image size={18} /></button>
      <button
        className={Styles.btn}
        onClick={onVideoUpload}
        disabled={disabled}
        title="Attach Video"
      ><Film size={18} /></button>
      <button
        className={Styles.btn}
        onClick={onAudioUpload}
        disabled={disabled}
        title="Attach Audio"
      ><Headphones size={18} /></button>
      <VoiceRecorder
        className={Styles.btn}
        onRecorded={onRecordAudio}
        onRecordingChange={onRecordingChange}
        disabled={disabled}
      />
      <button
        className={Styles.btn}
        onClick={onDocumentUpload}
        disabled={disabled}
        title="Attach Document"
      ><FileText size={18} /></button>
      <button
        className={Styles.btn}
        onClick={handleYouTubeEmbed}
        disabled={disabled}
        title="Embed YouTube"
      ><Play size={18} /></button>
    </>
  )
}
