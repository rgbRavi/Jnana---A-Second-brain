// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import styles from './Dashboard.module.css'
import { useDashboardPrefs } from './useDashboardPrefs'
import { showConfirmDialog, showPromptDialog } from '../../../lib/dialog'

/** Header dropdown to switch / save / rename / delete dashboard layouts. */
export function LayoutSwitcher() {
  const prefs = useDashboardPrefs()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = prefs.layouts.find((l) => l.id === prefs.activeId)

  const saveAs = async () => {
    setOpen(false)
    const name = await showPromptDialog({
      title: 'Save layout',
      message: 'Save the current arrangement as a new layout.',
      placeholder: 'e.g. Study mode',
      confirmLabel: 'Save',
    })
    if (name) prefs.createLayout(name)
  }

  const rename = async (id: string, current: string) => {
    const name = await showPromptDialog({ title: 'Rename layout', defaultValue: current, confirmLabel: 'Rename' })
    if (name) prefs.renameLayout(id, name)
  }

  const remove = async (id: string, name: string) => {
    const ok = await showConfirmDialog({
      title: 'Delete layout',
      message: `Delete the “${name}” layout? This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) prefs.deleteLayout(id)
  }

  return (
    <div className={styles.layoutSwitch} ref={wrapRef}>
      <button type="button" className={styles.layoutBtn} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className={styles.layoutBtnLabel}>{active?.name ?? 'Layout'}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={styles.layoutMenu} role="menu">
          {prefs.layouts.map((l) => (
            <div key={l.id} className={`${styles.layoutItem} ${l.id === prefs.activeId ? styles.layoutItemActive : ''}`}>
              <button
                type="button"
                className={styles.layoutItemMain}
                onClick={() => {
                  prefs.switchLayout(l.id)
                  setOpen(false)
                }}
              >
                <span className={styles.layoutCheck} aria-hidden="true">
                  {l.id === prefs.activeId ? '✓' : ''}
                </span>
                {l.name}
                {l.builtin && <span className={styles.layoutTag}>preset</span>}
              </button>
              {!l.builtin && (
                <span className={styles.layoutItemActions}>
                  <button type="button" className={styles.layoutMini} title="Rename" onClick={() => rename(l.id, l.name)}>
                    ✎
                  </button>
                  <button type="button" className={styles.layoutMini} title="Delete" onClick={() => remove(l.id, l.name)}>
                    ✕
                  </button>
                </span>
              )}
            </div>
          ))}
          <button type="button" className={styles.layoutSaveAs} onClick={saveAs}>
            ＋ Save current as…
          </button>
        </div>
      )}
    </div>
  )
}
