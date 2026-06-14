// src/core/ai/modelHistory.ts
//
// Remembers model names the user has typed per field (chat / embedding /
// transcription / deep-research) so the settings UI can offer them as a dropdown.
// Model names aren't secret, so localStorage is fine (unlike API keys, which
// live Rust-side).

const STORAGE_KEY = 'jnana.ai.modelHistory'
const MAX = 12

export type ModelKind = 'chat' | 'embedding' | 'transcription' | 'deepResearch'

type Store = Partial<Record<ModelKind, string[]>>

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

function write(s: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable — suggestions just won't persist */
  }
}

export function getModelHistory(kind: ModelKind): string[] {
  return read()[kind] ?? []
}

/** Record a used model name (most-recent first, de-duped, capped). */
export function rememberModel(kind: ModelKind, model: string): void {
  const m = model.trim()
  if (!m) return
  const s = read()
  s[kind] = [m, ...(s[kind] ?? []).filter((x) => x !== m)].slice(0, MAX)
  write(s)
}
