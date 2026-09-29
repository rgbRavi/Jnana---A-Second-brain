// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/noteContext.ts
//
// Builds the "here are the user's notes" block that the grounded actions
// (Analyze / Ask / Quiz) send to the model, inside a user-set token budget
// (Settings → Advanced AI generation).
//
//  1. Each note becomes plain text: embed links stripped (they carry no meaning
//     and ate the old fixed allowance), extracted PDF text appended.
//  2. If everything fits, every note goes in whole.
//  3. Otherwise the budget is shared fairly — short notes keep all their text
//     and the rest flows to longer ones — and an over-long note contributes
//     passages instead of just its opening: the ones closest in meaning to the
//     question/topic when there is one (from the existing embedding index), or
//     an even spread across the note when there isn't.
//
// Passages are cut with `chunkNote`, the same splitter the embedding index
// uses, so a passage lines up with its stored vector by chunk index.
//
// With a vision-capable chat model, the notes' images — and the pages of any
// scanned PDF (one with no text layer, so step 1 got nothing from it) — are
// sent as images too, labelled per note so the model can tie them to the text.

import { invoke } from '@tauri-apps/api/core'
import type { AiConfig, Note, RetrievalHit } from '../../types'
import { getAttachmentText } from '../attachmentText'
import { basenameOf, classifyFile } from '../media/classify'
import { chunkNote } from './chunk'
import { isVisionModel } from './capabilities'
import { getEmbeddingProvider } from './provider'

/** Rough English average; good enough to turn a token budget into characters. */
export const CHARS_PER_TOKEN = 4
export const DEFAULT_CONTEXT_TOKENS = 32_000

/** What one downscaled image is assumed to cost, reserved out of the text budget. */
export const TOKENS_PER_IMAGE = 1000
/** Pages rendered per scanned PDF — enough for a handout's key pages, not a whole book. */
const MAX_SCANNED_PAGES = 3

/** How many images a run may send: 2 at small budgets, 8 at the 32k default, 20 at most. */
export function maxImagesFor(budgetTokens: number): number {
  return Math.min(20, Math.max(2, Math.floor(budgetTokens / 4000)))
}

/** Image / PDF assets embedded in a note, in document order. */
export function mediaIn(content: string): { filename: string; kind: 'image' | 'pdf' }[] {
  const out: { filename: string; kind: 'image' | 'pdf' }[] = []
  for (const m of content.matchAll(/!\[[^\]]*\]\(jnana-asset:\/\/([^)\s]+)\)/g)) {
    const kind = classifyFile(m[1])
    if (kind === 'image' || kind === 'pdf') out.push({ filename: m[1], kind })
  }
  return out
}

/** How many notes a topic/time scope may pull in — grows with the budget
 *  (8 at the old ~3k-token size, up to 40 for very large budgets). */
export function maxNotesFor(budgetTokens: number): number {
  return Math.min(40, Math.max(8, Math.floor(budgetTokens / 2000)))
}

/**
 * Split `budget` characters across notes of the given lengths, fairly: short
 * notes keep everything, and whatever they don't use is shared by the longer
 * ones (water-filling). Returns each note's allowance, in input order.
 */
export function allocate(lengths: number[], budget: number): number[] {
  const alloc = new Array<number>(lengths.length).fill(0)
  const order = lengths.map((_, i) => i).sort((a, b) => lengths[a] - lengths[b])
  let remaining = Math.max(0, budget)
  order.forEach((i, k) => {
    const share = Math.floor(remaining / (order.length - k))
    alloc[i] = Math.min(lengths[i], share)
    remaining -= alloc[i]
  })
  return alloc
}

/** Indices 0..n-1 ordered so any prefix is spread across the range:
 *  first, last, middle, quarters, eighths, … then anything left. */
function spreadOrder(n: number): number[] {
  const out: number[] = []
  const seen = new Set<number>()
  const push = (i: number) => {
    if (i >= 0 && i < n && !seen.has(i)) {
      seen.add(i)
      out.push(i)
    }
  }
  push(0)
  push(n - 1)
  for (let step = (n - 1) / 2; step >= 1; step /= 2) {
    for (let x = step; x < n - 1; x += step * 2) push(Math.round(x))
  }
  for (let i = 0; i < n; i++) push(i)
  return out
}

/**
 * Choose passages totalling at most `limit` characters. With `scores`
 * (higher = more relevant; missing = unranked) the best-scoring go first;
 * without, they're spread evenly across the note. The result keeps document
 * order, with a "[…]" marker wherever passages were skipped.
 */
export function pickPassages(passages: string[], limit: number, scores?: (number | undefined)[]): string {
  const n = passages.length
  if (n === 0 || limit <= 0) return ''
  const ranked = scores?.some((s) => s !== undefined)
  const order = ranked
    ? passages.map((_, i) => i).sort((a, b) => (scores![b] ?? -Infinity) - (scores![a] ?? -Infinity))
    : spreadOrder(n)

  const chosen: number[] = []
  let used = 0
  const SEP = 7 // "\n\n[…]\n\n"
  for (const i of order) {
    const cost = passages[i].length + (chosen.length ? SEP : 0)
    if (used + cost <= limit) {
      chosen.push(i)
      used += cost
    }
  }
  // Nothing fits whole (one huge passage): take the top pick's opening.
  if (chosen.length === 0) return passages[order[0]].slice(0, limit)

  chosen.sort((a, b) => a - b)
  return chosen
    .map((i, k) => (k > 0 && i !== chosen[k - 1] + 1 ? `[…]\n\n${passages[i]}` : passages[i]))
    .join('\n\n')
}

interface Prepared {
  note: Note
  title: string
  /** Whole plain text (embed links stripped, PDF text appended). */
  text: string
  /** Same text as passages, aligned with the embedding index's chunk indices. */
  passages: string[]
}

async function prepare(note: Note): Promise<Prepared> {
  let pdfText = ''
  try {
    pdfText = await getAttachmentText(note.id)
  } catch {
    pdfText = '' // best-effort: a lookup failure just means no PDF text
  }
  const title = note.title?.trim() || 'Untitled'
  // chunkNote prefixes every chunk with "<title>\n\n" so a stored chunk stands
  // alone; strip it back off for the prompt, which heads each note already.
  const passages = chunkNote(note, pdfText).map((c) => c.chunkText.slice(title.length + 2))
  return { note, title, text: passages.join('\n\n'), passages }
}

/** Relevance of each over-budget note's passages to `query`, from the stored
 *  embedding index. Any failure (AI off, no index) → no scores → even spread. */
async function scorePassages(
  query: string,
  prepared: Prepared[],
  config: AiConfig,
): Promise<Map<string, (number | undefined)[]>> {
  const out = new Map<string, (number | undefined)[]>()
  if (!query.trim() || prepared.length === 0) return out
  try {
    const [queryVector] = await getEmbeddingProvider(config).embed([query])
    if (!queryVector) return out
    const wanted = new Map(prepared.map((p) => [p.note.id, p]))
    const topK = prepared.reduce((sum, p) => sum + p.passages.length, 0) * 3 + 50
    const hits = await invoke<RetrievalHit[]>('search_embeddings', { queryVector, topK })
    for (const h of hits) {
      const p = wanted.get(h.noteId)
      // A note edited since it was indexed may have shifted chunks — only trust
      // a score whose stored text still matches the passage at that index.
      if (!p || `${p.title}\n\n${p.passages[h.chunkIndex]}` !== h.chunkText) continue
      const scores = out.get(h.noteId) ?? new Array<number | undefined>(p.passages.length).fill(undefined)
      scores[h.chunkIndex] = h.score
      out.set(h.noteId, scores)
    }
  } catch {
    return new Map()
  }
  return out
}

/**
 * Gather up to `max` images from the notes, taking turns across notes (so one
 * picture-heavy note can't use the whole allowance). Image embeds are loaded as
 * they are; a PDF contributes rendered pages only when it has no text layer —
 * a text PDF is already in the prompt as text. Returns the images in send
 * order plus a caption line per note.
 */
async function collectImages(notes: Note[], max: number): Promise<{ images: string[]; captions: string[][] }> {
  const queues = notes.map((n) => mediaIn(n.content))
  const captions: string[][] = notes.map(() => [])
  const images: string[] = []
  // Load the media helpers (and pdf.js) only when a note actually embeds something.
  if (max <= 0 || queues.every((q) => q.length === 0)) return { images, captions }
  const { loadImageForVision, renderPdfPagesForVision } = await import('../media/visionImages')
  const extractPdfText = (f: string) => import('../media/pdfText').then((m) => m.extractPdfText(f))

  let progressed = true
  while (images.length < max && progressed) {
    progressed = false
    for (let i = 0; i < queues.length && images.length < max; i++) {
      const item = queues[i].shift()
      if (!item) continue
      progressed = true
      const name = basenameOf(item.filename)
      if (item.kind === 'image') {
        const url = await loadImageForVision(item.filename)
        if (url) {
          images.push(url)
          captions[i].push(`Image ${images.length} — ${name}`)
        }
        continue
      }
      const hasText = await extractPdfText(item.filename).then((t) => t.trim().length > 0, () => true)
      if (hasText) continue
      const pages = await renderPdfPagesForVision(item.filename, Math.min(MAX_SCANNED_PAGES, max - images.length))
      pages.forEach((url, p) => {
        images.push(url)
        captions[i].push(`Image ${images.length} — ${name}, page ${p + 1} (scanned)`)
      })
    }
  }
  return { images, captions }
}

export interface NoteContext {
  /** The notes block for the prompt. */
  text: string
  /** Data-URL images to attach, numbered in the order the text's captions list them. */
  images: string[]
}

/**
 * The notes block for a grounded prompt, within `budgetTokens`. `query` (the
 * question or topic) lets over-long notes contribute their most relevant
 * passages; without it they contribute an even spread. Images are gathered
 * only when the chat model has vision, and reserve their share of the budget.
 */
export async function buildNoteContext(
  notes: Note[],
  opts: { budgetTokens: number; config: AiConfig; query?: string },
): Promise<NoteContext> {
  const prepared = await Promise.all(notes.map(prepare))
  const { images, captions } = isVisionModel(opts.config.chatModel)
    ? await collectImages(notes, maxImagesFor(opts.budgetTokens))
    : { images: [] as string[], captions: notes.map(() => [] as string[]) }
  const textTokens = Math.max(1000, opts.budgetTokens - images.length * TOKENS_PER_IMAGE)
  const budget = textTokens * CHARS_PER_TOKEN
  const allowance = allocate(prepared.map((p) => p.text.length), budget)

  const overflowing = prepared.filter((p, i) => p.text.length > allowance[i])
  const scores = opts.query ? await scorePassages(opts.query, overflowing, opts.config) : new Map()

  const blocks = prepared.map((p, i) => {
    const whole = p.text.length <= allowance[i]
    const body = whole ? p.text : pickPassages(p.passages, allowance[i], scores.get(p.note.id))
    const pics = captions[i].length ? `\n\n[Attached from this note: ${captions[i].join('; ')}]` : ''
    return `### Note ${i + 1}: ${p.title}${whole ? '' : ' (excerpts)'}\n${body}${pics}`
  })
  const imageNote = images.length
    ? `\n\n(${images.length} image${images.length === 1 ? ' is' : 's are'} attached from these notes, in the order listed above. Treat what they show as part of the notes.)`
    : ''
  return { text: blocks.join('\n\n') + imageNote, images }
}
