import styles from '../Dashboard.module.css'
import { relativeTime } from '../format'

interface Props {
  name: string
  color: string
  noteCount: number
  lastActivity: number
  onClick?: () => void
}

export function ProjectCard({ name, color, noteCount, lastActivity, onClick }: Props) {
  return (
    <button type="button" className={styles.project} onClick={onClick} disabled={!onClick}>
      <span className={styles.projectDot} style={{ background: color }} aria-hidden="true" />
      <span className={styles.projectBody}>
        <span className={styles.projectName}>{name || 'Untitled project'}</span>
        <span className={styles.projectMeta}>
          {noteCount} note{noteCount === 1 ? '' : 's'} · {relativeTime(lastActivity)}
        </span>
      </span>
    </button>
  )
}
