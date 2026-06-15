import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Note } from '../../../types'
import { useNotesContext } from '../../../context/NotesContext'
import { setViewState } from '../../../hooks/useViewState'
import { eventBus } from '../../../lib/eventBus'
import { NoteModal } from '../../../ui/NoteModal'
import styles from './Dashboard.module.css'
import { useDashboardData } from './useDashboardData'
import { useDashboardPrefs } from './useDashboardPrefs'
import { SECTIONS } from './registry'
import { SortableSection } from './components/SortableSection'
import { HeroSection, type DashboardActions } from './sections'
import { CustomizePanel } from './CustomizePanel'
import { LayoutSwitcher } from './LayoutSwitcher'
import type { SectionId } from './types'

/** The Home dashboard: a hero stat row + config-driven widget sections, each
 *  collapsible/hideable, rendered from the user's saved preferences. */
export function Dashboard() {
  const data = useDashboardData()
  const prefs = useDashboardPrefs()
  const navigate = useNavigate()
  const { update, updateTags } = useNotesContext()
  const [openNote, setOpenNote] = useState<Note | null>(null)
  const [customizing, setCustomizing] = useState(false)

  const actions: DashboardActions = useMemo(
    () => ({
      openNote: (n) => {
        eventBus.emit('note:opened', n)
        setOpenNote(n)
      },
      goto: (path) => navigate(path),
      newNote: () => setViewState('notes.composer.state', 'expanded'),
      recordAudio: () => {
        setViewState('notes.composer.state', 'expanded')
        eventBus.emit('composer:record', null)
      },
      importFile: () => {
        setViewState('notes.composer.state', 'expanded')
        eventBus.emit('composer:import', null)
      },
    }),
    [navigate],
  )

  // Visible sections in order; background-tasks auto-hides when nothing's running.
  const visible = prefs.active.order.filter(
    (id) => !prefs.isHidden(id) && !(id === 'backgroundTasks' && data.tasks.length === 0),
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const order = prefs.active.order
    const from = order.indexOf(active.id as SectionId)
    const to = order.indexOf(over.id as SectionId)
    if (from < 0 || to < 0) return
    prefs.setOrder(arrayMove(order, from, to))
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.dashboardHeader}>
        <div>
          <h1 className={styles.dashTitle}>Welcome back to Jnana</h1>
          <p className={styles.dashSubtitle}>Your knowledge command center</p>
        </div>
        <div className={styles.dashboardActions}>
          <LayoutSwitcher />
          <button type="button" className={styles.customizeBtn} onClick={() => setCustomizing(true)}>
            <span aria-hidden="true">⚙</span> Customize
          </button>
        </div>
      </header>

      <HeroSection data={data} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <div className={styles.sections}>
            {visible.map((id) => {
              const def = SECTIONS[id]
              const Component = def.Component
              const size = prefs.getSize(id)
              return (
                <SortableSection
                  key={id}
                  id={id}
                  title={def.title}
                  icon={def.icon}
                  collapsed={prefs.isCollapsed(id)}
                  onToggleCollapse={() => prefs.toggleCollapsed(id)}
                  onHide={() => prefs.toggleHidden(id)}
                  onRefresh={def.refreshable ? data.refresh : undefined}
                  width={size.w ?? 2}
                  onToggleWidth={() => prefs.toggleWidth(id)}
                  height={size.h}
                  onResizeHeight={(h) => prefs.setHeight(id, h)}
                >
                  <Component data={data} actions={actions} />
                </SortableSection>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {customizing && <CustomizePanel onClose={() => setCustomizing(false)} />}

      {openNote && (
        <NoteModal
          note={openNote}
          isOpen
          onClose={() => {
            setOpenNote(null)
            // Reading progress is written on close — refresh so Continue Learning updates.
            data.refresh()
          }}
          onUpdate={update}
          onUpdateTags={updateTags}
        />
      )}
    </div>
  )
}
