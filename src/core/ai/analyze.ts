// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type {
  AiConfig,
  AnalysisResult,
  AnalyzeInput,
  Note,
  SourceNote,
} from '../../types'
import { getLinks } from '../notes'
import { getChatProvider } from './provider'
import { retrieve } from './rag'
import { buildNoteContext, DEFAULT_CONTEXT_TOKENS, maxNotesFor } from './noteContext'

/** Options shared by the grounded actions (Analyze / Ask / Quiz). */
export interface GroundingOpts {
  /** How many tokens of note text the model may read (Settings → Advanced AI
   *  generation). Defaults to DEFAULT_CONTEXT_TOKENS. */
  contextTokens?: number
}
const MAX_HISTORY_TURNS = 6

const SYSTEM_PROMPT = `You are a study analyst embedded in a personal knowledge app.
You are given excerpts from the user's OWN notes. Analyze ONLY what is present in
those notes — never invent facts, and do not use outside knowledge to fill gaps.
If the notes are thin on a point, that is itself a useful signal (a weak spot).

Respond with a SINGLE JSON object and nothing else, matching exactly:
{
  "summary": "2-4 sentence synthesis of what the user has learned/recorded",
  "keyConcepts": ["concept the notes actually cover", "..."],
  "openQuestions": ["question the notes raise but don't resolve", "..."],
  "weakSpots": ["topic the user collected material on but explained thinly or inconsistently", "..."]
}
Keep each list item short (one line). Use [] for a list with no items. Output JSON only.`

const ASK_SYSTEM_PROMPT = `You are a study assistant embedded in a personal knowledge app.
Answer the user's question using ONLY the excerpts from their own notes provided
below. If the notes don't contain the answer, say so plainly — never invent facts
or fill gaps with outside knowledge. Be concise and direct, in plain text.`

/**
 * Resolve which notes form the context for an analysis or question.
 *
 * - `topic` mode uses semantic retrieval over the vector store.
 * - `window` mode pulls notes created/updated within a time range.
 * - `note` mode takes one note plus the notes linked to it (its thread).
 */
export async function resolveContextNotes(
  input: AnalyzeInput,
  config: AiConfig,
  notes: Note[],
  /** Cap for topic/time scopes and linked-note fill (see maxNotesFor). */
  maxNotes = 8,
): Promise<Note[]> {
  const byId = new Map(notes.map((n) => [n.id, n]))

  if (input.mode === 'topic') {
    const hits = await retrieve(input.query, config, maxNotes * 2)
    // Collapse chunk hits to unique notes, preserving relevance order.
    const seen = new Set<string>()
    const contextNotes: Note[] = []
    for (const hit of hits) {
      if (seen.has(hit.noteId)) continue
      seen.add(hit.noteId)
      const note = byId.get(hit.noteId)
      if (note) contextNotes.push(note)
      if (contextNotes.length >= maxNotes) break
    }
    return contextNotes
  }

  if (input.mode === 'note') {
    // Every selected note (the user picked them explicitly, so none is dropped),
    // then their threads — notes linked in either direction, most recently
    // touched first — filling whatever room is left under the context cap.
    const roots = input.noteIds.map((id) => byId.get(id)).filter((n): n is Note => !!n)
    const room = maxNotes - roots.length
    if (roots.length === 0 || room <= 0) return roots
    const rootIds = new Set(roots.map((n) => n.id))
    let linkedIds: string[] = []
    try {
      linkedIds = (await Promise.all(roots.map((r) => getLinks(r.id)))).flat()
    } catch (err) {
      console.error('[analyze] failed to load linked notes:', err)
    }
    const linked = [...new Set(linkedIds)]
      .map((id) => byId.get(id))
      .filter((n): n is Note => !!n && !rootIds.has(n.id))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return [...roots, ...linked.slice(0, room)]
  }

  return notes
    .filter((n) => {
      const t = n.updatedAt ?? n.createdAt
      return t >= input.since && t <= input.until
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, maxNotes)
}

/** "the note "A"" / "the notes "A", "B" and "C"" for the analysis prompt. */
function noteSubject(selected: SourceNote[]): string {
  const titles = selected.map((s) => `"${s.title}"`)
  if (titles.length <= 1) return `the note ${titles[0] ?? '"Untitled"'}`
  return `the notes ${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}

function toSourceNotes(contextNotes: Note[]): SourceNote[] {
  return contextNotes.map((n) => ({
    noteId: n.id,
    title: n.title?.trim() || 'Untitled',
  }))
}

function emptyContextMessage(input: AnalyzeInput): string {
  switch (input.mode) {
    case 'topic':
      return 'No indexed notes matched that topic. Try indexing your notes or a different phrasing.'
    case 'note':
      return 'The selected notes could not be found — they may have been deleted.'
    default:
      return 'No notes were found in that time window.'
  }
}

/** Tolerantly extract a JSON object from a model response (handles code fences/prose). */
export function parseAnalysis(raw: string): Omit<AnalysisResult, 'sourceNotes'> {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

  const obj = JSON.parse(text) as Record<string, unknown>
  const toList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    keyConcepts: toList(obj.keyConcepts),
    openQuestions: toList(obj.openQuestions),
    weakSpots: toList(obj.weakSpots),
  }
}

/**
 * Run the Thread/Day analyzer over the context selected by `input`.
 *
 * The source notes are resolved from the actual notes used as context, so the
 * cited sources can never be hallucinated by the model.
 */
export async function analyze(
  input: AnalyzeInput,
  config: AiConfig,
  notes: Note[],
  opts: GroundingOpts = {},
): Promise<AnalysisResult> {
  const budgetTokens = opts.contextTokens ?? DEFAULT_CONTEXT_TOKENS
  const contextNotes = await resolveContextNotes(input, config, notes, maxNotesFor(budgetTokens))
  const sourceNotes = toSourceNotes(contextNotes)

  if (contextNotes.length === 0) {
    return {
      summary: emptyContextMessage(input),
      keyConcepts: [],
      openQuestions: [],
      weakSpots: [],
      sourceNotes: [],
    }
  }

  const { text: context, images } = await buildNoteContext(contextNotes, {
    budgetTokens,
    config,
    query: input.mode === 'topic' ? input.query : undefined,
  })
  const focus =
    input.mode === 'topic'
      ? `The user wants to understand what they've learned about: "${input.query}".`
      : input.mode === 'note'
        ? `The user wants an analysis of ${noteSubject(sourceNotes.slice(0, input.noteIds.length))}${
            contextNotes.length > input.noteIds.length ? ' together with the notes linked to them (their threads)' : ''
          }.`
        : `The user wants a synthesis of what they recorded during: ${input.label}.`

  const provider = getChatProvider(config)
  const raw = await provider.complete(
    `${focus}\n\nHere are the relevant notes:\n\n${context}`,
    { system: SYSTEM_PROMPT, temperature: 0.2, images },
  )

  try {
    return { ...parseAnalysis(raw), sourceNotes }
  } catch {
    // Model didn't return clean JSON — degrade gracefully rather than crash.
    return {
      summary: raw.trim().slice(0, 1000),
      keyConcepts: [],
      openQuestions: [],
      weakSpots: [],
      sourceNotes,
    }
  }
}

/** One question/answer exchange in a grounded follow-up conversation. */
export interface AskTurn {
  question: string
  answer: string
}

export interface AskResult {
  answer: string
  sourceNotes: SourceNote[]
}

/**
 * Ask a free-form question against the same note context an analysis uses
 * (topic retrieval, time window, or note + thread). Earlier turns are folded
 * into the prompt so follow-ups read like a conversation, while the answer
 * stays grounded in the user's own notes.
 */
export async function askNotes(
  input: AnalyzeInput,
  question: string,
  history: AskTurn[],
  config: AiConfig,
  notes: Note[],
  opts: GroundingOpts = {},
): Promise<AskResult> {
  const budgetTokens = opts.contextTokens ?? DEFAULT_CONTEXT_TOKENS
  const contextNotes = await resolveContextNotes(input, config, notes, maxNotesFor(budgetTokens))
  const sourceNotes = toSourceNotes(contextNotes)

  if (contextNotes.length === 0) {
    return { answer: emptyContextMessage(input), sourceNotes: [] }
  }

  const convo = history
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join('\n\n')

  // The question picks the most relevant passages from any note too long to send whole.
  const { text: context, images } = await buildNoteContext(contextNotes, { budgetTokens, config, query: question })
  const prompt = [
    `Here are the user's notes:\n\n${context}`,
    convo ? `Earlier in this conversation:\n\n${convo}` : '',
    `Question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const provider = getChatProvider(config)
  const answer = await provider.complete(prompt, {
    system: ASK_SYSTEM_PROMPT,
    temperature: 0.3,
    images,
  })

  return { answer: answer.trim(), sourceNotes }
}

/** Convenience builders for the common time windows offered in the UI. */
export function timeWindow(kind: 'today' | 'yesterday' | 'week'): AnalyzeInput {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const DAY = 24 * 60 * 60 * 1000

  switch (kind) {
    case 'today':
      return { mode: 'window', since: startOfToday, until: now.getTime(), label: 'today' }
    case 'yesterday':
      return { mode: 'window', since: startOfToday - DAY, until: startOfToday - 1, label: 'yesterday' }
    case 'week':
      return { mode: 'window', since: startOfToday - 6 * DAY, until: now.getTime(), label: 'the past 7 days' }
  }
}
