// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Settings shell header: find any setting by name and jump to it. `/` or Ctrl/⌘+F focuses it.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import { getDialog } from '../../lib/dialog'
import { settingInputClass } from './SettingLayout'
import { revealSetting, searchSettings, TAB_LABELS, type SettingEntry } from './settingsIndex'
import styles from './SettingsSearch.module.css'

const shortEcho = (q: string) => (q.length > 60 ? q.slice(0, 60) + '…' : q)

export function SettingsSearch() {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [{ showDeveloperOptions }] = useGeneralSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `${id}-results`
  const results = useMemo(() => searchSettings(query, { showDev: showDeveloperOptions }), [query, showDeveloperOptions])
  const open = query.trim().length > 0
  const cancelReveal = useRef<() => void>(() => {})
  useEffect(() => () => cancelReveal.current(), [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      // A dialog over Settings (or a menu that handled the key) owns the keyboard.
      if (e.defaultPrevented || getDialog()) return
      const inField = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
      const find = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f'
      if (find || (e.key === '/' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (e: SettingEntry) => {
    const path = '/settings/' + e.tab
    // Same tab (a General setting): don't stack a duplicate history entry.
    navigate(path, { replace: location.pathname === path })
    cancelReveal.current()
    cancelReveal.current = revealSetting(e.anchor, e)
    setQuery('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query) {
      // Clear first; a second Esc falls through to Settings (blur / Back).
      e.preventDefault()
      setQuery('')
    } else if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      go(results[active])
    }
  }

  return (
    <div className={styles.search}>
      <div className={styles.inputWrap}>
        <Search size={15} className={styles.icon} aria-hidden />
        <input
          type="search"
          className={`${settingInputClass} ${styles.input}`}
          ref={inputRef}
          placeholder="Search settings (press /)"
          aria-label="Search all settings"
          title="Search settings (/ or Ctrl+F)"
          aria-keyshortcuts="/ Control+F Meta+F"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-r${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (
        <ul id={listId} role="listbox" aria-label="Matching settings" className={styles.results}>
          {results.length === 0 ? (
            <li className={styles.empty} role="presentation">
              No settings match “{shortEcho(query.trim())}”. Try a broader word, like “theme”, “backup” or “AI”.
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={`${r.tab}:${r.label}`}
                id={`${id}-r${i}`}
                role="option"
                aria-selected={i === active}
                className={`${styles.result} ${i === active ? styles.resultActive : ''}`}
                // mousedown, not click: keep the input's focus model simple and fire before blur.
                onMouseDown={(e) => {
                  e.preventDefault()
                  go(r)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className={styles.label}>{r.label}</span>
                <span className={styles.where}>
                  {TAB_LABELS[r.tab]}
                  {r.where && r.where !== TAB_LABELS[r.tab] ? ` › ${r.where}` : ''}
                </span>
                {i === active && <CornerDownLeft size={13} className={styles.enter} aria-hidden />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
