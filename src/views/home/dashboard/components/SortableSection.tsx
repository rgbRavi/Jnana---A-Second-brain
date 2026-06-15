import type { CSSProperties, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import styles from '../Dashboard.module.css'
import { DashboardCard } from './DashboardCard'
import type { SectionId } from '../types'

interface Props {
  id: SectionId
  title: string
  icon?: string
  width: number
  height?: number
  collapsed: boolean
  onToggleCollapse: () => void
  onHide: () => void
  onRefresh?: () => void
  onToggleWidth: () => void
  onResizeHeight: (h: number | undefined) => void
  children: ReactNode
}

/** A DashboardCard wrapped as a drag-sortable item (drag by its grip handle). */
export function SortableSection(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 5 : undefined,
  }

  const handle = (
    <button
      type="button"
      className={styles.dragHandle}
      {...attributes}
      {...listeners}
      title="Drag to reorder"
      aria-label="Drag to reorder"
    >
      ⠿
    </button>
  )

  return (
    <DashboardCard
      title={props.title}
      icon={props.icon}
      collapsed={props.collapsed}
      onToggleCollapse={props.onToggleCollapse}
      onHide={props.onHide}
      onRefresh={props.onRefresh}
      width={props.width}
      onToggleWidth={props.onToggleWidth}
      height={props.height}
      onResizeHeight={props.onResizeHeight}
      dragHandle={handle}
      nodeRef={setNodeRef}
      style={style}
    >
      {props.children}
    </DashboardCard>
  )
}
