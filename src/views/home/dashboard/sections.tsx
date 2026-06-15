import { useRef } from 'react'
import styles from './Dashboard.module.css'
import { preview, relativeTime } from './format'
import { useWheelHorizontal } from './useWheelHorizontal'
import type { Note } from '../../../types'
import type { DashboardData } from './useDashboardData'
import { StatCard } from './components/StatCard'
import { QuickActionButton } from './components/QuickActionButton'
import { InsightCard } from './components/InsightCard'
import { ProjectCard } from './components/ProjectCard'
import { TaskCard } from './components/TaskCard'
import { GraphPreviewCard } from './components/GraphPreviewCard'
import { ActivityHeatmap } from './components/ActivityHeatmap'
import { Skeleton, SkeletonRows } from './components/Skeleton'

/** Imperative actions a widget can trigger (provided by the Dashboard). */
export interface DashboardActions {
  openNote: (note: Note) => void
  goto: (path: string) => void
  newNote: () => void
  recordAudio: () => void
  importFile: () => void
}

export interface SectionProps {
  data: DashboardData
  actions: DashboardActions
}

// ── Hero (always-on) ────────────────────────────────────
export function HeroSection({ data }: { data: DashboardData }) {
  const t = data.totals
  return (
    <div className={styles.statGrid}>
      <StatCard icon="📝" label="Notes" value={t.notes} accent="#7c6af7" />
      <StatCard icon="🔗" label="Connections" value={t.connections} accent="#3ba7f7" />
      <StatCard icon="📂" label="Projects" value={t.projects} accent="#3fb950" />
      <StatCard icon="🧠" label="Indexed" value={`${t.indexedPct}%`} sub={`${data.notes.length} notes`} accent="#e3b341" />
    </div>
  )
}

// ── Quick Actions ───────────────────────────────────────
export function QuickActionsSection({ actions }: SectionProps) {
  return (
    <div className={styles.quickGrid}>
      <QuickActionButton icon="✏️" label="New Note" onClick={actions.newNote} />
      <QuickActionButton icon="🎤" label="Record Audio" onClick={actions.recordAudio} />
      <QuickActionButton icon="📄" label="Import File" onClick={actions.importFile} />
      <QuickActionButton icon="🔍" label="Search Vault" onClick={() => actions.goto('/search')} />
      <QuickActionButton icon="🤖" label="AI Chat" onClick={() => actions.goto('/ai')} />
    </div>
  )
}

// ── Daily Summary ───────────────────────────────────────
export function DailySummarySection({ data }: SectionProps) {
  const today = data.activity[data.activity.length - 1]
  const createdToday = today?.created ?? 0
  const tidy = data.orphanCount === 0 && data.untaggedCount === 0
  return (
    <p className={styles.summary}>
      You have <b>{data.totals.notes}</b> notes connected by <b>{data.totals.connections}</b> links.
      {createdToday > 0 && (
        <>
          {' '}You created <b>{createdToday}</b> today.
        </>
      )}
      {data.streak > 1 && (
        <>
          {' '}You're on a <b>{data.streak}-day</b> streak. 🔥
        </>
      )}{' '}
      {tidy ? (
        <>Your vault is tidy. ✨</>
      ) : (
        <>
          <b>{data.orphanCount}</b> orphan{data.orphanCount === 1 ? '' : 's'} and <b>{data.untaggedCount}</b> untagged
          note{data.untaggedCount === 1 ? '' : 's'} could use attention.
        </>
      )}
    </p>
  )
}

// ── Continue Learning ───────────────────────────────────
export function ContinueLearningSection({ data, actions }: SectionProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  useWheelHorizontal(rowRef)
  if (data.loading) return <SkeletonRows rows={2} />
  if (data.continueLearning.length === 0)
    return <p className={styles.empty}>Open a note to start a learning session — it'll show up here.</p>
  return (
    <div className={styles.scrollRow} ref={rowRef}>
      {data.continueLearning.map((item) => {
        const pct = Math.round(item.progress * 100)
        return (
          <button key={item.note.id} type="button" className={styles.learnCard} onClick={() => actions.openNote(item.note)}>
            <span className={styles.learnTitle}>{item.note.title || 'Untitled'}</span>
            <span className={styles.learnMeta}>
              {relativeTime(item.lastOpenedAt)} · {item.linkedCount} link{item.linkedCount === 1 ? '' : 's'} ·{' '}
              {item.readingTimeMin} min read
            </span>
            <span className={styles.progressBar}>
              <span className={styles.progressFill} style={{ width: `${pct}%` }} />
            </span>
            <span className={styles.learnProgress}>{pct}% read</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Favourites ──────────────────────────────────────────
export function FavouritesSection({ data, actions }: SectionProps) {
  if (data.loading) return <SkeletonRows rows={2} />
  if (data.favourites.length === 0)
    return <p className={styles.empty}>Star a note (☆ in the editor) to pin it here.</p>
  return (
    <div className={styles.favGrid}>
      {data.favourites.map((n) => (
        <button key={n.id} type="button" className={styles.favCard} onClick={() => actions.openNote(n)}>
          <span className={styles.favStar} aria-hidden="true">
            ★
          </span>
          <span className={styles.favBody}>
            <span className={styles.favTitle}>{n.title || 'Untitled'}</span>
            <span className={styles.favPreview}>{preview(n.content, 64) || 'No content'}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Knowledge Insights ──────────────────────────────────
export function InsightsSection({ data, actions }: SectionProps) {
  return (
    <div className={styles.insightGrid}>
      <InsightCard count={data.orphanCount} label="Orphan notes" tone="warn" icon="🌱" onClick={() => actions.goto('/graph')} />
      <InsightCard count={data.staleCount} label="Need indexing" tone="accent" icon="🧠" onClick={() => actions.goto('/settings')} />
      <InsightCard count={data.suggestedConnections} label="Suggested links" tone="good" icon="🔗" onClick={() => actions.goto('/graph')} />
      <InsightCard count={data.untaggedCount} label="Untagged notes" tone="neutral" icon="🏷" onClick={() => actions.goto('/search')} />
    </div>
  )
}

// ── Knowledge Graph snapshot ────────────────────────────
export function GraphSnapshotSection({ data, actions }: SectionProps) {
  if (data.loading) return <Skeleton height={190} radius={10} />
  return (
    <GraphPreviewCard
      nodes={data.graph.nodes}
      links={data.graph.links}
      stats={{ nodes: data.totals.notes, links: data.totals.connections, largest: data.clusters.largest, orphans: data.orphanCount }}
      onOpen={() => actions.goto('/graph')}
    />
  )
}

// ── Projects ────────────────────────────────────────────
export function ProjectsSection({ data, actions }: SectionProps) {
  if (data.loading) return <SkeletonRows rows={2} />
  if (data.projects.length === 0)
    return <p className={styles.empty}>No projects yet — create one in the AI view to group your work.</p>
  return (
    <div className={styles.projectGrid}>
      {data.projects.map((p) => (
        <ProjectCard
          key={p.project.id}
          name={p.project.name}
          color={p.color}
          noteCount={p.noteCount}
          lastActivity={p.project.updatedAt}
          onClick={() => actions.goto('/ai')}
        />
      ))}
    </div>
  )
}

// ── Recent Imports ──────────────────────────────────────
const TYPE_ICON: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  pdf: '📕',
  document: '📄',
}
export function RecentImportsSection({ data, actions }: SectionProps) {
  if (data.loading) return <SkeletonRows rows={3} />
  if (data.recentImports.length === 0) return <p className={styles.empty}>No imported files yet.</p>
  const byId = new Map(data.notes.map((n) => [n.id, n]))
  return (
    <div className={styles.importList}>
      {data.recentImports.map((m) => (
        <button
          key={m.filename}
          type="button"
          className={styles.importItem}
          onClick={() => {
            const n = byId.get(m.noteId)
            if (n) actions.openNote(n)
          }}
        >
          <span className={styles.importIcon} aria-hidden="true">
            {TYPE_ICON[m.mediaType] ?? '📎'}
          </span>
          <span className={styles.importMeta}>
            <span className={styles.importTitle}>{m.noteTitle || 'Untitled'}</span>
            <span className={styles.importSub}>
              {m.mediaType} · {relativeTime(m.createdAt)}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Background Tasks ────────────────────────────────────
export function BackgroundTasksSection({ data }: SectionProps) {
  if (data.tasks.length === 0) return <p className={styles.empty}>No background tasks running.</p>
  return (
    <div className={styles.taskList}>
      {data.tasks.map((t) => (
        <TaskCard key={t.id} label={t.label} sublabel={t.sublabel} status={t.status} />
      ))}
    </div>
  )
}

// ── Activity heatmap ────────────────────────────────────
export function ActivityHeatmapSection({ data }: SectionProps) {
  if (data.loading) return <Skeleton height={120} radius={10} />
  return <ActivityHeatmap days={data.activity} />
}
