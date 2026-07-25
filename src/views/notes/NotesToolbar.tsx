// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Pencil, Search } from 'lucide-react'
import { openComposer } from '../../ui/editor/NoteCreator'
import { useNotesViewPrefs, setNotesViewPrefs, activeFilterCount, NOTES_PREFS_KEY } from './useNotesViewPrefs'
import type { DisplayMode, SortBy } from './filterNotes'
import Styles from './NotesToolbar.module.css'

const SORT_OPTIONS: [SortBy, string][] = [
  ['updated', 'Updated'],
  ['created', 'Created'],
  ['title', 'Title'],
  ['length', 'Length'],
  ['links', 'Links'],
]

const MODES: [DisplayMode, string][] = [
  ['card', 'Cards'],
  ['comfortable', 'Comfortable'],
  ['compact', 'Compact'],
  ['grid', 'Grid'],
]

/** Lucide icon per display mode (stroke + size come from CSS `.modeBtn svg`). */
const MODE_ICON: Record<DisplayMode, ReactNode> = {
  card: (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>
  ),
  comfortable: (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M21 9H3" /><path d="M21 15H3" /></svg>
  ),
  compact: (
    <svg viewBox="0 0 24 24"><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h18" /><path d="M12 3v18" /></svg>
  ),
}

interface Props {
  count: number
  total: number
  search: string
  onSearch: (v: string) => void
  filtersOpen: boolean
  onToggleFilters: () => void
  /** Which prefs instance to drive (All-Notes vs a workspace). */
  prefsKey?: string
  /** Optional extra controls rendered before the "New note" button. */
  extraActions?: ReactNode
  /** Label for the create button (default "New note"). */
  newLabel?: ReactNode
  /** Override the create action (default opens the global composer). */
  onNew?: () => void
}

export function NotesToolbar({
  count,
  total,
  search,
  onSearch,
  filtersOpen,
  onToggleFilters,
  prefsKey = NOTES_PREFS_KEY,
  extraActions,
  newLabel = <><Pencil size={15} /> New note</>,
  onNew,
}: Props) {
  const prefs = useNotesViewPrefs(prefsKey)
  const activeCount = activeFilterCount(prefs.filters)

  return (
    <div className={Styles.toolbar}>
      <div className={Styles.searchWrap}>
        <span className={Styles.searchIcon} aria-hidden="true"><Search size={15} /></span>
        <input
          className={Styles.search}
          type="search"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search notes"
        />
      </div>

      <button
        className={`${Styles.toolBtn} ${filtersOpen ? Styles.toolBtnActive : ''}`}
        onClick={onToggleFilters}
        aria-expanded={filtersOpen}
      >
        Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
      </button>

      <div className={Styles.sort}>
        <select
          className={Styles.select}
          value={prefs.sortBy}
          onChange={(e) => setNotesViewPrefs(prefsKey, { sortBy: e.target.value as SortBy })}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <button
          className={Styles.toolBtn}
          onClick={() => setNotesViewPrefs(prefsKey, { sortOrder: prefs.sortOrder === 'asc' ? 'desc' : 'asc' })}
          title={prefs.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          aria-label="Toggle sort order"
        >
          {prefs.sortOrder === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
        </button>
      </div>

      <div className={Styles.modes} role="group" aria-label="Display mode">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            className={`${Styles.modeBtn} ${prefs.displayMode === m ? Styles.modeBtnActive : ''}`}
            onClick={() => setNotesViewPrefs(prefsKey, { displayMode: m })}
            title={label}
            aria-label={label}
            aria-pressed={prefs.displayMode === m}
          >
            {MODE_ICON[m]}
            <span className={Styles.modeLabel}>{label}</span>
          </button>
        ))}
      </div>

      <span className={Styles.count}>
        {count === total ? `${total}` : `${count} / ${total}`} note{total !== 1 ? 's' : ''}
      </span>

      {extraActions}

      <button className={Styles.newBtn} onClick={onNew ?? openComposer}>
        {newLabel}
      </button>
    </div>
  )
}
