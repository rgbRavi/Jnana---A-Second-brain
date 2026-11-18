// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Search, X } from 'lucide-react'
import { ContextMenu, type MenuItem } from '../../ui/ContextMenu'
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
  ['comfortable', 'Large cards'],
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
  /** Extra entries for the create button's dropdown (after "New note"). The chevron only shows when given. */
  newMenuItems?: MenuItem[]
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
  newMenuItems,
}: Props) {
  const prefs = useNotesViewPrefs(prefsKey)
  const activeCount = activeFilterCount(prefs.filters)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const create = onNew ?? openComposer
  const descending = prefs.sortOrder === 'desc'
  const orderLabel = descending ? 'Sort descending — click for ascending' : 'Sort ascending — click for descending'

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
        {search && (
          <button
            className={Styles.searchClear}
            onClick={() => onSearch('')}
            title="Clear search"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
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
        <label className={Styles.fieldLabel} htmlFor={`${prefsKey}-sort`}>Sort</label>
        <div className={Styles.selectWrap}>
          <SettingSelect
            value={prefs.sortBy}
            onChange={(v) => setNotesViewPrefs(prefsKey, { sortBy: v as SortBy })}
            options={SORT_OPTIONS.map(([value, label]) => ({ value, label }))}
            id={`${prefsKey}-sort`}
          />
        </div>
        <button
          className={`${Styles.toolBtn} ${Styles.iconBtn}`}
          onClick={() => setNotesViewPrefs(prefsKey, { sortOrder: descending ? 'asc' : 'desc' })}
          title={orderLabel}
          aria-label={orderLabel}
        >
          {descending ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
        </button>
      </div>

      <div className={Styles.sort}>
        <label className={Styles.fieldLabel} htmlFor={`${prefsKey}-view`}>View</label>
        <div className={Styles.selectWrap}>
          <SettingSelect
            value={prefs.displayMode}
            onChange={(v) => setNotesViewPrefs(prefsKey, { displayMode: v as DisplayMode })}
            options={MODES.map(([value, label]) => ({ value, label }))}
            id={`${prefsKey}-view`}
          />
        </div>
      </div>

      {extraActions}

      <div className={Styles.split}>
        <button className={`${Styles.newBtn} ${newMenuItems ? Styles.newBtnMain : ''}`} onClick={create}>
          {newLabel}
        </button>
        {newMenuItems && (
          <button
            className={Styles.newChevron}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenuAt({ x: r.left, y: r.bottom + 4 })
            }}
            title="More ways to create"
            aria-label="More ways to create"
            aria-haspopup="menu"
            aria-expanded={!!menuAt}
          >
            <ChevronDown size={15} />
          </button>
        )}
      </div>
      {menuAt && newMenuItems && (
        <ContextMenu
          x={menuAt.x}
          y={menuAt.y}
          items={[{ label: 'New note', onClick: create }, ...newMenuItems]}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  )
}
