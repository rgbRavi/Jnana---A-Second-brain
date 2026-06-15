import styles from '../Dashboard.module.css'
import { dayLabel } from '../format'
import type { ActivityDay } from '../useDashboardData'

/** GitHub-style activity heatmap. `days` is chronological (oldest → today). */
export function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  if (days.length === 0) return null

  // Pad the front so column 1 begins on the right weekday row (col-major, 7 rows).
  const firstWeekday = new Date(days[0].ts).getDay() // 0 = Sun
  const pad = Array.from({ length: firstWeekday }, () => null)
  const cells: (ActivityDay | null)[] = [...pad, ...days]

  return (
    <div className={styles.heatmap}>
      <div className={styles.heatGrid}>
        {cells.map((d, i) =>
          d ? (
            <span
              key={d.ts}
              className={`${styles.heatCell} ${styles[`heatL${d.level}`]}`}
              title={`${d.created + d.edited} change${d.created + d.edited === 1 ? '' : 's'} on ${dayLabel(d.ts)} · ${d.created} created, ${d.edited} edited`}
            />
          ) : (
            <span key={`pad-${i}`} className={styles.heatPad} />
          ),
        )}
      </div>
      <div className={styles.heatLegend}>
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`${styles.heatCell} ${styles[`heatL${l}`]}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
