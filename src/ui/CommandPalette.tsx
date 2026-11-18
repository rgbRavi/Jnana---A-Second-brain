// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotesContext } from '../context/NotesContext'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { eventBus } from '../lib/eventBus'
import { openComposer } from './editor/NoteCreator'
import { workspaceColor } from '../core/workspaces'
import { openNoteInWorking, setNotesSubView } from '../views/notes/working/useWorkingLayout'
import { listNoteTypes, subscribeNoteTypes, getNoteTypesVersion } from '../lib/noteTypes'
import { createNoteIndex, searchNotes } from '../core/search'
import { getAllAttachmentText } from '../core/attachmentText'
import { loadAiConfig, getIndexStats } from '../core/ai'
import { useActiveVaultId } from '../hooks/useVaults'
import { useSemanticSearch, type SemanticStatus } from '../hooks/useSemanticSearch'
import type { SemanticResult } from '../core/ai/searchResults'
import type { Note } from '../types'
import { plainText, snippetAround, splitHighlight, trimWords } from '../lib/searchSnippet'
import { listCommands, listWidgets, subscribeContributions, getContributionsVersion } from '../lib/pluginContributions'
import { isRailHidden, toggleRailHidden } from './rail/RightRail'
import { useGeneralSettings } from '../hooks/useGeneralSettings'
import { revealSetting, searchSettings, TAB_LABELS } from './settings/settingsIndex'
import styles from './CommandPalette.module.css'

// Intuitive, non-intrusive: ⇧ + the palette-style modifier + E ("Editor desk").
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
export const WORKING_NOTES_SHORTCUT = IS_MAC ? '⇧⌘E' : 'Ctrl+⇧+E'
export const PALETTE_SHORTCUT = IS_MAC ? '⌘`' : 'Ctrl+`'

/** Open the palette from anywhere (sidebar Search, dashboard quick action). */
export const openCommandPalette = () => eventBus.emit('palette:open', {})

type NoteIndex = Awaited<ReturnType<typeof createNoteIndex>>

interface Item {
  key: string
  icon: string
  /** Plain label — what command/setting filtering matches against. */
  label: string
  /** Rich label (highlighted note title); falls back to `label`. */
  labelNode?: ReactNode
  /** Second line (note snippet). */
  detail?: ReactNode
  hint?: string
  /** Accent dot (workspaces). */
  color?: string
  run: () => void
}

interface MeaningState {
  results: SemanticResult[]
  status: SemanticStatus
  retry: () => void
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {splitHighlight(text, terms).map((p, i) =>
        p.hit ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>,
      )}
    </>
  )
}

/**
 * Headless: runs semantic search and reports up. Rendered only in "by meaning"
 * mode, so its `useRag` (which also auto-indexes on save) isn't mounted the rest
 * of the time. ponytail: if the AI view is open too, saves get indexed twice
 * while this mode is on; a shared RAG instance would fix it if that ever matters.
 */
function MeaningRunner({ notes, query, onChange }: { notes: Note[]; query: string; onChange: (s: MeaningState) => void }) {
  const { results, status, retry } = useSemanticSearch(notes, query)
  const retryRef = useRef(retry)
  retryRef.current = retry
  useEffect(() => {
    onChange({ results, status, retry: () => retryRef.current() })
  }, [results, status, onChange])
  return null
}

/**
 * Global Ctrl/⌘-` command palette — also the app's search (the sidebar's Search
 * opens it). Mounted once in AppLayout so the shortcut works from any view.
 * Keyword-searches notes across vaults (MiniSearch over note text + attachment/PDF
 * text, built only while open), offers "Search by meaning" (semantic, active
 * vault) when AI is on and indexed, switches workspaces, and runs a static
 * command registry. Actions dispatch via the router, the eventBus, or
 * openComposer — no view coupling.
 */
export function CommandPalette() {
  const navigate = useNavigate()
  const [{ showDeveloperOptions }] = useGeneralSettings()
  const { notes, create } = useNotesContext()
  const { workspaces } = useWorkspaces()
  const vaultId = useActiveVaultId()
  // Re-render when the note-type registry changes so a plugin loaded *after* mount
  // (built-ins register synchronously, but installed plugins load async at boot)
  // adds its "New {label}" command without needing an app reload.
  const noteTypesVersion = useSyncExternalStore(subscribeNoteTypes, getNoteTypesVersion)
  const contributionsVersion = useSyncExternalStore(subscribeContributions, getContributionsVersion)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [meaning, setMeaning] = useState(false)
  const [meaningState, setMeaningState] = useState<MeaningState | null>(null)
  const [aiReady, setAiReady] = useState(false)
  const [noteIndex, setNoteIndex] = useState<NoteIndex | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Global shortcut + programmatic open (idempotent listeners).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '`')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    eventBus.on('palette:open', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      eventBus.off('palette:open', onOpen)
    }
  }, [])

  // Reset + focus on open; check whether "by meaning" can run (AI on + indexed).
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setMeaning(false)
    setMeaningState(null)
    let live = true
    Promise.all([loadAiConfig(), getIndexStats(vaultId)])
      .then(([cfg, stats]) => { if (live) setAiReady(cfg.enabled && stats.chunkCount > 0) })
      .catch(() => { if (live) setAiReady(false) })
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [open, vaultId])

  // Note index — built only while open, refreshed if notes change. Folds in
  // attachment (PDF) text, best-effort: keyword search still works without it.
  useEffect(() => {
    if (!open) {
      setNoteIndex(null)
      return
    }
    let live = true
    getAllAttachmentText()
      .catch(() => undefined)
      .then((attach) => createNoteIndex(notes, attach))
      .then((idx) => { if (live) setNoteIndex(idx) })
    return () => { live = false }
  }, [open, notes])

  const close = () => setOpen(false)

  const goto = (path: string) => {
    navigate(path)
    close()
  }

  const openNoteById = (id: string) => {
    const n = notes.find((x) => x.id === id)
    if (!n) return
    eventBus.emit('note:opened', n)
    // Palette is unscoped (searches all vaults); pass the note's vault so opening
    // it switches to that vault's desk.
    openNoteInWorking(id, n.vaultId ?? undefined)
    navigate('/notes')
    close()
  }

  const enterMeaning = () => {
    setMeaning(true)
    setMeaningState(null)
    setActive(0)
    inputRef.current?.focus()
  }
  const exitMeaning = () => {
    setMeaning(false)
    setActive(0)
  }

  const commands: Item[] = useMemo(
    () => [
      { key: 'cmd:new-note', icon: '✏️', label: 'New note', hint: 'Create', run: () => { openComposer(); close() } },
      // One "New {label}" per registered plugin note type (e.g. Flashcard deck).
      ...listNoteTypes().map((t) => ({
        key: `cmd:new-${t.id}`,
        icon: '🧩',
        label: `New ${t.label}`,
        hint: 'Create',
        run: async () => {
          const note = await create('', t.newContent?.() ?? '', undefined, [], t.id)
          setNotesSubView('working')
          openNoteInWorking(note.id, note.vaultId ?? undefined)
          navigate('/notes')
          close()
        },
      })),
      { key: 'cmd:home', icon: '🏠', label: 'Go to Home', run: () => goto('/') },
      { key: 'cmd:notes', icon: '📝', label: 'Go to All Notes', run: () => { setNotesSubView('gallery'); goto('/notes') } },
      { key: 'cmd:working', icon: '🗂️', label: 'Open Working Notes', hint: WORKING_NOTES_SHORTCUT, run: () => { setNotesSubView('working'); goto('/notes') } },
      { key: 'cmd:workspaces', icon: '📁', label: 'Go to Workspaces', run: () => goto('/workspaces') },
      { key: 'cmd:graph', icon: '🕸️', label: 'Open Graph', run: () => goto('/graph') },
      { key: 'cmd:ai', icon: '🤖', label: 'Open AI Chat', run: () => goto('/ai') },
      { key: 'cmd:settings', icon: '⚙️', label: 'Open Settings', run: () => goto('/settings') },
      { key: 'cmd:trash', icon: '🗑️', label: 'Open Trash', run: () => goto('/trash') },
      // The rail's hide button removes its own UI, so the way back has to live
      // somewhere that is always reachable.
      {
        key: 'cmd:rail',
        icon: '📐',
        label: isRailHidden() ? 'Show the right rail' : 'Hide the right rail',
        hint: 'Tools panel',
        run: () => {
          toggleRailHidden()
          close()
        },
      },
      // Always-reachable way into plugin widgets (the floating button can be turned off).
      ...(listWidgets().length
        ? [{ key: 'cmd:widgets', icon: '🧩', label: 'Show plugin widgets', hint: 'Widgets', run: () => { eventBus.emit('widgets:toggle', {}); close() } }]
        : []),
      // Commands contributed by plugins via ctx.ui.registerCommand.
      ...listCommands().map((c) => ({
        key: `plugincmd:${c.id}`,
        icon: c.icon ?? '🔌',
        label: c.label,
        hint: c.hint,
        run: () => { c.run(); close() },
      })),
    ],
    // Recompute when a note type or contributed command registers/unregisters
    // (plugin load/enable/disable). navigate is stable; goto closes over it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteTypesVersion, contributionsVersion],
  )

  const groups = useMemo(() => {
    const raw = query.trim()
    const q = raw.toLowerCase()

    if (meaning) {
      const items: Item[] = (meaningState?.results ?? []).map((r) => ({
        key: `meaning:${r.note.id}`,
        icon: '📄',
        label: r.note.title || 'Untitled',
        detail: trimWords(r.snippet, 140),
        run: () => openNoteById(r.note.id),
      }))
      if (meaningState?.status === 'error') {
        items.push({ key: 'meaning:retry', icon: '↻', label: 'Try again', run: () => meaningState.retry() })
      }
      return [{ title: 'By meaning', items }].filter((g) => g.items.length > 0)
    }

    const wsItems: Item[] = workspaces
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((w) => ({
        key: `ws:${w.id}`,
        icon: w.icon || '📁',
        label: w.name,
        hint: 'Workspace',
        color: workspaceColor(w),
        run: () => goto(`/workspaces/${w.id}`),
      }))

    const cmdItems = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands

    // Settings only surface once you type, so the default list stays short.
    const settingItems: Item[] = q
      ? searchSettings(q, { showDev: showDeveloperOptions, limit: 6 }).map((e) => ({
          key: `setting:${e.tab}:${e.label}`,
          icon: '⚙️',
          label: `Settings: ${e.label}`,
          hint: TAB_LABELS[e.tab],
          run: () => {
            goto('/settings/' + e.tab)
            revealSetting(e.anchor, e)
          },
        }))
      : []

    let noteItems: Item[] = []
    if (q && noteIndex) {
      noteItems = searchNotes(raw, noteIndex)
        .slice(0, 8)
        .map((r) => {
          const doc = r as unknown as { title?: string; content?: string }
          const terms = r.terms?.length ? r.terms : r.queryTerms ?? []
          const title = doc.title || 'Untitled'
          const snippet = snippetAround(plainText(doc.content), terms, 50, 90, 120)
          return {
            key: `note:${r.id}`,
            icon: '📄',
            label: title,
            labelNode: <Highlighted text={title} terms={terms} />,
            detail: snippet ? <Highlighted text={snippet} terms={terms} /> : undefined,
            run: () => openNoteById(String(r.id)),
          }
        })
    }

    const meaningItems: Item[] =
      q && aiReady
        ? [{ key: 'meaning:enter', icon: '✨', label: `Search by meaning: “${raw}”`, hint: 'AI', run: enterMeaning }]
        : []

    // Typing is mostly looking for a note, so notes lead once there's a query.
    return [
      { title: 'Notes', items: noteItems },
      { title: 'AI', items: meaningItems },
      { title: 'Commands', items: cmdItems },
      { title: 'Settings', items: settingItems },
      { title: 'Workspaces', items: wsItems },
    ].filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, meaning, meaningState, aiReady, workspaces, commands, noteIndex, notes, showDeveloperOptions])

  // Flatten for keyboard navigation.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => {
    if (active >= flat.length) setActive(0)
  }, [flat.length, active])

  // Keep the keyboard-active row in view.
  useEffect(() => {
    resultsRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (meaning) exitMeaning()
      else close()
    } else if (e.key === 'Backspace' && meaning && !query) {
      e.preventDefault()
      exitMeaning()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      flat[active]?.run()
    }
  }

  let meaningStatus = ''
  if (meaning) {
    const st = meaningState?.status ?? 'idle'
    const n = meaningState?.results.length ?? 0
    meaningStatus =
      st === 'searching' ? 'Searching by meaning…'
      : st === 'error' ? "AI search couldn't reach your index."
      : st === 'done' ? (n ? `${n} ${n === 1 ? 'note' : 'notes'} in this vault` : 'No notes matched. Try rephrasing.')
      : 'Ask in plain language — e.g. the note about spaced repetition'
  }

  return (
    <>
      {open && (
        <div className={styles.overlay} onClick={close}>
          <div className={styles.palette} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Search and commands">
            <div className={styles.inputRow}>
              {meaning && (
                <button
                  type="button"
                  className={styles.modeChip}
                  onClick={() => { exitMeaning(); inputRef.current?.focus() }}
                  title="Back to keyword search (Esc)"
                >
                  By meaning ×
                </button>
              )}
              <input
                ref={inputRef}
                className={styles.input}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={onKeyDown}
                placeholder={meaning ? 'Ask in plain language…' : 'Search notes, workspaces, or run a command…'}
                aria-label={meaning ? 'Search by meaning' : 'Search notes and commands'}
              />
            </div>
            {meaning && (
              <MeaningRunner notes={notes} query={query} onChange={setMeaningState} />
            )}
            <div className={styles.results} ref={resultsRef}>
              {meaning ? (
                <p className={styles.status} role="status">{meaningStatus}</p>
              ) : (
                flat.length === 0 && <p className={styles.empty}>{query.trim() && !noteIndex ? 'Searching…' : 'No matches.'}</p>
              )}
              {groups.map((g) => (
                <div key={g.title} className={styles.group}>
                  <div className={styles.groupTitle}>{g.title}</div>
                  {g.items.map((it) => {
                    const idx = flat.indexOf(it)
                    return (
                      <button
                        key={it.key}
                        data-idx={idx}
                        className={`${styles.item} ${idx === active ? styles.itemActive : ''}`}
                        onClick={it.run}
                        onMouseEnter={() => setActive(idx)}
                      >
                        {it.color ? (
                          <span className={styles.dot} style={{ background: it.color }} />
                        ) : (
                          <span className={styles.itemIcon} aria-hidden="true">{it.icon}</span>
                        )}
                        <span className={styles.itemText}>
                          <span className={styles.itemLabel}>{it.labelNode ?? it.label}</span>
                          {it.detail && <span className={styles.itemDetail}>{it.detail}</span>}
                        </span>
                        {it.hint && <span className={styles.itemHint}>{it.hint}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className={styles.footer}>
              <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span><kbd>↵</kbd> select</span>
              <span><kbd>esc</kbd> {meaning ? 'back' : 'close'}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
