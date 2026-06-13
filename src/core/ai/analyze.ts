import type {
  AiConfig,
  AnalysisResult,
  AnalyzeInput,
  Note,
  SourceNote,
} from '../../types'
import { getLinks } from '../notes'
import { getProvider } from './provider'
import { retrieve } from './rag'

const MAX_CONTEXT_NOTES = 8
const MAX_CHARS_PER_NOTE = 1500
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
async function resolveContextNotes(
  input: AnalyzeInput,
  config: AiConfig,
  notes: Note[],
): Promise<Note[]> {
  const byId = new Map(notes.map((n) => [n.id, n]))

  if (input.mode === 'topic') {
    const hits = await retrieve(input.query, config, MAX_CONTEXT_NOTES * 2)
    // Collapse chunk hits to unique notes, preserving relevance order.
    const seen = new Set<string>()
    const contextNotes: Note[] = []
    for (const hit of hits) {
      if (seen.has(hit.noteId)) continue
      seen.add(hit.noteId)
      const note = byId.get(hit.noteId)
      if (note) contextNotes.push(note)
      if (contextNotes.length >= MAX_CONTEXT_NOTES) break
    }
    return contextNotes
  }

  if (input.mode === 'note') {
    // The selected note first, then its thread: notes linked in either
    // direction, most recently touched first.
    const root = byId.get(input.noteId)
    if (!root) return []
    let linkedIds: string[] = []
    try {
      linkedIds = await getLinks(root.id)
    } catch (err) {
      console.error('[analyze] failed to load linked notes:', err)
    }
    const linked = linkedIds
      .map((id) => byId.get(id))
      .filter((n): n is Note => !!n && n.id !== root.id)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    return [root, ...linked.slice(0, MAX_CONTEXT_NOTES - 1)]
  }

  return notes
    .filter((n) => {
      const t = n.updatedAt ?? n.createdAt
      return t >= input.since && t <= input.until
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, MAX_CONTEXT_NOTES)
}

function toSourceNotes(contextNotes: Note[]): SourceNote[] {
  return contextNotes.map((n) => ({
    noteId: n.id,
    title: n.title?.trim() || 'Untitled',
  }))
}

/** Build the context block sent to the model from a set of notes. */
function buildContext(snippets: { title: string; text: string }[]): string {
  return snippets
    .map((s, i) => `### Note ${i + 1}: ${s.title}\n${s.text.slice(0, MAX_CHARS_PER_NOTE)}`)
    .join('\n\n')
}

function contextBlockFor(contextNotes: Note[]): string {
  return buildContext(
    contextNotes.map((n) => ({ title: n.title?.trim() || 'Untitled', text: n.content })),
  )
}

function emptyContextMessage(input: AnalyzeInput): string {
  switch (input.mode) {
    case 'topic':
      return 'No indexed notes matched that topic. Try indexing your notes or a different phrasing.'
    case 'note':
      return 'That note could not be found — it may have been deleted.'
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
): Promise<AnalysisResult> {
  const contextNotes = await resolveContextNotes(input, config, notes)
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

  const context = contextBlockFor(contextNotes)
  const focus =
    input.mode === 'topic'
      ? `The user wants to understand what they've learned about: "${input.query}".`
      : input.mode === 'note'
        ? `The user wants an analysis of the note "${sourceNotes[0]?.title ?? 'Untitled'}"${
            contextNotes.length > 1 ? ' together with the notes linked to it (its thread)' : ''
          }.`
        : `The user wants a synthesis of what they recorded during: ${input.label}.`

  const provider = getProvider(config)
  const raw = await provider.complete(
    `${focus}\n\nHere are the relevant notes:\n\n${context}`,
    { system: SYSTEM_PROMPT, temperature: 0.2 },
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
): Promise<AskResult> {
  const contextNotes = await resolveContextNotes(input, config, notes)
  const sourceNotes = toSourceNotes(contextNotes)

  if (contextNotes.length === 0) {
    return { answer: emptyContextMessage(input), sourceNotes: [] }
  }

  const convo = history
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join('\n\n')

  const prompt = [
    `Here are the user's notes:\n\n${contextBlockFor(contextNotes)}`,
    convo ? `Earlier in this conversation:\n\n${convo}` : '',
    `Question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const provider = getProvider(config)
  const answer = await provider.complete(prompt, {
    system: ASK_SYSTEM_PROMPT,
    temperature: 0.3,
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
