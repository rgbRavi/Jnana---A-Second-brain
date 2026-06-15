import type { ReactNode } from 'react'
import styles from '../Dashboard.module.css'

interface Props {
  title: string
  icon?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  onHide?: () => void
  onRefresh?: () => void
  /** Right-aligned slot in the header (e.g. a "View all" link). */
  action?: ReactNode
  children: ReactNode
}

/** The shell every dashboard section renders inside: header (title + collapse /
 *  refresh / hide controls) and a collapsible body. */
export function DashboardCard({ title, icon, collapsed, onToggleCollapse, onHide, onRefresh, action, children }: Props) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
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
            ⌄
          </span>
          {icon && (
            <span className={styles.cardIcon} aria-hidden="true">
              {icon}
            </span>
          )}
          {title}
        </button>
        <div className={styles.cardActions}>
          {action}
          {onRefresh && (
            <button type="button" className={styles.cardBtn} onClick={onRefresh} title="Refresh">
              ↻
            </button>
          )}
          {onHide && (
            <button type="button" className={styles.cardBtn} onClick={onHide} title="Hide section">
              ✕
            </button>
          )}
        </div>
      </header>
      {!collapsed && <div className={styles.cardBody}>{children}</div>}
    </section>
  )
}
