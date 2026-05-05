import { useEffect } from 'react'
import { eventBus } from '../lib/eventBus'
import type { Note } from '../types'

const STORAGE_KEY = 'jnana:last-opened'
const MAX = 10

export function getLastOpenedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function pushLastOpened(id: string) {
  const prev = getLastOpenedIds()
  const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function useSaveLastOpened() {
  useEffect(() => {
    const handler = (note: Note) => pushLastOpened(note.id)
    eventBus.on('note:opened', handler)
    return () => eventBus.off('note:opened', handler)
  }, [])
}
