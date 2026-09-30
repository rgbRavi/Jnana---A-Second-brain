// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Live one-way Markdown mirror. SQLite stays the source of truth; every save
// rewrites that note's .md in a folder the user picked, so notes stay readable,
// greppable and git-able without Jnana. The folder is never read back: edits
// made there are overwritten on the next save.

import type { Note } from '../types'
import { getNoteType } from '../lib/noteTypes'
import { safeName } from './export'

/** note id → file name written for it in the mirror folder. */
export type MirrorIndex = Record<string, string>

export interface MirrorPlan {
  index: MirrorIndex
  /** File to (re)write for this note, or null. */
  write: string | null
  /** File of this note to delete (its previous name), or null. */
  remove: string | null
}

const INDEX_KEY = 'jnana.mirror.index.v1'

/** Plain notes, and typed notes whose type projects to markdown. A canvas's raw JSON isn't a readable .md. */
export function isMirrorable(note: Note): boolean {
  if (!note.kind) return true
  return !!getNoteType(note)?.toExportMarkdown
}

export function planDelete(index: MirrorIndex, id: string): MirrorPlan {
  const current = index[id]
  if (!current) return { index, write: null, remove: null }
  const next = { ...index }
  delete next[id]
  return { index: next, write: null, remove: current }
}

export function planSave(index: MirrorIndex, note: Note): MirrorPlan {
  if (!isMirrorable(note)) return planDelete(index, note.id)
  const base = safeName(note.title)
  // Case-insensitive: Windows and macOS file systems treat "Same.md" and "same.md" as one file.
  const plain = `${base}.md`.toLowerCase()
  const taken = Object.entries(index).some(([id, name]) => id !== note.id && name.toLowerCase() === plain)
  const name = taken ? `${base} (${note.id.slice(0, 8)}).md` : `${base}.md`
  const current = index[note.id]
  return {
    index: { ...index, [note.id]: name },
    write: name,
    // A case-only rename writes over the same file on disk; removing the "old" name would delete it.
    remove: current && current.toLowerCase() !== name.toLowerCase() ? current : null,
  }
}

export function loadIndex(dir: string): MirrorIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return {}
    const stored = JSON.parse(raw) as { dir?: string; files?: MirrorIndex }
    return stored.dir === dir && stored.files ? stored.files : {}
  } catch {
    return {}
  }
}

export function saveIndex(dir: string, index: MirrorIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify({ dir, files: index }))
  } catch {
    /* storage unavailable: worst case a later rename leaves the old file behind */
  }
}
