// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import type { ReactNode } from 'react'
import { ChevronDown, GripVertical } from 'lucide-react'
import styles from '../Dashboard.module.css'

interface Props {
  title: string
  icon?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  children: ReactNode
}

/** The shell every dashboard widget renders inside. Fills its grid cell; the
 *  ⠿ grip is DashboardGrid's drag handle, resize is its edge handles — so the
 *  header carries only collapse. Hiding a section lives in Customize, and
 *  refreshing is one dashboard-wide button in the header. */
export function DashboardCard({ title, icon, collapsed, onToggleCollapse, children }: Props) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={`${styles.dragHandle} dashboard-drag-handle`} title="Drag to move" aria-hidden="true">
            <GripVertical size={15} />
          </span>
          <button
            type="button"
            className={styles.cardTitle}
            onClick={onToggleCollapse}
            disabled={!onToggleCollapse}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <span
              className={styles.cardCaret}
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
              aria-hidden="true"
            >
              <ChevronDown size={15} />
            </span>
            {icon && (
              <span className={styles.cardIcon} aria-hidden="true">
                {icon}
              </span>
            )}
            {title}
          </button>
        </div>
      </header>
      {!collapsed && <div className={styles.cardBody}>{children}</div>}
    </section>
  )
}
