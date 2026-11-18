// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/graph/GraphView.tsx
import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Link2, List, Network, Route, Scan, SlidersHorizontal, X } from 'lucide-react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { useGraph } from '../../hooks/useGraph'
import { usePersistentViewState, useViewState } from '../../hooks/useViewState'
import { nodesWithinHops } from './neighbourhood'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { GraphListView } from './GraphListView'
import { shortestPath } from './graphPath'
import { GraphSettingsPanel, nextGroupColor, type DatePreset, type SectionKey } from './GraphSettingsPanel'
import { compileGroup, describeGroup, migrateGroups, newGroup, type GraphGroup } from './groupMatch'
import { useGraphForces, setGraphForces, DEFAULT_GRAPH_FORCES } from '../../hooks/useGraphForces'
import { NoteItem } from '../editor/NoteItem'
import { isAutoTag } from '../../core/tags'
import { extractWikilinkTitles, normalizeTitle, pseudoNodeId } from '../../core/markdown/wikilinks'
import { noteLinkText } from '../../lib/noteTypes'
import { showChoiceDialog, showConfirmDialog } from '../../lib/dialog'
import { setGraphSpotlight, useGraphSpotlight } from '../../lib/graphSpotlight'
import { useSuggestedPairs } from '../../lib/suggestedLinks'
import { nearestPair, type SuggestedPair } from '../../core/graph/suggestedLinks'
import { useDashboardPrefs } from '../../views/home/dashboard/useDashboardPrefs'
import { toast } from '../../lib/toast'
import { log } from '../../lib/logger'
import { eventBus } from '../../lib/eventBus'
import { resolveColor } from '../../lib/themeColor'
import { DEFAULT_VAULT_ID, type Note } from '../../types'
import styles from './GraphView.module.css'

/** Escape user text before it's interpolated into the tooltip's raw HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Remove every `[[Title]]` reference to `title` from `content` (case-insensitive),
 *  then tidy the blank lines a disconnect tends to leave behind. This is how a
 *  disconnect is made durable: edges are derived from content, so a raw link-row
 *  delete would be re-added on the source's next save. */
function stripWikilink(content: string, title: string): string {
  const esc = title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!esc) return content
  const re = new RegExp(`\\[\\[\\s*${esc}\\s*\\]\\]`, 'gi')
  return content.replace(re, '').replace(/\n{3,}/g, '\n\n').trim()
}

// Structural / label colors — re-themed live off design tokens on the same
// `theme:changed` beat as the accent bindings below (readGraphColors reads them
// from :root). Seeded with the dark-theme values so the first paint (before any
// theme resolves) matches.
let DEFAULT_NODE_COLOR = '#8b8794' // --text-2 (>=3:1 on --bg; --text-3 was ~2.5:1)
let ORPHAN_COLOR = '#e3b341' // --warning
let CONNECT_COLOR = '#3fb950' // --success
// Faded outline for a pseudo-node (an unresolved `[[wikilink]]` target).
let PSEUDO_COLOR = '#8b8794' // --text-2
let PSEUDO_FILL = 'rgba(139, 135, 148, 0.25)' // translucent --text-2
let LABEL_COLOR = '#f0eff5' // --text-1
let LABEL_DIM_COLOR = '#9896a4' // --text-2

// Accent-derived node colors — re-themed live. `nodeCanvasObject` below reads
// these on every canvas paint (it's called continuously by react-force-graph,
// not gated on a React re-render), so updating the bindings on `theme:changed`
// is enough — same "no React re-render for the repaint" approach Theme Studio
// uses for the rest of the app. Module-scoped (not per-instance) since several
// GraphView instances (main + per-workspace) can be mounted at once.
let HUB_COLOR = '#7c6af7'
let FOCUS_COLOR = '#7c6af7'
// Translucent accent for link strokes. Canvas 2D can't resolve `var(--accent)`,
// so we derive a concrete rgba() from the resolved accent (via the browser's own
// parser) and re-derive it on `theme:changed`, same as HUB/FOCUS above.
let LINK_COLOR = 'rgba(124, 106, 247, 0.4)'
// Dashed "you could link these" strokes for the suggested-links spotlight.
let SUGGEST_COLOR = 'rgba(63, 185, 80, 0.55)' // --success, translucent
// Links touching the hovered/selected node vs. everything else while dimming.
let LINK_STRONG_COLOR = 'rgba(124, 106, 247, 0.9)'
let LINK_FADED_COLOR = 'rgba(124, 106, 247, 0.07)'
// Canvas can't resolve var(); the resolved --font-body stack goes here.
let graphFont = 'sans-serif'

function readGraphColors(): void {
  const cs = getComputedStyle(document.documentElement)
  const g = (k: string) => cs.getPropertyValue(k).trim()
  const accent = g('--accent')
  if (accent) {
    HUB_COLOR = accent
    FOCUS_COLOR = accent
    LINK_COLOR = resolveColor(accent, 0.4) ?? accent
    LINK_STRONG_COLOR = resolveColor(accent, 0.9) ?? accent
    LINK_FADED_COLOR = resolveColor(accent, 0.07) ?? LINK_COLOR
  }
  graphFont = g('--font-body') || 'sans-serif'
  DEFAULT_NODE_COLOR = g('--text-2') || DEFAULT_NODE_COLOR
  ORPHAN_COLOR = g('--warning') || ORPHAN_COLOR
  CONNECT_COLOR = g('--success') || CONNECT_COLOR
  SUGGEST_COLOR = resolveColor(CONNECT_COLOR, 0.55) ?? SUGGEST_COLOR
  PSEUDO_COLOR = g('--text-2') || PSEUDO_COLOR
  PSEUDO_FILL = resolveColor(PSEUDO_COLOR, 0.25) ?? PSEUDO_FILL
  LABEL_COLOR = g('--text-1') || LABEL_COLOR
  LABEL_DIM_COLOR = g('--text-2') || LABEL_DIM_COLOR
}
readGraphColors()
eventBus.on('theme:changed', readGraphColors)

// A note linked to this many or more notes (in + out) counts as a hub.
const HUB_DEGREE = 4

// How near (in graph units) a click has to land to count as hitting a suggested
// link's line, and how far the orphan halo reaches past the node's own radius.
const SUGGEST_HIT_RADIUS = 6
const ORPHAN_HALO_SCALE = 4

// The halo breathes, and the canvas can't inherit the CSS reduced-motion rule —
// so track the query here. Read once (plus on change) rather than per frame,
// since the paint callbacks run continuously.
const motionQuery =
  typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
let reducedMotion = !!motionQuery?.matches
motionQuery?.addEventListener?.('change', (e) => {
  reducedMotion = e.matches
})

// Force defaults live in useGraphForces (persisted to localStorage).
// Display defaults.
const DEFAULT_DISPLAY = { textFade: 0.4, nodeSize: 1, linkThickness: 1.5 }

// Session-scoped (survive view switches, reset on reload), keyed per graph
// instance so the main graph and each workspace's local graph keep their own
// layout + viewport. react-force-graph stores each node's settled position by
// mutating its object; keeping that cache at module scope — instead of a per-mount
// useRef — means the layout is preserved when you leave the graph and come back,
// so it no longer recompacts from scratch.
type Viewport = { k: number; x: number; y: number }
const nodeCaches = new Map<string, Map<string, any>>()
const savedViewports = new Map<string, Viewport>()
function nodeCacheFor(key: string): Map<string, any> {
  let m = nodeCaches.get(key)
  if (!m) {
    m = new Map()
    nodeCaches.set(key, m)
  }
  return m
}

// Separate position cache for derived pseudo-nodes, so they hold their layout
// across recomputes (the real-node cache is pruned to existing note ids, which
// would otherwise evict them every pass).
const pseudoCaches = new Map<string, Map<string, any>>()
function pseudoCacheFor(key: string): Map<string, any> {
  let m = pseudoCaches.get(key)
  if (!m) {
    m = new Map()
    pseudoCaches.set(key, m)
  }
  return m
}

// Obsidian-style quick presets (see the in-panel descriptions).
const FORCE_PRESETS = {
  clusters: { center: 0.15, repel: 400, link: 0.5, distance: 150 }, // separate clusters clearly
  compact: { center: 0.9, repel: 40, link: 0.9, distance: 30 }, // pull everything into a tight ball
}

/**
 * A custom d3 force that pulls every node toward the origin (0,0). This is what
 * makes "center force" actually compact the graph (higher = tighter & more
 * circular) — d3's built-in forceCenter only *recenters* (a translation) and
 * doesn't change spacing. The built-in center force is left in place to keep the
 * graph on-screen; this adds the adjustable inward pull on top of it.
 */
// Slider 0..1 maps to an effective pull of 0..0.25 per tick, so the default (0.4)
// lands on d3's standard centering strength (0.1) and notes drift in gently.
const CENTER_SCALE = 0.25
function makeRadialForce(initial: number) {
  let nodes: any[] = []
  let strength = initial
  const force = (alpha: number) => {
    const k = strength * CENTER_SCALE * alpha
    if (!k) return
    for (const n of nodes) {
      n.vx -= (n.x || 0) * k
      n.vy -= (n.y || 0) * k
    }
  }
  force.initialize = (n: any[]) => {
    nodes = n
  }
  force.strength = (v?: number) => {
    if (v === undefined) return strength
    strength = v
    return force
  }
  return force
}

// Gentle perpetual-motion force (Advanced → Keep nodes moving). Each node bobs on
// its own slow sine, with a random phase so they don't move in lockstep. The input
// is a smooth periodic velocity, so displacement stays a bounded, smooth float
// around the settled position (no random walk, no jitter). Pinned nodes (fx/fy)
// ignore velocity, so they stay put. Off under prefers-reduced-motion.
const FLOAT_STRENGTH = 0.04 // ~4 graph px of drift with the default velocity decay
const FLOAT_PERIOD = 240 // ticks per cycle (~4 s at 60 fps)
/** Label with a background-coloured halo so it stays legible over links and nodes. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, bg: string) {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3 / scale
  ctx.strokeStyle = bg
  ctx.strokeText(text, x, y)
  ctx.restore()
  ctx.fillText(text, x, y)
}

function makeFloatForce(strength: number) {
  let nodes: any[] = []
  let t = 0
  const w = (2 * Math.PI) / FLOAT_PERIOD
  const force = () => {
    if (reducedMotion) return
    t += 1
    for (const n of nodes) {
      if (n.__floatPhase === undefined) n.__floatPhase = Math.random() * 2 * Math.PI
      const p = n.__floatPhase
      n.vx = (n.vx || 0) + Math.cos(t * w + p) * strength
      n.vy = (n.vy || 0) + Math.sin(t * w * 0.8 + p * 1.7) * strength
    }
  }
  force.initialize = (n: any[]) => {
    nodes = n
  }
  return force
}

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
}

interface Props {
  // Received from App.tsx which owns the single useNotes instance.
  // GraphView never calls useNotes() directly — that would create a second
  // desynchronised state array alongside App's.
  onUpdate: (id: string, title: string, content: string, tags?: string[]) => Promise<Note | undefined>
  onRemove: (id: string) => Promise<boolean>
  /** Create a note (used to materialize a pseudo-node's `[[title]]` on click). */
  onCreate: (title: string, content: string) => Promise<Note>
  /** When set, restrict the graph to these note ids (and the links among them) —
   *  used for a workspace's local graph and the vault-scoped main graph. */
  scopeIds?: Set<string>
  /** Noun for the empty-state copy when `scopeIds` is set ('workspace' | 'vault').
   *  Defaults to 'workspace'. */
  scopeNoun?: string
  /** Distinguishes this graph's session caches (layout + viewport) from others.
   *  Defaults to 'main'; a workspace graph passes e.g. `ws:<id>`. */
  instanceKey?: string
}

/** Compact search box that focuses a matching node (replaces the old big card). */
function JumpToNote({
  nodes,
  onJump,
  idPrefix = 'graph-jump',
  placeholder = 'Jump to a note…',
  label = 'Jump to a note',
  autoFocus = false,
}: {
  nodes: { id: string; title: string; content: string }[]
  onJump: (id: string) => void
  /** Distinct per instance so two pickers never share listbox ids. */
  idPrefix?: string
  placeholder?: string
  label?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return nodes
      .filter((n) => (n.title || '').toLowerCase().includes(s) || (n.content || '').toLowerCase().includes(s))
      .slice(0, 8)
  }, [q, nodes])
  const expanded = open && matches.length > 0
  const optId = (i: number) => `${idPrefix}-opt-${i}`

  const pick = (id: string) => {
    onJump(id)
    setQ('')
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
      return
    }
    if (matches.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + matches.length) % matches.length)
    } else if (e.key === 'Enter' && expanded) {
      e.preventDefault()
      pick(matches[Math.min(active, matches.length - 1)].id)
    }
  }

  return (
    <div className={styles.jump}>
      <input
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={`${idPrefix}-list`}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? optId(Math.min(active, matches.length - 1)) : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        className={styles.toolbarInput}
      />
      {expanded && (
        <div
          id={`${idPrefix}-list`}
          role="listbox"
          aria-label="Matching notes"
          className={styles.jumpList}
        >
          {matches.map((m, i) => (
            <div
              key={m.id}
              id={optId(i)}
              role="option"
              aria-selected={i === active}
              // preventDefault keeps focus in the input so blur can't close the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(m.id)
              }}
              onMouseEnter={() => setActive(i)}
              className={`${styles.jumpOption} ${i === active ? styles.jumpOptionActive : ''}`}
            >
              {m.title || 'Untitled'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GraphView({ onUpdate, onRemove, onCreate, scopeIds, scopeNoun = 'workspace', instanceKey = 'main' }: Props) {
  const { graphData, loading, error, reload } = useGraph()

  // Per-instance session caches (layout + viewport), so a workspace's local graph
  // never shares positions/zoom with the main graph.
  const nodeCacheStore = useMemo(() => nodeCacheFor(instanceKey), [instanceKey])
  const pseudoCacheStore = useMemo(() => pseudoCacheFor(instanceKey), [instanceKey])

  // Notes in scope (all notes, or just the workspace's) — for jump-to + empty state.
  const scopedNodes = useMemo(
    () => (scopeIds ? graphData.nodes.filter((n) => scopeIds.has(n.id)) : graphData.nodes),
    [graphData.nodes, scopeIds],
  )

  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  // Off (default): selecting dims non-neighbours. On: the graph filters to the 1-hop neighbourhood.
  const [neighbourhoodOnly, setNeighbourhoodOnly] = usePersistentViewState('graph.neighbourhoodOnly', false)
  // How many links out selection emphasis / "Neighbourhood only" reach (hover stays 1).
  const [rawDepth, setDepth] = usePersistentViewState('graph.depth', 1)
  const depth = rawDepth === 2 || rawDepth === 3 ? rawDepth : 1

  // Connect-to-node: chosen from a node's right-click menu. While set, a
  // rubber-band line follows the cursor and the next node clicked is linked.
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  // List mode can't click a target node, so Connect opens a searchable picker instead.
  const [pickFrom, setPickFrom] = useState<string | null>(null)
  // "Find path to…": pathFrom = waiting for a target (click, or the list picker); path = the result.
  const [pathFrom, setPathFrom] = useState<string | null>(null)
  const [path, setPath] = useState<string[] | null>(null)

  // Right-click context menu (per node).
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ── Spotlight (requested by the dashboard's insight tiles) ──
  // 'orphans' haloes unlinked notes; 'suggested' draws dashed lines between
  // notes that look related but aren't linked. Cleared by the dismiss chip.
  const spotlight = useGraphSpotlight()
  const { suggestSource } = useDashboardPrefs()

  // The suggestion engine wants Notes; graph nodes carry the same fields plus
  // simulation state. Scope-filtered so a workspace graph only suggests within
  // its own notes.
  const suggestionNotes = useMemo(
    () =>
      graphData.nodes
        .filter((n) => !scopeIds || scopeIds.has(n.id))
        .map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          tags: n.tags ?? [],
          createdAt: n.createdAt ?? n.updatedAt,
          updatedAt: n.updatedAt,
          vaultId: n.vaultId,
        })),
    [graphData.nodes, scopeIds],
  )
  const suggestionLinks = useMemo<[string, string][]>(
    () => graphData.edges.map((e) => [e.source, e.target] as [string, string]),
    [graphData.edges],
  )
  const { pairs: suggestedPairs, loading: suggestionsLoading } = useSuggestedPairs(
    suggestionNotes,
    suggestionLinks,
    suggestSource,
    spotlight === 'suggested',
  )

  // Settings panel — all of the controls below persist across view switches
  // (via useViewState) so the graph's configuration isn't lost when navigating.
  const [showPanel, setShowPanel] = useViewState('graph.showPanel', false)
  const [viewMode, setViewMode] = useViewState<'graph' | 'list'>('graph.viewMode', 'graph')
  const [openSections, setOpenSections] = useViewState<Record<SectionKey, boolean>>('graph.openSections', {
    filters: true,
    groups: false,
    display: false,
    advanced: false,
  })

  // Filters.
  const [filterText, setFilterText] = useViewState('graph.filterText', '')
  const [filterTags, setFilterTags] = useViewState<Set<string>>('graph.filterTags', () => new Set())
  const [datePreset, setDatePreset] = useViewState<DatePreset>('graph.datePreset', 'all')
  const [orphansOnly, setOrphansOnly] = useViewState('graph.orphansOnly', false)

  // Groups (color categories of notes).
  // Stored shape may be legacy ({query}) or junk — always read through migrateGroups.
  const [rawGroups, setRawGroups] = usePersistentViewState<unknown>('graph.groups', [])
  const groups = useMemo(() => migrateGroups(rawGroups), [rawGroups])
  const setGroups = useCallback(
    (fn: (prev: GraphGroup[]) => GraphGroup[]) => setRawGroups((prev: unknown) => fn(migrateGroups(prev))),
    [setRawGroups],
  )

  // Display.
  const [directed, setDirected] = usePersistentViewState('graph.directed', false)
  const [highlightStructure, setHighlightStructure] = usePersistentViewState('graph.highlightStructure', false)
  const [pinOnDrag, setPinOnDrag] = usePersistentViewState('graph.pinOnDrag', true)
  const [textFade, setTextFade] = usePersistentViewState('graph.textFade', DEFAULT_DISPLAY.textFade)
  const [nodeSize, setNodeSize] = usePersistentViewState('graph.nodeSize', DEFAULT_DISPLAY.nodeSize)
  const [linkThickness, setLinkThickness] = usePersistentViewState('graph.linkThickness', DEFAULT_DISPLAY.linkThickness)
  // Optional ambience: keep nodes gently drifting, and a rippling accent glow behind the graph.
  const [perpetualMotion, setPerpetualMotion] = usePersistentViewState('graph.perpetualMotion', false)
  const [rippleBackground, setRippleBackground] = usePersistentViewState('graph.rippleBackground', false)
  // The canvas backgroundColor is a prop (not painted in the continuous loop), so
  // unlike the node/link bindings it needs a re-render to re-theme. Track --bg.
  const [canvasBg, setCanvasBg] = useState(
    () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d0d0f',
  )
  useEffect(() => {
    const read = () =>
      setCanvasBg(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d0d0f')
    read()
    eventBus.on('theme:changed', read)
    return () => eventBus.off('theme:changed', read)
  }, [])

  // Forces — persisted to localStorage so a user's tuning survives a restart.
  const forces = useGraphForces()

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  // Whether the viewport has been restored for this mount (restore only once).
  const viewportRestored = useRef(false)
  // Mirrors used inside the per-frame canvas callback (avoids stale closures).
  const connectingFromRef = useRef<string | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    connectingFromRef.current = connectingFrom
    if (!connectingFrom) pointerRef.current = null
  }, [connectingFrom])

  // The canvas callbacks run per frame, outside React — mirror spotlight state
  // into refs so they don't paint from a stale closure.
  const spotlightRef = useRef(spotlight)
  spotlightRef.current = spotlight
  const suggestedPairsRef = useRef<SuggestedPair[]>(suggestedPairs)
  suggestedPairsRef.current = suggestedPairs

  // No repaint pump needed: force-graph's canvas loop calls the paint callbacks
  // every frame whether or not the simulation is still settling, which is what
  // lets the halo below breathe off a clock.

  // Esc peels back one layer at a time: a pending connection or menu, then the
  // selection, then list view (back to the graph).
  useEscapeKey(() => {
    if (connectingFrom || contextMenu || pickFrom || pathFrom) {
      setConnectingFrom(null)
      setContextMenu(null)
      setPickFrom(null)
      setPathFrom(null)
    } else if (path) {
      setPath(null)
    } else if (focusNodeId) {
      setFocusNodeId(null)
    } else if (viewMode === 'list') {
      setViewMode('graph')
    }
  })

  // Nothing is drawn in list mode, so stop the simulation/render loop burning CPU.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    if (viewMode === 'list') fg.pauseAnimation()
    else fg.resumeAnimation()
  }, [viewMode, loading, error])

  // Restore the saved viewport before the first paint, so returning to the graph
  // doesn't snap the camera once the layout settles. Waits for the canvas to mount.
  useEffect(() => {
    const vp = savedViewports.get(instanceKey)
    const fg = fgRef.current
    if (viewportRestored.current || !vp || !fg) return
    viewportRestored.current = true
    fg.zoom(vp.k, 0)
    fg.centerAt(vp.x, vp.y, 0)
  }, [instanceKey, loading, error])

  // ── Derived data ────────────────────────────────────────

  // Undirected degree per node (counts both inbound and outbound links).
  // Drives orphan (degree 0) and hub (degree ≥ HUB_DEGREE) detection.
  const degrees = useMemo(() => {
    const d = new Map<string, number>()
    graphData.nodes.forEach((n) => d.set(n.id, 0))
    graphData.edges.forEach((e) => {
      d.set(e.source, (d.get(e.source) ?? 0) + 1)
      d.set(e.target, (d.get(e.target) ?? 0) + 1)
    })
    return d
  }, [graphData.nodes, graphData.edges])

  // Counted off the same scoped set the halo paints, so the chip and the canvas
  // can't disagree.
  const orphanCount = useMemo(
    () => (spotlight === 'orphans' ? scopedNodes.filter((n) => (degrees.get(n.id) ?? 0) === 0).length : 0),
    [spotlight, scopedNodes, degrees],
  )

  // Every user tag present (auto-tags like has:* excluded), sorted — the filter chips.
  // Scoped, not global: a chip for a tag that only exists in another vault (or
  // outside this workspace) filters the graph down to nothing.
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    scopedNodes.forEach((n) =>
      (n.tags ?? []).forEach((t) => {
        if (!isAutoTag(t)) tags.add(t)
      }),
    )
    return [...tags].sort()
  }, [scopedNodes])

  // A tag selected before a vault/workspace switch may not exist here. Its chip
  // is gone with the scoping above, so honouring it would blank the graph with
  // no way to clear it — ignore it while out of scope, keep it for the trip back.
  const activeFilterTags = useMemo(
    () => new Set([...filterTags].filter((t) => allTags.includes(t))),
    [filterTags, allTags],
  )

  const filterSince = useMemo(() => {
    const day = 24 * 60 * 60 * 1000
    const now = Date.now()
    switch (datePreset) {
      case 'week':
        return now - 7 * day
      case 'month':
        return now - 30 * day
      case 'year':
        return now - 365 * day
      default:
        return 0
    }
  }, [datePreset])

  const filterActive =
    filterText.trim() !== '' || filterTags.size > 0 || datePreset !== 'all' || orphansOnly

  // Colour a node by the first group it matches (tag / title conditions — see
  // groupMatch.ts). Precomputed so the per-frame paint is a Map lookup instead of
  // a groups loop per node.
  const groupColors = useMemo(() => {
    const m = new Map<string, string>()
    const matchers = groups.map((g) => ({ color: g.color, test: compileGroup(g) }))
    if (!matchers.length) return m
    for (const n of graphData.nodes) {
      const hit = matchers.find((x) => x.test(n))
      if (hit) m.set(n.id, hit.color)
    }
    return m
  }, [graphData.nodes, groups])

  // Memoize so the force simulation only restarts when data actually changes,
  // not on every hover/focus state update.
  // Only the opt-in "Neighbourhood only" mode changes graphData on select.
  const neighbourhoodFocusId = neighbourhoodOnly ? focusNodeId : null
  const forceData = useMemo(() => {
    // Drop cached nodes that no longer exist (deleted notes).
    const allIds = new Set(graphData.nodes.map((n) => n.id))
    for (const id of nodeCacheStore.keys()) {
      if (!allIds.has(id)) nodeCacheStore.delete(id)
    }

    // Restrict to the workspace's notes when a scope is given (local graph).
    const inScope = (id: string) => !scopeIds || scopeIds.has(id)

    const q = filterText.trim().toLowerCase()
    const passesFilter = (n: (typeof graphData.nodes)[number]) => {
      if (!inScope(n.id)) return false
      if (orphansOnly && (degrees.get(n.id) ?? 0) !== 0) return false
      if (filterSince && n.updatedAt < filterSince) return false
      if (activeFilterTags.size > 0 && !(n.tags ?? []).some((t) => activeFilterTags.has(t))) return false
      if (q) {
        const hay = `${n.title}\n${n.content}\n${(n.tags ?? []).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    }

    // Focus mode shows a node's immediate neighbourhood and overrides filters.
    // Otherwise the filter set decides what's visible. Both stay within scope.
    const visibleNodes = neighbourhoodFocusId
      ? (() => {
          const adj = new Map<string, Set<string>>()
          const link = (a: string, b: string) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
          graphData.edges.forEach((e) => {
            link(e.source, e.target)
            link(e.target, e.source)
          })
          const neighbors = nodesWithinHops(adj, neighbourhoodFocusId, depth)
          return graphData.nodes.filter((n) => neighbors.has(n.id) && inScope(n.id))
        })()
      : graphData.nodes.filter(passesFilter)

    const visibleIds = new Set(visibleNodes.map((n) => n.id))

    const nodes = visibleNodes.map((n) => {
      const cached = nodeCacheStore.get(n.id)
      if (cached) {
        // Reuse the object (keeps x/y/fx/fy from the simulation); refresh display fields.
        cached.title = n.title
        cached.content = n.content
        cached.tags = n.tags
        cached.updatedAt = n.updatedAt
        return cached
      }
      const fresh = { ...n, val: 1 }
      nodeCacheStore.set(n.id, fresh)
      return fresh
    })

    // Real edges among visible notes.
    const links = graphData.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    // Overlay: derive a faded pseudo-node for every `[[wikilink]]` that doesn't
    // resolve to an existing note (edges to unresolved titles aren't stored
    // server-side, so this is content-derived on the fly). Clicking one creates
    // the note. Only sourced from visible notes so filters/scope still apply.
    // Keyed per vault: a title only resolves to a note in the linking note's vault.
    const vaultKey = (vaultId: string | null | undefined, title: string) => `${vaultId ?? DEFAULT_VAULT_ID}|${normalizeTitle(title)}`
    const titleToId = new Map<string, string>()
    for (const n of graphData.nodes) {
      if (normalizeTitle(n.title)) titleToId.set(vaultKey(n.vaultId, n.title), n.id)
    }
    const pseudoNodes = new Map<string, any>()
    for (const n of visibleNodes) {
      // Typed notes (e.g. canvas) store JSON — scan only their link projection.
      // Placed note cards always resolve, so no titleOf is needed for pseudo-nodes.
      for (const title of extractWikilinkTitles(noteLinkText(n, () => undefined))) {
        const key = normalizeTitle(title)
        if (!key || titleToId.has(vaultKey(n.vaultId, title))) continue
        const pid = pseudoNodeId(title)
        if (!pseudoNodes.has(pid)) {
          const cached = pseudoCacheStore.get(pid)
          if (cached) {
            cached.title = title
            pseudoNodes.set(pid, cached)
          } else {
            const fresh = { id: pid, title, isPseudo: true, val: 1 }
            pseudoCacheStore.set(pid, fresh)
            pseudoNodes.set(pid, fresh)
          }
        }
        links.push({ source: n.id, target: pid })
      }
    }
    // Evict pseudo positions no longer referenced.
    for (const pid of pseudoCacheStore.keys()) {
      if (!pseudoNodes.has(pid)) pseudoCacheStore.delete(pid)
    }

    return { nodes: [...nodes, ...pseudoNodes.values()], links }
  }, [
    graphData.nodes,
    graphData.edges,
    neighbourhoodFocusId,
    depth,
    filterText,
    activeFilterTags,
    filterSince,
    orphansOnly,
    degrees,
    scopeIds,
    nodeCacheStore,
    pseudoCacheStore,
  ])

  // Real notes on screen. forceData.nodes also carries pseudo-nodes (faded
  // placeholders for unresolved [[wikilinks]]), which aren't notes and would
  // push the count past the total.
  const shownCount = useMemo(() => forceData.nodes.filter((n: any) => !n.isPseudo).length, [forceData])

  // id -> neighbour ids, for hover/selection dimming. Links are ids here (the
  // sim mutates them to objects later), but tolerate both.
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const idOf = (x: any): string => (typeof x === 'object' && x ? x.id : x)
    const add = (a: string, b: string) => {
      let set = m.get(a)
      if (!set) m.set(a, (set = new Set()))
      set.add(b)
    }
    for (const l of forceData.links as any[]) {
      const a = idOf(l.source)
      const b = idOf(l.target)
      add(a, b)
      add(b, a)
    }
    return m
  }, [forceData])

  // Hover wins over selection; selection dims only when not filtering to the neighbourhood.
  const emphasisId = hoverNodeId ?? (neighbourhoodOnly ? null : focusNodeId)
  const dimAlpha = hoverNodeId ? 0.35 : 0.15
  // Selection emphasis reaches `depth` links; computed once per selection/depth/data.
  const selectionRange = useMemo(
    () => (focusNodeId && !neighbourhoodOnly ? nodesWithinHops(adjacency, focusNodeId, depth) : null),
    [adjacency, focusNodeId, neighbourhoodOnly, depth],
  )
  // A found path outranks hover/selection: its notes + hops stay lit, the rest dims.
  const pathSet = useMemo(() => (path ? new Set(path) : null), [path])
  const pathEdges = useMemo(() => {
    const e = new Set<string>()
    path?.forEach((id, i) => {
      if (i > 0) e.add(`${path[i - 1]}|${id}`).add(`${id}|${path[i - 1]}`)
    })
    return e
  }, [path])
  const idOfEnd = (x: any): string => (typeof x === 'object' && x ? x.id : x)
  const isPathLink = (l: any) => !!pathSet && pathEdges.has(`${idOfEnd(l.source)}|${idOfEnd(l.target)}`)
  const dimFor = (id: string): number =>
    pathSet
      ? pathSet.has(id) ? 1 : 0.15
      : !emphasisId
        ? 1
        : hoverNodeId || !selectionRange
          ? id === emphasisId || adjacency.get(emphasisId)?.has(id) ? 1 : dimAlpha
          : selectionRange.has(id) ? 1 : dimAlpha
  const linkColorFor = (l: any): string => {
    if (pathSet) return isPathLink(l) ? FOCUS_COLOR : LINK_FADED_COLOR
    if (!emphasisId) return LINK_COLOR
    const a = typeof l.source === 'object' ? l.source.id : l.source
    const b = typeof l.target === 'object' ? l.target.id : l.target
    if (!hoverNodeId && selectionRange) return selectionRange.has(a) && selectionRange.has(b) ? LINK_STRONG_COLOR : LINK_FADED_COLOR
    return a === emphasisId || b === emphasisId ? LINK_STRONG_COLOR : LINK_FADED_COLOR
  }
  // One radius for both paint and hit-testing (hubs, orphans, Node size slider).
  const nodeRadius = (node: any): number => {
    if (node.isPseudo) return 5 * nodeSize
    const deg = degrees.get(node.id) ?? 0
    const isHub = highlightStructure && deg >= HUB_DEGREE
    const isOrphan = highlightStructure && deg === 0
    return (isHub ? 8 : isOrphan ? 4 : 5) * nodeSize
  }

  // Apply the tunable forces to the d3 simulation, then reheat so changes take
  // effect. Re-runs when a slider moves or the visible data changes (force-graph
  // rebuilds its forces on data change, so we must re-assert ours).
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return

    // Repel: a more negative charge makes notes push each other further apart.
    const charge = fg.d3Force('charge')
    if (charge && typeof charge.strength === 'function') charge.strength(-forces.repel)

    // Link: strength = rubber-band tightness; distance = preferred length.
    const link = fg.d3Force('link')
    if (link) {
      if (typeof link.strength === 'function') link.strength(forces.link)
      if (typeof link.distance === 'function') link.distance(forces.distance)
    }

    // Center: an inward pull toward the origin that compacts the graph. Installed
    // once (force-graph keeps it across data changes), then updated in place.
    const existing = fg.d3Force('centerPull') as any
    if (existing && typeof existing.strength === 'function') {
      existing.strength(forces.center)
    } else {
      fg.d3Force('centerPull', makeRadialForce(forces.center))
    }

    fg.d3ReheatSimulation()
  }, [forces.center, forces.repel, forces.link, forces.distance, forceData])

  // Perpetual motion: register/remove the wiggle force and reheat so nodes either
  // start drifting forever (cooldown props are lifted to Infinity below) or settle
  // and stop. Re-applied on forceData changes so a data swap keeps the force.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.d3Force('wiggle', perpetualMotion ? (makeFloatForce(FLOAT_STRENGTH) as any) : null)
    fg.d3ReheatSimulation()
  }, [perpetualMotion, forceData])

  // ── Link editing ────────────────────────────────────────

  // Append [[target title]] to the source note's content. That's what makes the
  // edge durable (a raw link row would be wiped on the source's next save, when
  // links are recomputed from content).
  const connect = useCallback(
    async (sourceId: string, targetId: string) => {
      const source = graphData.nodes.find((n) => n.id === sourceId)
      const target = graphData.nodes.find((n) => n.id === targetId)
      const targetTitle = target?.title?.trim()
      if (source && targetTitle) {
        const wl = `[[${targetTitle}]]`
        if (source.content.includes(wl)) {
          toast.info('Those notes are already linked.')
          return
        }
        try {
          await onUpdate(source.id, source.title, `${source.content.trimEnd()}\n\n${wl}\n`)
          toast.success(`Linked "${source.title}" → "${targetTitle}"`)
        } catch (err) {
          log.error('Failed to connect notes', err)
          toast.error('Could not link the notes.')
        }
      } else if (source && !targetTitle) {
        toast.info('Give the target note a title first — links connect by [[title]].')
      }
    },
    [graphData.nodes, onUpdate],
  )

  // Remove every link to and from a node by stripping the matching [[wikilinks]]
  // from the source content on each side (so sync can't re-add them).
  const disconnectAll = useCallback(
    async (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId)
      if (!node) return
      const edits: { n: typeof node; content: string }[] = []

      // Outgoing: strip [[target]] for each link this note owns.
      let newContent = node.content
      graphData.edges
        .filter((e) => e.source === nodeId)
        .forEach((e) => {
          const t = graphData.nodes.find((n) => n.id === e.target)
          if (t?.title) newContent = stripWikilink(newContent, t.title)
        })
      if (newContent !== node.content) edits.push({ n: node, content: newContent })

      // Incoming: strip [[this title]] from each note that links here.
      const thisTitle = node.title?.trim()
      if (thisTitle) {
        graphData.edges
          .filter((e) => e.target === nodeId)
          .forEach((e) => {
            const s = graphData.nodes.find((n) => n.id === e.source)
            if (!s) return
            const stripped = stripWikilink(s.content, thisTitle)
            if (stripped !== s.content) edits.push({ n: s, content: stripped })
          })
      }
      if (edits.length === 0) return

      const ok = await showConfirmDialog({
        title: 'Disconnect all links?',
        message: `This edits ${edits.length} note${edits.length === 1 ? '' : 's'} to remove their [[links]] to/from "${node.title || 'Untitled'}".`,
        confirmLabel: 'Disconnect',
        danger: true,
      })
      if (!ok) return
      try {
        await Promise.all(edits.map((e) => onUpdate(e.n.id, e.n.title, e.content)))
        toast.success(`Removed links from ${edits.length} note${edits.length === 1 ? '' : 's'}.`)
      } catch (err) {
        log.error('Failed to disconnect node', err)
        toast.error('Could not remove all the links.')
      }
    },
    [graphData.nodes, graphData.edges, onUpdate],
  )

  // Materialize a pseudo-node: create the note for its title (useNotes then
  // re-syncs the notes already referencing it, so their edges resolve at once).
  // Cheap and reversible, so no confirm — the toast offers Undo.
  const createFromPseudo = useCallback(
    async (title: string) => {
      const name = title.trim()
      if (!name) return
      try {
        const created = await onCreate(name, '')
        setFocusNodeId(created.id)
        toast.success(`Created "${name}"`, 6000, {
          label: 'Undo',
          onClick: () => {
            void onRemove(created.id)
              .then((ok) => {
                if (ok) setFocusNodeId((f) => (f === created.id ? null : f))
              })
              .catch((err) => {
                log.error('Failed to undo note creation', err)
                toast.error('Could not undo.')
              })
          },
        })
      } catch (err) {
        log.error('Failed to create note from pseudo-node', err)
        toast.error('Could not create the note.')
      }
    },
    [onCreate, onRemove],
  )

  // Clicking a suggested line offers to make it real. Direction matters for
  // wikilinks (the [[link]] lives in the source note), so ask rather than guess.
  const promptConnect = useCallback(
    async (pair: SuggestedPair) => {
      const nameOf = (id: string) =>
        graphData.nodes.find((n) => n.id === id)?.title?.trim() || 'Untitled'
      const aName = nameOf(pair.a)
      const bName = nameOf(pair.b)
      const choice = await showChoiceDialog({
        title: 'Link these notes?',
        message: `${aName} and ${bName} — ${pair.reason}.`,
        options: [
          { value: 'both', label: 'Link both ways', description: `Each note gets a [[link]] to the other`, primary: true },
          { value: 'a-b', label: `${aName} → ${bName}`, description: `Adds [[${bName}]] to ${aName}` },
          { value: 'b-a', label: `${bName} → ${aName}`, description: `Adds [[${aName}]] to ${bName}` },
        ],
        cancelLabel: 'Not now',
      })
      if (!choice) return
      if (choice === 'a-b' || choice === 'both') await connect(pair.a, pair.b)
      if (choice === 'b-a' || choice === 'both') await connect(pair.b, pair.a)
    },
    [graphData.nodes, connect],
  )

  // Select + glide to the node. Zoom in only when we're very zoomed out.
  const selectNode = useCallback(
    (id: string, x?: number, y?: number) => {
      setFocusNodeId(id)
      const fg = fgRef.current
      const n = nodeCacheStore.get(id)
      const nx = x ?? n?.x
      const ny = y ?? n?.y
      if (!fg || !Number.isFinite(nx) || !Number.isFinite(ny)) return
      const ms = reducedMotion ? 0 : 700
      fg.centerAt(nx, ny, ms)
      if (fg.zoom() < 1.2) fg.zoom(2, ms)
    },
    [nodeCacheStore],
  )

  // Resolve a path over real notes only (an unresolved [[title]] pseudo-node isn't a connection).
  const completePath = useCallback(
    (from: string, to: string) => {
      setPathFrom(null)
      const isReal = (id: string) => !forceData.nodes.some((n: any) => n.id === id && n.isPseudo)
      const noteAdj = new Map<string, Set<string>>()
      adjacency.forEach((set, id) => {
        if (isReal(id)) noteAdj.set(id, new Set([...set].filter(isReal)))
      })
      const found = shortestPath(noteAdj, from, to)
      if (!found) {
        setPath(null)
        toast.info("These notes aren't connected yet.")
        return
      }
      setPath(found)
    },
    [adjacency, forceData],
  )

  // Frame the path (instant under reduced motion); drop it if filters hide one of its notes.
  useEffect(() => {
    if (!path) return
    if (!path.every((id) => forceData.nodes.some((n: any) => n.id === id))) {
      setPath(null)
      return
    }
    ;(fgRef.current as any)?.zoomToFit?.(reducedMotion ? 0 : 600, 80, (n: any) => path.includes(n.id))
  }, [path, forceData])

  // Vault-empty "New note": a blank note, then open it in the editable panel.
  const createBlank = useCallback(async () => {
    try {
      const created = await onCreate('', '')
      selectNode(created.id)
    } catch (err) {
      log.error('Failed to create note from graph', err)
      toast.error('Could not create the note.')
    }
  }, [onCreate, selectNode])

  const handleNodeClick = useCallback(
    (node: any) => {
      // A faded pseudo-node → offer to create the real note.
      if (node.isPseudo) {
        void createFromPseudo(node.title)
        return
      }

      // Completing a connection started from the context menu.
      if (connectingFrom) {
        if (node.id !== connectingFrom) void connect(connectingFrom, node.id)
        setConnectingFrom(null)
        return
      }

      if (pathFrom) {
        if (node.id !== pathFrom) completePath(pathFrom, node.id)
        else setPathFrom(null)
        return
      }

      if (focusNodeId === node.id) {
        setFocusNodeId(null)
      } else {
        selectNode(node.id, node.x, node.y)
      }
    },
    [connectingFrom, connect, focusNodeId, createFromPseudo, selectNode, pathFrom, completePath],
  )

  const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
    event.preventDefault?.()
    // Pseudo-nodes aren't real notes — no connect/disconnect/delete menu.
    if (node.isPseudo) return
    setConnectingFrom(null)
    // Clamp so the menu stays on screen.
    const menuW = 210
    const menuH = 168
    const pad = 8
    const x = Math.min(event.clientX, window.innerWidth - menuW - pad)
    const y = Math.min(event.clientY, window.innerHeight - menuH - pad)
    setContextMenu({ nodeId: node.id, x, y })
  }, [])

  // ── Pin layout ──────────────────────────────────────────

  const handleNodeDragEnd = useCallback(
    (node: any) => {
      if (pinOnDrag) {
        // Fix the node where it was dropped so the force layout stops moving it.
        node.fx = node.x
        node.fy = node.y
      }
    },
    [pinOnDrag],
  )

  const togglePin = useCallback((next: boolean) => {
    setPinOnDrag(next)
    if (!next) {
      // Releasing: clear every pinned position and let the layout relax again.
      nodeCacheStore.forEach((n) => {
        n.fx = undefined
        n.fy = undefined
      })
      fgRef.current?.d3ReheatSimulation?.()
    }
  }, [])

  // Track the cursor in graph coordinates so the rubber-band connect line can be
  // drawn. Only needed while a connection is pending.
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Needed by the connect rubber-band and by suggestion-line hit-testing.
    const tracking = connectingFromRef.current || spotlightRef.current === 'suggested'
    if (!tracking || !fgRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    pointerRef.current = fgRef.current.screen2GraphCoords(e.clientX - rect.left, e.clientY - rect.top)
  }, [])

  // ── Note panel ──────────────────────────────────────────

  const handleUpdateNote = useCallback(
    async (id: string, title: string, content: string, tags?: string[]) => {
      // Delegate entirely to the prop — no refresh() call here.
      // useGraph stays in sync via its eventBus listeners:
      //   note:saved  → upserts the node
      //   link:created / link:removed → updates edges
      return onUpdate(id, title, content, tags)
    },
    [onUpdate],
  )

  // `onRemove` (useNotes().remove) confirms centrally when confirmBeforeDelete
  // is on — no separate dialog here (would double-prompt).
  const handleRemoveNote = useCallback(
    async (id: string) => {
      const ok = await onRemove(id)
      if (!ok) return
      if (focusNodeId === id) setFocusNodeId(null)
    },
    [onRemove, focusNodeId],
  )

  // ── Panel actions ───────────────────────────────────────

  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilterText('')
    setFilterTags(new Set())
    setDatePreset('all')
    setOrphansOnly(false)
  }, [])

  const toggleFilterTag = useCallback((tag: string) => {
    setFilterTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const addGroup = useCallback(() => {
    setGroups((prev) => [
      ...prev,
      newGroup(nextGroupColor(prev.map((g) => g.color))),
    ])
  }, [])
  const updateGroup = useCallback((id: string, patch: Partial<GraphGroup>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }, [])
  const removeGroup = useCallback((id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
  }, [])

  const resetForces = useCallback(() => {
    setGraphForces(DEFAULT_GRAPH_FORCES)
  }, [])

  const applyPreset = useCallback((name: keyof typeof FORCE_PRESETS) => {
    setGraphForces(FORCE_PRESETS[name])
  }, [])

  const fitView = useCallback(() => {
    ;(fgRef.current as any)?.zoomToFit?.(reducedMotion ? 0 : 400, 60)
  }, [])
  const rerunLayout = useCallback(() => {
    fgRef.current?.d3ReheatSimulation?.()
  }, [])

  const resetAllSettings = useCallback(() => {
    clearFilters()
    setGroups(() => [])
    setDirected(false)
    setHighlightStructure(false)
    togglePin(true)
    setTextFade(DEFAULT_DISPLAY.textFade)
    setNodeSize(DEFAULT_DISPLAY.nodeSize)
    setLinkThickness(DEFAULT_DISPLAY.linkThickness)
    setPerpetualMotion(false)
    setRippleBackground(false)
    setNeighbourhoodOnly(false)
    setDepth(1)
    resetForces()
  }, [clearFilters, togglePin, resetForces, setPerpetualMotion, setRippleBackground, setNeighbourhoodOnly, setDepth])

  const confirmResetAll = useCallback(async () => {
    const ok = await showConfirmDialog({
      title: 'Reset graph settings?',
      message: 'Filters, groups, display and layout go back to their defaults.',
      confirmLabel: 'Reset',
      danger: true,
    })
    if (ok) resetAllSettings()
  }, [resetAllSettings])

  const openBtnRef = useRef<HTMLButtonElement>(null)
  const focusPanelRef = useRef(false)
  const closeSettings = useCallback(() => {
    focusPanelRef.current = false
    setShowPanel(false)
    // The close button unmounts with the panel — hand focus to the opener once it exists.
    requestAnimationFrame(() => openBtnRef.current?.focus())
  }, [setShowPanel])

  const focusedNode = focusNodeId ? graphData.nodes.find((n) => n.id === focusNodeId) : null

  const focusedNoteForPanel = focusedNode
    ? {
        id: focusedNode.id,
        title: focusedNode.title,
        content: focusedNode.content,
        tags: focusedNode.tags ?? [],
        createdAt: focusedNode.createdAt ?? focusedNode.updatedAt,
        updatedAt: focusedNode.updatedAt,
      }
    : null

  const realLinkCount = forceData.links.filter((l: any) => !l.source?.isPseudo && !l.target?.isPseudo).length
  const legendGroups = groups.map((g) => ({ id: g.id, color: g.color, label: describeGroup(g) })).filter((g) => g.label)
  const menuNode = contextMenu ? graphData.nodes.find((n) => n.id === contextMenu.nodeId) : null
  const menuItems = (id: string): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: 'Connect to a note',
        onClick: () => {
          setContextMenu(null)
          if (viewMode === 'list') {
            setPickFrom(id)
            return
          }
          setFocusNodeId(null)
          setPathFrom(null)
          setConnectingFrom(id)
        },
      },
      {
        label: 'Find path to…',
        onClick: () => {
          setContextMenu(null)
          setConnectingFrom(null)
          setPickFrom(null)
          setPath(null)
          setPathFrom(id)
        },
      },
    ]
    if ((degrees.get(id) ?? 0) >= 1) {
      items.push({
        label: 'Disconnect all links',
        onClick: () => {
          setContextMenu(null)
          void disconnectAll(id)
        },
      })
    }
    items.push({
      label: 'Delete note',
      danger: true,
      separator: true,
      onClick: () => {
        setContextMenu(null)
        void handleRemoveNote(id)
      },
    })
    return items
  }
  // A workspace graph's new note wouldn't land in its scope, so only offer it for the vault.
  const canCreateHere = !scopeIds || scopeNoun === 'vault'
  const pickSource = pickFrom ? graphData.nodes.find((n) => n.id === pickFrom) : null

  if (loading) {
    return <div className="note-empty">Loading graph…</div>
  }

  if (error) {
    return (
      <div className={styles.root}>
        <div className={`note-empty ${styles.empty}`} role="alert">
          <p>Couldn't load the graph.</p>
          <button type="button" className={styles.emptyBtn} onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} data-anchor="graph" role="group" aria-label={`Note graph: ${shownCount} notes, ${realLinkCount} links`} aria-describedby="graph-list-hint" onMouseMove={handleMouseMove} className={styles.root}>
      {/* Optional glowing backdrop — first child so it paints under the (transparent) graph canvas. */}
      {rippleBackground && <div className={styles.rippleBg} aria-hidden="true" />}
      {/* One empty state at a time: in list mode GraphListView owns it. */}
      {viewMode !== 'list' && (scopedNodes.length === 0 || (shownCount === 0 && filterActive)) && (
        <div className={`note-empty ${styles.empty}`}>
          {scopedNodes.length === 0 ? (
            <>
              <p>{`No notes in this ${scopeIds ? scopeNoun : 'vault'} yet`}</p>
              {canCreateHere && (
                <button type="button" className={styles.emptyBtn} onClick={() => void createBlank()}>
                  New note
                </button>
              )}
            </>
          ) : (
            <>
              <p>No notes match these filters</p>
              <button type="button" className={styles.emptyBtn} onClick={clearFilters}>
                Clear filters
              </button>
            </>
          )}
        </div>
      )}

      {/* Top-left: toolbar row, then the status chips stacked under it (never squeezed
          between the side panels, whatever the window width). */}
      <div className={styles.toolbar}>
       <div className={styles.toolbarRow}>
        <JumpToNote
          nodes={scopedNodes}
          onJump={(id) => {
            if (scopedNodes.some((n) => n.id === id)) selectNode(id)
          }}
        />
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'list' ? 'graph' : 'list')}
          aria-pressed={viewMode === 'list'}
          aria-label={viewMode === 'list' ? 'Show graph' : 'Show as list'}
          title={viewMode === 'list' ? 'Show graph' : 'Show as list'}
          className={styles.toolbarBtn}
        >
          {viewMode === 'list' ? <Network size={15} /> : <List size={15} />}
        </button>
        <button type="button" className={styles.toolbarBtn} onClick={fitView} title="Fit all notes in view" aria-label="Fit all notes in view">
          <Scan size={15} />
        </button>
        <span id="graph-list-hint" className={styles.srOnly}>
          A list view of these notes is available with the List button next to the search box.
        </span>
       </div>

        {connectingFrom && (
          <div className={styles.connectBanner} role="status">
            <Link2 size={14} className={styles.connectIcon} aria-hidden="true" />
            <span>Click a target note to link it, or press Esc to cancel</span>
            <button type="button" className={styles.chipBtn} onClick={() => setConnectingFrom(null)}>
              Cancel
            </button>
          </div>
        )}

        {pathFrom && viewMode !== 'list' && (
          <div className={styles.connectBanner} role="status">
            <Route size={14} className={styles.connectIcon} aria-hidden="true" />
            <span>Click the note to find a path to, or press Esc to cancel</span>
            <button type="button" className={styles.chipBtn} onClick={() => setPathFrom(null)}>
              Cancel
            </button>
          </div>
        )}

        {path && path.length > 1 && (
          <div className={styles.spotlightChip} role="status">
            <Route size={14} aria-hidden="true" />
            <span className={styles.pathTrail}>
              {(path.length > 5 ? [path[0], path[1], null, path[path.length - 1]] : path).map((id, i) => (
                <span key={id ?? 'gap'}>
                  {i > 0 && ' → '}
                  {id === null ? (
                    '…'
                  ) : (
                    <button type="button" className={styles.pathTitle} onClick={() => selectNode(id)}>
                      {graphData.nodes.find((n) => n.id === id)?.title?.trim() || 'Untitled'}
                    </button>
                  )}
                </span>
              ))}
              {` · ${path.length - 1} hop${path.length === 2 ? '' : 's'}`}
            </span>
            <button type="button" className={styles.chipBtn} onClick={() => setPath(null)}>
              Clear
            </button>
          </div>
        )}

        {/* Spotlight chip: what the dashboard asked us to highlight. */}
        {spotlight && !connectingFrom && (
          <div className={styles.spotlightChip} role="status">
            <span>
              {spotlight === 'orphans'
                ? `${orphanCount} unlinked note${orphanCount === 1 ? '' : 's'} highlighted`
                : suggestionsLoading
                  ? 'Finding suggested links…'
                  : suggestedPairs.length === 0
                    ? 'No suggested links found'
                    : `${suggestedPairs.length} suggested link${suggestedPairs.length === 1 ? '' : 's'} — click one to connect`}
            </span>
            <button type="button" className={styles.chipBtn} onClick={() => setGraphSpotlight(null)}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Bottom-left stack: group legend, then the right-click hint (graph mode only) */}
      <div className={styles.corner}>
        {legendGroups.length > 0 && (
          <ul className={`${styles.legend} ${styles.legendScroll}`} aria-label="Group colours">
            {legendGroups.map((g) => (
              <li key={g.id}>
                <span className={styles.legendSwatch} style={{ background: g.color }} aria-hidden="true" />
                {g.label}
              </li>
            ))}
          </ul>
        )}
        {highlightStructure && (
          <ul className={styles.legend} aria-label="Highlighted notes">
            <li>
              <span className={`${styles.legendSwatch} ${styles.swatchSm}`} style={{ background: ORPHAN_COLOR }} aria-hidden="true" />
              Unlinked: no links
            </li>
            <li>
              <span className={`${styles.legendSwatch} ${styles.swatchLg}`} style={{ background: HUB_COLOR }} aria-hidden="true" />
              {`Well-linked: ${HUB_DEGREE}+ links`}
            </li>
          </ul>
        )}
        {viewMode !== 'list' && <div className={styles.hint}>Right-click a note for more</div>}
      </div>

      {filterActive && (
        <div className={styles.filterChip} role="status">
          <span>{`Filtered · ${shownCount} of ${scopedNodes.length} notes`}</span>
          <button type="button" onClick={clearFilters}>
            Clear
          </button>
        </div>
      )}

      {viewMode === 'list' && (
        <GraphListView
          nodes={forceData.nodes as any}
          links={forceData.links as any}
          onOpen={(id) => selectNode(id)}
          onCreate={(t) => void createFromPseudo(t)}
          onMenu={(id, x, y) => {
            setConnectingFrom(null)
            setContextMenu({ nodeId: id, x, y })
          }}
          vaultEmpty={scopedNodes.length === 0}
          noun={scopeIds ? scopeNoun : 'vault'}
          onClearFilters={clearFilters}
          onNewNote={canCreateHere ? () => void createBlank() : undefined}
          header={
            pathFrom ? (
              <div className={styles.connectPicker}>
                <span>{`Path from “${graphData.nodes.find((n) => n.id === pathFrom)?.title || 'Untitled'}” to:`}</span>
                <JumpToNote
                  nodes={scopedNodes.filter((n) => n.id !== pathFrom)}
                  idPrefix="graph-path"
                  placeholder="Search for a note…"
                  label="Note to find a path to"
                  autoFocus
                  onJump={(id) => completePath(pathFrom, id)}
                />
                <button type="button" onClick={() => setPathFrom(null)}>
                  Cancel
                </button>
              </div>
            ) : pickFrom && pickSource ? (
              <div className={styles.connectPicker}>
                <span>{`Link “${pickSource.title || 'Untitled'}” to:`}</span>
                <JumpToNote
                  nodes={scopedNodes.filter((n) => n.id !== pickFrom)}
                  idPrefix="graph-connect"
                  placeholder="Search for a note…"
                  label="Note to link to"
                  autoFocus
                  onJump={(id) => {
                    setPickFrom(null)
                    void connect(pickFrom, id)
                  }}
                />
                <button type="button" onClick={() => setPickFrom(null)}>
                  Cancel
                </button>
              </div>
            ) : null
          }
        />
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={forceData}
        nodeLabel={(n: any) => {
          // Raw HTML: escape the title, and never show note body (screen-share safe).
          const title = escapeHtml(n.title ?? '')
          const deg = degrees.get(n.id) ?? 0
          const sub = n.isPseudo ? 'Click to create this note' : `${deg} link${deg === 1 ? '' : 's'}`
          return `<div style="background:var(--surface);padding:6px 10px;border-radius:6px;border:1px ${n.isPseudo ? 'dashed' : 'solid'} var(--border-control);color:var(--text-1);max-width:260px;font-family:var(--font-body);font-size:0.8rem;"><strong>${title}</strong><br/><span style="color:var(--text-3)">${sub}</span></div>`
        }}
        onNodeHover={(node: any) => setHoverNodeId(node ? node.id : null)}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeDragEnd={handleNodeDragEnd}
        onBackgroundClick={() => {
          setContextMenu(null)
          if (connectingFrom) {
            setConnectingFrom(null)
            return
          }
          // A suggestion line is painted over empty canvas, so its click arrives
          // here. Hit-test before falling through to "clear the focus".
          const p = pointerRef.current
          if (spotlight === 'suggested' && p) {
            const hit = nearestPair(
              suggestedPairs,
              (id) => {
                const n = nodeCacheStore.get(id)
                return n && Number.isFinite(n.x) && Number.isFinite(n.y) ? { x: n.x, y: n.y } : undefined
              },
              p,
              SUGGEST_HIT_RADIUS,
            )
            if (hit) {
              void promptConnect(hit)
              return
            }
          }
          setFocusNodeId(null)
        }}
        onBackgroundRightClick={(e: MouseEvent) => {
          e.preventDefault?.()
          setContextMenu(null)
          setConnectingFrom(null)
        }}
        onRenderFramePost={(ctx, globalScale) => {
          // Suggested links: dashed strokes between notes that aren't linked yet.
          if (spotlightRef.current === 'suggested') {
            ctx.save()
            ctx.strokeStyle = SUGGEST_COLOR
            ctx.lineWidth = 1.2 / globalScale
            ctx.setLineDash([6 / globalScale, 5 / globalScale])
            for (const pair of suggestedPairsRef.current) {
              const a = nodeCacheStore.get(pair.a)
              const b = nodeCacheStore.get(pair.b)
              // Same unplaced-node caveat as the halo: NaN coords would pass a
              // null check and paint nothing useful.
              if (!a || !b) continue
              if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue
              if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
            ctx.restore()
          }

          // Rubber-band line from the connect source to the cursor.
          const from = connectingFromRef.current
          if (!from) return
          const src = nodeCacheStore.get(from)
          const p = pointerRef.current
          if (!src || src.x == null || !p) return
          ctx.save()
          ctx.strokeStyle = CONNECT_COLOR
          ctx.lineWidth = 1.5 / globalScale
          ctx.setLineDash([5 / globalScale, 4 / globalScale])
          ctx.beginPath()
          ctx.moveTo(src.x, src.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.restore()
        }}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.title || 'Untitled'
          const text = label.length > 32 ? `${label.slice(0, 31)}…` : label
          const fontSize = 12 / globalScale
          ctx.font = `${fontSize}px ${graphFont}`

          // Pseudo-node (unresolved wikilink): a faded, dashed-outline dot with
          // a muted label, standing in for a note that doesn't exist yet.
          if (node.isPseudo) {
            const radius = nodeRadius(node)
            const dim = dimFor(node.id)
            ctx.save()
            ctx.globalAlpha = (hoverNodeId === node.id ? 1 : 0.9) * dim
            ctx.beginPath()
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
            ctx.fillStyle = PSEUDO_FILL
            ctx.fill()
            ctx.setLineDash([3 / globalScale, 2 / globalScale])
            ctx.lineWidth = 1.5 / globalScale
            ctx.strokeStyle = PSEUDO_COLOR
            ctx.stroke()
            ctx.setLineDash([])
            const labelAlpha = Math.max(0, Math.min(1, (globalScale - textFade) * 2.5))
            if (labelAlpha > 0.01) {
              ctx.globalAlpha = labelAlpha * (hoverNodeId === node.id ? 1 : 0.85) * dim
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = PSEUDO_COLOR
              drawLabel(ctx, text, node.x, node.y + radius + 3, globalScale, canvasBg)
            }
            ctx.restore()
            return
          }

          const deg = degrees.get(node.id) ?? 0
          const isHub = highlightStructure && deg >= HUB_DEGREE
          const isOrphan = highlightStructure && deg === 0
          const isConnectSource = node.id === connectingFrom
          const isFocus = node.id === focusNodeId

          const radius = nodeRadius(node)
          const dim = dimFor(node.id)
          ctx.save()
          ctx.globalAlpha = dim

          // Fill: group color → structural highlight → focus → connect-source override.
          const gColor = groupColors.get(node.id) ?? null
          let fill = gColor ?? DEFAULT_NODE_COLOR
          if (highlightStructure) {
            if (isOrphan) fill = ORPHAN_COLOR
            else if (isHub && !gColor) fill = HUB_COLOR
          }
          if (isFocus || (pathSet && pathSet.has(node.id))) fill = FOCUS_COLOR
          if (isConnectSource) fill = CONNECT_COLOR

          // Orphan spotlight: a breathing gradient halo behind unlinked notes.
          // Independent of `highlightStructure` so the two never fight over fill.
          // A node the simulation hasn't placed yet has undefined/NaN coords.
          // ctx.arc tolerates that (it just draws nothing), but
          // createRadialGradient throws on a non-finite value — which took the
          // whole view down through the error boundary. Skip the halo instead.
          if (spotlightRef.current === 'orphans' && deg === 0 && Number.isFinite(node.x) && Number.isFinite(node.y)) {
            const pulse = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(Date.now() / 450)
            const haloR = radius * ORPHAN_HALO_SCALE
            const halo = ctx.createRadialGradient(node.x, node.y, radius * 0.6, node.x, node.y, haloR)
            halo.addColorStop(0, resolveColor(ORPHAN_COLOR, 0.55 * pulse) ?? ORPHAN_COLOR)
            halo.addColorStop(1, resolveColor(ORPHAN_COLOR, 0) ?? 'transparent')
            ctx.beginPath()
            ctx.arc(node.x, node.y, haloR, 0, 2 * Math.PI, false)
            ctx.fillStyle = halo
            ctx.fill()
          }

          ctx.beginPath()
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
          ctx.fillStyle = fill
          ctx.fill()

          if (hoverNodeId === node.id || isConnectSource || isHub || isOrphan) {
            ctx.strokeStyle = isConnectSource ? CONNECT_COLOR : isOrphan ? ORPHAN_COLOR : LABEL_COLOR
            ctx.lineWidth = (isConnectSource || isHub ? 2 : 1) / globalScale
            ctx.stroke()
          }

          // Labels fade out as you zoom past the text-fade threshold.
          const labelAlpha = Math.max(0, Math.min(1, (globalScale - textFade) * 2.5))
          if (labelAlpha > 0.01) {
            ctx.save()
            ctx.globalAlpha = labelAlpha * dim
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = isFocus ? LABEL_COLOR : LABEL_DIM_COLOR
            drawLabel(ctx, text, node.x, node.y + radius + 3, globalScale, canvasBg)
            ctx.restore()
          }
          ctx.restore()
        }}
        nodePointerAreaPaint={(node: any, color, ctx, globalScale) => {
          ctx.fillStyle = color
          ctx.beginPath()
          // At least ~6 screen px, so small dots stay clickable when zoomed out.
          ctx.arc(node.x, node.y, Math.max(nodeRadius(node), 6 / globalScale), 0, 2 * Math.PI, false)
          ctx.fill()
        }}
        // No tick cap: the layout eases out until alpha reaches alphaMin, instead of
        // freezing mid-motion. With motion on, alphaMin 0 keeps the engine (and the
        // float force) running while the layout forces still decay to rest.
        cooldownTime={perpetualMotion ? Infinity : 15000}
        d3AlphaMin={perpetualMotion ? 0 : 0.001}
        onZoomEnd={() => {
          // Remember where the user is looking (zoom + graph-space center) so we
          // can restore it after a view switch. Stored in graph coords so it's
          // robust to the layout re-settling.
          const fg = fgRef.current
          const el = containerRef.current
          if (!fg || !el) return
          try {
            const c = fg.screen2GraphCoords(el.clientWidth / 2, el.clientHeight / 2)
            savedViewports.set(instanceKey, { k: fg.zoom(), x: c.x, y: c.y })
          } catch {
            /* graph not ready yet */
          }
        }}
        linkColor={linkColorFor}
        linkWidth={(l: any) => (isPathLink(l) ? Math.max(linkThickness * 2.5, 3) : linkThickness)}
        linkDirectionalArrowLength={directed ? 4 : 0}
        linkDirectionalArrowRelPos={1}
        backgroundColor={rippleBackground ? 'rgba(0,0,0,0)' : canvasBg}
      />

      {/* Settings panel (top-right). Hidden while the note panel is open. */}
      {!focusedNoteForPanel &&
        (showPanel ? (
          <GraphSettingsPanel
            openSections={openSections}
            onToggleSection={toggleSection}
            onResetAll={confirmResetAll}
            onClose={closeSettings}
            focusOnMount={focusPanelRef.current}
            filterText={filterText}
            setFilterText={setFilterText}
            datePreset={datePreset}
            setDatePreset={setDatePreset}
            orphansOnly={orphansOnly}
            setOrphansOnly={setOrphansOnly}
            tags={allTags}
            filterTags={filterTags}
            onToggleTag={toggleFilterTag}
            filterActive={filterActive}
            onClearFilters={clearFilters}
            shownCount={shownCount}
            totalCount={scopedNodes.length}
            groups={groups}
            onAddGroup={addGroup}
            onUpdateGroup={updateGroup}
            onRemoveGroup={removeGroup}
            neighbourhoodOnly={neighbourhoodOnly}
            setNeighbourhoodOnly={setNeighbourhoodOnly}
            depth={depth}
            setDepth={setDepth}
            directed={directed}
            setDirected={setDirected}
            highlightStructure={highlightStructure}
            setHighlightStructure={setHighlightStructure}
            pinOnDrag={pinOnDrag}
            onTogglePin={togglePin}
            textFade={textFade}
            setTextFade={setTextFade}
            nodeSize={nodeSize}
            setNodeSize={setNodeSize}
            linkThickness={linkThickness}
            setLinkThickness={setLinkThickness}
            perpetualMotion={perpetualMotion}
            setPerpetualMotion={setPerpetualMotion}
            rippleBackground={rippleBackground}
            setRippleBackground={setRippleBackground}
            forces={forces}
            onForcesChange={setGraphForces}
            onResetForces={resetForces}
            onApplyPreset={applyPreset}
            onRerunLayout={rerunLayout}
          />
        ) : (
          <button ref={openBtnRef} type="button" className={styles.openPanelBtn} onClick={() => { focusPanelRef.current = true; setShowPanel(true) }} title={filterActive ? 'Graph settings (filters active)' : 'Graph settings'} aria-label={filterActive ? 'Graph settings (filters active)' : 'Graph settings'}>
            <SlidersHorizontal size={16} />
            {filterActive && <span className={styles.filterDot} aria-hidden="true" />}
          </button>
        ))}

      {/* Right-click context menu (shared menu: portaled, clamped, full keyboard model) */}
      {contextMenu && menuNode && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={menuItems(contextMenu.nodeId)}
        />
      )}

      {focusedNoteForPanel && (
        <div className={styles.notePanel}>
          <div className={styles.noteHead}>
            <button type="button" className={styles.noteClose} onClick={() => setFocusNodeId(null)} title="Close note" aria-label="Close note">
              <X size={15} />
            </button>
          </div>
          <NoteItem note={focusedNoteForPanel} onUpdate={handleUpdateNote} onRemove={handleRemoveNote} />
        </div>
      )}
    </div>
  )
}
