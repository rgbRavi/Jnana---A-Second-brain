import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import styles from '../Dashboard.module.css'

interface Props {
  title: string
  icon?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
  onHide?: () => void
  onRefresh?: () => void
  /** Column span (1 = half, 2 = full). */
  width?: number
  onToggleWidth?: () => void
  /** Body height in px (undefined = auto). */
  height?: number
  onResizeHeight?: (h: number | undefined) => void
  /** Right-aligned slot in the header. */
  action?: ReactNode
  children: ReactNode
}

/** The shell every dashboard section renders inside: header (collapse / width /
 *  refresh / hide), a body that can be height-constrained, and a drag handle to
 *  resize that height. The column span is applied to the section's grid-column. */
export function DashboardCard({
  title,
  icon,
  collapsed,
  onToggleCollapse,
  onHide,
  onRefresh,
  width = 2,
  onToggleWidth,
  height,
  onResizeHeight,
  action,
  children,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ y: number; h: number } | null>(null)
  const latest = useRef<number>(0)
  const [dragH, setDragH] = useState<number | null>(null)

  const appliedH = dragH ?? height

  const beginResize = (e: ReactPointerEvent) => {
    e.preventDefault()
    const startH = appliedH ?? bodyRef.current?.offsetHeight ?? 220
    dragStart.current = { y: e.clientY, h: startH }
    latest.current = startH
    setDragH(startH)
    document.body.style.userSelect = 'none'

    const move = (ev: PointerEvent) => {
      if (!dragStart.current) return
      const next = Math.max(120, dragStart.current.h + (ev.clientY - dragStart.current.y))
      latest.current = next
      setDragH(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      dragStart.current = null
      onResizeHeight?.(latest.current)
      setDragH(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const sectionStyle: CSSProperties = { gridColumn: `span ${width}` }
  const bodyStyle: CSSProperties | undefined =
    appliedH != null ? { height: appliedH, overflowY: 'auto' } : undefined

  return (
    <section className={styles.card} style={sectionStyle}>
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
          {onToggleWidth && (
            <button
              type="button"
              className={styles.cardBtn}
              onClick={onToggleWidth}
              title={width === 2 ? 'Make half-width' : 'Make full-width'}
            >
              {width === 2 ? '◧' : '▭'}
            </button>
          )}
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
      {!collapsed && (
        <>
          <div className={styles.cardBody} ref={bodyRef} style={bodyStyle}>
            {children}
          </div>
          {onResizeHeight && (
            <div
              className={styles.resizeHandle}
              onPointerDown={beginResize}
              onDoubleClick={() => onResizeHeight(undefined)}
              title="Drag to resize · double-click to reset"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </section>
  )
}
