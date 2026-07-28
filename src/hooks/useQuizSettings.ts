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
