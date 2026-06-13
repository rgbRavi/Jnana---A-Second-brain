// src/ui/graph/GraphView.tsx
import { useState, useCallback, useRef, useMemo } from 'react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { useGraph } from '../../hooks/useGraph'
import { NoteItem } from '../editor/NoteItem'
import { SearchDocs } from '../SearchDocs'
import type { Note } from '../../types'

/** Escape user text before it's interpolated into the tooltip's raw HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface Props {
  // Received from App.tsx which owns the single useNotes instance.
  // GraphView never calls useNotes() directly — that would create a second
  // desynchronised state array alongside App's.
  onUpdate: (id: string, title: string, content: string) => Promise<Note | undefined>
  onRemove: (id: string) => void
}

export function GraphView({ onUpdate, onRemove }: Props) {
  const { graphData, loading } = useGraph()

  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  // Connect mode: click a source node, then a target, to create a [[link]].
  const [connectMode, setConnectMode] = useState(false)
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null)

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  // Cache node objects by id. react-force-graph stores each node's simulation
  // position (x/y/vx/vy) by mutating its object, so we must hand it the *same*
  // object across rebuilds — otherwise adding an edge (e.g. on connect) drops
  // every position and the whole graph reflows, losing your place.
  const nodeCache = useRef<Map<string, any>>(new Map())

  const toggleConnect = useCallback(() => {
    setConnectMode((on) => {
      const next = !on
      setPendingSourceId(null)
      if (next) setFocusNodeId(null) // show the full graph while connecting
      return next
    })
  }, [])

  // Memoize so the force simulation only restarts when data actually changes,
  // not on every hover/focus state update.
  const forceData = useMemo(() => {
    // Drop cached nodes that no longer exist (deleted notes).
    const allIds = new Set(graphData.nodes.map((n) => n.id))
    for (const id of nodeCache.current.keys()) {
      if (!allIds.has(id)) nodeCache.current.delete(id)
    }

    const visibleNodes = focusNodeId
      ? (() => {
          const neighbors = new Set<string>([focusNodeId])
          graphData.edges.forEach((e) => {
            if (e.source === focusNodeId) neighbors.add(e.target)
            if (e.target === focusNodeId) neighbors.add(e.source)
          })
          return graphData.nodes.filter((n) => neighbors.has(n.id))
        })()
      : graphData.nodes

    const visibleIds = new Set(visibleNodes.map((n) => n.id))

    const nodes = visibleNodes.map((n) => {
      const cached = nodeCache.current.get(n.id)
      if (cached) {
        // Reuse the object (keeps x/y from the simulation); refresh display fields.
        cached.title = n.title
        cached.content = n.content
        cached.updatedAt = n.updatedAt
        return cached
      }
      const fresh = { ...n, val: 1 }
      nodeCache.current.set(n.id, fresh)
      return fresh
    })

    return {
      nodes,
      links: graphData.edges
        .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target })),
    }
  }, [graphData.nodes, graphData.edges, focusNodeId])

  const handleNodeClick = useCallback(
    (node: any) => {
      // Connect mode: first click picks the source, second links them. Links are
      // wikilinks, so we append [[target title]] to the source note's content —
      // that's what makes the edge durable (a raw link row would be wiped on the
      // source's next save, when links are recomputed from content).
      if (connectMode) {
        if (!pendingSourceId) {
          setPendingSourceId(node.id)
        } else if (pendingSourceId === node.id) {
          setPendingSourceId(null) // clicking the source again deselects it
        } else {
          const source = graphData.nodes.find((n) => n.id === pendingSourceId)
          const target = graphData.nodes.find((n) => n.id === node.id)
          const targetTitle = target?.title?.trim()
          if (source && targetTitle) {
            const wl = `[[${targetTitle}]]`
            if (!source.content.includes(wl)) {
              void onUpdate(source.id, source.title, `${source.content.trimEnd()}\n\n${wl}\n`).catch(
                (err) => console.error('Failed to connect notes:', err),
              )
            }
          } else if (source && !targetTitle) {
            alert('Give the target note a title first — links connect by [[title]].')
          }
          setPendingSourceId(null)
        }
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
    [connectMode, pendingSourceId, onUpdate, graphData.nodes, focusNodeId]
  )

  const handleUpdateNote = useCallback(
    async (id: string, title: string, content: string) => {
      // Delegate entirely to the prop — no refresh() call here.
      // useGraph stays in sync via its eventBus listeners:
      //   note:saved  → upserts the node
      //   link:created / link:removed → updates edges
      return onUpdate(id, title, content)
    },
    [onUpdate]
  )

  const handleRemoveNote = useCallback(
    async (id: string) => {
      const node = graphData.nodes.find((n) => n.id === id)
      const title = node?.title || 'this note'
      if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
      onRemove(id)
      if (focusNodeId === id) setFocusNodeId(null)
    },
    [onRemove, focusNodeId, graphData.nodes]
  )

  const focusedNode = focusNodeId
    ? graphData.nodes.find((n) => n.id === focusNodeId)
    : null

  const focusedNoteForPanel = focusedNode
    ? {
        id: focusedNode.id,
        title: focusedNode.title,
        content: focusedNode.content,
        tags: [] as string[],
        createdAt: focusedNode.updatedAt,
        updatedAt: focusedNode.updatedAt,
      }
    : null

  if (loading) {
    return <div className="note-empty">Loading graph…</div>
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {graphData.nodes.length === 0 && (
        <div
          className="note-empty"
          style={{ position: 'absolute', width: '100%', zIndex: 10 }}
        >
          No notes to graph. Create some notes and link them using [[Title]]!
        </div>
      )}

      {/* Local Graph Search Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          width: '320px',
          zIndex: 20,
        }}
      >
        <SearchDocs
          notes={graphData.nodes as unknown as Note[]}
          onOpenNote={(id) => {
            const node = graphData.nodes.find((n) => n.id === id)
            if (node) {
              handleNodeClick(node)
            }
          }}
          placeholder="Search Graph..."
        />
      </div>

      {/* Connect-nodes toolbar */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <button
          onClick={toggleConnect}
          title={connectMode ? 'Exit connect mode' : 'Connect two notes with a link'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: connectMode ? 'var(--danger, #e5484d)' : 'var(--surface)',
            color: connectMode ? '#fff' : 'var(--text-1)',
            border: '1px solid ' + (connectMode ? 'var(--danger, #e5484d)' : 'var(--border)'),
            borderRadius: 'var(--radius-sm)',
            padding: '0.45rem 0.8rem',
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          {connectMode ? '■ Stop connect mode' : '🔗 Connect nodes'}
        </button>
        {connectMode && (
          <span
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.4rem 0.7rem',
              fontSize: '0.78rem',
              color: 'var(--text-2)',
            }}
          >
            Connecting nodes… {pendingSourceId ? 'click the target node' : 'click the source node'}
          </span>
        )}
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={forceData}
        nodeLabel={(n: any) => {
          const preview =
            n.content.substring(0, 100).replace(/\n/g, ' ') +
            (n.content.length > 100 ? '…' : '')
          // nodeLabel is rendered as raw HTML — escape note-derived text to
          // prevent markup in a title/content from injecting into the tooltip.
          const title = escapeHtml(n.title ?? '')
          const safePreview = escapeHtml(preview)
          return `<div style="background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-1);max-width:300px;font-family:var(--font-body);font-size:13px;"><strong>${title}</strong><br/><span style="color:var(--text-2)">${safePreview}</span></div>`
        }}
        onNodeHover={(node: any) => setHoverNodeId(node ? node.id : null)}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => {
          if (connectMode) setPendingSourceId(null)
          else setFocusNodeId(null)
        }}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.title || 'Untitled'
          const fontSize = 12 / globalScale
          ctx.font = `${fontSize}px var(--font-body), Sans-Serif`

          const isPendingSource = node.id === pendingSourceId
          ctx.beginPath()
          ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false)
          ctx.fillStyle = isPendingSource
            ? '#3fb950'
            : node.id === focusNodeId
              ? '#7c6af7'
              : '#55535f'
          ctx.fill()

          if (hoverNodeId === node.id || isPendingSource) {
            ctx.strokeStyle = isPendingSource ? '#3fb950' : '#f0eff5'
            ctx.lineWidth = (isPendingSource ? 2 : 1) / globalScale
            ctx.stroke()
          }

          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = node.id === focusNodeId ? '#f0eff5' : '#9896a4'
          ctx.fillText(label, node.x, node.y + 8)
        }}
        cooldownTicks={100}
        linkColor={() => 'rgba(124, 106, 247, 0.4)'}
        linkWidth={1.5}
        backgroundColor="#0d0d0f"
      />

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
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Panel header — back button lives here, separate from NoteItem */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px 0',
          }}>
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
                <path d="M8.5 2.5L3.5 7l5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', opacity: 0.6 }}>
              Click graph to dismiss
            </span>
          </div>
          <NoteItem
            note={focusedNoteForPanel}
            onUpdate={handleUpdateNote}
            onRemove={handleRemoveNote}
          />
        </div>
      )}
    </div>
  )
}