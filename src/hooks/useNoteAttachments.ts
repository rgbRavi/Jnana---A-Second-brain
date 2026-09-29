// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { open } from '@tauri-apps/plugin-dialog'
import { importMedia, registerMediaRef } from '../core/media'
import { uploadAsset } from '../core/notes'
import { basenameOf, type MediaKind } from '../core/media/classify'
import { toast } from '../lib/toast'

/** A failed media_refs insert silently drops the note's has:* auto-tags — make
 *  it visible instead of swallowing it with a bare console.error. */
const registerFailed = (err: unknown) => {
  console.error('registerMediaRef failed:', err)
  toast.error(`Couldn't tag attached media: ${String(err)}`)
}

/** Re-exported so existing importers of this hook keep working; the source of
 *  truth is [core/media/classify.ts](../core/media/classify.ts). */
export type AttachmentKind = MediaKind

/** Fallback extension when a pasted file has no usable one in its name. */
const DEFAULT_EXT: Record<AttachmentKind, string> = {
  image: 'png',
  video: 'mp4',
  audio: 'webm',
  pdf: 'pdf',
}

/** The embed token for a stored asset. Only an image keeps the original
 *  filename as its alt text — the other three alts are what the renderers
 *  dispatch on (see remarkJnana / the live-editor decoration walk). */
const embedToken = (kind: AttachmentKind, filename: string, name: string) =>
  `\n\n![${kind === 'image' ? name : kind}](jnana-asset://${filename})`

interface UseNoteAttachmentsProps {
  noteId: string
  onUploadStart: () => void
  onUploadFinish: () => void
  onInsertMarkdown: (markdown: string) => void
  onFocus?: () => void
  onRegisterPendingMedia?: (filename: string, type: AttachmentKind) => void
}

export function useNoteAttachments({
  noteId,
  onUploadStart,
  onUploadFinish,
  onInsertMarkdown,
  onFocus,
  onRegisterPendingMedia,
}: UseNoteAttachmentsProps) {
  /**
   * Store an in-memory file (a clipboard paste, the toolbar's file input) as an
   * asset and embed it. This is the *bytes* path — a file picked through the
   * native dialog goes via `importMedia`, which takes an on-disk path instead.
   */
  const handleFileUpload = async (
    file: File | null | undefined,
    kind: AttachmentKind,
    clearInput?: () => void,
  ) => {
    if (!file) return

    onUploadStart()
    try {
      const arrayBuffer = await file.arrayBuffer()
      const extension = file.name.split('.').pop() || DEFAULT_EXT[kind]
      const filename = await uploadAsset(new Uint8Array(arrayBuffer), extension)

      if (onRegisterPendingMedia) {
        onRegisterPendingMedia(filename, kind)
      } else {
        registerMediaRef(noteId, kind, filename).catch(registerFailed)
      }

      onInsertMarkdown(embedToken(kind, filename, file.name))
    } catch (err) {
      console.error(`Failed to upload ${kind}:`, err)
      toast.error(`Failed to upload ${kind}: ` + String(err))
    } finally {
      clearInput?.()
      onUploadFinish()
      onFocus?.()
    }
  }

  const handleImageUpload = (file: File | null | undefined, clearInput?: () => void) =>
    handleFileUpload(file, 'image', clearInput)

  /**
   * Store a file that already exists on disk — one picked from the native
   * dialog, or dropped onto the editor — and embed it. Rust copies it into the
   * assets dir itself, so no bytes cross the webview (unlike `handleFileUpload`,
   * which is the only option for a clipboard paste).
   */
  const handlePathUpload = async (path: string, kind: MediaKind) => {
    onUploadStart()
    try {
      const filename = await importMedia(path, noteId)

      if (onRegisterPendingMedia) {
        onRegisterPendingMedia(filename, kind)
      } else {
        registerMediaRef(noteId, kind, filename).catch(registerFailed)
      }

      onInsertMarkdown(embedToken(kind, filename, basenameOf(path)))
    } catch (err) {
      console.error(`Failed to upload ${kind}:`, err)
      toast.error(`Failed to upload ${kind}: ` + String(err))
    } finally {
      onUploadFinish()
      onFocus?.()
    }
  }

  /** Pick a file of `kind` from the native dialog, then import it by path. */
  const pickAndUpload = async (kind: MediaKind, label: string, extensions: string[]) => {
    const selected = await open({ multiple: false, filters: [{ name: label, extensions }] })
    if (!selected || typeof selected !== 'string') return
    await handlePathUpload(selected, kind)
  }

  const handleVideoUpload = () =>
    pickAndUpload('video', 'Video', ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'])

  // Save a recording captured from the mic (a Blob, not a picked file). Mirrors
  // handleImageUpload's bytes path — no file dialog. Recordings are webm/opus.
  const handleAudioBlob = async (blob: Blob) => {
    onUploadStart()
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const filename = await uploadAsset(new Uint8Array(arrayBuffer), 'webm')

      if (onRegisterPendingMedia) {
        onRegisterPendingMedia(filename, 'audio')
      } else {
        registerMediaRef(noteId, 'audio', filename).catch(registerFailed)
      }

      onInsertMarkdown(`\n\n![audio](jnana-asset://${filename})`)
    } catch (err) {
      console.error('Failed to save recording:', err)
      toast.error('Failed to save recording: ' + String(err))
    } finally {
      onUploadFinish()
      onFocus?.()
    }
  }

  const handleAudioUpload = () =>
    pickAndUpload('audio', 'Audio', ['mp3', 'wav', 'm4a', 'aac', 'flac', 'oga', 'ogg', 'opus'])

  return { handleFileUpload, handlePathUpload, handleImageUpload, handleVideoUpload, handleAudioUpload, handleAudioBlob }
}
