import { useState, useEffect, useCallback, useRef } from 'react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { getAllNotes, getAllLinks, saveNote, deleteNote } from '../../core/notes'
import type { Note } from '../../types'
import { NoteItem } from '../editor/NoteItem'
import { syncLinksForNote } from '../../core/notes'

interface GraphData {
  nodes: any[]
  links: any[]
}

export function GraphView() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [fullNotes, setFullNotes] = useState<Note[]>([])
  const [allLinks, setAllLinks] = useState<[string, string][]>([])
  
  const [hoverNode, setHoverNode] = useState<any | null>(null)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)

  // Load Data
  useEffect(() => {
    async function load() {
      const notes = await getAllNotes()
      const links = await getAllLinks()
      setFullNotes(notes)
      setAllLinks(links)
    }
    load()
  }, [])

  // Calculate rendering graph Data based on Focus Node
  useEffect(() => {
    let nodes = fullNotes.map(n => ({ ...n, id: n.id, val: 1 }))
    let gLinks = allLinks.map(l => ({ source: l[0], target: l[1] }))

    if (focusNodeId) {
      // Find all neighbors
      const neighbors = new Set<string>([focusNodeId])
      gLinks.forEach(l => {
        if (l.source === focusNodeId) neighbors.add(l.target as string)
        if (l.target === focusNodeId) neighbors.add(l.source as string)
      })

      // Filter
      nodes = nodes.filter(n => neighbors.has(n.id))
      gLinks = gLinks.filter(l => neighbors.has(l.source as string) && neighbors.has(l.target as string))
    }

    setGraphData({ nodes, links: gLinks })
  }, [fullNotes, allLinks, focusNodeId])

  const handleNodeClick = useCallback(
    (node: any) => {
      // If already focused, unfocus to see all, otherwise focus this node
      if (focusNodeId === node.id) {
        setFocusNodeId(null)
      } else {
        setFocusNodeId(node.id)
        if (fgRef.current) {
          fgRef.current.centerAt(node.x, node.y, 1000)
          fgRef.current.zoom(4, 1000)
        }
      }
    },
    [focusNodeId]
  )

  const handleUpdateNote = async (id: string, title: string, content: string) => {
    const existing = fullNotes.find(n => n.id === id)
    if (!existing) return undefined
    
    const updated = { ...existing, title, content, updatedAt: Date.now() }
    await saveNote(updated)
    await syncLinksForNote(id, content)

    // Reload everything to get updated links
    const [newNotes, newLinks] = await Promise.all([getAllNotes(), getAllLinks()])
    setFullNotes(newNotes)
    setAllLinks(newLinks)
    
    return updated
  }

  const handleRemoveNote = async (id: string) => {
    await deleteNote(id)
    setFullNotes(prev => prev.filter(n => n.id !== id))
    if (focusNodeId === id) setFocusNodeId(null)
  }

  // Find actual Note object if editing
  const editingNote = focusNodeId ? fullNotes.find(n => n.id === focusNodeId) : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {(fullNotes.length === 0) && (
        <div className="note-empty" style={{position: 'absolute', width: '100%', zIndex: 10, outline: 'none'}}>No notes to graph. Create some notes and link them using [[Title]]!</div>
      )}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel={(n: any) => {
          const preview = n.content.substring(0, 100).replace(/\n/g, ' ') + (n.content.length > 100 ? '...' : '')
          return `<div style="background:var(--surface);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-1);max-width:300px;font-family:var(--font-body);font-size:13px;"><strong>${n.title}</strong><br/><span style="color:var(--text-2)">${preview}</span></div>`
        }}
        onNodeHover={setHoverNode}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => setFocusNodeId(null)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.title || 'Untitled'
          const fontSize = 12/globalScale
          ctx.font = `${fontSize}px var(--font-body), Sans-Serif`
          
          // Draw Circle
          ctx.beginPath()
          ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false)
          ctx.fillStyle = node.id === focusNodeId ? '#7c6af7' : '#55535f'
          ctx.fill()
          if (hoverNode && hoverNode.id === node.id) {
             ctx.strokeStyle = '#f0eff5'
             ctx.lineWidth = 1/globalScale
             ctx.stroke()
          }

          // Draw Text underneath
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = node.id === focusNodeId ? '#f0eff5' : '#9896a4'
          ctx.fillText(label, node.x, node.y + 8)
        }}
        linkColor={() => 'rgba(124, 106, 247, 0.4)'}
        linkWidth={1.5}
        backgroundColor="#0d0d0f"
      />

      {editingNote && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '400px',
          maxHeight: '90%',
          overflowY: 'auto',
          background: 'var(--bg)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          border: '1px solid var(--border)'
        }}>
          <NoteItem
            note={editingNote}
            onUpdate={handleUpdateNote}
            onRemove={handleRemoveNote}
          />
        </div>
      )}
    </div>
  )
}
