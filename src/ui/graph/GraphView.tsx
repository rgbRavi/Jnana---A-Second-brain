// src/ui/graph/GraphView.tsx
import { useState, useCallback, useRef, useMemo } from 'react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { useGraph } from '../../hooks/useGraph'
import { useNotes } from '../../hooks/useNotes'
import { NoteItem } from '../editor/NoteItem'

export function GraphView() {
  const { graphData, loading, refresh } = useGraph()
  const { update, remove } = useNotes()

  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)

  // Memoize forceData so react-force-graph-2d only sees a new object
  // when nodes or edges actually change — not on every render.
  // Without this, the simulation restarts on every state update (hover,
  // focus changes, etc.) which causes the constant twitching.
  const forceData = useMemo(() => {
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

    return {
      nodes: visibleNodes.map((n) => ({ ...n, val: 1 })),
      links: graphData.edges
        .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target })),
    }
  }, [graphData.nodes, graphData.edges, focusNodeId])

  const handleNodeClick = useCallback(
    (node: any) => {
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
    [focusNodeId]
  )

  const handleUpdateNote = useCallback(
    async (id: string, title: string, content: string) => {
      const updated = await update(id, title, content)
      // syncLinksForNote runs inside useNotes.update and emits link:created events,
      // which useGraph listens to. For bulk link changes we do a hard refresh.
      await refresh()
      return updated
    },
    [update, refresh]
  )

  const handleRemoveNote = useCallback(
    async (id: string) => {
      await remove(id)
      if (focusNodeId === id) setFocusNodeId(null)
    },
    [remove, focusNodeId]
  )

  const focusedNode = focusNodeId
    ? graphData.nodes.find((n) => n.id === focusNodeId)
    : null

  // We need a full Note shape to pass to NoteItem.
  // GraphNode has everything NoteItem needs except tags and createdAt.
  // Build a minimal Note from the GraphNode — tags and createdAt are
  // not displayed by NoteItem in this context.
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
    return (
      <div className="note-empty">Loading graph…</div>
    )
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

      <ForceGraph2D
        ref={fgRef}
        graphData={forceData}
        // After the simulation naturally winds down, freeze all node positions.
        // This stops the constant slow drift that looks like twitching.
        onEngineStop={() => {
          if (fgRef.current) fgRef.current.pauseAnimation()
        }}
        // Unfreeze briefly when new data arrives so nodes can re-settle.
        onEngineStart={() => {}}
        nodeLabel={(n: any) => {
          const preview =
            n.content.substring(0, 100).replace(/\n/g, ' ') +
            (n.content.length > 100 ? '…' : '')
          return `<div style="background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-1);max-width:300px;font-family:var(--font-body);font-size:13px;"><strong>${n.title}</strong><br/><span style="color:var(--text-2)">${preview}</span></div>`
        }}
        onNodeHover={(node: any) => setHoverNodeId(node ? node.id : null)}
        onNodeDragEnd={() => {
          // Re-freeze after the user finishes dragging a node
          if (fgRef.current) fgRef.current.pauseAnimation()
        }}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => setFocusNodeId(null)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.title || 'Untitled'
          const fontSize = 12 / globalScale
          ctx.font = `${fontSize}px var(--font-body), Sans-Serif`

          ctx.beginPath()
          ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false)
          ctx.fillStyle = node.id === focusNodeId ? '#7c6af7' : '#55535f'
          ctx.fill()

          if (hoverNodeId === node.id) {
            ctx.strokeStyle = '#f0eff5'
            ctx.lineWidth = 1 / globalScale
            ctx.stroke()
          }

          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = node.id === focusNodeId ? '#f0eff5' : '#9896a4'
          ctx.fillText(label, node.x, node.y + 8)
        }}
        // cooldownTicks controls how many simulation ticks run before the engine
        // considers itself "stopped". Lower = settles faster. 100 is enough for
        // graphs of a few hundred nodes.
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
