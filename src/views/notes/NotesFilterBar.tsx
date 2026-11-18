// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useState, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { useNotesViewPrefs, setNotesFilter, resetNotesFilter, activeFilterCount, NOTES_PREFS_KEY } from './useNotesViewPrefs'
import type { DatePreset, SizeBucket, StatusFilter } from './filterNotes'
import Styles from './NotesToolbar.module.css'
import NoteStyles from './Notes.module.css'

/** Show a tag finder once the Tags row gets long. */
const TAG_SEARCH_MIN = 20

const DATE_PRESETS: [DatePreset, string][] = [
  ['all', 'All'],
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['month', 'This month'],
  ['custom', 'Custom'],
]

const SIZES: [SizeBucket, string][] = [
  ['short', 'Short'],
  ['medium', 'Medium'],
  ['long', 'Long'],
]

const STATUSES: [StatusFilter, ReactNode][] = [
  ['fav', <><Star size={13} aria-hidden="true" /> Favourites</>],
  ['images', 'Has images'],
  ['pdfs', 'Has PDFs'],
  ['videos', 'Has videos'],
  ['audio', 'Has audio'],
  ['docs', 'Has documents'],
  ['webpages', 'Has web pages'],
  ['linked', 'Linked'],
  ['orphan', 'Orphan'],
  ['untagged', 'Untagged'],
]

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

const toInput = (ms?: number) => {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const fromInput = (s: string) => (s ? new Date(`${s}T00:00:00`).getTime() : undefined)

interface Props {
  /** Union of all tags across notes (user + auto), for the include/exclude picker. */
  allTags: string[]
  /** Which prefs instance to drive (All-Notes vs a workspace). */
  prefsKey?: string
}

/** Tag chips cycle: neutral → include → exclude → neutral. */
export function NotesFilterBar({ allTags: offeredTags, prefsKey = NOTES_PREFS_KEY }: Props) {
  const { filters } = useNotesViewPrefs(prefsKey)
  // Auto-tags aren't offered as chips any more, but a filter saved on one before
  // that change must stay visible — otherwise "Filters · 1" counts a tag the user
  // can't see or toggle off.
  const allTags = [
    ...offeredTags,
    ...[...filters.includeTags, ...filters.excludeTags].filter((t) => !offeredTags.includes(t)),
  ]
  const [tagQuery, setTagQuery] = useState('')
  const tq = tagQuery.trim().toLowerCase()
  const shownTags = tq ? allTags.filter((t) => t.toLowerCase().includes(tq)) : allTags

  const cycleTag = (tag: string) => {
    if (filters.includeTags.includes(tag)) {
      setNotesFilter(prefsKey, {
        includeTags: filters.includeTags.filter((t) => t !== tag),
        excludeTags: [...filters.excludeTags, tag],
      })
    } else if (filters.excludeTags.includes(tag)) {
      setNotesFilter(prefsKey, { excludeTags: filters.excludeTags.filter((t) => t !== tag) })
    } else {
      setNotesFilter(prefsKey, { includeTags: [...filters.includeTags, tag] })
    }
  }

  return (
    <div className={Styles.filterBar}>
      <div className={Styles.filterGroup}>
        <span className={Styles.filterLabel}>Date</span>
        <div className={Styles.chips}>
          {DATE_PRESETS.map(([v, label]) => (
            <button
              key={v}
              className={`${Styles.chip} ${filters.datePreset === v ? Styles.chipOn : ''}`}
              onClick={() => setNotesFilter(prefsKey, { datePreset: v })}
            >
              {label}
            </button>
          ))}
          {filters.datePreset === 'custom' && (
            <span className={Styles.dateRange}>
              <input
                type="date"
                className={Styles.dateInput}
                value={toInput(filters.dateFrom)}
                onChange={(e) => setNotesFilter(prefsKey, { dateFrom: fromInput(e.target.value) })}
                aria-label="From date"
              />
              <span className={Styles.dateSep}>–</span>
              <input
                type="date"
                className={Styles.dateInput}
                value={toInput(filters.dateTo)}
                onChange={(e) => setNotesFilter(prefsKey, { dateTo: fromInput(e.target.value) })}
                aria-label="To date"
              />
            </span>
          )}
        </div>
      </div>

      <div className={Styles.filterGroup}>
        <span className={Styles.filterLabel}>Size</span>
        <div className={Styles.chips}>
          {SIZES.map(([v, label]) => (
            <button
              key={v}
              className={`${Styles.chip} ${filters.sizes.includes(v) ? Styles.chipOn : ''}`}
              onClick={() => setNotesFilter(prefsKey, { sizes: toggle(filters.sizes, v) })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={Styles.filterGroup}>
        <span className={Styles.filterLabel}>Status</span>
        <div className={Styles.chips}>
          {STATUSES.map(([v, label]) => (
            <button
              key={v}
              className={`${Styles.chip} ${filters.status.includes(v) ? Styles.chipOn : ''}`}
              onClick={() => setNotesFilter(prefsKey, { status: toggle(filters.status, v) })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {allTags.length > 0 && (
        <div className={Styles.filterGroup}>
          <span className={Styles.filterLabel}>Tags</span>
          {allTags.length > TAG_SEARCH_MIN && (
            <input
              type="search"
              className={NoteStyles.tagFind}
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Find tag…"
              aria-label="Find tag"
            />
          )}
          <div className={Styles.chips}>
            {shownTags.map((tag) => {
              const inc = filters.includeTags.includes(tag)
              const exc = filters.excludeTags.includes(tag)
              return (
                <button
                  key={tag}
                  className={`${Styles.chip} ${inc ? Styles.chipOn : ''} ${exc ? Styles.chipExcluded : ''}`}
                  onClick={() => cycleTag(tag)}
                  title={inc ? 'Including — click to exclude' : exc ? 'Excluding — click to clear' : 'Click to include'}
                >
                  {inc ? '+ ' : exc ? '− ' : ''}
                  {tag}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {activeFilterCount(filters) > 0 && (
        <button className={Styles.clearBtn} onClick={() => resetNotesFilter(prefsKey)}>
          Clear all
        </button>
      )}
    </div>
  )
}
