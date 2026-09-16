// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState } from 'react'
import { useDocumentUpload } from './useDocumentUpload'
import { classifyFile } from '../core/media/classify'
import { useNoteAttachments } from './useNoteAttachments'

type PendingMediaType = 'video' | 'pdf' | 'image' | 'audio'

interface UseComposerArgs {
  noteId: string
  /** Append markdown to the note body (the composer's `setContent(prev => prev + md)`). */
  appendMarkdown: (md: string) => void
  /** Refocus the editor after an upload finishes. */
  focusTextarea?: () => void
  /** For unsaved notes: defer media registration until after the note is saved. */
  onRegisterPendingMedia?: (filename: string, type: PendingMediaType) => void
}

/**
 * Shared composer plumbing used by NoteCreator and the NoteItem/NoteModal edit
 * modes: image/video/audio/document attachment + mic recording, with the
 * `uploading`/`isRecording` state and the props for `<ComposerToolbar>`. Lifts
 * the orchestration that was previously copy-pasted across all three.
 */
export function useComposer({ noteId, appendMarkdown, focusTextarea, onRegisterPendingMedia }: UseComposerArgs) {
  const [uploading, setUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  const { handleDocumentUpload, handleDocumentPaste, handleDocumentPath } = useDocumentUpload({
    noteId,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => {
      setUploading(false)
      focusTextarea?.()
    },
    onInsertMarkdown: appendMarkdown,
    onRegisterPendingMedia,
  })

  const { handleFileUpload, handlePathUpload, handleImageUpload, handleVideoUpload, handleAudioUpload, handleAudioBlob } = useNoteAttachments({
    noteId,
    onUploadStart: () => setUploading(true),
    onUploadFinish: () => setUploading(false),
    onInsertMarkdown: appendMarkdown,
    onFocus: focusTextarea,
    onRegisterPendingMedia,
  })

  /**
   * A file dropped onto the editor. Only a path is available, which suits every
   * importer here — media is copied in by Rust, and the document pipeline is
   * path-based anyway, so a drop needs none of the byte-staging a paste does.
   * Unrecognized files are ignored rather than inserted as a path.
   */
  const handleDroppedPath = async (path: string) => {
    const kind = classifyFile(path)
    if (!kind) return
    if (kind === 'document') await handleDocumentPath(path)
    else await handlePathUpload(path, kind)
  }

  /** Props for `<ComposerToolbar>` — spread these and add `disabled` (with the caller's saving state). */
  const toolbarProps = {
    onInsertMarkdown: appendMarkdown,
    onImageUpload: handleImageUpload,
    // Bytes path, used by the editor's clipboard paste (the toolbar buttons
    // below open a native dialog and import by path instead).
    onFileUpload: handleFileUpload,
    onVideoUpload: () => void handleVideoUpload(),
    onAudioUpload: () => void handleAudioUpload(),
    onRecordAudio: (blob: Blob) => void handleAudioBlob(blob),
    onRecordingChange: setIsRecording,
    onDocumentUpload: handleDocumentUpload,
    // Same importer, reached from a clipboard paste instead of the dialog.
    onDocumentPaste: handleDocumentPaste,
    onDroppedPath: handleDroppedPath,
  }

  return { uploading, isRecording, toolbarProps }
}

/** The shape of `toolbarProps` — reused by the editor's right-click "Import"
 *  submenu, which is wired from a second `useComposer` instance whose inserts
 *  route to the click position instead of appending. */
export type ComposerToolbarProps = ReturnType<typeof useComposer>['toolbarProps']
