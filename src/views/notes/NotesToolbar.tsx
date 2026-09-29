// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Pencil, Search, X } from 'lucide-react'
import { openComposer } from '../../ui/editor/NoteCreator'
import { SettingSelect } from '../../ui/settings/SettingControls'
import {
  useNotesViewPrefs,
  setNotesViewPrefs,
  resetNotesFilter,
  activeFilterCount,
  NOTES_PREFS_KEY,
} from './useNotesViewPrefs'
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

interface Props {
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

      <div className={Styles.filterGroupBtns}>
        <button
          className={`${Styles.toolBtn} ${filtersOpen ? Styles.toolBtnActive : ''}`}
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
        >
          Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
        </button>
        {/* Only worth showing when there's something to clear. */}
        {activeCount > 0 && (
          <button
            className={Styles.toolBtn}
            onClick={() => resetNotesFilter(prefsKey)}
            title="Clear filters"
            aria-label="Clear filters"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className={Styles.sort}>
        <div className={Styles.selectWrap}>
          <SettingSelect
            value={prefs.sortBy}
            onChange={(v) => setNotesViewPrefs(prefsKey, { sortBy: v as SortBy })}
            options={SORT_OPTIONS.map(([value, label]) => ({ value, label }))}
            ariaLabel="Sort by"
          />
        </div>
        <button
          className={Styles.toolBtn}
          onClick={() => setNotesViewPrefs(prefsKey, { sortOrder: prefs.sortOrder === 'asc' ? 'desc' : 'asc' })}
          title={prefs.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          aria-label="Toggle sort order"
        >
          {prefs.sortOrder === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
        </button>
      </div>

      <div className={Styles.selectWrap}>
        <SettingSelect
          value={prefs.displayMode}
          onChange={(v) => setNotesViewPrefs(prefsKey, { displayMode: v as DisplayMode })}
          options={MODES.map(([value, label]) => ({ value, label }))}
          ariaLabel="Display mode"
        />
      </div>

      {extraActions}

      <button className={Styles.newBtn} onClick={onNew ?? openComposer}>
        {newLabel}
      </button>
    </div>
  )
}
