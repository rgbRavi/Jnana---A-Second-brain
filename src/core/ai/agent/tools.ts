// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/agent/tools.ts
//
// Native agent tools over the vault. Read tools run immediately and feed results
// back to the model; write tools are *staged* as proposed actions (never mutate
// here) so the user approves them before they touch the vault.
import { retrieve } from '../rag'
import { getLinks } from '../../notes'
import type { ToolDef } from '../provider'
import type { AiConfig, Note } from '../../../types'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

/** A vault-changing action the agent proposed; applied only on user confirm. */
export interface ProposedAction {
  id: string
  kind: 'create' | 'append' | 'link' | 'tags'
  summary: string
  // create
  title?: string
  content?: string
  tags?: string[]
  // append / tags
  noteId?: string
  noteTitle?: string
  // append
  text?: string
  // link (by title, so it can reference a not-yet-created note)
  sourceTitle?: string
  targetTitle?: string
}

export interface ToolContext {
  config: AiConfig
  notes: Note[]
  /** Already-staged proposals (so tools can resolve pending creates + dedupe). */
  proposals: ProposedAction[]
  stage: (action: ProposedAction) => void
}

export interface AgentTool {
  def: ToolDef
  /** Returns the tool-result string fed back to the model. */
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

const titleOf = (notes: Note[], id: string) => notes.find((n) => n.id === id)?.title?.trim() || 'Untitled'

function findNote(notes: Note[], idOrTitle: unknown): Note | undefined {
  const s = String(idOrTitle ?? '').trim()
  if (!s) return undefined
  const lower = s.toLowerCase()
  return (
    notes.find((n) => n.id === s) ||
    notes.find((n) => (n.title ?? '').trim().toLowerCase() === lower) ||
    notes.find((n) => (n.title ?? '').toLowerCase().includes(lower))
  )
}

/** Resolve an id/title to a note *title* — matching an existing note OR a note
 *  the agent already proposed to create (so create→link chains work). */
function resolveTitle(ctx: ToolContext, idOrTitle: unknown): string | undefined {
  const existing = findNote(ctx.notes, idOrTitle)
  if (existing) return existing.title?.trim() || 'Untitled'
  const lower = String(idOrTitle ?? '').trim().toLowerCase()
  if (!lower) return undefined
  const pending =
    ctx.proposals.find((p) => p.kind === 'create' && (p.title ?? '').toLowerCase() === lower) ||
    ctx.proposals.find((p) => p.kind === 'create' && (p.title ?? '').toLowerCase().includes(lower))
  return pending?.title
}

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
})

// ── Read tools ──────────────────────────────────────────

const searchNotesTool: AgentTool = {
  def: {
    name: 'search_notes',
    description: "Search the user's notes by meaning (falls back to title/text). Returns matching notes with snippets.",
    parameters: obj({ query: { type: 'string' }, k: { type: 'number', description: 'max results, default 6' } }, ['query']),
  },
  run: async (args, ctx) => {
    const query = String(args.query ?? '').trim()
    const k = Math.max(1, Math.min(20, Number(args.k ?? 6)))
    if (!query) return '[]'
    let results: { noteId: string; title: string; snippet: string }[] = []
    try {
      const hits = await retrieve(query, ctx.config, k)
      results = hits.map((h) => ({ noteId: h.noteId, title: titleOf(ctx.notes, h.noteId), snippet: h.chunkText.slice(0, 200) }))
    } catch {
      /* embeddings unavailable — fall back below */
    }
    if (results.length === 0) {
      const q = query.toLowerCase()
      results = ctx.notes
        .filter((n) => (n.title ?? '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
        .slice(0, k)
        .map((n) => ({ noteId: n.id, title: n.title?.trim() || 'Untitled', snippet: n.content.slice(0, 200) }))
    }
    return JSON.stringify(results)
  },
}

const readNoteTool: AgentTool = {
  def: {
    name: 'read_note',
    description: 'Read a note in full by id or title.',
    parameters: obj({ note: { type: 'string', description: 'note id or title' } }, ['note']),
  },
  run: async (args, ctx) => {
    const note = findNote(ctx.notes, args.note)
    if (!note) return `Note not found: ${String(args.note)}`
    return JSON.stringify({ id: note.id, title: note.title, content: note.content, tags: note.tags })
  },
}

const recentNotesTool: AgentTool = {
  def: {
    name: 'recent_notes',
    description: 'List notes updated within the last N days (most recent first).',
    parameters: obj({ days: { type: 'number', description: 'lookback window in days, default 7' } }),
  },
  run: async (args, ctx) => {
    const days = Math.max(1, Number(args.days ?? 7))
    const since = Date.now() - days * 86400000
    const list = ctx.notes
      .filter((n) => (n.updatedAt ?? 0) >= since)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, 50)
      .map((n) => ({ id: n.id, title: n.title?.trim() || 'Untitled', updatedAt: n.updatedAt }))
    return JSON.stringify(list)
  },
}

const graphNeighborsTool: AgentTool = {
  def: {
    name: 'graph_neighbors',
    description: 'List the notes directly linked to a note (its thread), in either direction.',
    parameters: obj({ note: { type: 'string', description: 'note id or title' } }, ['note']),
  },
  run: async (args, ctx) => {
    const note = findNote(ctx.notes, args.note)
    if (!note) return `Note not found: ${String(args.note)}`
    try {
      const ids = await getLinks(note.id)
      return JSON.stringify(ids.map((id) => ({ id, title: titleOf(ctx.notes, id) })))
    } catch (e) {
      return `Could not load links: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

// ── Write tools (staged) ────────────────────────────────

const asTags = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : []

const createNoteTool: AgentTool = {
  def: {
    name: 'create_note',
    description: 'Propose creating a new note. Staged for user approval — not created until confirmed.',
    parameters: obj(
      { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
      ['title', 'content'],
    ),
  },
  run: async (args, ctx) => {
    const title = String(args.title ?? '').trim() || 'Untitled'
    const content = String(args.content ?? '')
    const tags = asTags(args.tags)
    ctx.stage({ id: newId(), kind: 'create', title, content, tags, summary: `Create note “${title}”${tags.length ? ` [${tags.join(', ')}]` : ''}` })
    return `Proposed: create note “${title}” (pending user approval).`
  },
}

const appendNoteTool: AgentTool = {
  def: {
    name: 'append_to_note',
    description: 'Propose appending text to an existing note. Staged for user approval.',
    parameters: obj({ note: { type: 'string', description: 'note id or title' }, text: { type: 'string' } }, ['note', 'text']),
  },
  run: async (args, ctx) => {
    const note = findNote(ctx.notes, args.note)
    if (!note) return `Note not found: ${String(args.note)}`
    const text = String(args.text ?? '')
    ctx.stage({ id: newId(), kind: 'append', noteId: note.id, noteTitle: note.title?.trim() || 'Untitled', text, summary: `Append to “${note.title?.trim() || 'Untitled'}”` })
    return `Proposed: append to “${note.title?.trim() || 'Untitled'}” (pending user approval).`
  },
}

const setTagsTool: AgentTool = {
  def: {
    name: 'set_note_tags',
    description: "Propose setting a note's tags (replaces its user tags). Staged for user approval.",
    parameters: obj({ note: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, ['note', 'tags']),
  },
  run: async (args, ctx) => {
    const note = findNote(ctx.notes, args.note)
    if (!note) return `Note not found: ${String(args.note)}`
    const tags = asTags(args.tags)
    ctx.stage({ id: newId(), kind: 'tags', noteId: note.id, noteTitle: note.title?.trim() || 'Untitled', tags, summary: `Tag “${note.title?.trim() || 'Untitled'}” [${tags.join(', ')}]` })
    return `Proposed: set tags on “${note.title?.trim() || 'Untitled'}” (pending user approval).`
  },
}

const linkNotesTool: AgentTool = {
  def: {
    name: 'link_notes',
    description: 'Propose linking one note to another (adds a [[wikilink]] from the source). Staged for user approval.',
    parameters: obj({ from: { type: 'string', description: 'source note id or title' }, to: { type: 'string', description: 'target note id or title' } }, ['from', 'to']),
  },
  run: async (args, ctx) => {
    // Resolve against existing notes AND pending creates, so the agent can link
    // a freshly-proposed note to others in the same run.
    const fromTitle = resolveTitle(ctx, args.from)
    const toTitle = resolveTitle(ctx, args.to)
    if (!fromTitle) return `Source note not found: ${String(args.from)}`
    if (!toTitle) return `Target note not found: ${String(args.to)}`
    if (fromTitle.toLowerCase() === toTitle.toLowerCase()) return `Cannot link a note to itself.`
    ctx.stage({
      id: newId(),
      kind: 'link',
      sourceTitle: fromTitle,
      targetTitle: toTitle,
      summary: `Link “${fromTitle}” → “${toTitle}”`,
    })
    return `Proposed: link “${fromTitle}” → “${toTitle}” (pending user approval).`
  },
}

/** All native tools. Read tools first; write tools are staged. */
export const NATIVE_TOOLS: AgentTool[] = [
  searchNotesTool,
  readNoteTool,
  recentNotesTool,
  graphNeighborsTool,
  createNoteTool,
  appendNoteTool,
  setTagsTool,
  linkNotesTool,
]
