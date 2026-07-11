// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ReactNode } from 'react'
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

const MODES: [DisplayMode, string, string][] = [
  ['card', '▦', 'Cards'],
  ['comfortable', '▥', 'Comfortable'],
  ['compact', '☰', 'Compact'],
  ['grid', '⊞', 'Grid'],
]

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
  newLabel?: string
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
  newLabel = '✎ New note',
  onNew,
}: Props) {
  const prefs = useNotesViewPrefs(prefsKey)
  const activeCount = activeFilterCount(prefs.filters)

  return (
    <div className={Styles.toolbar}>
      <div className={Styles.searchWrap}>
        <span className={Styles.searchIcon} aria-hidden="true">⌕</span>
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
          {prefs.sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div className={Styles.modes} role="group" aria-label="Display mode">
        {MODES.map(([m, glyph, label]) => (
          <button
            key={m}
            className={`${Styles.modeBtn} ${prefs.displayMode === m ? Styles.modeBtnActive : ''}`}
            onClick={() => setNotesViewPrefs(prefsKey, { displayMode: m })}
            title={label}
            aria-label={label}
            aria-pressed={prefs.displayMode === m}
          >
            {glyph}
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
