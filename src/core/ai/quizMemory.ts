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
