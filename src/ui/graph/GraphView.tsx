// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/ui/graph/GraphView.tsx
import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Link2, Plus, RotateCcw, SlidersHorizontal, Unlink, X } from 'lucide-react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { ask } from '@tauri-apps/plugin-dialog'
import { useGraph } from '../../hooks/useGraph'
import { useViewState } from '../../hooks/useViewState'
import { useGraphForces, setGraphForces, DEFAULT_GRAPH_FORCES } from '../../hooks/useGraphForces'
import { NoteItem } from '../editor/NoteItem'
import { isAutoTag } from '../../core/tags'
import { extractWikilinkTitles, normalizeTitle, pseudoNodeId } from '../../core/markdown/wikilinks'
import { noteLinkText } from '../../lib/noteTypes'
import { showChoiceDialog } from '../../lib/dialog'
import { setGraphSpotlight, useGraphSpotlight } from '../../lib/graphSpotlight'
import { useSuggestedPairs } from '../../lib/suggestedLinks'
import { nearestPair, type SuggestedPair } from '../../core/graph/suggestedLinks'
import { useDashboardPrefs } from '../../views/home/dashboard/useDashboardPrefs'
import { toast } from '../../lib/toast'
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

// Stable palette used to seed new group colors and the filter tag chips.
const TAG_PALETTE = [
  '#7c6af7', '#3fb950', '#e3b341', '#3ba7f7', '#f778ba', '#a371f7',
  '#56d4bc', '#ff8c42', '#d29922', '#6cb6ff', '#e5484d', '#8bd450',
]

// Structural / label colors — re-themed live off design tokens on the same
// `theme:changed` beat as the accent bindings below (readGraphColors reads them
// from :root). Seeded with the dark-theme values so the first paint (before any
// theme resolves) matches.
let DEFAULT_NODE_COLOR = '#55535f' // --text-3
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

function readGraphColors(): void {
  const cs = getComputedStyle(document.documentElement)
  const g = (k: string) => cs.getPropertyValue(k).trim()
  const accent = g('--accent')
  if (accent) {
    HUB_COLOR = accent
    FOCUS_COLOR = accent
    LINK_COLOR = resolveColor(accent, 0.4) ?? accent
  }
  DEFAULT_NODE_COLOR = g('--text-3') || DEFAULT_NODE_COLOR
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
function makeRadialForce(initial: number) {
  let nodes: any[] = []
  let strength = initial
  const force = (alpha: number) => {
    const k = strength * alpha
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

// Gentle perpetual-motion force (Display → Keep nodes moving). Each tick it nudges
// every node with a tiny random impulse. It's alpha-INDEPENDENT so the wiggle
// persists after the layout settles; the existing charge/link/centre forces (run
// with d3AlphaDecay=0, so they stay at full strength) net to ~zero at equilibrium
// and gently restore each nudge, giving a bounded living-graph wiggle instead of a
// random walk. Pinned nodes (fx/fy set) ignore velocity, so they stay put.
const WIGGLE_STRENGTH = 0.45
function makeWiggleForce(strength: number) {
  let nodes: any[] = []
  const force = () => {
    for (const n of nodes) {
      n.vx = (n.vx || 0) + (Math.random() - 0.5) * strength
      n.vy = (n.vy || 0) + (Math.random() - 0.5) * strength
    }
  }
  force.initialize = (n: any[]) => {
    nodes = n
  }
  return force
}

type DatePreset = 'all' | 'week' | 'month' | 'year'
type SectionKey = 'filters' | 'groups' | 'display' | 'forces'

interface Group {
  id: string
  query: string
  color: string
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

const presetBtnStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-1)',
  fontSize: '0.75rem',
  padding: '0.4rem 0.5rem',
  cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-1)',
  padding: '0.45rem 0.6rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.82rem',
  outline: 'none',
}

// ── Small reusable panel pieces ───────────────────────────

/** A collapsible accordion section with a chevron header and optional right slot. */
function Section({
  title,
  open,
  onToggle,
  right,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: 1,
            textAlign: 'left',
            background: 'none',
            border: 'none',
            color: 'var(--text-1)',
            fontSize: '0.875rem',
            fontWeight: 600,
            padding: '0.7rem 0.1rem',
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden
            style={{ display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', fontSize: '0.8rem', color: 'var(--text-2)' }}
          >
            ›
          </span>
          {title}
        </button>
        {right}
      </div>
      {open && <div style={{ padding: '0 0.1rem 0.9rem' }}>{children}</div>}
    </div>
  )
}

/** A label + iOS-style switch row. */
function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  title?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0' }} title={title}>
      <span style={{ fontSize: '0.84rem', color: 'var(--text-1)' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        aria-label={label}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: 'var(--on-accent)',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )
}

/** A labeled range slider with a live value and optional hint / hover tip. */
function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  tip,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  hint?: string
  tip?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '0.35rem 0' }} title={tip}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: '0.84rem', color: 'var(--text-1)' }}>{label}</label>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      {hint && <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', lineHeight: 1.35 }}>{hint}</span>}
    </div>
  )
}

/** A color swatch + label row for the hub/orphan mini-legend. */
function LegendRow({ color, size = 10, label }: { color: string; size?: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', lineHeight: 1.6, fontSize: '0.75rem', color: 'var(--text-2)' }}>
      <span style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  )
}

/** Compact search box that focuses a matching node (replaces the old big card). */
function JumpToNote({
  nodes,
  onJump,
}: {
  nodes: { id: string; title: string; content: string }[]
  onJump: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return nodes
      .filter((n) => (n.title || '').toLowerCase().includes(s) || (n.content || '').toLowerCase().includes(s))
      .slice(0, 8)
  }, [q, nodes])

  return (
    <div style={{ width: '240px', position: 'relative' }}>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Jump to a note…"
        aria-label="Jump to a note"
        style={{
          ...inputStyle,
          width: '100%',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-md)',
        }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {matches.map((m) => (
            <button
              key={m.id}
              // onMouseDown fires before the input's onBlur closes the list.
              onMouseDown={() => {
                onJump(m.id)
                setQ('')
                setOpen(false)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-1)',
                fontSize: '0.82rem',
                padding: '0.5rem 0.6rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {m.title || 'Untitled'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function GraphView({ onUpdate, onRemove, onCreate, scopeIds, scopeNoun = 'workspace', instanceKey = 'main' }: Props) {
  const { graphData, loading } = useGraph()

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

  // Connect-to-node: chosen from a node's right-click menu. While set, a
  // rubber-band line follows the cursor and the next node clicked is linked.
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)

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
  const [showPanel, setShowPanel] = useViewState('graph.showPanel', true)
  const [openSections, setOpenSections] = useViewState<Record<SectionKey, boolean>>('graph.openSections', {
    filters: false,
    groups: false,
    display: false,
    forces: false,
  })

  // Filters.
  const [filterText, setFilterText] = useViewState('graph.filterText', '')
  const [filterTags, setFilterTags] = useViewState<Set<string>>('graph.filterTags', () => new Set())
  const [datePreset, setDatePreset] = useViewState<DatePreset>('graph.datePreset', 'all')
  const [orphansOnly, setOrphansOnly] = useViewState('graph.orphansOnly', false)

  // Groups (color categories of notes).
  const [groups, setGroups] = useViewState<Group[]>('graph.groups', [])

  // Display.
  const [directed, setDirected] = useViewState('graph.directed', false)
  const [highlightStructure, setHighlightStructure] = useViewState('graph.highlightStructure', false)
  const [pinOnDrag, setPinOnDrag] = useViewState('graph.pinOnDrag', true)
  const [textFade, setTextFade] = useViewState('graph.textFade', DEFAULT_DISPLAY.textFade)
  const [nodeSize, setNodeSize] = useViewState('graph.nodeSize', DEFAULT_DISPLAY.nodeSize)
  const [linkThickness, setLinkThickness] = useViewState('graph.linkThickness', DEFAULT_DISPLAY.linkThickness)
  // Optional ambience: keep nodes gently drifting, and a rippling accent glow behind the graph.
  const [perpetualMotion, setPerpetualMotion] = useViewState('graph.perpetualMotion', false)
  const [rippleBackground, setRippleBackground] = useViewState('graph.rippleBackground', false)
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
  const centerForce = forces.center
  const repelForce = forces.repel
  const linkForce = forces.link
  const linkDistance = forces.distance
  const setCenterForce = (v: number) => setGraphForces({ center: v })
  const setRepelForce = (v: number) => setGraphForces({ repel: v })
  const setLinkForce = (v: number) => setGraphForces({ link: v })
  const setLinkDistance = (v: number) => setGraphForces({ distance: v })

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

  // Esc cancels a pending connection and closes the context menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectingFrom(null)
        setContextMenu(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  // Every user tag present (auto-tags like has:* excluded), sorted, with a color
  // — used to style the filter tag chips.
  // Scoped, not global: a chip for a tag that only exists in another vault (or
  // outside this workspace) filters the graph down to nothing.
  const tagColors = useMemo(() => {
    const tags = new Set<string>()
    scopedNodes.forEach((n) =>
      (n.tags ?? []).forEach((t) => {
        if (!isAutoTag(t)) tags.add(t)
      }),
    )
    const map = new Map<string, string>()
    ;[...tags].sort().forEach((t, i) => map.set(t, TAG_PALETTE[i % TAG_PALETTE.length]))
    return map
  }, [scopedNodes])

  // A tag selected before a vault/workspace switch may not exist here. Its chip
  // is gone with the scoping above, so honouring it would blank the graph with
  // no way to clear it — ignore it while out of scope, keep it for the trip back.
  const activeFilterTags = useMemo(
    () => new Set([...filterTags].filter((t) => tagColors.has(t))),
    [filterTags, tagColors],
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

  // Color a node by the first group whose query it matches. `#tag` / `tag:` match
  // by tag; anything else matches the note's title (filename).
  const groupColorFor = useCallback(
    (node: any): string | null => {
      for (const g of groups) {
        const q = g.query.trim().toLowerCase()
        if (!q) continue
        if (q.startsWith('#') || q.startsWith('tag:')) {
          const tag = q.replace(/^tag:/, '').replace(/^#/, '').trim()
          if (tag && (node.tags ?? []).some((t: string) => t.toLowerCase().includes(tag))) return g.color
        } else if ((node.title || '').toLowerCase().includes(q)) {
          return g.color
        }
      }
      return null
    },
    [groups],
  )

  // Memoize so the force simulation only restarts when data actually changes,
  // not on every hover/focus state update.
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
    const visibleNodes = focusNodeId
      ? (() => {
          const neighbors = new Set<string>([focusNodeId])
          graphData.edges.forEach((e) => {
            if (e.source === focusNodeId) neighbors.add(e.target)
            if (e.target === focusNodeId) neighbors.add(e.source)
          })
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
    focusNodeId,
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

  // Apply the tunable forces to the d3 simulation, then reheat so changes take
  // effect. Re-runs when a slider moves or the visible data changes (force-graph
  // rebuilds its forces on data change, so we must re-assert ours).
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return

    // Repel: a more negative charge makes notes push each other further apart.
    const charge = fg.d3Force('charge')
    if (charge && typeof charge.strength === 'function') charge.strength(-repelForce)

    // Link: strength = rubber-band tightness; distance = preferred length.
    const link = fg.d3Force('link')
    if (link) {
      if (typeof link.strength === 'function') link.strength(linkForce)
      if (typeof link.distance === 'function') link.distance(linkDistance)
    }

    // Center: an inward pull toward the origin that compacts the graph. Installed
    // once (force-graph keeps it across data changes), then updated in place.
    const existing = fg.d3Force('centerPull') as any
    if (existing && typeof existing.strength === 'function') {
      existing.strength(centerForce)
    } else {
      fg.d3Force('centerPull', makeRadialForce(centerForce))
    }

    fg.d3ReheatSimulation()
  }, [centerForce, repelForce, linkForce, linkDistance, forceData])

  // Perpetual motion: register/remove the wiggle force and reheat so nodes either
  // start drifting forever (cooldown props are lifted to Infinity below) or settle
  // and stop. Re-applied on forceData changes so a data swap keeps the force.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.d3Force('wiggle', perpetualMotion ? (makeWiggleForce(WIGGLE_STRENGTH) as any) : null)
    fg.d3ReheatSimulation()
  }, [perpetualMotion, forceData])

  // ── Link editing ────────────────────────────────────────

  // Append [[target title]] to the source note's content. That's what makes the
  // edge durable (a raw link row would be wiped on the source's next save, when
  // links are recomputed from content).
  const connect = useCallback(
    (sourceId: string, targetId: string) => {
      const source = graphData.nodes.find((n) => n.id === sourceId)
      const target = graphData.nodes.find((n) => n.id === targetId)
      const targetTitle = target?.title?.trim()
      if (source && targetTitle) {
        const wl = `[[${targetTitle}]]`
        if (!source.content.includes(wl)) {
          void onUpdate(source.id, source.title, `${source.content.trimEnd()}\n\n${wl}\n`).catch(
            (err) => console.error('Failed to connect notes:', err),
          )
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
    (nodeId: string) => {
      const node = graphData.nodes.find((n) => n.id === nodeId)
      if (!node) return
      const tasks: Promise<unknown>[] = []

      // Outgoing: strip [[target]] for each link this note owns.
      let newContent = node.content
      graphData.edges
        .filter((e) => e.source === nodeId)
        .forEach((e) => {
          const t = graphData.nodes.find((n) => n.id === e.target)
          if (t?.title) newContent = stripWikilink(newContent, t.title)
        })
      if (newContent !== node.content) {
        tasks.push(onUpdate(node.id, node.title, newContent))
      }

      // Incoming: strip [[this title]] from each note that links here.
      const thisTitle = node.title?.trim()
      if (thisTitle) {
        graphData.edges
          .filter((e) => e.target === nodeId)
          .forEach((e) => {
            const s = graphData.nodes.find((n) => n.id === e.source)
            if (!s) return
            const stripped = stripWikilink(s.content, thisTitle)
            if (stripped !== s.content) tasks.push(onUpdate(s.id, s.title, stripped))
          })
      }

      Promise.all(tasks).catch((err) => console.error('Failed to disconnect node:', err))
    },
    [graphData.nodes, graphData.edges, onUpdate],
  )

  // Materialize a pseudo-node: create the note for its title (useNotes then
  // re-syncs the notes already referencing it, so their edges resolve at once).
  const createFromPseudo = useCallback(
    async (title: string) => {
      const name = title.trim()
      if (!name) return
      const ok = await ask(`Create note “${name}”?`, { title: 'Create note', kind: 'info' })
      if (!ok) return
      try {
        // useNotes re-syncs the notes already linking to this title on save, so
        // their edges to the new note appear without any work here.
        const created = await onCreate(name, '')
        setFocusNodeId(created.id)
      } catch (err) {
        console.error('Failed to create note from pseudo-node:', err)
        toast.error('Could not create the note.')
      }
    },
    [onCreate],
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
      if (choice === 'a-b' || choice === 'both') connect(pair.a, pair.b)
      if (choice === 'b-a' || choice === 'both') connect(pair.b, pair.a)
    },
    [graphData.nodes, connect],
  )

  const handleNodeClick = useCallback(
    (node: any) => {
      // A faded pseudo-node → offer to create the real note.
      if (node.isPseudo) {
        void createFromPseudo(node.title)
        return
      }

      // Completing a connection started from the context menu.
      if (connectingFrom) {
        if (node.id !== connectingFrom) connect(connectingFrom, node.id)
        setConnectingFrom(null)
        return
      }

      if (focusNodeId === node.id) {
        setFocusNodeId(null)
      } else {
        setFocusNodeId(node.id)
        if (fgRef.current) {
          fgRef.current.centerAt(node.x, node.y, 800)
          fgRef.current.zoom(4, 800)
        }
      }
    },
    [connectingFrom, connect, focusNodeId, createFromPseudo],
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
      { id: crypto.randomUUID(), query: '', color: TAG_PALETTE[prev.length % TAG_PALETTE.length] },
    ])
  }, [])
  const updateGroup = useCallback((id: string, patch: Partial<Group>) => {
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

  const animate = useCallback(() => {
    fgRef.current?.d3ReheatSimulation?.()
    ;(fgRef.current as any)?.zoomToFit?.(700, 50)
  }, [])

  const resetAllSettings = useCallback(() => {
    clearFilters()
    setGroups([])
    setDirected(false)
    setHighlightStructure(false)
    togglePin(true)
    setTextFade(DEFAULT_DISPLAY.textFade)
    setNodeSize(DEFAULT_DISPLAY.nodeSize)
    setLinkThickness(DEFAULT_DISPLAY.linkThickness)
    setPerpetualMotion(false)
    setRippleBackground(false)
    resetForces()
  }, [clearFilters, togglePin, resetForces, setPerpetualMotion, setRippleBackground])

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

  const menuNode = contextMenu ? graphData.nodes.find((n) => n.id === contextMenu.nodeId) : null
  const iconBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-2)',
    cursor: 'pointer',
    fontSize: '0.95rem',
    lineHeight: 1,
    padding: '4px 6px',
    borderRadius: '6px',
  }

  if (loading) {
    return <div className="note-empty">Loading graph…</div>
  }

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Optional glowing backdrop — first child so it paints under the (transparent) graph canvas. */}
      {rippleBackground && <div className={styles.rippleBg} aria-hidden="true" />}
      {scopedNodes.length === 0 && (
        <div className="note-empty" style={{ position: 'absolute', width: '100%', zIndex: 10 }}>
          {scopeIds
            ? `No notes in this ${scopeNoun} yet. Add or create some, then link them with [[Title]]!`
            : 'No notes to graph. Create some notes and link them using [[Title]]!'}
        </div>
      )}

      {/* Compact jump-to-note search (top-left) */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 20 }}>
        <JumpToNote
          nodes={scopedNodes}
          onJump={(id) => {
            if (scopedNodes.some((n) => n.id === id)) setFocusNodeId(id)
          }}
        />
      </div>

      {/* Connecting hint banner (top-center) */}
      {connectingFrom && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: CONNECT_COLOR,
            color: 'var(--on-accent)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.45rem 0.9rem',
            fontSize: '0.8rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          Click a target note to link it — or press Esc to cancel
        </div>
      )}

      {/* Spotlight chip (top-center): what the dashboard asked us to highlight. */}
      {spotlight && !connectingFrom && (
        <div className={styles.spotlightChip}>
          <span>
            {spotlight === 'orphans'
              ? `${orphanCount} orphan${orphanCount === 1 ? '' : 's'} highlighted`
              : suggestionsLoading
                ? 'Finding suggested links…'
                : suggestedPairs.length === 0
                  ? 'No suggested links found'
                  : `${suggestedPairs.length} suggested link${suggestedPairs.length === 1 ? '' : 's'} — click one to connect`}
          </span>
          <button type="button" onClick={() => setGraphSpotlight(null)} title="Dismiss">
            Dismiss
          </button>
        </div>
      )}

      {/* Right-click hint (bottom-left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '20px',
          zIndex: 20,
          fontSize: '0.72rem',
          color: 'var(--text-3)',
          pointerEvents: 'none',
        }}
      >
        Right-click a note for connect / disconnect / delete
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={forceData}
        nodeLabel={(n: any) => {
          if (n.isPseudo) {
            const title = escapeHtml(n.title ?? '')
            return `<div style="background:var(--surface);padding:8px;border-radius:6px;border:1px dashed var(--border);color:var(--text-2);max-width:300px;font-family:var(--font-body);font-size:13px;"><strong>${title}</strong><br/><span style="color:var(--text-3)">Click to create this note</span></div>`
          }
          const preview =
            n.content.substring(0, 100).replace(/\n/g, ' ') + (n.content.length > 100 ? '…' : '')
          // nodeLabel is rendered as raw HTML — escape note-derived text to
          // prevent markup in a title/content from injecting into the tooltip.
          const title = escapeHtml(n.title ?? '')
          const safePreview = escapeHtml(preview)
          return `<div style="background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-1);max-width:300px;font-family:var(--font-body);font-size:13px;"><strong>${title}</strong><br/><span style="color:var(--text-2)">${safePreview}</span></div>`
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
          const fontSize = 12 / globalScale
          ctx.font = `${fontSize}px var(--font-body), Sans-Serif`

          // Pseudo-node (unresolved wikilink): a faded, dashed-outline dot with
          // a muted label, standing in for a note that doesn't exist yet.
          if (node.isPseudo) {
            const radius = 5 * nodeSize
            ctx.save()
            ctx.globalAlpha = hoverNodeId === node.id ? 0.7 : 0.4
            ctx.beginPath()
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
            ctx.fillStyle = PSEUDO_FILL
            ctx.fill()
            ctx.setLineDash([3 / globalScale, 2 / globalScale])
            ctx.lineWidth = 1 / globalScale
            ctx.strokeStyle = PSEUDO_COLOR
            ctx.stroke()
            ctx.setLineDash([])
            const labelAlpha = Math.max(0, Math.min(1, (globalScale - textFade) * 2.5))
            if (labelAlpha > 0.01) {
              ctx.globalAlpha = labelAlpha * (hoverNodeId === node.id ? 0.9 : 0.55)
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = PSEUDO_COLOR
              ctx.fillText(label, node.x, node.y + radius + 3)
            }
            ctx.restore()
            return
          }

          const deg = degrees.get(node.id) ?? 0
          const isHub = highlightStructure && deg >= HUB_DEGREE
          const isOrphan = highlightStructure && deg === 0
          const isConnectSource = node.id === connectingFrom
          const isFocus = node.id === focusNodeId

          const baseRadius = isHub ? 8 : isOrphan ? 4 : 5
          const radius = baseRadius * nodeSize

          // Fill: group color → structural highlight → focus → connect-source override.
          const gColor = groupColorFor(node)
          let fill = gColor ?? DEFAULT_NODE_COLOR
          if (highlightStructure) {
            if (isOrphan) fill = ORPHAN_COLOR
            else if (isHub && !gColor) fill = HUB_COLOR
          }
          if (isFocus) fill = FOCUS_COLOR
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
            ctx.globalAlpha = labelAlpha
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = isFocus ? LABEL_COLOR : LABEL_DIM_COLOR
            ctx.fillText(label, node.x, node.y + radius + 3)
            ctx.restore()
          }
        }}
        cooldownTicks={perpetualMotion ? Infinity : 100}
        cooldownTime={perpetualMotion ? Infinity : 15000}
        d3AlphaDecay={perpetualMotion ? 0 : 0.0228}
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
        onEngineStop={() => {
          // Once the layout settles on (re)mount, jump back to the saved viewport.
          const vp = savedViewports.get(instanceKey)
          if (viewportRestored.current || !vp) return
          viewportRestored.current = true
          const fg = fgRef.current
          if (!fg) return
          fg.zoom(vp.k, 0)
          fg.centerAt(vp.x, vp.y, 0)
        }}
        linkColor={() => LINK_COLOR}
        linkWidth={linkThickness}
        linkDirectionalArrowLength={directed ? 4 : 0}
        linkDirectionalArrowRelPos={1}
        backgroundColor={rippleBackground ? 'rgba(0,0,0,0)' : canvasBg}
      />

      {/* Settings panel (top-right). Hidden while the note panel is open. */}
      {!focusedNoteForPanel &&
        (showPanel ? (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '290px',
              maxHeight: 'calc(100% - 40px)',
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 20,
              padding: '0.2rem 0.9rem',
            }}
          >
            {/* Filters */}
            <Section
              title="Filters"
              open={openSections.filters}
              onToggle={() => toggleSection('filters')}
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button onClick={resetAllSettings} title="Reset all graph settings" aria-label="Reset all graph settings" style={iconBtnStyle}>
                    <RotateCcw size={15} />
                  </button>
                  <button onClick={() => setShowPanel(false)} title="Close settings" aria-label="Close settings" style={iconBtnStyle}>
                    <X size={15} />
                  </button>
                </div>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <input
                  type="search"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter by text in title, body or tags…"
                  style={{ ...inputStyle, width: '100%' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                  Updated
                  <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                    style={{ ...inputStyle, flex: 1, padding: '0.4rem 0.5rem' }}
                  >
                    <option value="all">any time</option>
                    <option value="week">in the past week</option>
                    <option value="month">in the past month</option>
                    <option value="year">in the past year</option>
                  </select>
                </label>
                <Toggle label="Orphans only" checked={orphansOnly} onChange={setOrphansOnly} title="Show only notes with no links" />

                {tagColors.size > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.4rem' }}>Tags</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {[...tagColors.keys()].map((tag) => {
                        const on = filterTags.has(tag)
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleFilterTag(tag)}
                            style={{
                              background: on ? (tagColors.get(tag) as string) : 'transparent',
                              // Literal on purpose: the fill is a categorical
                              // data colour, which doesn't re-theme, so --on-accent
                              // (derived from --accent) would be the wrong contrast
                              // partner — dark text on a saturated chip in a light theme.
                              color: on ? '#fff' : 'var(--text-2)',
                              border: '1px solid ' + (on ? (tagColors.get(tag) as string) : 'var(--border)'),
                              borderRadius: '999px',
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            #{tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                  <span>
                    Showing {shownCount} of {scopedNodes.length}
                  </span>
                  {filterActive && (
                    <button onClick={clearFilters} style={{ ...presetBtnStyle, flex: 'unset', padding: '0.3rem 0.6rem' }}>
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            </Section>

            {/* Groups */}
            <Section title="Groups" open={openSections.groups} onToggle={() => toggleSection('groups')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.4 }}>
                  Color notes by category. Use <strong>#tag</strong> for tags, or plain text to match note titles.
                </span>
                {groups.map((g) => (
                  <div key={g.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={g.color}
                      onChange={(e) => updateGroup(g.id, { color: e.target.value })}
                      title="Group color"
                      style={{ width: '30px', height: '30px', padding: 0, border: '1px solid var(--border)', borderRadius: '6px', background: 'none', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <input
                      value={g.query}
                      onChange={(e) => updateGroup(g.id, { query: e.target.value })}
                      placeholder="#tag or title text"
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    />
                    <button onClick={() => removeGroup(g.id)} title="Remove group" aria-label="Remove group" style={iconBtnStyle}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <button onClick={addGroup} style={{ ...presetBtnStyle, flex: 'unset', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Plus size={14} /> Add group
                </button>
              </div>
            </Section>

            {/* Display */}
            <Section title="Display" open={openSections.display} onToggle={() => toggleSection('display')}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Toggle label="Arrows" checked={directed} onChange={setDirected} title="Show link direction with arrowheads" />
                <Toggle
                  label="Highlight hubs & orphans"
                  checked={highlightStructure}
                  onChange={setHighlightStructure}
                  title="Color orphan notes (no links) and hubs (many links)"
                />
                {highlightStructure && (
                  <div style={{ padding: '0.1rem 0 0.4rem 0.2rem' }}>
                    <LegendRow color={ORPHAN_COLOR} size={8} label="Orphan — no links" />
                    <LegendRow color={HUB_COLOR} size={12} label={`Hub — ${HUB_DEGREE}+ links`} />
                  </div>
                )}
                <Toggle label="Pin dragged nodes" checked={pinOnDrag} onChange={togglePin} title="Keep dragged nodes where you drop them" />
                <Toggle
                  label="Keep nodes moving"
                  checked={perpetualMotion}
                  onChange={setPerpetualMotion}
                  title="Nodes gently drift forever instead of settling to a stop"
                />
                <Toggle
                  label="Glowing background"
                  checked={rippleBackground}
                  onChange={setRippleBackground}
                  title="A soft accent-coloured gradient that slowly ripples behind the graph"
                />
                <Slider
                  label="Text fade threshold"
                  value={textFade}
                  onChange={setTextFade}
                  min={0}
                  max={2}
                  step={0.05}
                  hint="Higher = labels appear only when zoomed in closer."
                  tip="Text fade threshold — how zoomed-in you must be before note labels appear. Higher hides labels until you zoom in; lower keeps them visible."
                />
                <Slider
                  label="Node size"
                  value={nodeSize}
                  onChange={setNodeSize}
                  min={0.5}
                  max={3}
                  step={0.1}
                  hint="Scales how large the note dots are drawn."
                  tip="Node size — scales the radius of every note dot."
                />
                <Slider
                  label="Link thickness"
                  value={linkThickness}
                  onChange={setLinkThickness}
                  min={0.5}
                  max={6}
                  step={0.5}
                  hint="How thick the lines between linked notes are."
                  tip="Link thickness — the width of the lines drawn between linked notes."
                />
                <button onClick={animate} style={{ ...presetBtnStyle, flex: 'unset', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', padding: '0.55rem', marginTop: '0.5rem', fontWeight: 600 }}>
                  Animate
                </button>
              </div>
            </Section>

            {/* Forces */}
            <Section
              title="Forces"
              open={openSections.forces}
              onToggle={() => toggleSection('forces')}
              right={
                openSections.forces ? (
                  <button onClick={resetForces} title="Reset forces to defaults" style={{ ...presetBtnStyle, flex: 'unset', padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}>
                    Reset
                  </button>
                ) : undefined
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.4, marginBottom: '0.2rem' }}>
                  Forces that act on each node. Hover a slider for details.
                </span>
                <Slider
                  label="Center force"
                  value={centerForce}
                  onChange={setCenterForce}
                  min={0}
                  max={1}
                  step={0.05}
                  hint="Higher = compact & circular; lower = clusters spread apart."
                  tip="Center force — pulls all notes toward the center of the graph. Higher makes the graph more compact and circular; lower lets clusters spread farther apart."
                />
                <Slider
                  label="Repel force"
                  value={repelForce}
                  onChange={setRepelForce}
                  min={0}
                  max={500}
                  step={10}
                  hint="Higher = more spacing between notes; lower = they bunch up."
                  tip="Repel force — how strongly each note pushes the others away. Higher gives more spacing so individual nodes are easier to see; lower lets notes bunch together."
                />
                <Slider
                  label="Link force"
                  value={linkForce}
                  onChange={setLinkForce}
                  min={0}
                  max={1}
                  step={0.05}
                  hint="Rubber-band tightness. Higher = linked notes stay tightly grouped."
                  tip="Link force — the pull along each link, like a rubber band. Higher keeps connected notes tightly grouped; lower makes the band looser so clusters can stretch out."
                />
                <Slider
                  label="Link distance"
                  value={linkDistance}
                  onChange={setLinkDistance}
                  min={10}
                  max={300}
                  step={5}
                  hint="Preferred link length. Higher = linked notes sit farther apart."
                  tip="Link distance — the preferred length of the lines between linked notes. Higher places linked notes farther apart; lower keeps them closer together."
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Presets</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => applyPreset('clusters')} title="Low center, high repel — separates clusters so they're easy to see." style={presetBtnStyle}>
                      See clusters
                    </button>
                    <button onClick={() => applyPreset('compact')} title="High center, low repel — pulls everything into a tight ball." style={presetBtnStyle}>
                      Compact
                    </button>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        ) : (
          <button
            onClick={() => setShowPanel(true)}
            title="Graph settings"
            aria-label="Graph settings"
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 20,
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
              fontSize: '1.125rem',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={16} />
          </button>
        ))}

      {/* Right-click context menu */}
      {contextMenu && menuNode && (
        <>
          <div
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu(null)
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 30 }}
          />
          <div
            style={{
              position: 'fixed',
              top: `${contextMenu.y}px`,
              left: `${contextMenu.x}px`,
              zIndex: 31,
              width: '210px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            <div
              style={{
                padding: '6px 8px 8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-1)',
                borderBottom: '1px solid var(--border)',
                marginBottom: '4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {menuNode.title || 'Untitled'}
            </div>

            <ContextMenuItem
              onClick={() => {
                setFocusNodeId(null)
                setConnectingFrom(contextMenu.nodeId)
                setContextMenu(null)
              }}
            >
              <Link2 size={14} /> Connect to a note
            </ContextMenuItem>

            {(degrees.get(contextMenu.nodeId) ?? 0) >= 1 && (
              <ContextMenuItem
                onClick={() => {
                  disconnectAll(contextMenu.nodeId)
                  setContextMenu(null)
                }}
              >
                <Unlink size={14} /> Disconnect all links
              </ContextMenuItem>
            )}

            <ContextMenuItem
              danger
              onClick={() => {
                const id = contextMenu.nodeId
                setContextMenu(null)
                void handleRemoveNote(id)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M1 3.5h12M4.5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M5.5 6.5v4M8.5 6.5v4M2.5 3.5l.75 7.25a.5.5 0 0 0 .5.45h6.5a.5.5 0 0 0 .5-.45L11.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Delete note
            </ContextMenuItem>
          </div>
        </>
      )}

      {focusedNoteForPanel && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '400px',
            maxHeight: '90%',
            overflowY: 'auto',
            background: 'var(--bg)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Panel header — back button lives here, separate from NoteItem */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px 0',
            }}
          >
            <button
              onClick={() => setFocusNodeId(null)}
              title="Back to full graph"
              aria-label="Back to full graph"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-2)',
                fontSize: '0.8rem',
                padding: '4px 6px',
                borderRadius: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8.5 2.5L3.5 7l5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', opacity: 0.6 }}>
              Click graph to dismiss
            </span>
          </div>
          <NoteItem note={focusedNoteForPanel} onUpdate={handleUpdateNote} onRemove={handleRemoveNote} />
        </div>
      )}
    </div>
  )
}

/** A single row in the node right-click menu. */
function ContextMenuItem({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  const color = danger ? 'var(--danger)' : 'var(--text-1)'
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        textAlign: 'left',
        background: hover ? (danger ? 'color-mix(in srgb, var(--danger) 12%, transparent)' : 'var(--surface-2)') : 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color,
        fontSize: '0.82rem',
        padding: '0.5rem 0.6rem',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
