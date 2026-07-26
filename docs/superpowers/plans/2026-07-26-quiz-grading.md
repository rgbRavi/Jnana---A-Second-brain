# Quiz Grading, Formats & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the reveal-only AI quiz into a graded quiz with MCQ / MCMA / descriptive questions, per-format weights, negative marking, configurable feedback timing, and a question memory that stops repeats — saveable as a `kind='quiz'` note.

**Architecture:** All new logic lands in pure, unit-tested modules under `src/core/ai/` (generation, scoring, memory) plus two localStorage module stores. The UI stays inside the existing AI chat: `QuizControls` (settings popover + toolbar) and `QuizRunner` (interactive card) replace today's `QuizCard`. A quiz attempt is a `QuizAttempt` object carried inside the chat thread message, so it persists with the conversation for free. Saving materializes it as a `kind='quiz'` note via a new first-party plugin, exactly like `plugins/canvas`.

**Tech Stack:** React 19 + TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), Vitest, CSS Modules + design tokens, Tauri v2 (no Rust changes, no SQLite migration).

**Spec:** [../specs/2026-07-26-quiz-grading-design.md](../specs/2026-07-26-quiz-grading-design.md)

## Global Constraints

- **Every new `.ts`/`.tsx` file starts with the SPDX header**, verbatim:
  ```ts
  // SPDX-License-Identifier: AGPL-3.0-only
  // Copyright (c) 2026 Jnana Project
  ```
- **TypeScript is `strict` with `noUnusedLocals` + `noUnusedParameters`** — an unused import or parameter fails `npx tsc --noEmit`, which is the build.
- **No native dialogs.** Use `toast` (`src/lib/toast.ts`) and `showConfirmDialog` (`src/lib/dialog.ts`) — never `alert`/`confirm`/`prompt`.
- **No new dependencies.** Everything here is stdlib, React, and modules already in the repo.
- **No SQLite migration.** `notes.kind` (migrate_v17) already exists; do not touch `src-tauri/src/db/schema.rs`.
- **Colours come from design tokens** (`var(--accent)`, `var(--text-1)`, `var(--surface)`, `var(--danger)`, `var(--success)`, `var(--border)`, `var(--radius-sm)`, `var(--space-*)`). Never hardcode a hex for accent/surface/wash. Text on an accent fill uses `var(--on-accent)`.
- **Verification commands** (run from the repo root, `c:\Jnana-project\Jnana---A-Second-brain`):
  - single test file: `npx vitest run src/path/to/file.test.ts`
  - typecheck: `npx tsc --noEmit`
  - full suite: `npm test`
- **Commit only what the task touches.** Never `git add -A`. Commit messages use the repo's `feat:` / `fix:` / `test:` / `docs:` prefixes.
- **The app cannot be verified headlessly.** UI tasks end with a manual-check note for the user running `npm run tauri dev`; do not claim UI works from a passing typecheck.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/index.ts` (modify) | `QuizFormat`, `QuizDifficulty`, `McmaRule`, extended `QuizQuestion`, `QuizSettings`, `QuizAttempt`, `QuizGeneration` |
| `src/hooks/useQuizSettings.ts` (create) | localStorage module store for `QuizSettings` |
| `src/core/ai/quizMemory.ts` (create) | Per-vault ring buffer of asked questions + text normalization |
| `src/core/ai/jsonish.ts` (create) | Shared tolerant "extract a JSON array from a model reply" helper |
| `src/core/ai/quizGrade.ts` (create) | Pure objective scoring, attempt helpers, AI descriptive grading |
| `src/core/ai/quiz.ts` (modify) | Prompt building, format-aware parsing, source toggle, one retry |
| `src/ui/ai/QuizControls.tsx` (create) | Settings popover + optional toolbar |
| `src/ui/ai/QuizRunner.tsx` (create) | Interactive quiz card: answer, grade, score, save |
| `src/ui/ai/AiChat.tsx` (modify) | Wire controls + runner in quiz mode; quiz message carries a `QuizAttempt` |
| `src/ui/ai/Ai.module.css` (modify) | Classes for the runner's options, results, toolbar |
| `src/plugins/quiz/quizNote.ts` (create) | Pure `QuizAttempt` ↔ `note.content` projections |
| `src/plugins/quiz/QuizNoteView.tsx` (create) | Read + edit surface for a saved quiz note |
| `src/plugins/quiz/index.ts` (create) | Plugin definition registering the `quiz` note type |
| `src/plugins/index.ts` (modify) | Add the quiz plugin to `BUILTIN_PLUGINS` |
| `CLAUDE.md` (modify) | Document the quiz subsystem |

Tests: `src/hooks/useQuizSettings.test.ts`, `src/core/ai/quizMemory.test.ts`, `src/core/ai/quizGrade.test.ts`, `src/core/ai/quiz.test.ts`, `src/plugins/quiz/quizNote.test.ts`.

---

### Task 1: Types + settings store

**Files:**
- Modify: `src/types/index.ts` (the `QuizQuestion` block at ~line 319)
- Create: `src/hooks/useQuizSettings.ts`
- Test: `src/hooks/useQuizSettings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `QuizFormat`, `QuizDifficulty`, `McmaRule`, `QuizQuestion`, `QuizSettings`, `QuizAttempt`, `QuizGeneration` from `src/types`; `getQuizSettings(): QuizSettings`, `setQuizSettings(patch: Partial<QuizSettings>): void`, `useQuizSettings(): [QuizSettings, (patch: Partial<QuizSettings>) => void]`, `QUIZ_SETTINGS_DEFAULTS` from `src/hooks/useQuizSettings`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useQuizSettings.test.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getQuizSettings, setQuizSettings } from './useQuizSettings'

describe('useQuizSettings store', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('returns defaults before anything is set', () => {
    const s = getQuizSettings()
    expect(s.count).toBe(6)
    expect(s.formats).toEqual({ mcq: true, mcma: true, descriptive: true })
    expect(s.weights).toEqual({ mcq: 1, mcma: 1, descriptive: 1 })
    expect(s.negativeMarking).toBe(true)
    expect(s.negativeFraction).toBe(0.25)
    expect(s.mcmaRule).toBe('partial')
    expect(s.feedback).toBe('end')
    expect(s.source).toBe('retrieval')
    expect(s.difficulty).toBe('mix')
    expect(s.showToolbar).toBe(true)
  })

  it('merges a partial patch and persists it', () => {
    setQuizSettings({ count: 12, difficulty: 'hard' })
    expect(getQuizSettings().count).toBe(12)
    expect(getQuizSettings().difficulty).toBe('hard')
    // untouched fields keep defaults
    expect(getQuizSettings().mcmaRule).toBe('partial')
    expect(localStorage.getItem('jnana.quiz.settings.v1')).toContain('"count":12')
  })

  it('merges nested format/weight maps without dropping keys', () => {
    setQuizSettings({ formats: { ...getQuizSettings().formats, mcma: false } })
    expect(getQuizSettings().formats).toEqual({ mcq: true, mcma: false, descriptive: true })
  })

  it('falls back to defaults when the stored JSON is corrupt', async () => {
    localStorage.setItem('jnana.quiz.settings.v1', '{ not valid json')
    vi.resetModules()
    const mod = await import('./useQuizSettings')
    expect(mod.getQuizSettings().count).toBe(6)
  })

  it('keeps the in-memory value and does not throw when persistence fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => setQuizSettings({ negativeMarking: false })).not.toThrow()
    expect(getQuizSettings().negativeMarking).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useQuizSettings.test.ts`
Expected: FAIL — `Failed to resolve import "./useQuizSettings"`.

- [ ] **Step 3: Add the types**

In `src/types/index.ts`, replace the existing `QuizQuestion` interface (the block starting `/** A single quiz question generated from the user's notes. */`) with:

```ts
/** How a quiz question is answered. */
export type QuizFormat = 'mcq' | 'mcma' | 'descriptive'

/** Requested cognitive difficulty for generated questions. */
export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mix'

/** How a multiple-answer question is scored. */
export type McmaRule = 'allOrNothing' | 'partial' | 'proportional'

/** A single quiz question generated from the user's notes. */
export interface QuizQuestion {
  /** recall | application | compare — a hint at the question's cognitive type. */
  kind: string
  /** How it is answered. Questions parsed without one default to 'descriptive'. */
  format: QuizFormat
  question: string
  /** Answer choices — mcq/mcma only. */
  options?: string[]
  /** Indices into `options` that are correct — one for mcq, two or more for mcma. */
  correct?: number[]
  /** Reference answer: shown on reveal, and given to the descriptive grader. */
  answer: string
  explanation: string
  /** Marks this question is worth, frozen in from settings at generation time. */
  marks: number
}

/** User-tunable quiz behaviour, persisted in localStorage (no DB row). */
export interface QuizSettings {
  /** How many questions to request. */
  count: number
  /** Which formats the generator may produce. */
  formats: Record<QuizFormat, boolean>
  /** Marks a question of each format is worth. */
  weights: Record<QuizFormat, number>
  /** Deduct marks for a wrong answer. */
  negativeMarking: boolean
  /** Penalty as a fraction of the question's marks (0.25 = a quarter). */
  negativeFraction: number
  mcmaRule: McmaRule
  /** Grade each question as it is answered, or all of them at submit. */
  feedback: 'immediate' | 'end'
  /** 'retrieval' = semantic search over the index; 'raw' = feed scoped notes directly. */
  source: 'retrieval' | 'raw'
  difficulty: QuizDifficulty
  /** Show the compact quiz toolbar above the AI composer. */
  showToolbar: boolean
}

/** One taken (or in-progress) quiz. Serialized into a kind='quiz' note on save. */
export interface QuizAttempt {
  questions: QuizQuestion[]
  /** Per question: selected option indices (mcq/mcma) or typed text (descriptive). */
  responses: (number[] | string)[]
  /** Per question: marks awarded, or null when unanswered/ungraded. */
  marks: (number | null)[]
  /** Per question: the descriptive grader's one-line justification ('' otherwise). */
  feedback: string[]
  /** Sum of non-null `marks`. */
  total: number
  /** Sum of `marks` for questions that were actually graded. */
  max: number
  /** Human label for the scope the quiz came from, e.g. 'Topic: neural networks'. */
  scopeLabel: string
  takenAt: number
}

/** Result of a generation attempt — `reason` explains an empty question list. */
export interface QuizGeneration {
  questions: QuizQuestion[]
  /** 'empty-index' = retrieval found nothing (offer to index); 'empty-scope' = no notes in scope. */
  reason?: 'empty-index' | 'empty-scope'
}
```

- [ ] **Step 4: Write the settings store**

Create `src/hooks/useQuizSettings.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useQuizSettings.ts
//
// Persistent quiz preferences. A module-level store backed by localStorage and
// read reactively via useSyncExternalStore — the same pattern as
// useComposerOptions / useGeneralSettings — so the settings popover and the
// compact toolbar are two views of one value.

import { useSyncExternalStore } from 'react'
import type { QuizSettings } from '../types'

const STORAGE_KEY = 'jnana.quiz.settings.v1'

export const QUIZ_SETTINGS_DEFAULTS: QuizSettings = {
  count: 6,
  formats: { mcq: true, mcma: true, descriptive: true },
  weights: { mcq: 1, mcma: 1, descriptive: 1 },
  negativeMarking: true,
  negativeFraction: 0.25,
  mcmaRule: 'partial',
  feedback: 'end',
  source: 'retrieval',
  difficulty: 'mix',
  showToolbar: true,
}

function load(): QuizSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return QUIZ_SETTINGS_DEFAULTS
    const stored = JSON.parse(raw) as Partial<QuizSettings>
    return {
      ...QUIZ_SETTINGS_DEFAULTS,
      ...stored,
      // Nested maps merge key-wise, so a partial stored value can't drop a format.
      formats: { ...QUIZ_SETTINGS_DEFAULTS.formats, ...stored.formats },
      weights: { ...QUIZ_SETTINGS_DEFAULTS.weights, ...stored.weights },
    }
  } catch {
    return QUIZ_SETTINGS_DEFAULTS
  }
}

let settings: QuizSettings = load()
const listeners = new Set<() => void>()

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setQuizSettings(patch: Partial<QuizSettings>): void {
  settings = { ...settings, ...patch }
  persist()
  listeners.forEach((l) => l())
}

/** Non-reactive read, for callers outside React (generation, grading). */
export function getQuizSettings(): QuizSettings {
  return settings
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => settings

export function useQuizSettings(): [QuizSettings, (patch: Partial<QuizSettings>) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return [value, setQuizSettings]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/hooks/useQuizSettings.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. If it reports errors in `src/ui/ai/AiChat.tsx` about `QuizQuestion.format`/`marks` being missing, that is expected only if AiChat constructs a `QuizQuestion` literal — it does not (it only reads them), so any error here is a real mistake in the type edit. Fix before committing.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/hooks/useQuizSettings.ts src/hooks/useQuizSettings.test.ts
git commit -m "feat(quiz): quiz formats, settings types and settings store"
```

---

### Task 2: Asked-question memory

**Files:**
- Create: `src/core/ai/quizMemory.ts`
- Test: `src/core/ai/quizMemory.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeQuestion(text: string): string`, `getAskedQuestions(vaultId: string): string[]` (raw question texts, oldest first), `rememberQuestions(vaultId: string, questions: string[]): void`, `clearAskedQuestions(vaultId: string): void`, `MAX_REMEMBERED` from `src/core/ai/quizMemory`.

- [ ] **Step 1: Write the failing test**

Create `src/core/ai/quizMemory.test.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_REMEMBERED,
  clearAskedQuestions,
  getAskedQuestions,
  normalizeQuestion,
  rememberQuestions,
} from './quizMemory'

describe('normalizeQuestion', () => {
  it('ignores case, punctuation and spacing differences', () => {
    expect(normalizeQuestion('  What IS back-propagation? ')).toBe(
      normalizeQuestion('what is back propagation'),
    )
  })

  it('keeps genuinely different questions distinct', () => {
    expect(normalizeQuestion('What is a tensor?')).not.toBe(normalizeQuestion('What is a vector?'))
  })
})

describe('quiz memory', () => {
  beforeEach(() => localStorage.clear())

  it('starts empty and remembers what was asked', () => {
    expect(getAskedQuestions('vault-default')).toEqual([])
    rememberQuestions('vault-default', ['What is a tensor?', 'Define entropy.'])
    expect(getAskedQuestions('vault-default')).toEqual(['What is a tensor?', 'Define entropy.'])
  })

  it('keeps vaults separate', () => {
    rememberQuestions('vault-a', ['A?'])
    rememberQuestions('vault-b', ['B?'])
    expect(getAskedQuestions('vault-a')).toEqual(['A?'])
    expect(getAskedQuestions('vault-b')).toEqual(['B?'])
  })

  it('does not store a question twice, even reworded in case/punctuation', () => {
    rememberQuestions('v', ['What is a tensor?'])
    rememberQuestions('v', ['what is a TENSOR'])
    expect(getAskedQuestions('v')).toEqual(['What is a tensor?'])
  })

  it('drops the oldest entries past the cap', () => {
    const many = Array.from({ length: MAX_REMEMBERED + 5 }, (_, i) => `Question ${i}?`)
    rememberQuestions('v', many)
    const kept = getAskedQuestions('v')
    expect(kept).toHaveLength(MAX_REMEMBERED)
    expect(kept[0]).toBe('Question 5?')
    expect(kept[kept.length - 1]).toBe(`Question ${MAX_REMEMBERED + 4}?`)
  })

  it('clears one vault only', () => {
    rememberQuestions('v', ['A?'])
    rememberQuestions('w', ['B?'])
    clearAskedQuestions('v')
    expect(getAskedQuestions('v')).toEqual([])
    expect(getAskedQuestions('w')).toEqual(['B?'])
  })

  it('treats corrupt storage as empty instead of throwing', () => {
    localStorage.setItem('jnana.quiz.asked.v1', 'not json')
    expect(getAskedQuestions('v')).toEqual([])
    expect(() => rememberQuestions('v', ['A?'])).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/ai/quizMemory.test.ts`
Expected: FAIL — `Failed to resolve import "./quizMemory"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/ai/quizMemory.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/quizMemory.ts
//
// What the quiz generator has already asked, per vault. Two jobs: it feeds a
// "do not repeat these" block into the prompt, and it backstops that
// instruction by dropping repeats the model produces anyway. Plain localStorage
// — a ring buffer of question texts is not worth a table.

const STORAGE_KEY = 'jnana.quiz.asked.v1'

/** Questions kept per vault. Old ones fall off the front. */
export const MAX_REMEMBERED = 200

type Store = Record<string, string[]>

/** Case/punctuation/spacing-insensitive form used for repeat detection. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Store
  } catch {
    return {}
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* storage unavailable — the prompt just loses its exclusion list */
  }
}

/** Every question asked in this vault, oldest first. */
export function getAskedQuestions(vaultId: string): string[] {
  return load()[vaultId] ?? []
}

/** Append questions, skipping ones already remembered, trimming to the cap. */
export function rememberQuestions(vaultId: string, questions: string[]): void {
  const store = load()
  const existing = store[vaultId] ?? []
  const seen = new Set(existing.map(normalizeQuestion))
  const next = [...existing]
  for (const q of questions) {
    const key = normalizeQuestion(q)
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push(q)
  }
  store[vaultId] = next.slice(-MAX_REMEMBERED)
  save(store)
}

export function clearAskedQuestions(vaultId: string): void {
  const store = load()
  delete store[vaultId]
  save(store)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/ai/quizMemory.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/quizMemory.ts src/core/ai/quizMemory.test.ts
git commit -m "feat(quiz): per-vault asked-question memory"
```

---

### Task 3: Objective scoring + attempt helpers

**Files:**
- Create: `src/core/ai/quizGrade.ts`
- Test: `src/core/ai/quizGrade.test.ts`

**Interfaces:**
- Consumes: `QuizQuestion`, `QuizSettings`, `QuizAttempt` from `src/types`; `QUIZ_SETTINGS_DEFAULTS` from `src/hooks/useQuizSettings` (test only).
- Produces: `scoreObjective(q: QuizQuestion, picked: number[], settings: QuizSettings): number`, `emptyAttempt(questions: QuizQuestion[], scopeLabel: string): QuizAttempt`, `recomputeTotals(attempt: QuizAttempt): QuizAttempt` from `src/core/ai/quizGrade`.

- [ ] **Step 1: Write the failing test**

Create `src/core/ai/quizGrade.test.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { QuizQuestion, QuizSettings } from '../../types'
import { QUIZ_SETTINGS_DEFAULTS } from '../../hooks/useQuizSettings'
import { emptyAttempt, recomputeTotals, scoreObjective } from './quizGrade'

const settings = (patch: Partial<QuizSettings> = {}): QuizSettings => ({
  ...QUIZ_SETTINGS_DEFAULTS,
  ...patch,
})

const mcq = (correct: number): QuizQuestion => ({
  kind: 'recall',
  format: 'mcq',
  question: 'Pick one',
  options: ['A', 'B', 'C', 'D'],
  correct: [correct],
  answer: 'B',
  explanation: '',
  marks: 1,
})

const mcma = (correct: number[]): QuizQuestion => ({
  kind: 'recall',
  format: 'mcma',
  question: 'Pick all',
  options: ['A', 'B', 'C', 'D'],
  correct,
  answer: 'B and D',
  explanation: '',
  marks: 1,
})

describe('scoreObjective — mcq', () => {
  it('awards full marks for the right option', () => {
    expect(scoreObjective(mcq(1), [1], settings())).toBe(1)
  })

  it('deducts the negative fraction for a wrong option', () => {
    expect(scoreObjective(mcq(1), [2], settings())).toBe(-0.25)
  })

  it('deducts nothing when negative marking is off', () => {
    expect(scoreObjective(mcq(1), [2], settings({ negativeMarking: false }))).toBe(0)
  })

  it('never penalises an unanswered question', () => {
    expect(scoreObjective(mcq(1), [], settings())).toBe(0)
  })

  it('scales the penalty with the question weight', () => {
    expect(scoreObjective({ ...mcq(1), marks: 4 }, [2], settings())).toBe(-1)
  })
})

describe('scoreObjective — mcma rules', () => {
  const q = mcma([1, 3])

  it('allOrNothing: exact set wins full marks', () => {
    expect(scoreObjective(q, [1, 3], settings({ mcmaRule: 'allOrNothing' }))).toBe(1)
  })

  it('allOrNothing: a partially right set is penalised like a wrong answer', () => {
    expect(scoreObjective(q, [1], settings({ mcmaRule: 'allOrNothing' }))).toBe(-0.25)
  })

  it('partial: credits right picks and deducts for wrong ones', () => {
    // one of two correct picked (0.5) minus one wrong pick (0.25)
    expect(scoreObjective(q, [1, 2], settings({ mcmaRule: 'partial' }))).toBe(0.25)
  })

  it('partial: floors a question at zero', () => {
    expect(scoreObjective(q, [0, 2], settings({ mcmaRule: 'partial' }))).toBe(0)
  })

  it('proportional: pro-rates a clean partial answer', () => {
    expect(scoreObjective(q, [1], settings({ mcmaRule: 'proportional' }))).toBe(0.5)
  })

  it('proportional: any wrong pick zeroes the question', () => {
    expect(scoreObjective(q, [1, 2], settings({ mcmaRule: 'proportional' }))).toBe(0)
  })

  it('scores a descriptive question as zero — it is graded by the model', () => {
    const d: QuizQuestion = {
      kind: 'recall', format: 'descriptive', question: 'Explain', answer: 'x',
      explanation: '', marks: 3,
    }
    expect(scoreObjective(d, [], settings())).toBe(0)
  })
})

describe('attempt helpers', () => {
  const questions = [mcq(1), mcma([1, 3])]

  it('creates a blank attempt sized to the questions', () => {
    const a = emptyAttempt(questions, 'Topic: tensors')
    expect(a.responses).toEqual([[], []])
    expect(a.marks).toEqual([null, null])
    expect(a.feedback).toEqual(['', ''])
    expect(a.total).toBe(0)
    expect(a.max).toBe(0)
    expect(a.scopeLabel).toBe('Topic: tensors')
    expect(a.takenAt).toBeGreaterThan(0)
  })

  it('seeds a descriptive response with an empty string, not an array', () => {
    const d: QuizQuestion = {
      kind: 'recall', format: 'descriptive', question: 'Explain', answer: 'x',
      explanation: '', marks: 1,
    }
    expect(emptyAttempt([d], 'scope').responses[0]).toBe('')
  })

  it('totals only graded questions', () => {
    const a = { ...emptyAttempt(questions, 's'), marks: [1, null] }
    const t = recomputeTotals(a)
    expect(t.total).toBe(1)
    expect(t.max).toBe(1) // the ungraded mcma is excluded from the max too
  })

  it('keeps a negative total rather than clamping it', () => {
    const a = { ...emptyAttempt(questions, 's'), marks: [-0.25, -0.25] }
    expect(recomputeTotals(a).total).toBe(-0.5)
    expect(recomputeTotals(a).max).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/ai/quizGrade.test.ts`
Expected: FAIL — `Failed to resolve import "./quizGrade"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/ai/quizGrade.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/quizGrade.ts
//
// Scoring. Objective questions are graded here, deterministically and offline;
// only descriptive answers cost a model call (added in the next task). Kept
// pure and IO-free so the marking rules are unit-testable, in the same spirit
// as views/notes/filterNotes.ts.

import type { QuizAttempt, QuizQuestion, QuizSettings } from '../../types'

/**
 * Marks for one answered objective question. Never called for descriptive
 * questions (they return 0 here). An unanswered question always scores 0 —
 * negative marking punishes a wrong answer, not a skipped one.
 */
export function scoreObjective(
  q: QuizQuestion,
  picked: number[],
  settings: QuizSettings,
): number {
  if (q.format === 'descriptive') return 0
  if (picked.length === 0) return 0

  const correct = q.correct ?? []
  if (correct.length === 0) return 0

  const penalty = settings.negativeMarking ? settings.negativeFraction * q.marks : 0
  const correctSet = new Set(correct)
  const hits = picked.filter((i) => correctSet.has(i)).length
  const misses = picked.length - hits

  if (q.format === 'mcq') {
    return picked.length === 1 && hits === 1 ? q.marks : -penalty
  }

  switch (settings.mcmaRule) {
    case 'allOrNothing':
      return misses === 0 && hits === correct.length ? q.marks : -penalty
    case 'proportional':
      return misses > 0 ? 0 : (hits / correct.length) * q.marks
    case 'partial':
    default:
      // Right picks earn their share; wrong picks cost the penalty. Floored at
      // zero so one bad multi-answer can't eat another question's marks.
      return Math.max(0, (hits / correct.length) * q.marks - misses * penalty)
  }
}

/** A blank attempt for freshly generated questions. */
export function emptyAttempt(questions: QuizQuestion[], scopeLabel: string): QuizAttempt {
  return {
    questions,
    responses: questions.map((q) => (q.format === 'descriptive' ? '' : [])),
    marks: questions.map(() => null),
    feedback: questions.map(() => ''),
    total: 0,
    max: 0,
    scopeLabel,
    takenAt: Date.now(),
  }
}

/**
 * Recompute `total`/`max` from the per-question marks. Ungraded questions
 * (`marks[i] === null`) are excluded from both, so a grader failure reads as
 * "not marked" rather than "wrong". The total is reported as-is — negative
 * marking is allowed to push it below zero.
 */
export function recomputeTotals(attempt: QuizAttempt): QuizAttempt {
  let total = 0
  let max = 0
  attempt.marks.forEach((m, i) => {
    if (m === null) return
    total += m
    max += attempt.questions[i]?.marks ?? 0
  })
  // Trim float drift from repeated fraction arithmetic (0.1 + 0.2 territory).
  const round = (n: number) => Math.round(n * 100) / 100
  return { ...attempt, total: round(total), max: round(max) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/ai/quizGrade.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/ai/quizGrade.ts src/core/ai/quizGrade.test.ts
git commit -m "feat(quiz): objective scoring rules and attempt helpers"
```

---

### Task 4: Descriptive grading (model call + tolerant parse)

**Files:**
- Create: `src/core/ai/jsonish.ts`
- Modify: `src/core/ai/quizGrade.ts` (append)
- Test: `src/core/ai/quizGrade.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `scoreObjective`/`emptyAttempt`/`recomputeTotals` from Task 3; `getChatProvider` from `src/core/ai/provider`; `AiConfig` from `src/types`.
- Produces: `extractJsonArray(raw: string): string` from `src/core/ai/jsonish`; `DescriptiveItem { question: string; reference: string; answer: string; marks: number }`, `DescriptiveGrade { marks: number | null; feedback: string }`, `parseGrades(raw: string, caps: number[]): DescriptiveGrade[]`, `gradeDescriptive(items: DescriptiveItem[], config: AiConfig): Promise<DescriptiveGrade[]>` from `src/core/ai/quizGrade`.

- [ ] **Step 1: Write the failing test**

Append to `src/core/ai/quizGrade.test.ts` (and extend the existing import from `./quizGrade` to also pull in `parseGrades`):

```ts
describe('parseGrades', () => {
  it('reads marks and feedback from a clean JSON array', () => {
    const raw = '[{"marks":2,"feedback":"Covers both causes."},{"marks":0,"feedback":"Off topic."}]'
    expect(parseGrades(raw, [3, 3])).toEqual([
      { marks: 2, feedback: 'Covers both causes.' },
      { marks: 0, feedback: 'Off topic.' },
    ])
  })

  it('tolerates a fenced block and surrounding prose', () => {
    const raw = 'Here you go:\n```json\n[{"marks":1,"feedback":"Partly right."}]\n```\nHope that helps!'
    expect(parseGrades(raw, [2])).toEqual([{ marks: 1, feedback: 'Partly right.' }])
  })

  it('clamps to the question cap and rounds to half marks', () => {
    const raw = '[{"marks":9,"feedback":"a"},{"marks":1.3,"feedback":"b"},{"marks":-4,"feedback":"c"}]'
    expect(parseGrades(raw, [3, 3, 3]).map((g) => g.marks)).toEqual([3, 1.5, 0])
  })

  it('returns ungraded entries — never zeroes — when the reply is unparseable', () => {
    expect(parseGrades('the model said no', [2, 2])).toEqual([
      { marks: null, feedback: '' },
      { marks: null, feedback: '' },
    ])
  })

  it('pads a short reply with ungraded entries', () => {
    expect(parseGrades('[{"marks":1,"feedback":"ok"}]', [2, 2])).toEqual([
      { marks: 1, feedback: 'ok' },
      { marks: null, feedback: '' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/ai/quizGrade.test.ts`
Expected: FAIL — `parseGrades is not a function` / import error.

- [ ] **Step 3: Extract the shared JSON helper**

Create `src/core/ai/jsonish.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/core/ai/jsonish.ts
//
// Models wrap JSON in fences and chat around it however the mood takes them.
// One tolerant extractor, shared by every grounded generator that asks for an
// array back, instead of a copy per feature.

/** Strip fences/prose down to the outermost JSON array. Returns the input trimmed
 *  when no array is present — the caller's JSON.parse then fails as usual. */
export function extractJsonArray(raw: string): string {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return text
  return text.slice(start, end + 1)
}
```

- [ ] **Step 4: Append the grader to `src/core/ai/quizGrade.ts`**

Add these imports at the top of the file (merging with the existing `import type` line):

```ts
import type { AiConfig, QuizAttempt, QuizQuestion, QuizSettings } from '../../types'
import { extractJsonArray } from './jsonish'
import { getChatProvider } from './provider'
```

Then append:

```ts
const GRADER_SYSTEM = `You are marking a student's answers to questions drawn from their own notes.
For each item you get the question, a reference answer, the student's answer, and the maximum
marks. Award marks from 0 to the maximum, in steps of 0.5, judging meaning rather than wording —
a correct answer phrased differently from the reference still earns full marks. Add one short
sentence of feedback saying what earned or lost the marks.

Respond with ONLY a JSON array, one entry per item, in the same order, no prose:
[{"marks":2,"feedback":"…"}]`

/** One descriptive answer awaiting a mark. */
export interface DescriptiveItem {
  question: string
  /** The generated reference answer. */
  reference: string
  /** What the user typed. */
  answer: string
  /** Maximum marks for this question. */
  marks: number
}

/** A mark for one descriptive answer. `marks: null` means the grader failed. */
export interface DescriptiveGrade {
  marks: number | null
  feedback: string
}

/**
 * Tolerantly read the grader's reply. `caps` sets both the expected length and
 * each question's maximum. Anything unreadable becomes an ungraded entry rather
 * than a zero — an infrastructure failure must never look like a wrong answer.
 */
export function parseGrades(raw: string, caps: number[]): DescriptiveGrade[] {
  const ungraded: DescriptiveGrade = { marks: null, feedback: '' }
  let arr: unknown
  try {
    arr = JSON.parse(extractJsonArray(raw))
  } catch {
    return caps.map(() => ({ ...ungraded }))
  }
  if (!Array.isArray(arr)) return caps.map(() => ({ ...ungraded }))

  return caps.map((cap, i) => {
    const item = arr[i] as Record<string, unknown> | undefined
    if (!item || typeof item !== 'object') return { ...ungraded }
    const feedback = typeof item.feedback === 'string' ? item.feedback : ''
    const n = typeof item.marks === 'number' ? item.marks : Number(item.marks)
    if (!Number.isFinite(n)) return { marks: null, feedback }
    const clamped = Math.min(cap, Math.max(0, n))
    return { marks: Math.round(clamped * 2) / 2, feedback }
  })
}

/**
 * Mark descriptive answers with the chat model. One call for the whole batch —
 * pass a single-item array for immediate-feedback mode. Never throws: a provider
 * error comes back as ungraded entries.
 */
export async function gradeDescriptive(
  items: DescriptiveItem[],
  config: AiConfig,
): Promise<DescriptiveGrade[]> {
  const caps = items.map((it) => it.marks)
  if (items.length === 0) return []

  const body = items
    .map(
      (it, i) =>
        `Item ${i + 1} (max ${it.marks} marks)\nQuestion: ${it.question}\nReference answer: ${it.reference}\nStudent answer: ${it.answer.trim() || '(left blank)'}`,
    )
    .join('\n\n')

  try {
    const provider = getChatProvider(config)
    const raw = await provider.complete(body, { system: GRADER_SYSTEM, temperature: 0 })
    return parseGrades(raw, caps)
  } catch {
    return caps.map(() => ({ marks: null, feedback: '' }))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/core/ai/quizGrade.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/core/ai/jsonish.ts src/core/ai/quizGrade.ts src/core/ai/quizGrade.test.ts
git commit -m "feat(quiz): AI grading for descriptive answers"
```

---

### Task 5: Format-aware generation

**Files:**
- Modify: `src/core/ai/quiz.ts` (rewrite — the file is 62 lines)
- Test: `src/core/ai/quiz.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeQuestion`/`getAskedQuestions`/`rememberQuestions` (Task 2); `QuizSettings`/`QuizQuestion`/`QuizGeneration`/`AnalyzeInput`/`AiConfig`/`Note` from `src/types`; `resolveContextNotes`/`contextBlockFor` from `src/core/ai/analyze`; `extractJsonArray` from `src/core/ai/jsonish`; `getChatProvider` from `src/core/ai/provider`.
- Produces: `buildQuizSystemPrompt(settings: QuizSettings): string`, `parseQuiz(raw: string, settings: QuizSettings, asked: string[]): QuizQuestion[]`, `rawScopeNotes(input: AnalyzeInput, notes: Note[]): Note[]`, `generateQuiz(input: AnalyzeInput, config: AiConfig, notes: Note[], settings: QuizSettings, vaultId: string): Promise<QuizGeneration>` from `src/core/ai/quiz`.

**Note:** `generateQuiz`'s signature changes (two new parameters, new return type). `src/ui/ai/AiChat.tsx` is its only caller and is updated in Task 7 — `npx tsc --noEmit` will report that call site as an error until then. That is expected; do not "fix" it by reverting the signature.

- [ ] **Step 1: Write the failing test**

Create `src/core/ai/quiz.test.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { AnalyzeInput, Note, QuizSettings } from '../../types'
import { QUIZ_SETTINGS_DEFAULTS } from '../../hooks/useQuizSettings'
import { buildQuizSystemPrompt, parseQuiz, rawScopeNotes } from './quiz'

const settings = (patch: Partial<QuizSettings> = {}): QuizSettings => ({
  ...QUIZ_SETTINGS_DEFAULTS,
  ...patch,
})

const note = (id: string, title: string, content: string, updatedAt = 1000): Note => ({
  id,
  title,
  content,
  tags: [],
  createdAt: updatedAt,
  updatedAt,
})

describe('buildQuizSystemPrompt', () => {
  it('states the exact count and only the enabled formats', () => {
    const p = buildQuizSystemPrompt(
      settings({ count: 9, formats: { mcq: true, mcma: false, descriptive: false } }),
    )
    expect(p).toContain('exactly 9')
    expect(p).toContain('"mcq"')
    expect(p).not.toContain('"mcma"')
    expect(p).not.toContain('"descriptive"')
  })

  it('describes the requested difficulty', () => {
    expect(buildQuizSystemPrompt(settings({ difficulty: 'hard' }))).toContain('hard')
    expect(buildQuizSystemPrompt(settings({ difficulty: 'mix' }))).toContain('mix')
  })
})

describe('parseQuiz', () => {
  const good = JSON.stringify([
    {
      kind: 'recall',
      format: 'mcq',
      question: 'What is a tensor?',
      options: ['A', 'B', 'C', 'D'],
      correct: [1],
      answer: 'B',
      explanation: 'because',
    },
  ])

  it('parses a question and stamps the marks from settings', () => {
    const out = parseQuiz(good, settings({ weights: { mcq: 3, mcma: 1, descriptive: 1 } }), [])
    expect(out).toHaveLength(1)
    expect(out[0].marks).toBe(3)
    expect(out[0].format).toBe('mcq')
  })

  it('defaults a question with no format to descriptive', () => {
    const raw = JSON.stringify([
      { kind: 'recall', question: 'Explain entropy.', answer: 'x', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])[0].format).toBe('descriptive')
  })

  it('drops questions whose format the user disabled', () => {
    const out = parseQuiz(good, settings({ formats: { mcq: false, mcma: true, descriptive: true } }), [])
    expect(out).toEqual([])
  })

  it('drops choice questions with unusable options or correct indices', () => {
    const raw = JSON.stringify([
      { format: 'mcq', question: 'No options?', correct: [0], answer: 'a', explanation: '' },
      { format: 'mcq', question: 'Out of range?', options: ['A', 'B'], correct: [7], answer: 'a', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])).toEqual([])
  })

  it('promotes a multi-answer mcq to mcma when mcma is enabled', () => {
    const raw = JSON.stringify([
      { format: 'mcq', question: 'Pick all', options: ['A', 'B', 'C'], correct: [0, 2], answer: 'A and C', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])[0].format).toBe('mcma')
  })

  it('keeps only the first correct index when mcma is disabled', () => {
    const raw = JSON.stringify([
      { format: 'mcq', question: 'Pick all', options: ['A', 'B', 'C'], correct: [0, 2], answer: 'A and C', explanation: '' },
    ])
    const out = parseQuiz(raw, settings({ formats: { mcq: true, mcma: false, descriptive: true } }), [])
    expect(out[0].format).toBe('mcq')
    expect(out[0].correct).toEqual([0])
  })

  it('drops a question already asked, ignoring case and punctuation', () => {
    expect(parseQuiz(good, settings(), ['what is a TENSOR'])).toEqual([])
  })

  it('drops duplicates within a single response', () => {
    const raw = JSON.stringify([
      { format: 'descriptive', question: 'Explain entropy.', answer: 'a', explanation: '' },
      { format: 'descriptive', question: 'explain ENTROPY', answer: 'a', explanation: '' },
    ])
    expect(parseQuiz(raw, settings(), [])).toHaveLength(1)
  })

  it('returns an empty array for junk instead of throwing', () => {
    expect(parseQuiz('the model refused', settings(), [])).toEqual([])
    expect(parseQuiz('{"not":"an array"}', settings(), [])).toEqual([])
  })
})

describe('rawScopeNotes', () => {
  const notes = [
    note('1', 'Tensors', 'A tensor is a generalization of vectors.', 500),
    note('2', 'Entropy', 'Entropy measures disorder.', 1500),
  ]

  it('returns just the selected note in note mode', () => {
    const input: AnalyzeInput = { mode: 'note', noteId: '2' }
    expect(rawScopeNotes(input, notes).map((n) => n.id)).toEqual(['2'])
  })

  it('filters by the time window in window mode', () => {
    const input: AnalyzeInput = { mode: 'window', since: 1000, until: 2000, label: 'w' }
    expect(rawScopeNotes(input, notes).map((n) => n.id)).toEqual(['2'])
  })

  it('substring-matches title and body in topic mode', () => {
    const input: AnalyzeInput = { mode: 'topic', query: 'TENSOR' }
    expect(rawScopeNotes(input, notes).map((n) => n.id)).toEqual(['1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/ai/quiz.test.ts`
Expected: FAIL — `buildQuizSystemPrompt is not exported by ./quiz`.

- [ ] **Step 3: Rewrite `src/core/ai/quiz.ts`**

Replace the whole file with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/ai/quiz.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Confirm the only typecheck error is the known call site**

Run: `npx tsc --noEmit`
Expected: errors **only** in `src/ui/ai/AiChat.tsx` about `generateQuiz` arguments/return type. Any error in another file is a real problem — fix it now.

- [ ] **Step 6: Commit**

```bash
git add src/core/ai/quiz.ts src/core/ai/quiz.test.ts
git commit -m "feat(quiz): format-aware generation with settings and repeat exclusion"
```

---

### Task 6: Quiz settings popover + toolbar

**Files:**
- Create: `src/ui/ai/QuizControls.tsx`
- Modify: `src/ui/ai/Ai.module.css` (append)

**Interfaces:**
- Consumes: `useQuizSettings` (Task 1), `clearAskedQuestions` (Task 2), `SettingSelect`/`SettingSlider`/`SettingToggle` from `src/ui/settings/SettingControls`, `QuizFormat` from `src/types`.
- Produces: `QuizControls({ vaultId }: { vaultId: string })` (default-less named export) from `src/ui/ai/QuizControls` — renders the gear button, its popover, and the optional toolbar as one fragment.

- [ ] **Step 1: Add the CSS**

Append to `src/ui/ai/Ai.module.css`:

```css
/* Quiz controls — compact toolbar + settings popover */
.quizToolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  font-size: 0.8rem;
  color: var(--text-2);
}

.quizToolbarGroup {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.quizToolbarCheck {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  user-select: none;
}

.quizPopover {
  position: fixed;
  z-index: 10000;
  width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.quizPopoverRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  font-size: 0.82rem;
  color: var(--text-2);
}

.quizPopoverSection {
  margin-top: var(--space-xs);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.quizWeightInput {
  width: 3.5rem;
  padding: 0.25rem 0.4rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-1);
  font-size: 0.82rem;
}
```

- [ ] **Step 2: Write the component**

Create `src/ui/ai/QuizControls.tsx`:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizControls.tsx
//
// Quiz mode's two control surfaces: a gear-button popover holding every setting,
// and an optional compact toolbar repeating the four knobs you touch each run.
// Both write to the same store (hooks/useQuizSettings), so they are two views of
// one value, not two states to reconcile. The popover is portaled to <body> and
// viewport-clamped for the same reason SuggestionMenu is — the chat column
// scrolls and would otherwise clip it.

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings2 } from 'lucide-react'
import type { QuizFormat } from '../../types'
import { useQuizSettings } from '../../hooks/useQuizSettings'
import { clearAskedQuestions } from '../../core/ai/quizMemory'
import { SettingSelect, SettingSlider, SettingToggle } from '../settings/SettingControls'
import { toast } from '../../lib/toast'
import styles from './Ai.module.css'

const FORMAT_LABELS: [QuizFormat, string][] = [
  ['mcq', 'MCQ'],
  ['mcma', 'MCMA'],
  ['descriptive', 'Descriptive'],
]

const COUNT_OPTIONS = [3, 5, 6, 10, 15, 20].map((n) => ({ value: String(n), label: `${n}` }))

export function QuizControls({ vaultId }: { vaultId: string }) {
  const [settings, setSettings] = useQuizSettings()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Clamp the popover into the viewport once it has an anchor rect.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const width = 320
    setPos({
      top: Math.min(r.bottom + 6, window.innerHeight - 40),
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
    })
  }, [open])

  const toggleFormat = (f: QuizFormat, on: boolean) =>
    setSettings({ formats: { ...settings.formats, [f]: on } })

  const setWeight = (f: QuizFormat, value: number) =>
    setSettings({ weights: { ...settings.weights, [f]: Math.max(0.5, value) } })

  return (
    <>
      <button
        ref={anchorRef}
        className={styles.btn}
        title="Quiz settings"
        aria-label="Quiz settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 size={14} />
      </button>

      {settings.showToolbar && (
        <div className={styles.quizToolbar}>
          <span className={styles.quizToolbarGroup}>
            <label htmlFor="quiz-count">Questions</label>
            <SettingSelect
              id="quiz-count"
              value={String(settings.count)}
              onChange={(v) => setSettings({ count: Number(v) })}
              options={COUNT_OPTIONS}
              ariaLabel="Number of questions"
            />
          </span>

          <span className={styles.quizToolbarGroup}>
            {FORMAT_LABELS.map(([f, label]) => (
              <label key={f} className={styles.quizToolbarCheck}>
                <input
                  type="checkbox"
                  checked={settings.formats[f]}
                  onChange={(e) => toggleFormat(f, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </span>

          <span className={styles.quizToolbarGroup}>
            <label htmlFor="quiz-difficulty">Difficulty</label>
            <SettingSelect
              id="quiz-difficulty"
              value={settings.difficulty}
              onChange={(v) => setSettings({ difficulty: v as typeof settings.difficulty })}
              options={[
                { value: 'mix', label: 'Mix' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
              ariaLabel="Question difficulty"
            />
          </span>
        </div>
      )}

      {open &&
        createPortal(
          <>
            {/* Click-away layer; Escape is handled by the button losing focus. */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
              onPointerDown={() => setOpen(false)}
            />
            <div
              className={styles.quizPopover}
              style={{ top: pos.top, left: pos.left }}
              role="dialog"
              aria-label="Quiz settings"
            >
              <div className={styles.quizPopoverSection}>Question types</div>
              {FORMAT_LABELS.map(([f, label]) => (
                <div key={f} className={styles.quizPopoverRow}>
                  <SettingToggle
                    checked={settings.formats[f]}
                    onChange={(on) => toggleFormat(f, on)}
                    label={label}
                  />
                  <input
                    className={styles.quizWeightInput}
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={settings.weights[f]}
                    onChange={(e) => setWeight(f, Number(e.target.value))}
                    aria-label={`${label} marks per question`}
                    title={`${label} marks per question`}
                  />
                </div>
              ))}

              <div className={styles.quizPopoverSection}>Marking</div>
              <SettingToggle
                checked={settings.negativeMarking}
                onChange={(v) => setSettings({ negativeMarking: v })}
                label="Negative marking"
                hint="deducts for a wrong answer, never for a skipped one"
              />
              {settings.negativeMarking && (
                <div className={styles.quizPopoverRow}>
                  <span>Penalty: {settings.negativeFraction}× marks</span>
                  <SettingSlider
                    value={settings.negativeFraction}
                    min={0.1}
                    max={1}
                    step={0.05}
                    onChange={(v) => setSettings({ negativeFraction: v })}
                    ariaLabel="Negative marking fraction"
                  />
                </div>
              )}
              <div className={styles.quizPopoverRow}>
                <span>Multi-answer scoring</span>
                <SettingSelect
                  value={settings.mcmaRule}
                  onChange={(v) => setSettings({ mcmaRule: v as typeof settings.mcmaRule })}
                  options={[
                    { value: 'partial', label: 'Partial credit' },
                    { value: 'allOrNothing', label: 'All or nothing' },
                    { value: 'proportional', label: 'Proportional' },
                  ]}
                  ariaLabel="Multi-answer scoring rule"
                />
              </div>

              <div className={styles.quizPopoverSection}>Quiz</div>
              <div className={styles.quizPopoverRow}>
                <span>Show answers</span>
                <SettingSelect
                  value={settings.feedback}
                  onChange={(v) => setSettings({ feedback: v as typeof settings.feedback })}
                  options={[
                    { value: 'end', label: 'After submitting' },
                    { value: 'immediate', label: 'As I answer' },
                  ]}
                  ariaLabel="When to show answers"
                />
              </div>
              <div className={styles.quizPopoverRow}>
                <span>Notes source</span>
                <SettingSelect
                  value={settings.source}
                  onChange={(v) => setSettings({ source: v as typeof settings.source })}
                  options={[
                    { value: 'retrieval', label: 'Semantic index' },
                    { value: 'raw', label: 'Scoped notes' },
                  ]}
                  ariaLabel="Notes source"
                />
              </div>
              <SettingToggle
                checked={settings.showToolbar}
                onChange={(v) => setSettings({ showToolbar: v })}
                label="Show quick toolbar"
              />
              <button
                className={styles.btn}
                onClick={() => {
                  clearAskedQuestions(vaultId)
                  toast.success('Question history cleared for this vault.')
                }}
              >
                Forget asked questions
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors **only** in `src/ui/ai/AiChat.tsx` (the Task 5 call site, still unfixed). `QuizControls.tsx` itself must be clean. It is not yet imported anywhere, which is fine — `noUnusedLocals` covers symbols inside a file, not unused modules.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ai/QuizControls.tsx src/ui/ai/Ai.module.css
git commit -m "feat(quiz): settings popover and quick toolbar"
```

---

### Task 7: Interactive quiz runner + AiChat wiring

**Files:**
- Create: `src/ui/ai/QuizRunner.tsx`
- Modify: `src/ui/ai/AiChat.tsx` (imports at 1–10, `ChatMessage` at ~22–27, the quiz branch at ~345–360, the mode row at ~444–483, the thread render at ~562–563, remove `QuizCard` at ~761–798)
- Modify: `src/ui/ai/Ai.module.css` (append)

**Interfaces:**
- Consumes: everything from Tasks 1–6; `useActiveVaultId` from `src/hooks/useVaults`; `useRag` from `src/hooks/useRag` (for `reindexAll`).
- Produces: `QuizRunner` props — `{ attempt: QuizAttempt; settings: QuizSettings; config: AiConfig; reason?: 'empty-index' | 'empty-scope'; onChange: (next: QuizAttempt) => void; onIndexNow?: () => void; onSave?: (attempt: QuizAttempt) => void }`. `ChatMessage`'s quiz variant becomes `{ kind: 'quiz'; attempt: QuizAttempt; reason?: 'empty-index' | 'empty-scope' }`.

**Design note:** the attempt lives inside the thread message (`useViewState('ai.thread')`), which already survives navigation and is persisted with the conversation — so no separate view-state key is needed for in-progress answers.

- [ ] **Step 1: Add the CSS**

Append to `src/ui/ai/Ai.module.css`:

```css
/* Quiz runner */
.quizOptions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  margin: var(--space-2xs) 0 var(--space-xs);
  border: none;
  padding: 0;
}

.quizOption {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2xs);
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-1);
}

.quizOption:hover { background: var(--surface-hover); }
.quizOptionCorrect { border-color: var(--success); background: color-mix(in srgb, var(--success) 12%, transparent); }
.quizOptionWrong { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }

.quizTextarea {
  width: 100%;
  min-height: 5rem;
  resize: vertical;
  padding: var(--space-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-1);
  font: inherit;
}

.quizScore {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
  font-size: 0.85rem;
  color: var(--text-1);
}

.quizScoreValue { font-weight: 600; color: var(--accent); }
.quizMarkLine { font-size: 0.78rem; color: var(--text-2); margin-top: 0.2rem; }
.quizActions { display: flex; gap: var(--space-xs); margin-top: var(--space-sm); }
```

- [ ] **Step 2: Write the runner**

Create `src/ui/ai/QuizRunner.tsx`:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/ai/QuizRunner.tsx
//
// The interactive quiz card. Answers live in the QuizAttempt the parent owns
// (it rides the chat thread, so it survives navigation and is saved with the
// conversation) — this component only renders it and reports changes upward.
// Objective questions are graded locally by quizGrade; only descriptive answers
// cost a model call.

import { useState } from 'react'
import type { AiConfig, QuizAttempt, QuizQuestion, QuizSettings } from '../../types'
import { gradeDescriptive, recomputeTotals, scoreObjective, type DescriptiveItem } from '../../core/ai/quizGrade'
import styles from './Ai.module.css'

interface Props {
  attempt: QuizAttempt
  settings: QuizSettings
  config: AiConfig
  reason?: 'empty-index' | 'empty-scope'
  onChange: (next: QuizAttempt) => void
  onIndexNow?: () => void
  onSave?: (attempt: QuizAttempt) => void
}

const pickedOf = (attempt: QuizAttempt, i: number): number[] => {
  const r = attempt.responses[i]
  return Array.isArray(r) ? r : []
}

const textOf = (attempt: QuizAttempt, i: number): string => {
  const r = attempt.responses[i]
  return typeof r === 'string' ? r : ''
}

export function QuizRunner({ attempt, settings, config, reason, onChange, onIndexNow, onSave }: Props) {
  const [grading, setGrading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (attempt.questions.length === 0) {
    return (
      <div className={styles.analysisCard}>
        {reason === 'empty-index' ? (
          <>
            <p className={styles.hint}>
              Nothing indexed matched that topic. Index this vault's notes, or switch the quiz's
              notes source to “Scoped notes”.
            </p>
            {onIndexNow && (
              <button className={styles.btn} onClick={onIndexNow}>
                Index now
              </button>
            )}
          </>
        ) : (
          <p className={styles.hint}>Not enough in these notes to build a quiz.</p>
        )}
      </div>
    )
  }

  /** True once question `i` is locked (immediate mode after answering, or after submit). */
  const isRevealed = (i: number) => submitted || (settings.feedback === 'immediate' && attempt.marks[i] !== null)

  const setResponse = (i: number, value: number[] | string) => {
    const responses = [...attempt.responses]
    responses[i] = value
    onChange({ ...attempt, responses })
  }

  const gradeOne = async (i: number) => {
    const q = attempt.questions[i]
    const marks = [...attempt.marks]
    const feedback = [...attempt.feedback]

    if (q.format === 'descriptive') {
      setGrading(true)
      const [grade] = await gradeDescriptive(
        [{ question: q.question, reference: q.answer, answer: textOf(attempt, i), marks: q.marks }],
        config,
      )
      setGrading(false)
      marks[i] = grade?.marks ?? null
      feedback[i] = grade?.feedback ?? ''
    } else {
      marks[i] = scoreObjective(q, pickedOf(attempt, i), settings)
    }
    onChange(recomputeTotals({ ...attempt, marks, feedback }))
  }

  const submitAll = async () => {
    const marks = [...attempt.marks]
    const feedback = [...attempt.feedback]

    attempt.questions.forEach((q, i) => {
      if (q.format !== 'descriptive') marks[i] = scoreObjective(q, pickedOf(attempt, i), settings)
    })

    const descriptive: { index: number; item: DescriptiveItem }[] = []
    attempt.questions.forEach((q, i) => {
      if (q.format !== 'descriptive') return
      descriptive.push({
        index: i,
        item: { question: q.question, reference: q.answer, answer: textOf(attempt, i), marks: q.marks },
      })
    })

    if (descriptive.length > 0) {
      setGrading(true)
      const grades = await gradeDescriptive(descriptive.map((d) => d.item), config)
      setGrading(false)
      descriptive.forEach((d, k) => {
        marks[d.index] = grades[k]?.marks ?? null
        feedback[d.index] = grades[k]?.feedback ?? ''
      })
    }

    setSubmitted(true)
    onChange(recomputeTotals({ ...attempt, marks, feedback }))
  }

  const toggleChoice = (i: number, q: QuizQuestion, optionIndex: number) => {
    if (isRevealed(i)) return
    if (q.format === 'mcq') {
      setResponse(i, [optionIndex])
      if (settings.feedback === 'immediate') {
        const responses = [...attempt.responses]
        responses[i] = [optionIndex]
        const marks = [...attempt.marks]
        marks[i] = scoreObjective(q, [optionIndex], settings)
        onChange(recomputeTotals({ ...attempt, responses, marks }))
      }
      return
    }
    const current = pickedOf(attempt, i)
    const next = current.includes(optionIndex)
      ? current.filter((x) => x !== optionIndex)
      : [...current, optionIndex]
    setResponse(i, next)
  }

  const answeredAll = attempt.questions.every((q, i) =>
    q.format === 'descriptive' ? textOf(attempt, i).trim().length > 0 : pickedOf(attempt, i).length > 0,
  )

  return (
    <div className={styles.analysisCard}>
      <div className={styles.quizScore}>
        <span className={styles.sectionTitle}>Quiz · {attempt.questions.length} questions</span>
        <span className={styles.quizScoreValue}>
          {attempt.max > 0 ? `${attempt.total} / ${attempt.max}` : `0 / ${attempt.questions.reduce((s, q) => s + q.marks, 0)}`}
        </span>
      </div>

      {attempt.questions.map((q, i) => {
        const revealed = isRevealed(i)
        const picked = pickedOf(attempt, i)
        const correct = q.correct ?? []
        return (
          <div key={i} className={styles.quizItem}>
            <fieldset className={styles.quizOptions}>
              <legend className={styles.quizQ}>
                <span className={styles.quizKind}>{q.format === 'descriptive' ? q.kind : q.format}</span>
                {i + 1}. {q.question} <span className={styles.quizExpl}>({q.marks} marks)</span>
              </legend>

              {q.format === 'descriptive' ? (
                <textarea
                  className={styles.quizTextarea}
                  value={textOf(attempt, i)}
                  disabled={revealed}
                  placeholder="Your answer…"
                  aria-label={`Answer to question ${i + 1}`}
                  onChange={(e) => setResponse(i, e.target.value)}
                  onBlur={() => {
                    if (settings.feedback === 'immediate' && !revealed && textOf(attempt, i).trim()) void gradeOne(i)
                  }}
                />
              ) : (
                (q.options ?? []).map((opt, oi) => {
                  const state = !revealed
                    ? ''
                    : correct.includes(oi)
                      ? styles.quizOptionCorrect
                      : picked.includes(oi)
                        ? styles.quizOptionWrong
                        : ''
                  return (
                    <label key={oi} className={`${styles.quizOption} ${state}`}>
                      <input
                        type={q.format === 'mcq' ? 'radio' : 'checkbox'}
                        name={`q-${attempt.takenAt}-${i}`}
                        checked={picked.includes(oi)}
                        disabled={revealed}
                        onChange={() => toggleChoice(i, q, oi)}
                      />
                      {opt}
                    </label>
                  )
                })
              )}
            </fieldset>

            {q.format === 'mcma' && !revealed && settings.feedback === 'immediate' && (
              <button className={styles.quizReveal} onClick={() => void gradeOne(i)} disabled={picked.length === 0}>
                Check answer
              </button>
            )}

            {revealed && (
              <div className={styles.quizAnswer} aria-live="polite">
                <p className={styles.quizA}>{q.answer}</p>
                {q.explanation && <p className={styles.quizExpl}>{q.explanation}</p>}
                <p className={styles.quizMarkLine}>
                  {attempt.marks[i] === null ? 'Ungraded' : `${attempt.marks[i]} / ${q.marks} marks`}
                  {attempt.feedback[i] ? ` — ${attempt.feedback[i]}` : ''}
                </p>
              </div>
            )}
          </div>
        )
      })}

      <div className={styles.quizActions}>
        {settings.feedback === 'end' && !submitted && (
          <button className={styles.btn} onClick={() => void submitAll()} disabled={grading || !answeredAll}>
            {grading ? 'Grading…' : 'Submit answers'}
          </button>
        )}
        {onSave && (submitted || settings.feedback === 'immediate') && (
          <button className={styles.btn} onClick={() => onSave(attempt)}>
            Save quiz
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewire `AiChat.tsx`**

1. Replace the imports on lines 6–8 with:

```tsx
import type { AiConfig, AnalysisResult, AnalyzeInput, Note, QuizAttempt, SourceNote, StoredConversation } from '../../types'
import { analyze, askNotes, generateQuiz, type AskTurn } from '../../core/ai'
import { emptyAttempt } from '../../core/ai/quizGrade'
import { useQuizSettings } from '../../hooks/useQuizSettings'
import { useActiveVaultId } from '../../hooks/useVaults'
import { QuizControls } from './QuizControls'
import { QuizRunner } from './QuizRunner'
import { useViewState, getViewState } from '../../hooks/useViewState'
```

2. Change the `ChatMessage` quiz variant (line ~26) to:

```tsx
  | { kind: 'quiz'; attempt: QuizAttempt; reason?: 'empty-index' | 'empty-scope' }
```

3. Inside the component body, near the other hooks, add:

```tsx
  const [quizSettings] = useQuizSettings()
  const vaultId = useActiveVaultId()
```

4. Replace the quiz branch (lines ~345–360) with:

```tsx
    if (responseMode === 'quiz') {
      setBusy(true)
      setThread(base)
      setLastScopeKey(key)
      try {
        const { questions, reason } = await generateQuiz(scope, config, notes, quizSettings, vaultId)
        const label = scope.mode === 'topic' ? `Topic: ${scope.query}` : scope.mode === 'window' ? scope.label : 'Selected note'
        setThread([...base, { kind: 'quiz', attempt: emptyAttempt(questions, label), reason }])
        persistNow()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Quiz generation failed.')
      } finally {
        setBusy(false)
        setInput('')
      }
      return
    }
```

5. Render the controls. Immediately after the mode-picker `</div>` that closes at line ~483 (still inside the scope row), add:

```tsx
          {responseMode === 'quiz' && <QuizControls vaultId={vaultId} />}
```

6. Replace the thread's quiz branch (lines ~562–563) with:

```tsx
            ) : m.kind === 'quiz' ? (
              <QuizRunner
                key={i}
                attempt={m.attempt}
                settings={quizSettings}
                config={config}
                reason={m.reason}
                onChange={(next) =>
                  setThread((prev) =>
                    prev.map((msg, j) => (j === i && msg.kind === 'quiz' ? { ...msg, attempt: next } : msg)),
                  )
                }
              />
```

7. Delete the `QuizCard` function (lines ~761–798) and drop `QuizQuestion` from the type import if nothing else uses it (`noUnusedLocals` will tell you).

8. Guard the send button. Replace the `sendDisabled` line (~396) with:

```tsx
  const noFormatsEnabled = !quizSettings.formats.mcq && !quizSettings.formats.mcma && !quizSettings.formats.descriptive
  const sendDisabled =
    busy ||
    (responseMode === 'quiz' && noFormatsEnabled) ||
    (responseMode === 'chat' ? !input.trim() : !(input.trim() || buildScope()))
```

And directly above the send button's JSX, add the hint:

```tsx
        {responseMode === 'quiz' && noFormatsEnabled && (
          <p className={styles.hint}>Enable at least one question type in quiz settings.</p>
        )}
```

- [ ] **Step 4: Handle old saved conversations**

In `loadConv` (line ~195–217), the stored thread may contain the old `{ kind: 'quiz', questions }` shape. Immediately after the thread is read from the conversation and before `setThread`, normalize it:

```tsx
      const restored = (c.messages as ChatMessage[]).map((m) => {
        const legacy = m as unknown as { kind: string; questions?: QuizQuestion[] }
        if (legacy.kind === 'quiz' && Array.isArray(legacy.questions)) {
          return { kind: 'quiz', attempt: emptyAttempt(legacy.questions, 'Saved quiz') } as ChatMessage
        }
        return m
      })
```

then pass `restored` where the raw messages were passed. Keep the `QuizQuestion` type import if you use it here. Match the surrounding variable names — read the function before editing; `c.messages` may already be destructured under another name.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. This is the point where the Task 5 call-site error must disappear.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all files pass. No existing test touches `AiChat`, so a failure here means something in `core/ai` regressed.

- [ ] **Step 7: Manual check (ask the user)**

The UI cannot be verified headlessly. Ask the user to run `npm run tauri dev` and confirm, in the AI view with Quiz mode selected:
1. The gear opens the settings popover; the toolbar shows and hides with "Show quick toolbar".
2. Generating a quiz produces MCQ/MCMA/descriptive questions honouring the checkboxes and count.
3. "As I answer" locks each question on answer with marks + explanation; "After submitting" grades everything at Submit.
4. Running the same scope twice produces different questions.

Report their findings; do not claim it works otherwise.

- [ ] **Step 8: Commit**

```bash
git add src/ui/ai/QuizRunner.tsx src/ui/ai/AiChat.tsx src/ui/ai/Ai.module.css
git commit -m "feat(quiz): interactive graded quiz runner in AI chat"
```

---

### Task 8: Saved quiz note type

**Files:**
- Create: `src/plugins/quiz/quizNote.ts`, `src/plugins/quiz/QuizNoteView.tsx`, `src/plugins/quiz/index.ts`
- Modify: `src/plugins/index.ts`
- Test: `src/plugins/quiz/quizNote.test.ts`

**Interfaces:**
- Consumes: `QuizAttempt` from `src/types`; `emptyAttempt`/`recomputeTotals`/`scoreObjective` from `src/core/ai/quizGrade`; `Plugin` from `src/types`.
- Produces: `EMPTY_QUIZ_CONTENT`, `parseAttempt(content: string): QuizAttempt | null`, `serializeAttempt(attempt: QuizAttempt): string`, `quizToSearchText(content: string): string`, `quizToExportMarkdown(content: string): string` from `src/plugins/quiz/quizNote`; `quizPlugin`, `QUIZ_PLUGIN_ID`, `QUIZ_NOTE_KIND` from `src/plugins/quiz`.

- [ ] **Step 1: Write the failing test**

Create `src/plugins/quiz/quizNote.test.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { describe, expect, it } from 'vitest'
import type { QuizAttempt } from '../../types'
import {
  EMPTY_QUIZ_CONTENT,
  parseAttempt,
  quizToExportMarkdown,
  quizToSearchText,
  serializeAttempt,
} from './quizNote'

const attempt: QuizAttempt = {
  questions: [
    {
      kind: 'recall',
      format: 'mcq',
      question: 'What is a tensor?',
      options: ['A scalar', 'A generalization of vectors', 'A graph', 'A loss'],
      correct: [1],
      answer: 'A generalization of vectors',
      explanation: 'Notes define it that way.',
      marks: 1,
    },
    {
      kind: 'application',
      format: 'descriptive',
      question: 'Explain entropy in your own words.',
      answer: 'A measure of disorder.',
      explanation: '',
      marks: 2,
    },
  ],
  responses: [[1], 'It measures disorder.'],
  marks: [1, 1.5],
  feedback: ['', 'Right idea, thin on detail.'],
  total: 2.5,
  max: 3,
  scopeLabel: 'Topic: tensors',
  takenAt: 1_700_000_000_000,
}

describe('quiz note content', () => {
  it('round-trips an attempt through note content', () => {
    expect(parseAttempt(serializeAttempt(attempt))).toEqual(attempt)
  })

  it('parses the empty content a new quiz note starts with', () => {
    const parsed = parseAttempt(EMPTY_QUIZ_CONTENT)
    expect(parsed).not.toBeNull()
    expect(parsed?.questions).toEqual([])
  })

  it('returns null for content that is not a quiz', () => {
    expect(parseAttempt('just some markdown')).toBeNull()
    expect(parseAttempt('{"nope":true}')).toBeNull()
  })

  it('projects questions and answers into search text, not raw JSON', () => {
    const text = quizToSearchText(serializeAttempt(attempt))
    expect(text).toContain('What is a tensor?')
    expect(text).toContain('A generalization of vectors')
    expect(text).not.toContain('{')
  })

  it('exports readable markdown with options, answers and the score', () => {
    const md = quizToExportMarkdown(serializeAttempt(attempt))
    expect(md).toContain('# Quiz — Topic: tensors')
    expect(md).toContain('**Score:** 2.5 / 3')
    expect(md).toContain('1. What is a tensor?')
    expect(md).toContain('- [x] A generalization of vectors')
    expect(md).toContain('- [ ] A scalar')
    expect(md).toContain('Right idea, thin on detail.')
  })

  it('exports a placeholder for an empty quiz note', () => {
    expect(quizToExportMarkdown(EMPTY_QUIZ_CONTENT)).toContain('_Empty quiz._')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/plugins/quiz/quizNote.test.ts`
Expected: FAIL — `Failed to resolve import "./quizNote"`.

- [ ] **Step 3: Write `quizNote.ts`**

Create `src/plugins/quiz/quizNote.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Pure projections of a quiz note's content (a serialized QuizAttempt) into the
// plain-text + markdown forms the note-type infra wants for search and export.
// Mirrors plugins/canvas/canvasNote.ts.

import type { QuizAttempt } from '../../types'
import { emptyAttempt } from '../../core/ai/quizGrade'

export const EMPTY_QUIZ_CONTENT = JSON.stringify(emptyAttempt([], ''))

export function serializeAttempt(attempt: QuizAttempt): string {
  return JSON.stringify(attempt)
}

/** Parse note content into an attempt, or null when it isn't one. */
export function parseAttempt(content: string): QuizAttempt | null {
  try {
    const parsed = JSON.parse(content) as Partial<QuizAttempt>
    if (!parsed || !Array.isArray(parsed.questions)) return null
    return {
      questions: parsed.questions,
      responses: parsed.responses ?? parsed.questions.map(() => []),
      marks: parsed.marks ?? parsed.questions.map(() => null),
      feedback: parsed.feedback ?? parsed.questions.map(() => ''),
      total: parsed.total ?? 0,
      max: parsed.max ?? 0,
      scopeLabel: parsed.scopeLabel ?? '',
      takenAt: parsed.takenAt ?? 0,
    }
  } catch {
    return null
  }
}

/** Plain-text projection for search/RAG/preview — never raw JSON. */
export function quizToSearchText(content: string): string {
  const attempt = parseAttempt(content)
  if (!attempt) return ''
  return attempt.questions
    .map((q) => [q.question, ...(q.options ?? []), q.answer, q.explanation].filter(Boolean).join('\n'))
    .join('\n\n')
    .trim()
}

/** Readable markdown for export. */
export function quizToExportMarkdown(content: string): string {
  const attempt = parseAttempt(content)
  if (!attempt || attempt.questions.length === 0) return '_Empty quiz._'

  const head = [
    `# Quiz — ${attempt.scopeLabel || 'Untitled scope'}`,
    '',
    `**Score:** ${attempt.total} / ${attempt.max}`,
    '',
  ]

  const body = attempt.questions.flatMap((q, i) => {
    const lines = [`${i + 1}. ${q.question} _(${q.marks} marks)_`, '']
    if (q.options) {
      const correct = new Set(q.correct ?? [])
      lines.push(...q.options.map((opt, oi) => `- [${correct.has(oi) ? 'x' : ' '}] ${opt}`), '')
    }
    lines.push(`**Answer:** ${q.answer}`)
    if (q.explanation) lines.push(`**Why:** ${q.explanation}`)
    const mark = attempt.marks[i]
    lines.push(`**Marks awarded:** ${mark === null ? 'ungraded' : `${mark} / ${q.marks}`}`)
    if (attempt.feedback[i]) lines.push(`**Feedback:** ${attempt.feedback[i]}`)
    lines.push('')
    return lines
  })

  return [...head, ...body].join('\n').trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/plugins/quiz/quizNote.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the note view**

Create `src/plugins/quiz/QuizNoteView.tsx`:

```tsx
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// One component serving both the read and edit slots of the quiz note type:
// a saved quiz is the same card you took it in, plus Retake. The Editor slot
// writes the reworked attempt straight back into note.content.

import type { NoteEditorProps, NoteViewProps } from '../../lib/noteTypes'
import type { AiConfig } from '../../types'
import { QuizRunner } from '../../ui/ai/QuizRunner'
import { emptyAttempt } from '../../core/ai/quizGrade'
import { getQuizSettings } from '../../hooks/useQuizSettings'
import { loadAiConfig } from '../../core/ai/config'
import { useEffect, useState } from 'react'
import { parseAttempt, serializeAttempt } from './quizNote'

function useAiConfig(): AiConfig | null {
  const [config, setConfig] = useState<AiConfig | null>(null)
  useEffect(() => {
    void loadAiConfig().then(setConfig)
  }, [])
  return config
}

/** Read mode: the finished attempt, non-editable (no onChange target). */
export function QuizNoteView({ note }: NoteViewProps) {
  const attempt = parseAttempt(note.content)
  const config = useAiConfig()
  if (!attempt) return <p>Not a readable quiz.</p>
  if (attempt.questions.length === 0) return <p>Take a quiz in AI chat, then save it here.</p>
  if (!config) return <p>Loading…</p>
  return (
    <QuizRunner
      attempt={attempt}
      settings={getQuizSettings()}
      config={config}
      onChange={() => {
        /* read mode — answers aren't persisted */
      }}
    />
  )
}

/** Edit mode: same card, with Retake, writing back through onChange. */
export function QuizNoteEditor({ value, onChange }: NoteEditorProps) {
  const attempt = parseAttempt(value)
  const config = useAiConfig()
  if (!attempt) return <p>Not a readable quiz.</p>
  if (attempt.questions.length === 0) return <p>Take a quiz in AI chat, then save it here.</p>
  if (!config) return <p>Loading…</p>
  return (
    <>
      <button
        onClick={() => onChange(serializeAttempt(emptyAttempt(attempt.questions, attempt.scopeLabel)))}
      >
        Retake
      </button>
      <QuizRunner
        attempt={attempt}
        settings={getQuizSettings()}
        config={config}
        onChange={(next) => onChange(serializeAttempt(next))}
      />
    </>
  )
}
```

- [ ] **Step 6: Register the plugin**

Create `src/plugins/quiz/index.ts`:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// First-party bundled plugin: a saved quiz as a note type. The attempt is
// stored as JSON in the note's content, so a quiz rides folders/vaults/search/
// export/trash like any note. Mirrors the canvas note type.

import { GraduationCap } from 'lucide-react'
import type { Plugin } from '../../types'
import { EMPTY_QUIZ_CONTENT, quizToExportMarkdown, quizToSearchText } from './quizNote'
import { QuizNoteEditor, QuizNoteView } from './QuizNoteView'

export const QUIZ_PLUGIN_ID = 'jnana.quiz'

/** The note-type id a saved quiz carries in `note.kind`. */
export const QUIZ_NOTE_KIND = 'quiz'

export const quizPlugin: Plugin = {
  id: QUIZ_PLUGIN_ID,
  name: 'Quiz',
  version: '1.0.0',
  init(ctx) {
    ctx.registerNoteType({
      id: QUIZ_NOTE_KIND,
      label: 'Quiz',
      icon: GraduationCap,
      View: QuizNoteView,
      Editor: QuizNoteEditor,
      newContent: () => EMPTY_QUIZ_CONTENT,
      toSearchText: (note) => quizToSearchText(note.content),
      toExportMarkdown: (note) => quizToExportMarkdown(note.content),
    })
  },
}
```

Then in `src/plugins/index.ts`, add the import beside the canvas one and extend the array:

```ts
import { quizPlugin } from './quiz'
```

```ts
export const BUILTIN_PLUGINS: Plugin[] = [flashcardsPlugin, pomodoroPlugin, canvasPlugin, quizPlugin]
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/plugins/quiz src/plugins/index.ts
git commit -m "feat(quiz): saved quiz note type"
```

---

### Task 9: Save button wiring + docs

**Files:**
- Modify: `src/ui/ai/AiChat.tsx` (the quiz render branch from Task 7)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `QuizRunner`'s `onSave` prop (Task 7), `serializeAttempt`/`QUIZ_NOTE_KIND` (Task 8), `useNotesContext().create(title, content, id?, userTags?, kind?)`.
- Produces: nothing new.

`AiChat` receives `notes`/`onOpenNote` as props but has no note-creating callback. Use
`useNotesContext()` — it is a context hook (`NotesContextValue = ReturnType<typeof useNotes>`, so it
exposes `create`), not a `core/` import, so the `ui → hooks → core` layering rule holds.

- [ ] **Step 1: Wire the save handler**

In `AiChat.tsx`, add near the other hooks:

```tsx
  const { create } = useNotesContext()
```

with the import:

```tsx
import { useNotesContext } from '../../context/NotesContext'
import { serializeAttempt } from '../../plugins/quiz/quizNote'
import { QUIZ_NOTE_KIND } from '../../plugins/quiz'
import { toast } from '../../lib/toast'
```

Then extend the `QuizRunner` JSX from Task 7 with:

```tsx
                onSave={async (finished) => {
                  const title = `Quiz — ${finished.scopeLabel || 'Untitled'}`
                  await create(title, serializeAttempt(finished), undefined, [], QUIZ_NOTE_KIND)
                  toast.success('Quiz saved as a note.')
                }}
```

`create` is defined at `src/hooks/useNotes.ts:86` with signature
`(title: string, content: string, id?: string, userTags?: string[], kind?: string) => Promise<Note>`.

- [ ] **Step 2: Wire "Index now"**

`reindexAll` lives in `useRag()`. `AiChat` receives `config` as a prop and does not call `useRag`. Add it beside the other hooks:

```tsx
import { useRag } from '../../hooks/useRag'
```

```tsx
  const { reindexAll } = useRag()
```

and pass to `QuizRunner`:

```tsx
                onIndexNow={() => void reindexAll(notes)}
```

`notes` is already the vault-scoped list `AiChat` receives as a prop.

- [ ] **Step 3: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Update CLAUDE.md**

In the **AI layer** section, under the "Grounded generators" bullet, replace the `quiz.ts` mention (`[quiz.ts](src/core/ai/quiz.ts) (study quizzes)`) with a sub-bullet:

```markdown
  - **Quiz is graded, not just generated** — [quiz.ts](src/core/ai/quiz.ts) emits **MCQ / MCMA /
    descriptive** questions shaped by [useQuizSettings.ts](src/hooks/useQuizSettings.ts) (count,
    per-format enable + marks, negative marking, MCMA rule, feedback timing, difficulty, notes
    source). Objective answers are scored **locally and purely** by
    [quizGrade.ts](src/core/ai/quizGrade.ts) (`scoreObjective`; the three MCMA rules —
    all-or-nothing / partial / proportional — plus `emptyAttempt`/`recomputeTotals`); only
    **descriptive** answers cost a model call (`gradeDescriptive`, which returns `marks: null`
    rather than 0 when the grader fails, so an infrastructure error never reads as a wrong answer).
    Repeats are prevented by [quizMemory.ts](src/core/ai/quizMemory.ts) — a per-vault localStorage
    ring buffer of asked questions, injected into the prompt **and** enforced after parse. The UI is
    [QuizControls.tsx](src/ui/ai/QuizControls.tsx) (popover + toolbar) and
    [QuizRunner.tsx](src/ui/ai/QuizRunner.tsx); the in-progress `QuizAttempt` rides the chat thread
    message, so it survives navigation and persists with the conversation. **Save** materializes it
    as a `kind='quiz'` note ([plugins/quiz/](src/plugins/quiz/)) — no migration, `notes.kind` (v17)
    already carries it.
```

- [ ] **Step 5: Manual check (ask the user)**

Ask the user to run `npm run tauri dev` and confirm:
1. **Save quiz** on a graded quiz creates a note titled `Quiz — <scope>` that opens as a quiz card (not raw JSON), and its **Retake** clears the marks.
2. The saved quiz is findable by a phrase from one of its questions in keyword search.
3. With a topic scope and an unindexed vault, **Index now** appears and, after it runs, generating produces questions.

Report their findings.

- [ ] **Step 6: Commit**

```bash
git add src/ui/ai/AiChat.tsx CLAUDE.md
git commit -m "feat(quiz): save a graded quiz as a note, index-now recovery"
```

---

## Done criteria

- `npx tsc --noEmit` clean.
- `npm test` green, with 5 new test files (`useQuizSettings`, `quizMemory`, `quizGrade`, `quiz`, `quizNote`).
- All seven items from [problems with quiz.md](../../../problems%20with%20quiz.md) covered: repeats (Tasks 2+5), MCQ/MCMA (Tasks 1+5), format choice (Tasks 1+6), graded selection + settings (Tasks 3+6+7), question count + marks (Tasks 1+3), the six settings including negative marking, feedback timing and the RAG source (Tasks 1+6+7), AI-graded descriptive answers (Task 4).
- The user has manually confirmed the two UI checkpoints (Tasks 7 and 9).
