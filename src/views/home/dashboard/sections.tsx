// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Bot, File, FileText, FileUp, Film, Image, Link2, Mic, Music, Paperclip, Search, SearchX, SquarePen, Star, Tag, Unlink } from 'lucide-react'
import styles from './Dashboard.module.css'
import { preview, relativeTime } from './format'
import { useWheelHorizontal } from './useWheelHorizontal'
import type { Note } from '../../../types'
import type { DashboardData } from './useDashboardData'
import { QuickActionButton } from './components/QuickActionButton'
import { toast } from '../../../lib/toast'
import { openCommandPalette, PALETTE_SHORTCUT } from '../../../ui/CommandPalette'
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
  /** Open the Notes view filtered down to notes carrying no tags at all. */
  showUntagged: () => void
  /** Embed the notes that need indexing, reporting progress in a toast. */
  indexStale: () => void
  /** Open the graph with unlinked notes lit up. */
  showOrphans: () => void
  /** Open the graph with suggested links drawn between unlinked pairs. */
  showSuggestedLinks: () => void
  newNote: () => void
  recordAudio: () => void
  importFile: () => void
}

export interface SectionProps {
  data: DashboardData
  actions: DashboardActions
}

// ── Hero (always-on): resume row ────────────────────────
export function HeroSection({ data, actions }: SectionProps) {
  if (data.loading) return <Skeleton height={72} radius={10} />
  const item = data.continueLearning[0]
  // No reading history yet: fall back to the most recently touched note.
  const latest = item ? undefined : data.notes.reduce<Note | undefined>((a, n) => (!a || n.updatedAt > a.updatedAt ? n : a), undefined)
  const note = item?.note ?? latest
  if (!note)
    return (
      <div className={styles.resume}>
        <p className={`${styles.resumeBody} ${styles.resumeEmpty}`}>No notes yet. Start one from the composer below.</p>
        <button type="button" className={styles.resumeBtn} onClick={actions.newNote}>
          New note
        </button>
      </div>
    )
  const pct = item ? Math.round(item.progress * 100) : 0
  return (
    <div className={styles.resume}>
      <div className={styles.resumeBody}>
        <span className={styles.resumeKicker}>{item ? 'Pick up where you left off' : 'Latest note'}</span>
        <span className={styles.resumeTitle}>{note.title || 'Untitled'}</span>
        {item ? (
          <>
            <span className={styles.resumeMeta}>
              {relativeTime(item.lastOpenedAt)} · {item.readingTimeMin} min read
            </span>
            <span className={styles.resumeProgress}>
              <span className={styles.progressBar}>
                <span className={styles.progressFill} style={{ transform: `scaleX(${pct / 100})` }} />
              </span>
              {pct}% read
            </span>
          </>
        ) : (
          <span className={styles.resumeMeta}>{relativeTime(note.updatedAt)}</span>
        )}
      </div>
      <button type="button" className={styles.resumeBtn} onClick={() => actions.openNote(note)}>
        {item ? 'Resume' : 'Open'}
      </button>
    </div>
  )
}

// ── Quick Actions ───────────────────────────────────────
export function QuickActionsSection({ actions }: SectionProps) {
  return (
    <div className={styles.quickGrid}>
      <QuickActionButton icon={<SquarePen size={22} />} label="New note" onClick={actions.newNote} />
      <QuickActionButton icon={<Mic size={22} />} label="Record audio" onClick={actions.recordAudio} />
      <QuickActionButton icon={<FileUp size={22} />} label="Import file" onClick={actions.importFile} />
      <QuickActionButton icon={<Search size={22} />} label="Search" title={`Search (${PALETTE_SHORTCUT})`} onClick={openCommandPalette} />
      <QuickActionButton icon={<Bot size={22} />} label="AI chat" onClick={() => actions.goto('/ai')} />
    </div>
  )
}

// ── Daily Summary ───────────────────────────────────────
export function DailySummarySection({ data }: SectionProps) {
  const createdToday = data.activity[data.activity.length - 1]?.created ?? 0
  const parts: string[] = []
  if (createdToday > 0) parts.push(`You've created ${createdToday} note${createdToday === 1 ? '' : 's'} today.`)
  if (data.streak > 1) parts.push(`You've written on ${data.streak} days in a row.`)
  return <p className={styles.summary}>{parts.length ? parts.join(' ') : "You haven't written anything today yet."}</p>
}

// ── Continue Learning ───────────────────────────────────
export function ContinueLearningSection({ data, actions }: SectionProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  useWheelHorizontal(rowRef)
  if (data.loading) return <SkeletonRows rows={2} />
  // The hero already shows the most recent one; this card is the rest.
  const rest = data.continueLearning.slice(1)
  if (rest.length === 0)
    return <p className={styles.empty}>Nothing else in progress. Notes you start reading show up here.</p>
  return (
    <div className={styles.scrollRow} ref={rowRef}>
      {rest.map((item) => {
        const pct = Math.round(item.progress * 100)
        return (
          <button key={item.note.id} type="button" className={styles.learnCard} onClick={() => actions.openNote(item.note)}>
            <span className={styles.learnTitle}>{item.note.title || 'Untitled'}</span>
            <span className={styles.learnMeta}>
              {relativeTime(item.lastOpenedAt)} · {item.linkedCount} link{item.linkedCount === 1 ? '' : 's'} ·{' '}
              {item.readingTimeMin} min read
            </span>
            <span className={styles.progressBar}>
              <span className={styles.progressFill} style={{ transform: `scaleX(${pct / 100})` }} />
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
    return <p className={styles.empty}>Star a note in the editor to pin it here.</p>
  return (
    <div className={styles.favGrid}>
      {data.favourites.map((n) => (
        <button key={n.id} type="button" className={styles.favCard} onClick={() => actions.openNote(n)}>
          <span className={styles.favStar} aria-hidden="true">
            <Star size={16} fill="currentColor" />
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

// ── Tidy up ─────────────────────────────────────────────
export function InsightsSection({ data, actions }: SectionProps) {
  const rows: { count: number; label: string; icon: ReactNode; onClick: () => void }[] = [
    { count: data.orphanCount, label: 'Notes with no links', icon: <Unlink size={15} />, onClick: actions.showOrphans },
    { count: data.staleCount, label: 'Not searchable by AI yet', icon: <SearchX size={15} />, onClick: actions.indexStale },
    { count: data.suggestedConnections, label: 'Possible connections', icon: <Link2 size={15} />, onClick: actions.showSuggestedLinks },
    { count: data.untaggedCount, label: 'Notes without tags', icon: <Tag size={15} />, onClick: actions.showUntagged },
  ].filter((r) => r.count > 0)
  if (rows.length === 0) return <p className={styles.empty}>Nothing to tidy up.</p>
  return (
    <div className={styles.insightList}>
      {rows.map((r) => (
        <InsightCard key={r.label} {...r} />
      ))}
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
const TYPE_ICON: Record<string, ReactNode> = {
  image: <Image size={16} />,
  video: <Film size={16} />,
  audio: <Music size={16} />,
  pdf: <FileText size={16} />,
  document: <File size={16} />,
}
export function RecentImportsSection({ data, actions }: SectionProps) {
  if (data.loading) return <SkeletonRows rows={3} />
  if (data.recentImports.length === 0) return <p className={styles.empty}>No imports yet. Add a PDF, image or recording from the composer and it shows up here.</p>
  return (
    <div className={styles.importList}>
      {data.recentImports.map((m) => (
        <button
          key={m.filename}
          type="button"
          className={styles.importItem}
          onClick={() => {
            const n = data.notes.find((x) => x.id === m.noteId)
            if (n) actions.openNote(n)
            else toast.info("That note isn't in this vault anymore.")
          }}
        >
          <span className={styles.importIcon} aria-hidden="true">
            {TYPE_ICON[m.mediaType] ?? <Paperclip size={16} />}
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
