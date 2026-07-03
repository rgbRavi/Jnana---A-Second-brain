import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './ContextMenu.module.css'

export interface MenuItem {
  label: string
  onClick?: () => void
  danger?: boolean
  /** Draw a divider above this item. */
  separator?: boolean
  disabled?: boolean
  /** One level of flyout — hovering opens it instead of firing onClick. */
  children?: MenuItem[]
}

interface Props {
  /** Screen (client) coordinates of the right-click. */
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** A small screen-space right-click menu with one level of submenu. Closes on
 *  action, Escape, or an outside press. Flips to stay within the viewport.
 *  Generalized from the canvas's CanvasContextMenu for reuse in the note editor. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null)

  // Keep the menu on-screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - width - 8)
    const top = Math.min(y, window.innerHeight - height - 8)
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    // Pointerdown anywhere outside closes. Capture phase so it runs before
    // whatever the host page's own pointer handlers would do.
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={styles.itemWrap}
          onMouseEnter={() => setOpenSubmenu(item.children ? i : null)}
        >
          <button
            type="button"
            className={`${styles.contextItem} ${item.danger ? styles.contextItemDanger : ''} ${item.separator ? styles.contextSep : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (item.children) return
              item.onClick?.()
              onClose()
            }}
          >
            <span className={styles.itemLabel}>{item.label}</span>
            {item.children && <span className={styles.submenuArrow} aria-hidden="true">▸</span>}
          </button>
          {item.children && openSubmenu === i && (
            <div className={styles.submenu}>
              {item.children.map((sub, j) => (
                <button
                  key={j}
                  type="button"
                  className={`${styles.contextItem} ${sub.danger ? styles.contextItemDanger : ''} ${sub.separator ? styles.contextSep : ''}`}
                  disabled={sub.disabled}
                  onClick={() => { sub.onClick?.(); onClose() }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
