// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { transcribeAudio } from '../core/ai'
import { useNotesContext } from './NotesContext'

export type TranscriptionStatus = 'running' | 'done' | 'error'

export interface TranscriptionJob {
  id: string
  noteId: string
  noteTitle: string
  filename: string
  status: TranscriptionStatus
  error?: string
}

interface TranscriptionContextValue {
  jobs: TranscriptionJob[]
  /** Queue a background transcription for an audio asset already in a note. */
  transcribe: (noteId: string, noteTitle: string, filename: string) => void
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(null)

// How long finished jobs linger in the tray before disappearing.
const DONE_TTL = 4000
const ERROR_TTL = 12000

/** Insert the transcript right after its `![audio]` embed (or append if not found). */
function withTranscript(content: string, filename: string, transcript: string): string {
  const marker = `![audio](jnana-asset://${filename})`
  const insert = `\n\n${transcript}\n`
  const idx = content.indexOf(marker)
  if (idx === -1) return `${content}${insert}`
  const end = idx + marker.length
  return content.slice(0, end) + insert + content.slice(end)
}

/**
 * App-wide background transcription queue. A job runs without blocking the
 * editor; when it finishes, the transcript is written into the note and saved.
 * The sidebar tray observes `jobs`; audio embeds call `transcribe()`.
 */
export function TranscriptionProvider({ children }: { children: ReactNode }) {
  const { notes, update } = useNotesContext()
  const [jobs, setJobs] = useState<TranscriptionJob[]>([])

  // Refs so the async completion always sees the latest notes / running jobs.
  const notesRef = useRef(notes)
  notesRef.current = notes
  const jobsRef = useRef(jobs)
  jobsRef.current = jobs

  const removeLater = (id: string, ms: number) =>
    window.setTimeout(() => setJobs((prev) => prev.filter((j) => j.id !== id)), ms)

  const transcribe = useCallback(
    (noteId: string, noteTitle: string, filename: string) => {
      // Don't double-queue the same file.
      if (jobsRef.current.some((j) => j.filename === filename && j.status === 'running')) return

      const id = crypto.randomUUID()
      setJobs((prev) => [...prev, { id, noteId, noteTitle, filename, status: 'running' }])

      void (async () => {
        try {
          const text = (await transcribeAudio(filename)).trim()
          if (text) {
            const note = notesRef.current.find((n) => n.id === noteId)
            if (note) await update(note.id, note.title, withTranscript(note.content, filename, text))
          }
          setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: 'done' } : j)))
          removeLater(id, DONE_TTL)
        } catch (err) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === id
                ? { ...j, status: 'error', error: err instanceof Error ? err.message : String(err) }
                : j,
            ),
          )
          removeLater(id, ERROR_TTL)
        }
      })()
    },
    [update],
  )

  return (
    <TranscriptionContext.Provider value={{ jobs, transcribe }}>
      {children}
    </TranscriptionContext.Provider>
  )
}

export function useTranscription(): TranscriptionContextValue {
  const ctx = useContext(TranscriptionContext)
  if (!ctx) throw new Error('useTranscription must be used inside TranscriptionProvider')
  return ctx
}
