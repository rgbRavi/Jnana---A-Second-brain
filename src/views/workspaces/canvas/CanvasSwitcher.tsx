import { showConfirmDialog, showPromptDialog } from '../../../lib/dialog'
import type { Canvas } from '../../../core/canvas'
import styles from './canvas.module.css'

interface Props {
  canvases: Canvas[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

/** Switch between / create / rename / delete a workspace's named canvases. */
export function CanvasSwitcher({ canvases, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  const active = canvases.find((c) => c.id === activeId) ?? null

  const handleNew = async () => {
    const name = await showPromptDialog({ title: 'New canvas', placeholder: 'e.g. Plan, Moodboard', confirmLabel: 'Create' })
    if (name && name.trim()) onNew(name)
  }
  const handleRename = async () => {
    if (!active) return
    const name = await showPromptDialog({ title: 'Rename canvas', defaultValue: active.title, confirmLabel: 'Rename' })
    if (name && name.trim() && name.trim() !== active.title) onRename(active.id, name)
  }
  const handleDelete = async () => {
    if (!active) return
    const ok = await showConfirmDialog({
      title: `Delete “${active.title}”?`,
      message: 'This canvas and its layout are removed. Your notes stay in the workspace.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) onDelete(active.id)
  }

  return (
    <div className={styles.switcher}>
      <select className={styles.switchSelect} value={activeId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {canvases.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>
      <button className={styles.switchBtn} onClick={handleNew} title="New canvas">＋</button>
      <button className={styles.switchBtn} onClick={handleRename} title="Rename canvas" disabled={!active}>✎</button>
      <button className={styles.switchBtn} onClick={handleDelete} title="Delete canvas" disabled={!active}>🗑</button>
    </div>
  )
}
