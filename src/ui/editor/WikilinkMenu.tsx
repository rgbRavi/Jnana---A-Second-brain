import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeTitle, type TitledNote } from '../../core/markdown/wikilinks'
import styles from './SlashMenu.module.css'

/** A row in the `[[` autocomplete: an existing note, or a "create" affordance
 *  for an unresolved title (a pseudo-note that materializes on first click). */
export type WikilinkItem =
  | { kind: 'note'; id: string; title: string }
  | { kind: 'create'; title: string }

/**
 * Build the picker rows for a query: title-matching notes (prefix matches
 * first, then alphabetical, capped), followed by a "Create" row when the query
 * is non-empty and doesn't already name an existing note.
 */
export function buildWikilinkItems(query: string, notes: TitledNote[]): WikilinkItem[] {
  const q = normalizeTitle(query)
  const matches = (q ? notes.filter((n) => normalizeTitle(n.title).includes(q)) : notes).slice()
  matches.sort((a, b) => {
    const ap = normalizeTitle(a.title).startsWith(q) ? 0 : 1
    const bp = normalizeTitle(b.title).startsWith(q) ? 0 : 1
    if (ap !== bp) return ap - bp
    return a.title.localeCompare(b.title)
  })
  const items: WikilinkItem[] = matches
    .slice(0, 50)
    .map((n) => ({ kind: 'note', id: n.id, title: n.title }))
  if (q && !notes.some((n) => normalizeTitle(n.title) === q)) {
    items.push({ kind: 'create', title: query.trim() })
  }
  return items
}

interface Props {
  items: WikilinkItem[]
  activeIndex: number
  coords: { x: number; y: number }
  onPick: (item: WikilinkItem) => void
  onHover: (index: number) => void
  onClose: () => void
}

/**
 * The `[[`-triggered note picker. Controlled + presentational like SlashMenu
 * (LiveEditor owns the query, filtering, and active index), sharing its CSS.
 */
export function WikilinkMenu({ items, activeIndex, coords, onPick, onHover, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pos, setPos] = useState({ left: coords.x, top: coords.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(coords.x, window.innerWidth - width - 8))
    const below = coords.y + 20
    const top = below + height > window.innerHeight - 8 ? Math.max(8, coords.y - height - 6) : below
    setPos({ left, top })
  }, [coords.x, coords.y, items.length])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [onClose])

  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (items.length === 0) return null

  return (
    <div ref={ref} className={styles.menu} style={{ left: pos.left, top: pos.top }} role="listbox">
      {items.map((item, i) => (
        <button
          key={item.kind === 'note' ? item.id : '__create__'}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          ref={(el) => { rowRefs.current[i] = el }}
          className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
          onPointerDown={(e) => { e.preventDefault(); onPick(item) }}
          onMouseEnter={() => onHover(i)}
        >
          <span className={styles.icon} aria-hidden="true">{item.kind === 'note' ? '🔗' : '＋'}</span>
          <span className={styles.label}>
            {item.kind === 'note' ? (item.title || 'Untitled') : <>Create “{item.title}”</>}
          </span>
        </button>
      ))}
    </div>
  )
}
