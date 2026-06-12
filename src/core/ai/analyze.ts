import type {
  AiConfig,
  AnalysisResult,
  AnalyzeInput,
  Note,
  SourceNote,
} from '../../types'
import { getProvider } from './provider'
import { retrieve } from './rag'

const MAX_CONTEXT_NOTES = 8
const MAX_CHARS_PER_NOTE = 1500

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

/** Build the context block sent to the model from a set of notes. */
function buildContext(snippets: { title: string; text: string }[]): string {
  return snippets
    .map((s, i) => `### Note ${i + 1}: ${s.title}\n${s.text.slice(0, MAX_CHARS_PER_NOTE)}`)
    .join('\n\n')
}

/** Tolerantly extract a JSON object from a model response (handles code fences/prose). */
function parseAnalysis(raw: string): Omit<AnalysisResult, 'sourceNotes'> {
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
 * Run the Thread/Day analyzer.
 *
 * - `topic` mode uses semantic retrieval over the vector store.
 * - `window` mode pulls notes created/updated within a time range.
 *
 * In both cases the source notes are resolved from the actual notes used as
 * context, so the cited sources can never be hallucinated by the model.
 */
export async function analyze(
  input: AnalyzeInput,
  config: AiConfig,
  notes: Note[],
): Promise<AnalysisResult> {
  const byId = new Map(notes.map((n) => [n.id, n]))
  let contextNotes: Note[]

  if (input.mode === 'topic') {
    const hits = await retrieve(input.query, config, MAX_CONTEXT_NOTES * 2)
    // Collapse chunk hits to unique notes, preserving relevance order.
    const seen = new Set<string>()
    contextNotes = []
    for (const hit of hits) {
      if (seen.has(hit.noteId)) continue
      seen.add(hit.noteId)
      const note = byId.get(hit.noteId)
      if (note) contextNotes.push(note)
      if (contextNotes.length >= MAX_CONTEXT_NOTES) break
    }
  } else {
    contextNotes = notes
      .filter((n) => {
        const t = n.updatedAt ?? n.createdAt
        return t >= input.since && t <= input.until
      })
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, MAX_CONTEXT_NOTES)
  }

  const sourceNotes: SourceNote[] = contextNotes.map((n) => ({
    noteId: n.id,
    title: n.title?.trim() || 'Untitled',
  }))

  if (contextNotes.length === 0) {
    return {
      summary:
        input.mode === 'topic'
          ? 'No indexed notes matched that topic. Try indexing your notes or a different phrasing.'
          : 'No notes were found in that time window.',
      keyConcepts: [],
      openQuestions: [],
      weakSpots: [],
      sourceNotes: [],
    }
  }

  const context = buildContext(
    contextNotes.map((n) => ({ title: n.title?.trim() || 'Untitled', text: n.content })),
  )
  const focus =
    input.mode === 'topic'
      ? `The user wants to understand what they've learned about: "${input.query}".`
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
