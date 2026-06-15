// Aggregates every data source the dashboard needs into memoized, derived
// metrics, so each widget stays presentational. Frontend-only: reuses existing
// core fns + the v7 backend additions (recent media, reading progress).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotesContext } from '../../../context/NotesContext'
import { useTranscription } from '../../../context/TranscriptionContext'
import { getAllLinks, getFavouriteNoteIds, listNoteProgress } from '../../../core/notes'
import { recentMedia } from '../../../core/media'
import { listProjects, listProjectKnowledge } from '../../../core/aiWorkspace'
import { getIndexStats, getIndexTimes, staleNotes } from '../../../core/ai'
import { isAutoTag } from '../../../core/tags'
import { getLastOpened } from '../../../hooks/useSaveLastOpened'
import { eventBus } from '../../../lib/eventBus'
import type { AiProject, Note, RecentMedia } from '../../../types'

const PALETTE = [
  '#7c6af7', '#3fb950', '#e3b341', '#3ba7f7', '#f778ba', '#a371f7',
  '#56d4bc', '#ff8c42', '#d29922', '#6cb6ff', '#e5484d', '#8bd450',
]
/** Stable color from an id (for projects without an explicit color). */
export function colorFromId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const HUB_DEGREE = 4
const SNAPSHOT_NODE_CAP = 120
const ACTIVITY_DAYS = 182 // ~26 weeks
const DAY = 86_400_000

export interface ContinueItem {
  note: Note
  lastOpenedAt: number
  linkedCount: number
  readingTimeMin: number
  progress: number
}
export interface ProjectSummary {
  project: AiProject
  noteCount: number
  color: string
}
export interface TaskItem {
  id: string
  label: string
  sublabel?: string
  status: 'running' | 'done' | 'error'
}
export interface ActivityDay {
  ts: number
  created: number
  edited: number
  level: number // 0..4 intensity
}
export interface SnapshotNode {
  id: string
  title: string
  val: number
  color: string
}

export interface DashboardData {
  loading: boolean
  notes: Note[]
  totals: { notes: number; connections: number; projects: number; indexedPct: number }
  orphanCount: number
  untaggedCount: number
  staleCount: number
  suggestedConnections: number
  clusters: { count: number; largest: number }
  continueLearning: ContinueItem[]
  favourites: Note[]
  projects: ProjectSummary[]
  recentImports: RecentMedia[]
  tasks: TaskItem[]
  activity: ActivityDay[]
  streak: number
  graph: { nodes: SnapshotNode[]; links: { source: string; target: string }[] }
  refresh: () => void
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function useDashboardData(): DashboardData {
  const { notes, loading: notesLoading } = useNotesContext()
  const { jobs } = useTranscription()

  const [links, setLinks] = useState<[string, string][]>([])
  const [projects, setProjects] = useState<AiProject[]>([])
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})
  const [indexedCount, setIndexedCount] = useState(0)
  const [staleCount, setStaleCount] = useState(0)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [imports, setImports] = useState<RecentMedia[]>([])
  const [favIds, setFavIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const notesRef = useRef(notes)
  notesRef.current = notes

  const refresh = useCallback(async () => {
    try {
      const [allLinks, projs, stats, times, prog, media, favs] = await Promise.all([
        getAllLinks(),
        listProjects(),
        getIndexStats().catch(() => ({ chunkCount: 0, indexedNoteCount: 0 })),
        getIndexTimes().catch(() => []),
        listNoteProgress().catch(() => []),
        recentMedia(12).catch(() => []),
        getFavouriteNoteIds().catch(() => []),
      ])
      setLinks(allLinks)
      setProjects(projs)
      setIndexedCount(stats.indexedNoteCount)
      setStaleCount(stats.indexedNoteCount > 0 ? staleNotes(notesRef.current, times).length : 0)
      setProgress(Object.fromEntries(prog.map((p) => [p.noteId, p.progress])))
      setImports(media)
      setFavIds(favs)
      // Per-project note counts (projects are few; N small calls).
      const counts: Record<string, number> = {}
      await Promise.all(
        projs.map(async (p) => {
          try {
            const k = await listProjectKnowledge(p.id)
            counts[p.id] = k.filter((i) => i.kind === 'note').length
          } catch {
            counts[p.id] = 0
          }
        }),
      )
      setProjectCounts(counts)
    } catch (e) {
      console.error('[dashboard] data refresh failed:', e)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    let t: number | undefined
    const debounced = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => void refresh(), 400)
    }
    const events = ['note:saved', 'note:deleted', 'link:created', 'link:removed']
    events.forEach((e) => eventBus.on(e, debounced))
    return () => {
      window.clearTimeout(t)
      events.forEach((e) => eventBus.off(e, debounced))
    }
  }, [refresh])

  // ── Derived metrics (memoized over notes + fetched state) ──
  const data = useMemo<Omit<DashboardData, 'refresh'>>(() => {
    const degree = new Map<string, number>()
    for (const [from, to] of links) {
      degree.set(from, (degree.get(from) ?? 0) + 1)
      degree.set(to, (degree.get(to) ?? 0) + 1)
    }

    const orphanCount = notes.filter((n) => !degree.get(n.id)).length
    const untaggedCount = notes.filter((n) => n.tags.filter((t) => !isAutoTag(t)).length === 0).length

    // Connected components (union-find) → cluster count + largest.
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      let r = x
      while (parent.get(r) !== r && parent.get(r) !== undefined) r = parent.get(r)!
      return r
    }
    for (const n of notes) parent.set(n.id, n.id)
    for (const [from, to] of links) {
      if (!parent.has(from) || !parent.has(to)) continue
      const a = find(from)
      const b = find(to)
      if (a !== b) parent.set(a, b)
    }
    const sizes = new Map<string, number>()
    for (const n of notes) {
      const r = find(n.id)
      sizes.set(r, (sizes.get(r) ?? 0) + 1)
    }
    let clusterCount = 0
    let largest = 0
    for (const s of sizes.values()) {
      if (s >= 2) clusterCount++
      if (s > largest) largest = s
    }

    // Suggested connections: unlinked pairs sharing a user tag (bounded).
    const linkedKey = new Set<string>()
    for (const [from, to] of links) {
      linkedKey.add(from < to ? `${from}|${to}` : `${to}|${from}`)
    }
    const tagIndex = new Map<string, string[]>()
    for (const n of notes) {
      for (const t of n.tags) {
        if (isAutoTag(t)) continue
        const arr = tagIndex.get(t) ?? []
        arr.push(n.id)
        tagIndex.set(t, arr)
      }
    }
    const suggestedPairs = new Set<string>()
    for (const ids of tagIndex.values()) {
      if (ids.length < 2 || ids.length > 25) continue // skip generic tags
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i]
          const b = ids[j]
          const key = a < b ? `${a}|${b}` : `${b}|${a}`
          if (!linkedKey.has(key)) suggestedPairs.add(key)
        }
      }
    }

    // Continue learning (from last-opened, with timestamps).
    const byId = new Map(notes.map((n) => [n.id, n]))
    const continueLearning: ContinueItem[] = getLastOpened()
      .map(({ id, at }) => {
        const note = byId.get(id)
        if (!note) return null
        const words = note.content.trim() ? note.content.trim().split(/\s+/).length : 0
        return {
          note,
          lastOpenedAt: at,
          linkedCount: degree.get(id) ?? 0,
          readingTimeMin: Math.max(1, Math.round(words / 200)),
          progress: progress[id] ?? 0,
        }
      })
      .filter((x): x is ContinueItem => x !== null)

    const favourites = favIds.map((id) => byId.get(id)).filter((n): n is Note => !!n)

    // Projects with note counts + color.
    const projectSummaries: ProjectSummary[] = projects.map((p) => ({
      project: p,
      noteCount: projectCounts[p.id] ?? 0,
      color: p.color || colorFromId(p.id),
    }))

    // Activity heatmap buckets (created + last-edited per day).
    const today = startOfDay(Date.now())
    const start = today - (ACTIVITY_DAYS - 1) * DAY
    const created = new Map<number, number>()
    const edited = new Map<number, number>()
    for (const n of notes) {
      const c = startOfDay(n.createdAt)
      if (c >= start) created.set(c, (created.get(c) ?? 0) + 1)
      const u = startOfDay(n.updatedAt)
      if (u >= start && u !== c) edited.set(u, (edited.get(u) ?? 0) + 1)
    }
    const activity: ActivityDay[] = []
    for (let ts = start; ts <= today; ts += DAY) {
      const c = created.get(ts) ?? 0
      const e = edited.get(ts) ?? 0
      const total = c + e
      const level = total === 0 ? 0 : total === 1 ? 1 : total <= 3 ? 2 : total <= 6 ? 3 : 4
      activity.push({ ts, created: c, edited: e, level })
    }
    // Streak: consecutive days ending today with any activity.
    let streak = 0
    for (let i = activity.length - 1; i >= 0; i--) {
      if (activity[i].created + activity[i].edited > 0) streak++
      else break
    }

    // Graph snapshot: cap to the highest-degree nodes + their internal edges.
    const ranked = [...notes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    const picked = ranked.slice(0, SNAPSHOT_NODE_CAP)
    const pickedIds = new Set(picked.map((n) => n.id))
    const snapNodes: SnapshotNode[] = picked.map((n) => {
      const d = degree.get(n.id) ?? 0
      const color = d === 0 ? '#e3b341' : d >= HUB_DEGREE ? '#7c6af7' : '#55535f'
      return { id: n.id, title: n.title || 'Untitled', val: 1 + Math.min(d, 8), color }
    })
    const snapLinks = links
      .filter(([f, t]) => pickedIds.has(f) && pickedIds.has(t))
      .map(([source, target]) => ({ source, target }))

    const tasks: TaskItem[] = jobs.map((j) => ({
      id: j.id,
      label: j.status === 'running' ? 'Transcribing' : j.status === 'done' ? 'Transcribed' : 'Transcription failed',
      sublabel: j.noteTitle || j.filename,
      status: j.status,
    }))

    return {
      loading: notesLoading || !loaded,
      notes,
      totals: {
        notes: notes.length,
        connections: links.length,
        projects: projects.length,
        indexedPct: notes.length > 0 ? Math.round((indexedCount / notes.length) * 100) : 0,
      },
      orphanCount,
      untaggedCount,
      staleCount,
      suggestedConnections: suggestedPairs.size,
      clusters: { count: clusterCount, largest },
      continueLearning,
      favourites,
      projects: projectSummaries,
      recentImports: imports,
      tasks,
      activity,
      streak,
      graph: { nodes: snapNodes, links: snapLinks },
    }
  }, [notes, links, projects, projectCounts, indexedCount, staleCount, progress, imports, favIds, jobs, notesLoading, loaded])

  return { ...data, refresh: () => void refresh() }
}
