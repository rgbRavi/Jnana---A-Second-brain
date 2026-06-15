import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import styles from '../Dashboard.module.css'
import type { SectionId } from '../types'

interface Props {
  /** Droppable id, e.g. "column-0" (so cards can be dropped into an empty column). */
  id: string
  /** Visible section ids in this column (sortable order). */
  items: SectionId[]
  children: ReactNode
}

/** One independent dashboard column: a droppable wrapping a vertical sortable list. */
export function Column({ id, items, children }: Props) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={styles.column}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  )
}
