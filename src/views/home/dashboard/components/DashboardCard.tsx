// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useId, type ReactNode } from 'react'
import { ChevronDown, GripVertical } from 'lucide-react'
import styles from '../Dashboard.module.css'

interface Props {
  title: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  children: ReactNode
}

/** The shell every dashboard widget renders inside. Fills its grid cell; the
 *  grip button is DashboardGrid's drag handle (pointer) and its keyboard move /
 *  resize target (arrows, Shift+arrows). Hiding a section lives in Customize,
 *  and refreshing is one dashboard-wide button in the header. */
export function DashboardCard({ title, collapsed, onToggleCollapse, children }: Props) {
  const titleId = useId()
  const helpId = useId()
  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <button
            type="button"
            className={`${styles.dragHandle} dashboard-drag-handle`}
            aria-label={`Move ${title}`}
            aria-describedby={helpId}
            title="Drag, or use arrow keys, to move. Shift+arrows to resize"
          >
            <GripVertical size={15} aria-hidden="true" />
          </button>
          <span id={helpId} className={styles.gridLive}>
            Arrow keys move this card. Shift plus arrow keys resize it.
          </span>
          <h2 className={styles.cardHeading} id={titleId}>
            <button
              type="button"
              className={styles.cardTitle}
              onClick={onToggleCollapse}
              disabled={!onToggleCollapse}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <span className={`${styles.cardCaret} ${collapsed ? styles.cardCaretCollapsed : ''}`} aria-hidden="true">
                <ChevronDown size={15} />
              </span>
              {title}
            </button>
          </h2>
        </div>
      </header>
      {!collapsed && <div className={styles.cardBody}>{children}</div>}
    </section>
  )
}
