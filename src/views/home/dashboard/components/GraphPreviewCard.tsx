// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import styles from '../Dashboard.module.css'
import type { SnapshotNode } from '../useDashboardData'

interface Props {
  nodes: SnapshotNode[]
  links: { source: string; target: string }[]
  stats: { nodes: number; links: number; largest: number; orphans: number }
  onOpen: () => void
}

/** A small, live force-graph snapshot of the vault + headline graph stats. */
export function GraphPreviewCard({ nodes, links, stats, onOpen }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

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
      <div className={styles.graphCanvas} ref={wrapRef} onClick={onOpen}>
        {size.w > 0 && size.h > 0 && nodes.length > 0 ? (
          <ForceGraph2D
            graphData={data}
            width={size.w}
            height={size.h}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={2.4}
            nodeVal={(n: any) => n.val}
            nodeColor={(n: any) => n.color}
            linkColor={() => 'rgba(150, 150, 175, 0.16)'}
            linkWidth={1}
            enableNodeDrag={false}
            enableZoomInteraction={false}
            enablePanInteraction={false}
            cooldownTime={4000}
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
