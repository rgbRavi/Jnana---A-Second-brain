// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useSyncExternalStore } from 'react'
import { initialState, tick, type PomodoroState } from './timer'

// A module store so the widget and the palette commands share one timer. Owns a
// single 1s interval that runs only while the timer is running.

let state: PomodoroState = initialState()
const listeners = new Set<() => void>()
let handle: ReturnType<typeof setInterval> | undefined

function emit(): void {
  listeners.forEach((l) => l())
}

function syncInterval(): void {
  if (state.running && handle === undefined) {
    handle = setInterval(() => {
      state = tick(state)
      emit()
    }, 1000)
  } else if (!state.running && handle !== undefined) {
    clearInterval(handle)
    handle = undefined
  }
}

export function toggleRun(): void {
  state = { ...state, running: !state.running }
  syncInterval()
  emit()
}

export function reset(): void {
  state = initialState()
  syncInterval()
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePomodoro(): PomodoroState {
  return useSyncExternalStore(subscribe, () => state)
}
