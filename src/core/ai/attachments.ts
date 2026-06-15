// src/core/ai/attachments.ts
//
// Turning user-picked files into something the chat model can consume. We pick
// files via the native dialog, copy them into the assets dir (so they persist
// with the conversation), then resolve each to the right modality at send time:
//   image   → native vision block (base64) when the model supports vision
//   document→ extracted plain text (pandoc) — robust across every model
//   audio   → transcript (existing transcription backend)

import { open } from '@tauri-apps/plugin-dialog'
import { importFile, getAssetDataUrl, getLinks } from '../notes'
import { extractText, getAssetPath } from '../media'
import { transcribeAudio } from './rag'
import { isVisionModel } from './capabilities'
import type { ChatTurn } from './provider'
import type { Note } from '../../types'

export type AttachmentKind = 'image' | 'document' | 'audio' | 'other' | 'note'

/** Something attached to a chat message; persisted in the conversation for re-render.
 *  Files carry `filename`/`ext`/`mime`; Jnana notes carry `noteId` (+ thread opts). */
export interface ChatAttachment {
  /** Stable key — the asset filename for files, `note:<id>` for notes. */
  id: string
  kind: AttachmentKind
  /** Display name (file name or note title). */
  name: string
  // ── file attachments ──
  filename?: string
  ext?: string
  mime?: string
  // ── note attachments ──
  noteId?: string
  /** The note links to other notes (so a "thread" is available). */
  hasThread?: boolean
  /** How many notes are in the thread (direct links, both directions). */
  threadCount?: number
  /** Include the note's linked notes (its thread) when sending. */
  includeThread?: boolean
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
const DOC_EXTS = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'csv', 'pptx', 'ppt', 'epub']
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'webm']

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm',
}

const extOf = (p: string) => (p.split('.').pop() ?? '').toLowerCase()
const baseOf = (p: string) => p.split(/[\\/]/).pop() ?? p

function kindFor(ext: string): AttachmentKind {
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (AUDIO_EXTS.includes(ext)) return 'audio'
  if (DOC_EXTS.includes(ext)) return 'document'
  return 'other'
}

const mimeFor = (ext: string) => MIME[ext] ?? 'application/octet-stream'

/** Open the native file picker and import the chosen files into the assets dir. */
export async function pickAttachments(): Promise<ChatAttachment[]> {
  const selected = await open({
    multiple: true,
    filters: [
      { name: 'Documents', extensions: DOC_EXTS },
      { name: 'Images', extensions: IMAGE_EXTS },
      { name: 'Audio', extensions: AUDIO_EXTS },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (!selected) return []
  const paths = Array.isArray(selected) ? selected : [selected]

  const out: ChatAttachment[] = []
  for (const p of paths) {
    const filename = await importFile(p)
    const ext = extOf(p)
    out.push({ id: filename, filename, name: baseOf(p), ext, mime: mimeFor(ext), kind: kindFor(ext) })
  }
  return out
}

/** Build a note attachment, detecting whether the note has a thread (linked
 *  notes). When it does, the thread is included by default — attaching a note
 *  usually means "use this note and what it links to". Toggle it off per chip. */
export async function makeNoteAttachment(note: Note): Promise<ChatAttachment> {
  let threadCount = 0
  try {
    threadCount = (await getLinks(note.id)).length
  } catch {
    /* links unavailable — treat as no thread */
  }
  const hasThread = threadCount > 0
  return {
    id: `note:${note.id}`,
    kind: 'note',
    name: note.title?.trim() || 'Untitled',
    noteId: note.id,
    hasThread,
    threadCount,
    includeThread: hasThread,
  }
}

/**
 * Resolve a user message + its attachments into a chat turn for `model`:
 * images become vision blocks (when supported), documents/audio become text
 * folded into the message. Returns warnings for anything that couldn't be used.
 */
export async function buildUserTurn(
  text: string,
  attachments: ChatAttachment[],
  model: string,
  notes: Note[] = [],
): Promise<{ turn: ChatTurn; warnings: string[] }> {
  const images: string[] = []
  const warnings: string[] = []
  const vision = isVisionModel(model)
  let extra = ''

  for (const a of attachments) {
    try {
      if (a.kind === 'image' && a.filename) {
        if (vision) images.push(await getAssetDataUrl(a.filename, a.mime ?? 'image/png'))
        else warnings.push(`"${a.name}" is an image, but ${model || 'this model'} has no vision — skipped.`)
      } else if (a.kind === 'document' && a.filename) {
        const path = await getAssetPath(a.filename)
        const txt = (await extractText(path)).trim()
        extra += `\n\n--- Attached document: ${a.name} ---\n${txt || '(no extractable text)'}`
      } else if (a.kind === 'audio' && a.filename) {
        const txt = (await transcribeAudio(a.filename)).trim()
        extra += `\n\n--- Transcript of ${a.name} ---\n${txt || '(empty transcript)'}`
      } else if (a.kind === 'note' && a.noteId) {
        const note = notes.find((n) => n.id === a.noteId)
        if (!note) {
          warnings.push(`Note "${a.name}" wasn't found — skipped.`)
          continue
        }
        extra += `\n\n--- Note: ${note.title || 'Untitled'} ---\n${note.content.trim()}`
        if (a.includeThread) {
          const MAX_THREAD_NOTES = 20
          const MAX_LINKED_CHARS = 8000
          const linkedIds = (await getLinks(note.id)).slice(0, MAX_THREAD_NOTES)
          let folded = 0
          for (const id of linkedIds) {
            const linked = notes.find((n) => n.id === id)
            if (!linked) continue
            const body = linked.content.trim()
            const clipped = body.length > MAX_LINKED_CHARS ? `${body.slice(0, MAX_LINKED_CHARS)}…` : body
            extra += `\n\n--- Linked note: ${linked.title || 'Untitled'} ---\n${clipped}`
            folded++
          }
          if (folded === 0) {
            warnings.push(`"${a.name}" has no resolvable linked notes — sent the note alone.`)
          }
        }
      } else {
        warnings.push(`"${a.name}" isn't a supported attachment type — skipped.`)
      }
    } catch (e) {
      warnings.push(`Couldn't process "${a.name}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const turn: ChatTurn = {
    role: 'user',
    content: `${text}${extra}`.trim(),
    images: images.length ? images : undefined,
  }
  return { turn, warnings }
}
