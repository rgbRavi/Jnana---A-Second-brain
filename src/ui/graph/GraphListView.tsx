// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import styles from './GraphListView.module.css'

interface ListNode {
  id: string
  title: string
  isPseudo?: boolean
}
// force-graph swaps link endpoints from ids to node objects once it runs.
type End = string | { id: string }
interface ListLink {
  source: End
  target: End
}

const endId = (e: End) => (typeof e === 'string' ? e : e.id)

/** Accessible, keyboard-first alternative to the canvas: the same filtered node
 *  set as a plain list, with each note's linked notes inline. */
export function GraphListView({
  nodes,
  links,
  onOpen,
  onCreate,
  onMenu,
  header,
  vaultEmpty,
  noun,
  onClearFilters,
  onNewNote,
}: {
  nodes: ListNode[]
  links: ListLink[]
  onOpen: (id: string) => void
  onCreate: (title: string) => void
  /** Open the shared note menu at client coordinates (button rect / keyboard). */
  onMenu: (id: string, x: number, y: number) => void
  /** Rendered above the rows (e.g. the connect picker). */
  header?: ReactNode
  /** True when there are no notes at all (vs. none matching the filters). */
  vaultEmpty: boolean
  noun: string
  onClearFilters: () => void
  /** Omitted where creating a note here wouldn't land in this scope. */
  onNewNote?: () => void
}) {
  const missingId = useId()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const { notes, missing, neighbours, byId } = useMemo(() => {
    const index = new Map(nodes.map((n) => [n.id, n]))
    const nb = new Map<string, Set<string>>()
    const add = (a: string, b: string) => {
      if (!index.has(a) || !index.has(b)) return
      if (!nb.has(a)) nb.set(a, new Set())
      nb.get(a)!.add(b)
    }
    for (const l of links) {
      const s = endId(l.source)
      const t = endId(l.target)
      add(s, t)
      add(t, s)
    }
    const sorted = [...nodes].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    return {
      notes: sorted.filter((n) => !n.isPseudo),
      missing: sorted.filter((n) => n.isPseudo),
      neighbours: nb,
      byId: index,
    }
  }, [nodes, links])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (notes.length === 0 && missing.length === 0) {
    return (
      <div className={styles.empty}>
        {vaultEmpty ? (
          <>
            <p>{`No notes in this ${noun} yet`}</p>
            {onNewNote && (
              <button type="button" className={styles.create} onClick={onNewNote}>
                New note
              </button>
            )}
          </>
        ) : (
          <>
            <p>No notes match these filters</p>
            <button type="button" className={styles.create} onClick={onClearFilters}>
              Clear filters
            </button>
          </>
        )}
        {header}
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {header}
      <ul className={styles.list} aria-label="Notes">
        {notes.map((n) => {
          const linked = [...(neighbours.get(n.id) ?? [])]
          const open = expanded.has(n.id)
          return (
            <li key={n.id} className={styles.item}>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.chev}
                  onClick={() => toggle(n.id)}
                  aria-expanded={open}
                  aria-label={`${open ? 'Hide' : 'Show'} notes linked to ${n.title || 'Untitled'}`}
                  title={open ? 'Hide linked notes' : 'Show linked notes'}
                  disabled={linked.length === 0}
                >
                  <ChevronRight size={14} className={open ? styles.chevOpen : undefined} />
                </button>
                <button
                  type="button"
                  className={styles.title}
                  onClick={() => onOpen(n.id)}
                  onKeyDown={(e) => {
                    // Keyboard equivalent of the canvas right-click menu.
                    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                      e.preventDefault()
                      const r = e.currentTarget.getBoundingClientRect()
                      onMenu(n.id, r.left, r.bottom)
                    }
                  }}
                >
                  {n.title || 'Untitled'}
                </button>
                <span className={styles.count}>
                  {linked.length} {linked.length === 1 ? 'link' : 'links'}
                </span>
                <button
                  type="button"
                  className={styles.chev}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    onMenu(n.id, r.left, r.bottom)
                  }}
                  aria-haspopup="menu"
                  title={`More actions for ${n.title || 'Untitled'}`}
                  aria-label={`More actions for ${n.title || 'Untitled'}`}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
              {open && linked.length > 0 && (
                <ul className={styles.sub} aria-label={`Linked to ${n.title || 'Untitled'}`}>
                  {linked.map((id) => {
                    const other = byId.get(id)
                    return (
                      <li key={id}>
                        {other?.isPseudo ? (
                          <span className={styles.missingText}>{other.title} (missing)</span>
                        ) : (
                          <button type="button" className={styles.subBtn} onClick={() => onOpen(id)}>
                            {other?.title || 'Untitled'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {missing.length > 0 && (
        <section aria-labelledby={missingId}>
          <h3 id={missingId} className={styles.groupHead}>
            Missing notes
          </h3>
          <ul className={styles.list}>
            {missing.map((n) => (
              <li key={n.id} className={styles.row}>
                <span className={styles.missingTitle}>{n.title}</span>
                <span className={styles.count}>linked from {neighbours.get(n.id)?.size ?? 0}</span>
                <button
                  type="button"
                  className={styles.create}
                  onClick={() => onCreate(n.title)}
                  aria-label={`Create note ${n.title}`}
                >
                  Create
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
