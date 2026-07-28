# Quiz: question formats, grading, and settings — design

**Date:** 2026-07-26
**Status:** approved, ready for an implementation plan
**Source:** [problems with quiz.md](../../../problems%20with%20quiz.md)

## Problem

The quiz feature ([core/ai/quiz.ts](../../../src/core/ai/quiz.ts), surfaced as the third
`ResponseMode` in [ui/ai/AiChat.tsx](../../../src/ui/ai/AiChat.tsx)) generates 4–6 open-ended
questions and reveals their answers on click. Seven gaps:

1. It repeats questions across runs — nothing tells the model what it already asked, and
   `temperature: 0.4` over a fixed note set is close to deterministic.
2. No multiple-choice (MCQ) or multiple-choice-multiple-answer (MCMA) questions.
3. No way to choose between objective and descriptive question formats.
4. Selected options are never graded; there are no quiz settings.
5. No control over question count, no marks per question, no score.
6. No settings for: count, negative marking, feedback timing, RAG source.
7. Descriptive answers are never graded by the AI.

## Decisions

| Decision | Choice |
|---|---|
| Where a graded quiz runs | In AI chat, as today's quiz mode — settings popover + toolbar + an interactive card |
| Persisting a quiz | A **Save** button materializes a `kind='quiz'` note (JSON attempt in `note.content`) |
| Stopping repeats | Send the last ~40 asked questions as a do-not-repeat block; raise temperature; dedupe on normalized text after parse |
| Item 6d ("index into a rag or not") | Both a source toggle (retrieval vs raw notes) **and** an "Index now" prompt when the index is cold |
| Marks | Default 1 per question, −0.25 negative marking; per-format weights configurable |
| MCMA scoring | User-selectable — all-or-nothing / partial / proportional; all three implemented |

No SQLite migration. `notes.kind` (migrate_v17) and `note.content` carry everything; settings and
question memory are localStorage module stores.

## Data model

```ts
// src/types/index.ts
export type QuizFormat = 'mcq' | 'mcma' | 'descriptive'

export interface QuizQuestion {
  kind: string              // unchanged — recall | application | compare
  format: QuizFormat        // new
  question: string
  options?: string[]        // mcq/mcma only
  correct?: number[]        // indices into options (mcq = 1, mcma = many)
  answer: string            // reference answer — reveal + descriptive grading
  explanation: string
  marks: number             // weight frozen in at generation time
}

export interface QuizSettings {
  count: number                            // 6
  formats: Record<QuizFormat, boolean>     // all true
  weights: Record<QuizFormat, number>      // all 1
  negativeMarking: boolean                 // true
  negativeFraction: number                 // 0.25 x that question's marks
  mcmaRule: 'allOrNothing' | 'partial' | 'proportional'   // 'partial'
  feedback: 'immediate' | 'end'            // 'end'
  source: 'retrieval' | 'raw'              // item 6d
  difficulty: 'easy' | 'medium' | 'hard' | 'mix'          // 'mix'
  showToolbar: boolean                     // true
}

export interface QuizAttempt {
  questions: QuizQuestion[]
  responses: (number[] | string)[]   // indices for mcq/mcma, text for descriptive
  marks: (number | null)[]           // awarded per question; null = ungraded
  feedback: string[]                 // grader justification, descriptive only
  total: number
  max: number
  scopeLabel: string
  takenAt: number
}
```

`QuizQuestion.kind` keeps its current meaning (the cognitive axis, now also driven by
`difficulty`); `format` is the new orthogonal axis. A question parsed without `format` — an older
saved conversation — defaults to `'descriptive'`.

### Storage

- **Settings** — localStorage module store `jnana.quiz.settings.v1`, following the
  [useComposerOptions](../../../src/hooks/useComposerOptions.ts) pattern
  (`useSyncExternalStore` + a non-reactive getter for callers outside React).
- **Asked-question memory** — localStorage module store `jnana.quiz.asked.v1`, shaped
  `Record<vaultId, string[]>`: a ring buffer of the last 200 normalized question texts per vault.
- **Saved quiz** — a `kind='quiz'` note whose `content` is `JSON.stringify(QuizAttempt)`.

## Generation ([core/ai/quiz.ts](../../../src/core/ai/quiz.ts))

`generateQuiz(input, config, notes, settings)` — one extra argument, same call site in `AiChat`.
Its return type widens from `QuizQuestion[]` to
`{ questions: QuizQuestion[]; reason?: 'empty-index' | 'empty-scope' }` so the runner can tell an
empty result apart from a cold index. `AiChat` is the only caller.

**Prompt**

- Inject the enabled formats and exact count: "write exactly N questions, only these formats: …".
- Spell out the JSON shape per format. MCQ/MCMA must emit `options` (4) plus `correct` indices;
  MCMA must have at least 2 correct.
- Append a do-not-repeat block: the last ~40 asked questions for this vault, verbatim, with
  "avoid these and anything semantically equivalent".
- Map `difficulty` onto the existing `kind` axis — `easy` = recall/definition, `medium` =
  application, `hard` = compare/synthesize/multi-step, `mix` = spread across all three (today's
  behaviour). No new output field.
- Raise `temperature` from 0.4 to 0.7.

**Source (item 6d)**

- `settings.source === 'raw'` — skip `retrieve()` and feed the scoped notes directly, still capped
  by `MAX_CONTEXT_NOTES`.
- `settings.source === 'retrieval'` with `input.mode === 'topic'` — today's path through
  `resolveContextNotes` ([analyze.ts:45](../../../src/core/ai/analyze.ts#L45)).
- Cold index: when retrieval returns nothing, `generateQuiz` reports `reason: 'empty-index'` so the
  runner can offer **Index now** (vault-scoped `reindexAll`) instead of the misleading
  "Not enough in these notes to build a quiz."

**Post-parse hardening** — `parseQuiz` stays tolerant and never throws:

- Drop questions whose `format` is disabled, or whose mcq/mcma lack usable `options`/`correct`.
- Coerce an MCQ carrying multiple `correct` indices into MCMA when MCMA is enabled; otherwise keep
  the first index.
- Stamp `marks` from `settings.weights[format]`.
- Dedupe against the asked-question memory by normalized text (lowercase, strip punctuation and
  collapse whitespace). The prompt block is the instruction; this is the enforcement.
- If filtering leaves the quiz short by more than one question, retry **once** with the kept
  questions added to the exclusion list. One retry, not a loop.

After a quiz renders, its normalized question texts are pushed into the memory store, trimmed to
200 per vault.

Skipped: semantic (embedding) dedupe of past questions. Exact-text matching plus a higher
temperature addresses the reported symptom; add embedding dedupe if paraphrased repeats show up in
real use.

## Grading (`src/core/ai/quizGrade.ts`, new)

Split so the deterministic half is pure and testable and the AI call is isolated.

### Pure — `scoreObjective(q, picked: number[], settings): number`

| Case | Award |
|---|---|
| No selection | `0` — unanswered is never penalised |
| MCQ correct | `+marks` |
| MCQ wrong | `negativeMarking ? -negativeFraction * marks : 0` |
| MCMA `allOrNothing` | exact set match → `+marks`; otherwise the wrong-answer penalty above |
| MCMA `partial` | `(correctPicked / totalCorrect) * marks - wrongPicked * negativeFraction * marks`, floored at 0 |
| MCMA `proportional` | `(correctPicked / totalCorrect) * marks`, or `0` if any wrong option is picked |

The per-question floor applies to `partial` only. A wrong MCQ can still pull the **total** below
zero — that is what negative marking is for — and the total is displayed verbatim (`-1.5 / 6`),
not clamped.

### AI — `gradeDescriptive(items, config): Promise<{ marks: number | null; feedback: string }[]>`

- The grader sees the question, the reference `answer`, the user's text, and the `marks` cap. It
  awards `0…marks` in 0.5 steps plus a one-line justification.
- `feedback: 'end'` — one batched call for every descriptive answer at submit.
  `feedback: 'immediate'` — one call for that single question as it is answered. Same function,
  array of one.
- An unparseable response yields `marks: null`, rendered as **Ungraded** and excluded from both
  the total and the max. A grader failure must never read as a wrong answer.
- Reuses `getChatProvider(config)` and the tolerant JSON extraction already in
  [quiz.ts](../../../src/core/ai/quiz.ts) — lift that into a shared helper rather than writing a
  third copy of it.

## UI

### Chrome ([AiChat.tsx](../../../src/ui/ai/AiChat.tsx))

Quiz mode only: a gear button beside the mode dropdown opens the settings popover (portaled to
`<body>`, viewport-clamped, as [SuggestionMenu](../../../src/ui/ai/SuggestionMenu.tsx) does), and
an optional toolbar row sits above the input.

Popover, built from the themed
[SettingControls](../../../src/ui/settings/SettingControls.tsx) primitives:

- per-format enable toggle + weight (3 rows)
- negative marking toggle + fraction slider
- MCMA rule select
- feedback timing select
- source select (retrieval / raw notes)
- show-toolbar toggle

Toolbar (hidden when `showToolbar` is false):
`[ 6 ▾ questions ]  [✓ MCQ] [✓ MCMA] [✓ Descriptive]  [ Mix ▾ ]`

The toolbar writes to the same settings store as the popover — one source of truth, the toolbar
being a compact view of the four knobs touched every quiz. With all three format checkboxes off,
send is blocked with a hint instead of generating an empty quiz.

### `QuizRunner` (`src/ui/ai/QuizRunner.tsx`, replaces `QuizCard`)

| Format | Control |
|---|---|
| MCQ | radio group |
| MCMA | checkbox group |
| Descriptive | textarea |

- **Immediate mode** — answering locks that question and shows right/wrong, marks awarded, and the
  explanation; a descriptive answer shows a spinner, then its marks and the grader's line. A
  running score sits in the header.
- **End mode** — everything stays editable until **Submit**, which runs one grading pass and shows
  the results header (`4.75 / 6`) with an expandable per-question breakdown.
- Cold index with `source: 'retrieval'` — an **Index now** button running vault-scoped
  `reindexAll`, then regenerating.
- **Save quiz** on the results header creates the `kind='quiz'` note.

In-progress answers live in `useViewState` keyed by conversation id plus message index, not
component state, so a half-finished 20-question quiz survives navigating to a note and back —
matching how the chat thread already behaves.

Accessibility: options are real `<input>`s inside a `<fieldset>` whose legend is the question text;
immediate-mode results are announced via `aria-live="polite"`; keyboard order runs question →
options → next.

Skipped: timer/countdown, a question-navigation sidebar, retake-in-place inside chat. None were
requested and all sit cheaply on top of `QuizAttempt` later.

## Saved quiz note (`src/plugins/quiz/`)

A first-party built-in registered in `registerBuiltinPlugins()` beside canvas and flashcards.

- `id: 'quiz'`, label "Quiz", a lucide icon. `note.content` is `JSON.stringify(QuizAttempt)`.
- **`View` and `Editor` are the same component** — results header, per-question breakdown, and a
  **Retake** button that clears `responses`/`marks`, re-runs the runner, and writes the new attempt
  back through `onChange`. No raw-JSON editor.
- `toSearchText` — questions, reference answers, and explanations as plain text, so a saved quiz is
  findable by keyword and embeds into RAG like any other note.
- `toExportMarkdown` — numbered questions, options as a list, correct answers, explanations, and
  the score line. This doubles as the plain-markdown escape hatch.
- `newContent` — an empty attempt. The registry has no hide-from-creation flag, so a quiz note
  created from the command palette renders an empty state ("Take a quiz in AI chat to fill this")
  rather than a broken editor.

## Files

| File | Change |
|---|---|
| [types/index.ts](../../../src/types/index.ts) | `QuizFormat`, extended `QuizQuestion`, `QuizSettings`, `QuizAttempt` |
| `hooks/useQuizSettings.ts` | new — localStorage module store |
| `core/ai/quizMemory.ts` | new — asked-question ring buffer, per vault |
| [core/ai/quiz.ts](../../../src/core/ai/quiz.ts) | prompt (formats/count/difficulty/exclusions), temperature 0.7, source toggle, hardened parse + one retry |
| `core/ai/quizGrade.ts` | new — pure `scoreObjective` + `gradeDescriptive` |
| `ui/ai/QuizRunner.tsx` | new — replaces `QuizCard`, lifted out of the ~800-line `AiChat.tsx` |
| `ui/ai/QuizControls.tsx` | new — settings popover + toolbar |
| [ui/ai/AiChat.tsx](../../../src/ui/ai/AiChat.tsx) | render the controls in quiz mode, pass settings into `generateQuiz`, swap card for runner |
| `plugins/quiz/{index.ts,QuizNoteView.tsx,quizNote.ts}` | new — the `kind='quiz'` note type |
| [main.tsx](../../../src/main.tsx) | register the built-in |

## Testing

Pure modules, no mocks, no fixtures:

- `quizGrade.test.ts` — all three MCMA rules, negative marking on and off, blank answers,
  wrong-pick zeroing under `proportional`, a total containing an ungraded descriptive answer.
- `quiz.test.ts` — parse behaviour: format filtering, MCQ→MCMA coercion, dedupe against memory,
  marks stamping, the short-quiz retry path.
- `quizNote.test.ts` — `QuizAttempt` round-trip through `note.content`, plus `toExportMarkdown`.

The runner and popover are not unit-tested — UI cannot be verified headlessly in this project;
they are checked in `npm run tauri dev`.
