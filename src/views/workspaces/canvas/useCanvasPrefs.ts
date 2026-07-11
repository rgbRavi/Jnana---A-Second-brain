// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Persistent canvas preferences (pen, eraser, interaction-while-drawing). A
// module-level store backed by localStorage so it survives reloads — mirrors
// useComposerOptions.ts.

import { useSyncExternalStore } from 'react'

export type EraserMode = 'touch' | 'stroke'

export interface CanvasPrefs {
  penColor: string
  /** Stroke width in px, 2–200. */
  penSize: number
  /** 'touch' erases only the points the eraser passes over (splitting strokes);
   *  'stroke' deletes the entire stroke on contact. */
  eraserMode: EraserMode
  /** Eraser hit-test diameter in px, 8–300 (matches the old fixed 28px radius*2). */
  eraserSize: number
  /** When true, notes/attachments can still be moved/resized while in Draw mode. */
  interactWhileDrawing: boolean
}

const STORAGE_KEY = 'jnana.canvas.prefs'
const DEFAULTS: CanvasPrefs = {
  penColor: '#7c6af7',
  penSize: 4,
  eraserMode: 'touch',
  eraserSize: 28,
  interactWhileDrawing: true,
}

function load(): CanvasPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CanvasPrefs>) }
  } catch {
    return DEFAULTS
  }
}

let prefs: CanvasPrefs = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

export function setCanvasPrefs(patch: Partial<CanvasPrefs>): void {
  prefs = { ...prefs, ...patch }
  persist()
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => prefs

export function useCanvasPrefs(): [CanvasPrefs, (patch: Partial<CanvasPrefs>) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return [value, setCanvasPrefs]
}
