import { useEffect } from 'react'
import { eventBus } from '../lib/eventBus'
import type { Note } from '../types'

const STORAGE_KEY = 'jnana:last-opened'
const MAX = 10

/** One opened-note record. Older stores held bare id strings — tolerated on read. */
export interface LastOpened {
  id: string
  at: number
}

/** Full records (id + when last opened), most-recent first. */
export function getLastOpened(): LastOpened[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[]
    return raw
      .map((e) => (typeof e === 'string' ? { id: e, at: 0 } : (e as LastOpened)))
      .filter((e) => e && typeof e.id === 'string')
  } catch {
    return []
  }
}

/** Just the ids, most-recent first (back-compat for existing callers). */
export function getLastOpenedIds(): string[] {
  return getLastOpened().map((e) => e.id)
}

function pushLastOpened(id: string) {
  const prev = getLastOpened().filter((e) => e.id !== id)
  const next = [{ id, at: Date.now() }, ...prev].slice(0, MAX)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function useSaveLastOpened() {
  useEffect(() => {
    const handler = (note: Note) => pushLastOpened(note.id)
    eventBus.on('note:opened', handler)
    return () => eventBus.off('note:opened', handler)
  }, [])
}
