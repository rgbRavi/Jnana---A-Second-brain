import type { AiConfig, AnalyzeInput, Note, QuizQuestion } from '../../types'
import { contextBlockFor, resolveContextNotes } from './analyze'
import { getChatProvider } from './provider'

const SYSTEM_PROMPT = `You are a study quiz generator for a personal knowledge app. Using ONLY the
provided notes (never outside facts), write 4–6 questions that test understanding. Mix the types:
"recall" (facts/definitions), "application" (use an idea in a scenario), and "compare" (contrast
two ideas). For each question give the correct answer and a one-sentence explanation of why it's
right. If the notes are too thin to quiz, return an empty array.

Respond with ONLY a JSON array, no prose:
[{"kind":"recall","question":"…","answer":"…","explanation":"…"}]`

/** Tolerantly extract the quiz JSON array from a model response. */
function parseQuiz(raw: string): QuizQuestion[] {
  let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)

  const arr = JSON.parse(text) as unknown
  if (!Array.isArray(arr)) return []
  return arr
    .map((x) => {
      const item = x as Record<string, unknown>
      return {
        kind: typeof item.kind === 'string' ? item.kind : 'recall',
        question: typeof item.question === 'string' ? item.question : '',
        answer: typeof item.answer === 'string' ? item.answer : '',
        explanation: typeof item.explanation === 'string' ? item.explanation : '',
      }
    })
    .filter((q) => q.question && q.answer)
}

/**
 * Generate a quiz from the notes selected by `input` (the same topic/time/note
 * scoping the analyzer uses). Grounded in the user's own notes only.
 */
export async function generateQuiz(
  input: AnalyzeInput,
  config: AiConfig,
  notes: Note[],
): Promise<QuizQuestion[]> {
  const contextNotes = await resolveContextNotes(input, config, notes)
  if (contextNotes.length === 0) return []

  const provider = getChatProvider(config)
  const raw = await provider.complete(
    `Make a quiz from these notes:\n\n${contextBlockFor(contextNotes)}`,
    { system: SYSTEM_PROMPT, temperature: 0.4 },
  )

  try {
    return parseQuiz(raw)
  } catch {
    return []
  }
}
