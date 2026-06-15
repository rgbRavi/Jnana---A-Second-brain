import type { ReactNode } from 'react'
import styles from '../Dashboard.module.css'

interface Props {
  title: string
  icon?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  onHide?: () => void
  onRefresh?: () => void
  /** Right-aligned slot in the header. */
  action?: ReactNode
  children: ReactNode
}

/** The shell every dashboard widget renders inside. Fills its grid cell; the
 *  ⠿ grip is react-grid-layout's drag handle. Resize is handled by RGL's edge
 *  handles, so there's no manual resize control here. */
export function DashboardCard({ title, icon, collapsed, onToggleCollapse, onHide, onRefresh, action, children }: Props) {
  return (
    <section className={styles.card}>
      <header className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <span className={`${styles.dragHandle} dashboard-drag-handle`} title="Drag to move" aria-hidden="true">
            ⠿
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
              ⌄
            </span>
            {icon && (
              <span className={styles.cardIcon} aria-hidden="true">
                {icon}
              </span>
            )}
            {title}
          </button>
        </div>
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
