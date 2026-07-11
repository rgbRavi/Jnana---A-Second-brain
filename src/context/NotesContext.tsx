// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { createContext, useContext, ReactNode } from 'react'
import { useNotes } from '../hooks/useNotes'

type NotesContextValue = ReturnType<typeof useNotes>

const NotesContext = createContext<NotesContextValue | null>(null)

export function NotesProvider({ children }: { children: ReactNode }) {
  const value = useNotes()
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

export function useNotesContext(): NotesContextValue {
  const ctx = useContext(NotesContext)
  if (!ctx) throw new Error('useNotesContext must be used inside NotesProvider')
  return ctx
}
