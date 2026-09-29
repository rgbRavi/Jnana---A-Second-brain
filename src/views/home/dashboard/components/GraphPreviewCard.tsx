// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import styles from '../Dashboard.module.css'
import type { SnapshotNode } from '../useDashboardData'
import { eventBus } from '../../../../lib/eventBus'
import { resolveColor } from '../../../../lib/themeColor'

/** Wait for a drag-resize to stop before resizing the canvas (see the observer). */
const RESIZE_SETTLE_MS = 120
const GRAPH_PADDING = 24
/** Only used before the first token read lands (and if `--text-3` ever fails to parse). */
const FALLBACK_LINK_COLOR = 'rgba(150, 150, 175, 0.16)'

/** Faint link strokes, derived from `--text-3` so they follow the theme. */
function readLinkColor(): string {
  const t = getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim()
  return (t && resolveColor(t, 0.16)) || FALLBACK_LINK_COLOR
}

interface Props {
  nodes: SnapshotNode[]
  links: { source: string; target: string }[]
  stats: { nodes: number; links: number; largest: number; orphans: number }
  onOpen: () => void
}

/** A small, live force-graph snapshot of the vault + headline graph stats. */
export function GraphPreviewCard({ nodes, links, stats, onOpen }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Canvas takes a colour string, so this can't just be `var(--text-3)` — re-read
  // it when the theme changes, the same way GraphView does.
  const [linkColor, setLinkColor] = useState(readLinkColor)

  useEffect(() => {
    const read = () => setLinkColor(readLinkColor())
    eventBus.on('theme:changed', read)
    return () => eventBus.off('theme:changed', read)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    // Only push a genuinely new size — a same-dimension update would still make
    // force-graph re-run adjustCanvasSize (which clears the canvas) for nothing.
    const push = () =>
      setSize((prev) => {
        const w = el.clientWidth
        const h = el.clientHeight
        return prev.w === w && prev.h === h ? prev : { w, h }
      })

    // Dragging the card's edge fires this every frame, and force-graph pans the
    // viewport by half the size delta on each width/height change
    // (adjustCanvasSize). Sixty of those a second walk the graph clean off the
    // canvas — the card looks empty although the nodes are still there. So push
    // the size once the drag settles instead of on every frame.
    let t = 0
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t)
      t = window.setTimeout(push, RESIZE_SETTLE_MS)
    })
    ro.observe(el)
    push() // first measurement is immediate — there's nothing to settle yet
    return () => {
      window.clearTimeout(t)
      ro.disconnect()
    }
  }, [])

  // Nothing to re-frame here: the graph is remounted at the new size (see the
  // `key` below), which starts it from an identity transform.

  // react-force-graph mutates the objects it's given (adds x/y/vx/vy) and re-runs
  // its simulation whenever `graphData` is a new reference — so memoize on the
  // (stable) nodes/links so unrelated re-renders (collapse, resize of other
  // cards) don't reload the graph.
  const data = useMemo<any>(
    () => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }),
    [nodes, links],
  )

  return (
    <div className={styles.graphPreview}>
      <div
        className={styles.graphCanvas}
        ref={wrapRef}
        role="button"
        tabIndex={0}
        aria-label="Open graph"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        {size.w > 0 && size.h > 0 && nodes.length > 0 ? (
          <ForceGraph2D
            // Remount on a settled size change. Resizing an existing instance
            // leaves the viewport panned (force-graph translates by half the size
            // delta per change, and a drag produces a stream of them), which
            // walked the graph off-canvas — the card looked empty though the
            // nodes were still there. A fresh instance starts from an identity
            // transform and re-frames itself in onEngineStop below.
            key={`${size.w}x${size.h}`}
            ref={fgRef}
            graphData={data}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={2.4}
            nodeVal={(n: any) => n.val}
            nodeColor={(n: any) => n.color}
            linkColor={() => linkColor}
            linkWidth={1}
            enableNodeDrag={false}
            enableZoomInteraction={false}
            enablePanInteraction={false}
            cooldownTime={4000}
            onEngineStop={() => fgRef.current?.zoomToFit(0, GRAPH_PADDING)}
          />
        ) : (
          <div className={styles.graphEmpty}>{nodes.length === 0 ? 'No notes to graph yet.' : '…'}</div>
        )}
      </div>
      <div className={styles.graphStats}>
        <GraphStat n={stats.nodes} label="Nodes" />
        <GraphStat n={stats.links} label="Links" />
        <GraphStat n={stats.largest} label="Largest cluster" />
        <GraphStat n={stats.orphans} label="Orphans" />
      </div>
      <button type="button" className={styles.openGraphBtn} onClick={onOpen}>
        Open Full Graph →
      </button>
    </div>
  )
}

function GraphStat({ n, label }: { n: number; label: string }) {
  return (
    <div className={styles.graphStat}>
      <span className={styles.graphStatVal}>{n}</span>
      <span className={styles.graphStatLabel}>{label}</span>
    </div>
  )
}
