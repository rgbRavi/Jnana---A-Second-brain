// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Live one-way Markdown mirror. SQLite stays the source of truth; every save
// rewrites that note's .md in a folder the user picked, laid out as
// `<Vault>/<Folder>/<Subfolder>/<Note>.md`, so notes stay readable, greppable
// and git-able without Jnana. The folder is never read back: edits made there
// are overwritten on the next save.

import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { DEFAULT_VAULT_ID, type Folder, type Note, type Vault } from '../types'
import { getNoteType } from '../lib/noteTypes'
import { toast } from '../lib/toast'
import { log } from '../lib/logger'
import { exportNoteContent, safeName } from './export'
import { listVaults } from './vaults'
import { listFolders } from './folders'
import { getAllNotes } from './notes'

/** note id → `/`-separated path written for it, relative to the mirror folder. */
export type MirrorIndex = Record<string, string>

export interface MirrorPlan {
  index: MirrorIndex
  /** Path to (re)write for this note, or null. */
  write: string | null
  /** Path of this note to delete (its previous location), or null. */
  remove: string | null
  /**
   * Delete `remove` before writing: a case-only rename, where both paths are one
   * file on Windows/macOS. Written first, the removal would delete the new file;
   * removed first, the new casing lands everywhere and Linux keeps no stale copy.
   */
  removeFirst: boolean
}

/** Directory segment per vault and per folder (unique among siblings), plus folder parents. */
export interface MirrorTree {
  vaults: Map<string, string>
  folders: Map<string, { seg: string; parentId: string | null }>
}

interface ExportOutcome {
  written: number
  failed: string[]
}

const INDEX_KEY = 'jnana.mirror.index.v1'
/** Guards a parent cycle in bad data; real trees are far shallower. */
const MAX_DEPTH = 32

/**
 * Segment names for items grouped by `groupOf` (a vault's siblings are all
 * vaults; a folder's are the folders with its vault and parent). The oldest keeps
 * the plain name; a same-named sibling (ignoring case) gets ` (<id8>)`, so two
 * "Physics" folders never pour their notes into one directory.
 */
function segments<T extends { id: string; name: string; createdAt?: number }>(
  items: T[],
  groupOf: (item: T) => string,
): Map<string, string> {
  const out = new Map<string, string>()
  const taken = new Set<string>()
  const ordered = [...items].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))
  for (const item of ordered) {
    const plain = safeName(item.name)
    const key = `${groupOf(item)}\u0000${plain.toLowerCase()}`
    out.set(item.id, taken.has(key) ? `${plain} (${item.id.slice(0, 8)})` : plain)
    taken.add(key)
  }
  return out
}

export function buildTree(vaults: Vault[], folders: Folder[]): MirrorTree {
  const folderSegs = segments(folders, (f) => `${f.vaultId}/${f.parentId ?? ''}`)
  return {
    vaults: segments(vaults, () => ''),
    folders: new Map(folders.map((f) => [f.id, { seg: folderSegs.get(f.id)!, parentId: f.parentId }])),
  }
}

/** `[vault, folder, subfolder, …]` directory segments for a note. */
function noteDirs(note: Note, tree: MirrorTree): string[] {
  const chain: string[] = []
  let id = note.folderId ?? null
  for (let depth = 0; id && depth < MAX_DEPTH; depth++) {
    const f = tree.folders.get(id)
    // A folder deleted just before this event: the note is unfiled now.
    if (!f) {
      chain.length = 0
      break
    }
    chain.unshift(f.seg)
    id = f.parentId
  }
  return [tree.vaults.get(note.vaultId ?? DEFAULT_VAULT_ID) ?? 'Vault', ...chain]
}

/** `assets` reached from a file at `path` (one `../` per directory level). */
function assetDirFor(path: string): string {
  return '../'.repeat(path.split('/').length - 1) + 'assets'
}

/** Plain notes, and typed notes whose type projects to markdown. */
export function isMirrorable(note: Note): boolean {
  if (!note.kind) return true
  return !!getNoteType(note)?.toExportMarkdown
}

export function planDelete(index: MirrorIndex, id: string): MirrorPlan {
  const current = index[id]
  if (!current) return { index, write: null, remove: null, removeFirst: false }
  const next = { ...index }
  delete next[id]
  return { index: next, write: null, remove: current, removeFirst: false }
}

export function planSave(index: MirrorIndex, note: Note, tree: MirrorTree): MirrorPlan {
  if (!isMirrorable(note)) return planDelete(index, note.id)
  const dir = noteDirs(note, tree).join('/')
  const base = safeName(note.title)
  // Case-insensitive: Windows and macOS file systems treat "Same.md" and "same.md" as one file.
  const plain = `${dir}/${base}.md`.toLowerCase()
  const taken = Object.entries(index).some(([id, path]) => id !== note.id && path.toLowerCase() === plain)
  const path = taken ? `${dir}/${base} (${note.id.slice(0, 8)}).md` : `${dir}/${base}.md`
  const current = index[note.id]
  const moved = !!current && current !== path
  return {
    index: { ...index, [note.id]: path },
    write: path,
    remove: moved ? current : null,
    removeFirst: moved && current.toLowerCase() === path.toLowerCase(),
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

/** Notice written into the mirror folder so nobody edits the copies by mistake. */
export const MIRROR_README = 'README - Jnana mirror.txt'
const README_TEXT =
  'Generated by Jnana. Each .md file here is rewritten whenever its note is saved in Jnana ' +
  'and removed when the note is deleted, renamed or moved. Edits made here are overwritten; edit in Jnana instead.\n'

// Saves reuse the last tree; mirrorAll (first mirror, and every vault/folder
// change) reloads it. A note saved into a brand-new folder before that reload
// lands at its vault root and is moved by the re-mirror that follows.
let treeCache: Promise<MirrorTree> | null = null
function loadTree(fresh: boolean): Promise<MirrorTree> {
  if (fresh || !treeCache) {
    const load = Promise.all([listVaults(), listFolders()]).then(([v, f]) => buildTree(v, f))
    // A failed load must not stick (or clear a newer one).
    load.catch(() => {
      if (treeCache === load) treeCache = null
    })
    treeCache = load
  }
  return treeCache
}

// Note titles, for a canvas's [[note:id]] cards. Rebuilt by mirrorAll, kept
// current by each save, fetched once if a canvas is saved before either.
let titles: Map<string, string> | null = null
// Typed notes (canvases, decks…) as last mirrored, so renaming a note can
// rewrite just the canvases that show it. Filled by mirrorAll (the hook runs
// one at startup), kept current by each save.
let typed: Map<string, Note> | null = null
async function titleLookup(): Promise<(id: string) => string | undefined> {
  if (!titles) titles = new Map((await getAllNotes()).map((n) => [n.id, n.title]))
  const map = titles
  return (id) => map.get(id)
}

// One queue for every mirror write, so two quick saves of the same note
// (e.g. a rename) can't interleave their write and remove.
let queue: Promise<unknown> = Promise.resolve()
function enqueue(job: () => Promise<void>): Promise<void> {
  const run = queue.then(job)
  queue = run.catch(() => {})
  return run
}

// --- Failure handling -------------------------------------------------------
// An outage (folder missing, drive unplugged) is reported once; notes whose
// write was lost wait in `pending`, and the first write that succeeds again
// queues one catch-up re-mirror. A single file the OS refuses is different: the
// folder works, so it's named in its own warning and simply retried next save.
const pending = new Set<string>()
let outage = false
const reportedFiles = new Set<string>()

function failed(dir: string, err: unknown, noteId?: string): void {
  if (noteId) pending.add(noteId)
  if (outage) return
  outage = true
  log.error('[mirror] write failed', err)
  toast.error(`Markdown mirror: ${dir} is missing or unreachable. Jnana will catch up when it's back.`)
}

function succeeded(dir: string): void {
  if (!outage && pending.size === 0) return
  outage = false
  void remirror(dir)
}

function reportUnwritable(paths: string[]): void {
  const fresh = paths.filter((p) => !reportedFiles.has(p))
  if (fresh.length === 0) return
  fresh.forEach((p) => reportedFiles.add(p))
  log.warn('[mirror] could not write', fresh)
  toast.error(`Markdown mirror couldn't write ${fresh.join(', ')}. Renaming the note usually fixes it.`)
}

async function exportFiles(dir: string, files: { name: string; content: string }[], assets: string[]): Promise<string[]> {
  const out = await invoke<ExportOutcome>('export_notes', { dir, files, assets })
  if (out.failed.length) reportUnwritable(out.failed)
  return out.failed
}

async function removeFiles(dir: string, names: string[]): Promise<void> {
  if (names.length) await invoke<number>('remove_export_files', { dir, names })
}

/** Write (or rename/move) one note's file. Never rejects: failures are reported and caught up later. */
export function mirrorNote(dir: string, note: Note): Promise<void> {
  titles?.set(note.id, note.title)
  if (note.kind) typed?.set(note.id, note)
  return enqueue(async () => {
    const plan = planSave(loadIndex(dir), note, await loadTree(false))
    if (plan.remove && plan.removeFirst) await removeFiles(dir, [plan.remove])
    if (plan.write) {
      const { content, assets } = exportNoteContent(note, assetDirFor(plan.write), note.kind ? await titleLookup() : undefined)
      const refused = await exportFiles(dir, [{ name: plan.write, content }], assets)
      // Keep the old copy and index entry; the next save tries again.
      if (refused.length) return
    }
    if (plan.remove && !plan.removeFirst) await removeFiles(dir, [plan.remove])
    saveIndex(dir, plan.index)
    pending.delete(note.id)
    // A renamed note changes the [[Title]] its canvases show; rewrite those (queued after this job).
    if (plan.remove && typed) {
      for (const t of typed.values()) if (t.id !== note.id && (t.content ?? '').includes(note.id)) void mirrorNote(dir, t)
    }
  }).then(
    () => succeeded(dir),
    (err) => failed(dir, err, note.id),
  )
}

/** Remove one note's file. Never rejects; a missed removal is pruned by the next re-mirror. */
export function unmirrorNote(dir: string, id: string): Promise<void> {
  titles?.delete(id)
  typed?.delete(id)
  return enqueue(async () => {
    const plan = planDelete(loadIndex(dir), id)
    await removeFiles(dir, plan.remove ? [plan.remove] : [])
    saveIndex(dir, plan.index)
  }).then(
    () => succeeded(dir),
    (err) => failed(dir, err),
  )
}

/**
 * Bring the whole folder in line with `notes`: new and moved notes are written,
 * old paths and deleted notes removed. `rewrite` (the default, used when
 * mirroring is turned on) also rewrites notes whose path didn't change; so are
 * notes whose write was lost in an outage. Rejects on failure so the caller can
 * report it.
 */
export function mirrorAll(dir: string, notes: Note[], { rewrite = true } = {}): Promise<void> {
  return enqueue(async () => {
    const tree = await loadTree(true)
    titles = new Map(notes.map((n) => [n.id, n.title]))
    typed = new Map(notes.filter((n) => n.kind).map((n) => [n.id, n]))
    const titleOf = (id: string) => titles?.get(id)
    const before = loadIndex(dir)
    let index = before
    const files = [{ name: MIRROR_README, content: README_TEXT }]
    const owner = new Map<string, string>() // written path → note id
    const assets = new Set<string>()
    const removeFirst: string[] = []
    const removeAfter: { id: string | null; path: string }[] = []
    // Notes deleted without a per-note event drop out here, before the loop,
    // so their names are free for the notes below.
    const live = new Set(notes.map((n) => n.id))
    for (const id of Object.keys(index)) {
      if (live.has(id)) continue
      const plan = planDelete(index, id)
      index = plan.index
      if (plan.remove) removeAfter.push({ id: null, path: plan.remove })
    }
    for (const n of notes) {
      const plan = planSave(index, n, tree)
      index = plan.index
      if (plan.remove) (plan.removeFirst ? removeFirst.push(plan.remove) : removeAfter.push({ id: n.id, path: plan.remove }))
      const unchanged = plan.write === before[n.id]
      if (!plan.write || (unchanged && !rewrite && !pending.has(n.id))) continue
      const out = exportNoteContent(n, assetDirFor(plan.write), titleOf)
      files.push({ name: plan.write, content: out.content })
      owner.set(plan.write, n.id)
      out.assets.forEach((a) => assets.add(a))
    }
    await removeFiles(dir, removeFirst)
    const refused = new Set(
      (await exportFiles(dir, files, [...assets])).map((path) => owner.get(path)).filter((id): id is string => !!id),
    )
    // A refused note keeps its previous file and index entry, so the next save retries it.
    for (const id of refused) {
      if (before[id]) index = { ...index, [id]: before[id] }
      else index = planDelete(index, id).index
    }
    // A later note in this batch may have taken a path an earlier one moved off.
    const written = new Set(files.map((f) => f.name.toLowerCase()))
    await removeFiles(
      dir,
      removeAfter.filter((r) => !(r.id && refused.has(r.id)) && !written.has(r.path.toLowerCase())).map((r) => r.path),
    )
    saveIndex(dir, index)
    notes.forEach((n) => refused.has(n.id) || pending.delete(n.id))
  }).then(() => {
    outage = false
  })
}

/**
 * At startup, after a vault/folder rename, move or delete, a note moving between
 * them, or an outage: bring the folder back in line, writing only what changed.
 * Never rejects.
 */
export async function remirror(dir: string): Promise<void> {
  // ponytail: plans every note per structure change; fine at thousands of notes,
  // track affected folders if this ever shows up in a profile.
  try {
    await mirrorAll(dir, await getAllNotes(), { rewrite: false })
  } catch (err) {
    failed(dir, err)
  }
}

export async function pickMirrorFolder(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title: 'Choose a folder to mirror your notes into' })
  return typeof dir === 'string' ? dir : null
}
