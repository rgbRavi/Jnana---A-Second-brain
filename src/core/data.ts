import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { Note } from '../types'
import { eventBus } from '../lib/eventBus'
import { log } from '../lib/logger'
import { importMedia, registerMediaRef } from './media'
import { saveNote } from './notes'
import { inferTags } from './tags'

// ─── Storage statistics ─────────────────────────────────────────────────────

export interface StorageStats {
  noteCount: number
  conversationCount: number
  assetCount: number
  assetBytes: number
  dbBytes: number
}

export function getStorageStats(): Promise<StorageStats> {
  return invoke<StorageStats>('get_storage_stats')
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

// ─── Export ─────────────────────────────────────────────────────────────────

/** Copy all managed assets into a chosen folder's `assets/`. Returns count or null (cancelled). */
export async function exportAssets(): Promise<number | null> {
  const dir = await open({ directory: true, multiple: false, title: 'Choose a folder for assets' })
  if (!dir || typeof dir !== 'string') return null
  return invoke<number>('export_assets', { dir })
}

/** Write a full-vault backup .zip (DB + assets) into a chosen folder. Returns the path or null. */
export async function exportFullVault(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title: 'Choose a folder for the vault backup' })
  if (!dir || typeof dir !== 'string') return null
  return invoke<string>('create_backup', { destDir: dir })
}

// ─── Backup / restore ─────────────────────────────────────────────────────--

/** Create a backup in the app's default backups folder. Returns the file path. */
export async function createBackup(): Promise<string> {
  const path = await invoke<string>('create_backup', { destDir: null })
  log.info('Backup created', path)
  return path
}

/** Pick a backup .zip and stage it for restore (applied on next launch). */
export async function restoreBackup(): Promise<boolean> {
  const file = await open({
    multiple: false,
    title: 'Choose a backup .zip',
    filters: [{ name: 'Backup', extensions: ['zip'] }],
  })
  if (!file || typeof file !== 'string') return false
  await invoke('restore_backup', { zipPath: file })
  log.info('Backup staged for restore', file)
  return true
}

// ─── Import ─────────────────────────────────────────────────────────────────

/** Pick a folder of `.md` files and import each as a note. Returns count or null. */
export async function importMarkdownFolder(): Promise<number | null> {
  const dir = await open({ directory: true, multiple: false, title: 'Choose a folder of markdown files' })
  if (!dir || typeof dir !== 'string') return null
  const created = await invoke<Note[]>('import_markdown_dir', { dir })
  for (const n of created) eventBus.emit('note:saved', n)
  log.info(`Imported ${created.length} note(s) from markdown folder`, dir)
  return created.length
}

type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'document'

const MEDIA_KINDS: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio', opus: 'audio',
  pdf: 'pdf',
  doc: 'document', docx: 'document', odt: 'document',
}

const DOCUMENT_EXTS = ['pdf', 'doc', 'docx', 'odt']
const MEDIA_EXTS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'mp4', 'webm', 'mov', 'mkv',
  'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus',
]

function mediaMarkdown(kind: MediaKind, filename: string, label: string): string {
  switch (kind) {
    case 'image':
      return `![${label}](jnana-asset://${filename})`
    case 'video':
      return `![video](jnana-asset://${filename})`
    case 'audio':
      return `![audio](jnana-asset://${filename})`
    case 'pdf':
      return `![pdf](jnana-asset://${filename})`
    default:
      return `[${label}](jnana-asset://${filename})`
  }
}

async function importOneFileAsNote(path: string): Promise<void> {
  const base = path.split(/[\\/]/).pop() || 'Imported file'
  const ext = (base.split('.').pop() || '').toLowerCase()
  const kind = MEDIA_KINDS[ext] ?? 'document'

  const id = crypto.randomUUID()
  const filename = await importMedia(path, id) // copies into assets, returns stored name
  const now = Date.now()
  const note: Note = {
    id,
    title: base.replace(/\.[^.]+$/, ''),
    content: mediaMarkdown(kind, filename, base),
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
  await saveNote(note) // note must exist before media_ref (FK); emits note:saved
  await registerMediaRef(id, kind, filename)
  // Re-infer auto-tags now that the media_ref exists (has:image / has:pdf / …).
  const tags = await inferTags(note)
  if (tags.length) await saveNote({ ...note, tags })
}

/** Pick documents or media files and import each as its own note. Returns count or null. */
export async function importFilesAsNotes(kind: 'documents' | 'media'): Promise<number | null> {
  const extensions = kind === 'documents' ? DOCUMENT_EXTS : MEDIA_EXTS
  const selected = await open({
    multiple: true,
    title: kind === 'documents' ? 'Import documents' : 'Import media',
    filters: [{ name: kind, extensions }],
  })
  if (!selected) return null
  const paths = Array.isArray(selected) ? selected : [selected]
  let count = 0
  for (const path of paths) {
    if (typeof path !== 'string') continue
    await importOneFileAsNote(path)
    count++
  }
  return count
}

// ─── Export / backup history (localStorage, no DB migration) ─────────────────

export interface DataHistory {
  lastExportAt: number | null
  lastBackupAt: number | null
}

const HISTORY_KEY = 'jnana.data.history'

export function getDataHistory(): DataHistory {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return { lastExportAt: null, lastBackupAt: null, ...(JSON.parse(raw) as Partial<DataHistory>) }
  } catch {
    /* ignore */
  }
  return { lastExportAt: null, lastBackupAt: null }
}

function setDataHistory(patch: Partial<DataHistory>): DataHistory {
  const next = { ...getDataHistory(), ...patch }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
  return next
}

export const markExport = (): DataHistory => setDataHistory({ lastExportAt: Date.now() })
export const markBackup = (): DataHistory => setDataHistory({ lastBackupAt: Date.now() })
