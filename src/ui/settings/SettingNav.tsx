// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The one sub-navigation and the one segmented control for Settings panels.
// Theme Studio and Plugins used to carry their own (underline tabs vs bordered
// pills; two segmented looks) — these replace both so every panel moves the same way.

import type { KeyboardEvent, ReactNode } from 'react'
import styles from './SettingNav.module.css'

export interface SettingTabItem<T extends string> {
  id: T
  label: string
  /** Small count after the label (e.g. updates available). */
  count?: number
  /** Accessible text for the count ("3 available"). */
  countLabel?: string
  /** `data-setting-anchor` so Settings search can jump to (and click) this tab. */
  anchor?: string
}

/** Id of a tab button, for the tab panel's `aria-labelledby`. */
export const settingTabId = (prefix: string, id: string) => `${prefix}-tab-${id}`

/**
 * ARIA tablist with roving focus (←/→/Home/End). Only the active tab is in the
 * tab order. `trailing` renders at the row's right end (panel-level actions),
 * outside the tablist so it isn't announced as a tab.
 */
export function SettingTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  panelId,
  trailing,
}: {
  items: SettingTabItem<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  idPrefix: string
  /** Id of the element the tabs control (role="tabpanel"). */
  panelId: string
  trailing?: ReactNode
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.id === value)
    const next =
      e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null
    if (next === null) return
    e.preventDefault()
    const t = items[(next + items.length) % items.length]
    onChange(t.id)
    document.getElementById(settingTabId(idPrefix, t.id))?.focus()
  }
  return (
    <div className={styles.tabRow}>
      <div className={styles.tabs} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {items.map((t) => {
          const on = t.id === value
          return (
            <button
              key={t.id}
              id={settingTabId(idPrefix, t.id)}
              data-setting-anchor={t.anchor}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              className={`${styles.tab} ${on ? styles.tabActive : ''}`}
              onClick={() => onChange(t.id)}
            >
              {t.label}
              {t.count ? (
                <>
                  <span className={styles.count} aria-hidden>
                    {t.count}
                  </span>
                  <span className={styles.srOnly}>, {t.countLabel ?? t.count}</span>
                </>
              ) : null}
            </button>
          )
        })}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  )
}

/** Pick one of a few values. Buttons with `aria-pressed`, named as a group. */
export function SettingSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  describedBy,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  ariaLabel: string
  id?: string
  describedBy?: string
}) {
  return (
    <div id={id} className={styles.segmented} role="group" aria-label={ariaLabel} aria-describedby={describedBy}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          className={`${styles.segment} ${value === o.value ? styles.segmentOn : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
