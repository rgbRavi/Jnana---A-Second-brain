// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { Note } from '../types'

interface ExportFile {
  name: string
  content: string
}

/**
 * Rewrite app-specific links to portable relative paths and collect the asset
 * filenames a note references, so an exported `.md` works in other markdown
 * tools (Obsidian, VS Code, …) with its media alongside in `assets/`.
 */
export function toExportMarkdown(content: string): { markdown: string; assets: string[] } {
  const assets = new Set<string>()
  const markdown = content
    // jnana-asset://FILE  →  assets/FILE
    .replace(/\(jnana-asset:\/\/([^)]+)\)/g, (_m, file: string) => {
      assets.add(file)
      return `(assets/${file})`
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
      return `(assets/${base})`
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

/** Assemble one exported note: frontmatter + `# Title` + portable markdown. */
export function exportNoteContent(n: Note): { content: string; assets: string[] } {
  const { markdown, assets } = toExportMarkdown(n.content || '')
  const content = `${buildFrontmatter(n)}\n\n# ${n.title?.trim() || 'Untitled'}\n\n${markdown}\n`
  return { content, assets }
}

/** Filesystem-safe base name from a note title. */
function safeName(title: string): string {
  return (
    (title || 'Untitled')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'Untitled'
  )
}

function buildFiles(notes: Note[]): { files: ExportFile[]; assets: string[] } {
  const seen = new Map<string, number>()
  const allAssets = new Set<string>()

  const files = notes.map((n) => {
    const { content, assets } = exportNoteContent(n)
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
export async function exportNotes(notes: Note[]): Promise<number | null> {
  if (notes.length === 0) return 0
  const dir = await open({ directory: true, multiple: false, title: 'Choose an export folder' })
  if (!dir || typeof dir !== 'string') return null // cancelled

  const { files, assets } = buildFiles(notes)
  return invoke<number>('export_notes', { dir, files, assets })
}
