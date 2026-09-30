// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { toast } from '../lib/toast'
import type { Note } from '../types'
import { getNoteType } from '../lib/noteTypes'
import { TABLE_BLOCK, parseCsv, tableToGfm, parseTableMeta } from './table'
import { getAllNotes } from './notes'

interface ExportFile {
  name: string
  content: string
}

/**
 * Rewrite app-specific links to portable relative paths and collect the asset
 * filenames a note references, so an exported `.md` works in other markdown
 * tools (Obsidian, VS Code, …) with its media alongside in `assets/`.
 */
export function toExportMarkdown(content: string, assetDir = 'assets'): { markdown: string; assets: string[] } {
  const assets = new Set<string>()
  const markdown = content
    // ```table CSV block → a portable GFM pipe table (renders in Obsidian/
    // GitHub/VS Code). Done first so the asset rewrites below never see it.
    // Column alignment carries over (GFM separator); colour/size are dropped.
    .replace(TABLE_BLOCK, (_m, info: string, csv: string) => `${tableToGfm(parseCsv(csv), parseTableMeta(info).align)}\n`)
    // jnana-asset://FILE  →  assets/FILE (`assetDir` is ../-prefixed for a nested file)
    .replace(/\(jnana-asset:\/\/([^)]+)\)/g, (_m, file: string) => {
      assets.add(file)
      return `(${assetDir}/${file})`
    })
    // external://<encoded absolute path>  →  assets/<basename>
    .replace(/\(external:\/\/([^)]+)\)/g, (_m, enc: string) => {
      let base = ''
      try {
        base = decodeURIComponent(enc).split(/[\\/]/).pop() || ''
      } catch {
        base = ''
      }
      if (base) assets.add(base)
      return `(${assetDir}/${base})`
    })
    // app-specific youtube embed  →  a plain clickable link
    .replace(/!\[youtube\]\((https?:\/\/[^)]+)\)/g, '[▶ YouTube]($1)')

  return { markdown, assets: [...assets] }
}

/** Quote + escape a string as a double-quoted YAML scalar (safe for any value). */
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * YAML frontmatter carrying the note metadata that isn't recoverable from the
 * markdown body (tags, timestamps, id). Obsidian/VS Code read this block, so an
 * exported note keeps its tags instead of dropping them. Presentation-only state
 * that lives outside the note text — PDF highlights, canvas, workspace membership,
 * media layout — is still not exported (see the scope note in the UI/README).
 */
function buildFrontmatter(n: Note): string {
  const lines = ['---']
  lines.push(`title: ${yamlString(n.title?.trim() || 'Untitled')}`)
  if (Number.isFinite(n.createdAt)) lines.push(`created: ${new Date(n.createdAt).toISOString()}`)
  if (Number.isFinite(n.updatedAt)) lines.push(`updated: ${new Date(n.updatedAt).toISOString()}`)
  if (n.tags && n.tags.length) lines.push(`tags: [${n.tags.map(yamlString).join(', ')}]`)
  lines.push(`id: ${yamlString(n.id)}`)
  lines.push('---')
  return lines.join('\n')
}

/** A note card in a typed note's projection (canvas), by id. */
const NOTE_CARD = /\[\[note:([^\]]*)\]\]/g

/**
 * Assemble one exported note: frontmatter + `# Title` + portable markdown.
 * `titleOf` turns a canvas's `[[note:<id>]]` cards into `[[Title]]` links other
 * markdown tools can follow.
 */
export function exportNoteContent(
  n: Note,
  assetDir = 'assets',
  titleOf?: (id: string) => string | undefined,
): { content: string; assets: string[] } {
  // A typed note exports via its note-type's markdown projection (e.g. a deck as a
  // Q/A list); the result still runs through the asset rewriter below. Plain notes
  // export their raw content unchanged.
  const def = getNoteType(n)
  let source = def?.toExportMarkdown ? def.toExportMarkdown(n) : (n.content || '')
  if (def?.toExportMarkdown && titleOf) {
    source = source.replace(NOTE_CARD, (_m, id: string) => {
      const title = titleOf(id)
      return title ? `[[${title}]]` : '(missing note)'
    })
  }
  const { markdown, assets } = toExportMarkdown(source, assetDir)
  const content = `${buildFrontmatter(n)}\n\n# ${n.title?.trim() || 'Untitled'}\n\n${markdown}\n`
  return { content, assets }
}

/** Windows device names: `CON` or `CON.anything` can't be a file there. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null
/** First `max` user-perceived characters, so a cut never splits an emoji. */
function clip(text: string, max: number): string {
  const parts = graphemes ? Array.from(graphemes.segment(text), (s) => s.segment) : Array.from(text)
  return parts.slice(0, max).join('')
}

/** Filesystem-safe base name from a note title (portable across Windows, macOS, Linux). */
export function safeName(title: string): string {
  const cleaned = clip((title || '').trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' '), 80)
    // Windows silently drops trailing dots/spaces; strip them so the name on disk is the one we track.
    .replace(/[. ]+$/, '')
  return cleaned ? cleaned.replace(RESERVED, '$1_') : 'Untitled'
}

function buildFiles(notes: Note[], titleOf: (id: string) => string | undefined): { files: ExportFile[]; assets: string[] } {
  const seen = new Map<string, number>()
  const allAssets = new Set<string>()

  const files = notes.map((n) => {
    const { content, assets } = exportNoteContent(n, 'assets', titleOf)
    assets.forEach((a) => allAssets.add(a))

    const base = safeName(n.title)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const name = count === 0 ? `${base}.md` : `${base} (${count}).md`

    return { name, content }
  })

  return { files, assets: [...allAssets] }
}

/**
 * Export one or many notes to a user-chosen folder as `.md` files, copying any
 * referenced assets into `<folder>/assets/`. Returns the number of files
 * written, or `null` if the user cancelled the folder picker.
 */
export interface ExportResult {
  /** Files written (notes plus their assets). */
  count: number
  /** Folder the user picked — for "show me where it went". */
  dir: string
  /**
   * What to reveal in the file manager: the first note written, so the folder
   * opens with it selected. Falls back to the folder itself.
   */
  revealPath: string
}

export async function exportNotes(notes: Note[]): Promise<ExportResult | null> {
  if (notes.length === 0) return { count: 0, dir: '', revealPath: '' }
  const dir = await open({ directory: true, multiple: false, title: 'Choose an export folder' })
  if (!dir || typeof dir !== 'string') return null // cancelled

  // Canvas note cards name other notes by id; only fetch titles when a typed note is exported.
  // If titles can't be read, cards export as "(missing note)" rather than failing the export.
  const all = notes.some((n) => n.kind) ? await getAllNotes().catch(() => []) : []
  const titles = new Map(all.map((n) => [n.id, n.title]))
  const { files, assets } = buildFiles(notes, (id) => titles.get(id))
  const { written: count, failed } = await invoke<{ written: number; failed: string[] }>('export_notes', { dir, files, assets })
  if (failed.length) toast.error(`Couldn't write ${failed.length === 1 ? 'one file' : `${failed.length} files`}: ${failed.join(', ')}`)
  // Mirrors the guard in the Rust command, which skips names it won't write.
  const written = files.find((f) => f.name && !/[\\/:]/.test(f.name) && !failed.includes(f.name))
  const sep = dir.includes('\\') ? '\\' : '/'
  return { count, dir, revealPath: written ? `${dir}${sep}${written.name}` : dir }
}

/**
 * The one success notification for an export, so every caller reports it the
 * same way: a count plus a link that opens the folder in the OS file manager.
 * Pass the result of `exportNotes`; a cancelled export (null) says nothing.
 */
export function toastExported(result: ExportResult | null): void {
  if (!result || result.count === 0) return
  toast.success(
    `${result.count} file${result.count === 1 ? '' : 's'} downloaded`,
    5000,
    {
      label: 'here',
      onClick: () => {
        // revealItemInDir, not openPath: opening an arbitrary path is scope-gated
        // (and the scope is empty by design — it would let any path be launched),
        // while revealing just shows the file in the OS file manager.
        revealItemInDir(result.revealPath).catch((err) => {
          console.error('[export] could not reveal export folder', err)
          toast.error('Could not open that folder.')
        })
      },
    },
  )
}
