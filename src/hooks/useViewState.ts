// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useViewState.ts
import { useCallback, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'

/**
 * A subscribable, module-level store that outlives any component. Because the
 * module stays loaded for the whole app session, values written here survive a
 * component unmounting and remounting — which is what happens when you switch
 * views (react-router unmounts the previous route).
 *
 * It's an *external* store (not per-component React state) for a reason: an
 * async task started in a view (e.g. an AI request) keeps running after you
 * navigate away. Its completion writes straight to this store via the setter,
 * regardless of whether the originating component is still mounted — and any
 * view currently subscribed to that key re-renders. So an answer that lands
 * while you're on another view is there when you come back.
 *
 * In-memory only: it intentionally resets on a full app reload.
 */
const store = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l())
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
  }
}

/** Read a stored value without subscribing (e.g. for non-React access). */
export function getViewState<T>(key: string): T | undefined {
  return store.get(key) as T | undefined
}

/** Write a value (or updater) imperatively and notify subscribers. */
export function setViewState<T>(key: string, value: T | ((prev: T | undefined) => T)): void {
  const prev = store.get(key) as T | undefined
  const next = typeof value === 'function' ? (value as (p: T | undefined) => T)(prev) : value
  if (Object.is(next, prev)) return
  store.set(key, next)
  emit(key)
}

/** Clear one key, or the whole store when called with no argument. */
export function clearViewState(key?: string): void {
  if (key === undefined) {
    store.clear()
    listeners.forEach((set) => set.forEach((l) => l()))
  } else {
    store.delete(key)
    emit(key)
  }
}

/**
 * Drop-in replacement for `useState` whose value lives in the shared store under
 * `key`, so it is restored when the component remounts (view switch) and stays
 * live even when written by code outside the current component.
 *
 * Keys must be unique per logical piece of state — two components sharing a key
 * share the value. Namespace them, e.g. `graph.filterText`, `ai.thread`.
 */
export function useViewState<T>(key: string, initial: T | (() => T)) {
  // Seed once (idempotent — guarded so StrictMode's double render is safe).
  if (!store.has(key)) {
    store.set(key, typeof initial === 'function' ? (initial as () => T)() : initial)
  }

  const subscribeKey = useCallback((l: () => void) => subscribe(key, l), [key])
  const getSnapshot = useCallback(() => store.get(key) as T, [key])
  const state = useSyncExternalStore(subscribeKey, getSnapshot, getSnapshot)

  const setState = useCallback<Dispatch<SetStateAction<T>>>(
    (value) => setViewState<T>(key, value as T | ((prev: T | undefined) => T)),
    [key],
  )

  return [state, setState] as const
}
