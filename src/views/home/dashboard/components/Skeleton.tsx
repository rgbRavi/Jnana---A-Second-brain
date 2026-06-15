import styles from '../Dashboard.module.css'

/** A shimmer placeholder block. `lines` stacks several. */
export function Skeleton({ width = '100%', height = 14, radius = 6 }: { width?: string | number; height?: number; radius?: number }) {
  return <div className={styles.skeleton} style={{ width, height, borderRadius: radius }} />
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.skeletonRows}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={`${90 - i * 12}%`} />
      ))}
    </div>
  )
}
