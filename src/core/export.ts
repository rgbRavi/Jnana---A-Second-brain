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
    const { markdown, assets } = toExportMarkdown(n.content || '')
    assets.forEach((a) => allAssets.add(a))

    const base = safeName(n.title)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const name = count === 0 ? `${base}.md` : `${base} (${count}).md`

    const body = `# ${n.title?.trim() || 'Untitled'}\n\n${markdown}\n`
    return { name, content: body }
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
