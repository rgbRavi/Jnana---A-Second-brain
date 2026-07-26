// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type {
  AiConfig,
  AnalyzeInput,
  Note,
  QuizFormat,
  QuizGeneration,
  QuizQuestion,
  QuizSettings,
} from '../../types'
import { contextBlockFor, resolveContextNotes } from './analyze'
import { extractJsonArray } from './jsonish'
import { getAskedQuestions, normalizeQuestion, rememberQuestions } from './quizMemory'
import { getChatProvider } from './provider'

/** Cap on notes fed to the model when retrieval is bypassed (mirrors the analyzer's). */
const MAX_RAW_NOTES = 8

const DIFFICULTY_GUIDE: Record<QuizSettings['difficulty'], string> = {
  easy: 'easy — definitions and direct recall of what the notes state',
  medium: 'medium — apply an idea from the notes to a short scenario',
  hard: 'hard — compare, contrast or synthesize across several ideas in the notes',
  mix: 'mix — spread the questions across recall, application and comparison',
}

const FORMAT_GUIDE: Record<QuizFormat, string> = {
  mcq: '"mcq" — exactly 4 entries in "options" and exactly one index in "correct"',
  mcma: '"mcma" — exactly 4 entries in "options" and two or more indices in "correct"',
  descriptive: '"descriptive" — no "options"/"correct"; the student writes a short answer',
}

/** Enabled formats, in a stable order. */
function enabledFormats(settings: QuizSettings): QuizFormat[] {
  return (['mcq', 'mcma', 'descriptive'] as QuizFormat[]).filter((f) => settings.formats[f])
}

/** The system prompt for one generation, shaped by the user's quiz settings. */
export function buildQuizSystemPrompt(settings: QuizSettings): string {
  const formats = enabledFormats(settings)
  return `You are a study quiz generator for a personal knowledge app. Using ONLY the provided
notes (never outside facts), write exactly ${settings.count} questions that test understanding.
Difficulty: ${DIFFICULTY_GUIDE[settings.difficulty]}.

Allowed formats — use only these, spread evenly across them:
${formats.map((f) => `- ${FORMAT_GUIDE[f]}`).join('\n')}

For every question give "answer" (the correct answer written out) and "explanation" (one sentence
on why it is right). Distractor options must be plausible and drawn from the notes' subject matter.
If the notes are too thin to quiz, return an empty array.

Respond with ONLY a JSON array, no prose:
[{"kind":"recall","format":"mcq","question":"…","options":["…","…","…","…"],"correct":[1],"answer":"…","explanation":"…"}]`
}

/** The "don't ask these again" block, or '' when nothing has been asked yet. */
function exclusionBlock(asked: string[]): string {
  if (asked.length === 0) return ''
  const recent = asked.slice(-40)
  return `\n\nYou have already asked the following questions. Do not repeat any of them, and do not
ask a reworded version of one:\n${recent.map((q) => `- ${q}`).join('\n')}`
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function asIndexArray(value: unknown, optionCount: number): number[] {
  const raw = Array.isArray(value) ? value : [value]
  const out = raw
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < optionCount)
  return [...new Set(out)]
}

/**
 * Tolerantly extract questions from a model reply and enforce the user's
 * settings: disabled formats are dropped, malformed choice questions are
 * dropped, multi-answer questions are routed to the right format, marks are
 * stamped, and anything already asked (`asked`, raw question texts) is removed.
 * Never throws.
 */
export function parseQuiz(raw: string, settings: QuizSettings, asked: string[]): QuizQuestion[] {
  let arr: unknown
  try {
    arr = JSON.parse(extractJsonArray(raw))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []

  const seen = new Set(asked.map(normalizeQuestion))
  const out: QuizQuestion[] = []

  for (const entry of arr) {
    const item = entry as Record<string, unknown>
    if (!item || typeof item !== 'object') continue

    const question = typeof item.question === 'string' ? item.question.trim() : ''
    const answer = typeof item.answer === 'string' ? item.answer.trim() : ''
    if (!question || !answer) continue

    const key = normalizeQuestion(question)
    if (!key || seen.has(key)) continue

    const rawFormat = typeof item.format === 'string' ? item.format.toLowerCase() : ''
    let format: QuizFormat =
      rawFormat === 'mcq' || rawFormat === 'mcma' || rawFormat === 'descriptive'
        ? rawFormat
        : 'descriptive'

    let options: string[] | undefined
    let correct: number[] | undefined

    if (format !== 'descriptive') {
      options = asStringArray(item.options)
      if (options.length < 2) continue
      correct = asIndexArray(item.correct, options.length)
      if (correct.length === 0) continue

      // A model often returns several correct indices on an "mcq". Route it to
      // the format that actually fits, or trim it if that format is disabled.
      if (correct.length > 1) format = settings.formats.mcma ? 'mcma' : 'mcq'
      if (format === 'mcq') correct = correct.slice(0, 1)
      if (format === 'mcma' && correct.length < 2) format = 'mcq'
    }

    if (!settings.formats[format]) continue

    seen.add(key)
    out.push({
      kind: typeof item.kind === 'string' ? item.kind : 'recall',
      format,
      question,
      ...(options ? { options } : {}),
      ...(correct ? { correct } : {}),
      answer,
      explanation: typeof item.explanation === 'string' ? item.explanation : '',
      marks: settings.weights[format],
    })
  }

  return out
}

/**
 * The notes a scope covers without going through the embedding index — used
 * when the user sets `source: 'raw'`. Topic mode degrades to a substring match,
 * which is exactly what "don't use retrieval" has to mean.
 */
export function rawScopeNotes(input: AnalyzeInput, notes: Note[]): Note[] {
  if (input.mode === 'note') return notes.filter((n) => n.id === input.noteId)

  if (input.mode === 'window') {
    return notes
      .filter((n) => {
        const t = n.updatedAt ?? n.createdAt
        return t >= input.since && t <= input.until
      })
      .slice(0, MAX_RAW_NOTES)
  }

  const q = input.query.trim().toLowerCase()
  if (!q) return notes.slice(0, MAX_RAW_NOTES)
  return notes
    .filter((n) => `${n.title ?? ''}\n${n.content}`.toLowerCase().includes(q))
    .slice(0, MAX_RAW_NOTES)
}

/**
 * Generate a quiz from the notes selected by `input`, shaped by `settings`.
 * Grounded in the user's own notes only. Records the questions it produced in
 * the vault's quiz memory so the next run can exclude them.
 */
export async function generateQuiz(
  input: AnalyzeInput,
  config: AiConfig,
  notes: Note[],
  settings: QuizSettings,
  vaultId: string,
): Promise<QuizGeneration> {
  const contextNotes =
    settings.source === 'raw'
      ? rawScopeNotes(input, notes)
      : await resolveContextNotes(input, config, notes)

  if (contextNotes.length === 0) {
    // Retrieval coming back empty usually means an unbuilt index, which the UI
    // can fix; anything else is genuinely an empty scope.
    const reason =
      settings.source === 'retrieval' && input.mode === 'topic' ? 'empty-index' : 'empty-scope'
    return { questions: [], reason }
  }

  const asked = getAskedQuestions(vaultId)
  const system = buildQuizSystemPrompt(settings)
  const provider = getChatProvider(config)
  const userPrompt = `Make a quiz from these notes:\n\n${contextBlockFor(contextNotes)}${exclusionBlock(asked)}`

  const first = await provider.complete(userPrompt, { system, temperature: 0.7 })
  let questions = parseQuiz(first, settings, asked)

  // Filtering (disabled formats, malformed choices, repeats) can leave the quiz
  // short. One retry, with what we kept added to the exclusion list.
  if (questions.length < settings.count - 1) {
    const askedPlus = [...asked, ...questions.map((q) => q.question)]
    const retryPrompt = `Make a quiz from these notes:\n\n${contextBlockFor(contextNotes)}${exclusionBlock(askedPlus)}`
    const second = await provider.complete(retryPrompt, { system, temperature: 0.8 })
    questions = [...questions, ...parseQuiz(second, settings, askedPlus)]
  }

  questions = questions.slice(0, settings.count)
  if (questions.length > 0) rememberQuestions(vaultId, questions.map((q) => q.question))
  return { questions }
}
