// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MiniSearch from 'minisearch'
import { useNotesContext } from '../context/NotesContext'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { eventBus } from '../lib/eventBus'
import { openComposer } from './editor/NoteCreator'
import { workspaceColor } from '../core/workspaces'
import { openNoteInWorking, setNotesSubView } from '../views/notes/working/useWorkingLayout'
import styles from './CommandPalette.module.css'

// Intuitive, non-intrusive: ⇧ + the palette-style modifier + E ("Editor desk").
const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
export const WORKING_NOTES_SHORTCUT = IS_MAC ? '⇧⌘E' : 'Ctrl+⇧+E'

interface IndexedNote {
  id: string
  title: string
  content: string
  tags: string
}

interface Item {
  key: string
  icon: string
  label: string
  hint?: string
  /** Accent dot (workspaces). */
  color?: string
  run: () => void
}

/**
 * Global Ctrl/⌘-K command palette. Mounted once in AppLayout so the shortcut
 * works from any view. Fuzzy-jumps to notes (minisearch, built only while open),
 * switches workspaces, and runs a static command registry. Actions dispatch via
 * the router, the eventBus, or openComposer — no view coupling.
 */
export function CommandPalette() {
  const navigate = useNavigate()
  const { notes } = useNotesContext()
  const { workspaces } = useWorkspaces()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global shortcut (idempotent listener).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset + focus on open.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      const t = window.setTimeout(() => inputRef.current?.focus(), 30)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const close = () => setOpen(false)

  const goto = (path: string) => {
    navigate(path)
    close()
  }

  // Note index — built only while the palette is open, refreshed if notes change.
  const noteIndex = useMemo(() => {
    if (!open) return null
    const mi = new MiniSearch<IndexedNote>({
      idField: 'id',
      fields: ['title', 'content', 'tags'],
      storeFields: ['title'],
      searchOptions: { boost: { title: 3, tags: 2, content: 1 }, prefix: true, fuzzy: 0.2 },
    })
    mi.addAll(
      notes.map((n) => ({ id: n.id, title: n.title || '', content: n.content || '', tags: (n.tags || []).join(' ') })),
    )
    return mi
  }, [open, notes])

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

  const commands: Item[] = useMemo(
    () => [
      { key: 'cmd:new-note', icon: '✏️', label: 'New note', hint: 'Create', run: () => { openComposer(); close() } },
      { key: 'cmd:home', icon: '🏠', label: 'Go to Home', run: () => goto('/') },
      { key: 'cmd:notes', icon: '📝', label: 'Go to All Notes', run: () => { setNotesSubView('gallery'); goto('/notes') } },
      { key: 'cmd:working', icon: '🗂️', label: 'Open Working Notes', hint: WORKING_NOTES_SHORTCUT, run: () => { setNotesSubView('working'); goto('/notes') } },
      { key: 'cmd:workspaces', icon: '📁', label: 'Go to Workspaces', run: () => goto('/workspaces') },
      { key: 'cmd:graph', icon: '🕸️', label: 'Open Graph', run: () => goto('/graph') },
      { key: 'cmd:search', icon: '🔍', label: 'Open Search', run: () => goto('/search') },
      { key: 'cmd:ai', icon: '🤖', label: 'Open AI Chat', run: () => goto('/ai') },
      { key: 'cmd:settings', icon: '⚙️', label: 'Open Settings', run: () => goto('/settings') },
    ],
    // navigate is stable; goto closes over it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()

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

    let noteItems: Item[] = []
    if (q && noteIndex) {
      noteItems = noteIndex
        .search(q)
        .slice(0, 6)
        .map((r) => ({
          key: `note:${r.id}`,
          icon: '📄',
          label: (r as unknown as { title?: string }).title || 'Untitled',
          hint: 'Note',
          run: () => openNoteById(String(r.id)),
        }))
    }

    return [
      { title: 'Commands', items: cmdItems },
      { title: 'Workspaces', items: wsItems },
      { title: 'Notes', items: noteItems },
    ].filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, workspaces, commands, noteIndex, notes])

  // Flatten for keyboard navigation.
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => {
    if (active >= flat.length) setActive(0)
  }, [flat.length, active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      flat[active]?.run()
    }
  }

  return (
    <>
      {open && (
        <div className={styles.overlay} onClick={close}>
          <div className={styles.palette} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <input
              ref={inputRef}
              className={styles.input}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onKeyDown}
              placeholder="Search notes, workspaces, or run a command…"
              aria-label="Command palette search"
            />
            <div className={styles.results}>
              {flat.length === 0 && <p className={styles.empty}>No matches.</p>}
              {groups.map((g) => (
                <div key={g.title} className={styles.group}>
                  <div className={styles.groupTitle}>{g.title}</div>
                  {g.items.map((it) => {
                    const idx = flat.indexOf(it)
                    return (
                      <button
                        key={it.key}
                        className={`${styles.item} ${idx === active ? styles.itemActive : ''}`}
                        onClick={it.run}
                        onMouseEnter={() => setActive(idx)}
                      >
                        {it.color ? (
                          <span className={styles.dot} style={{ background: it.color }} />
                        ) : (
                          <span className={styles.itemIcon} aria-hidden="true">{it.icon}</span>
                        )}
                        <span className={styles.itemLabel}>{it.label}</span>
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
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
