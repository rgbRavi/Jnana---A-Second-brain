// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useGraph.ts
import { useState, useEffect, useCallback } from 'react'
import { getAllNotes, getAllLinks, createLink, removeLink, syncLinksForNote } from '../core/notes'
import { eventBus } from '../lib/eventBus'
import type { Note } from '../types'

export interface GraphNode {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function useGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)

  // Load everything on mount
  useEffect(() => {
    async function load() {
      try {
        const [notes, links] = await Promise.all([getAllNotes(), getAllLinks()])
        setNodes(notes.map(noteToNode))
        setEdges(links.map(([from, to]) => ({ source: from, target: to })))
      } catch (err) {
        console.error('Failed to load graph:', err)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  // When a note is saved, upsert it in the node list.
  // This keeps the graph in sync without a full reload.
  useEffect(() => {
    const handler = (saved: Note) => {
      setNodes((prev) => {
        const exists = prev.find((n) => n.id === saved.id)
        if (exists) {
          return prev.map((n) => (n.id === saved.id ? noteToNode(saved) : n))
        }
        return [...prev, noteToNode(saved)]
      })
    }
    eventBus.on('note:saved', handler)
    return () => eventBus.off('note:saved', handler)
  }, [])

  // When a note is deleted, remove it and all its edges.
  useEffect(() => {
    const handler = ({ id }: { id: string }) => {
      setNodes((prev) => prev.filter((n) => n.id !== id))
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
    }
    eventBus.on('note:deleted', handler)
    return () => eventBus.off('note:deleted', handler)
  }, [])

  // When a link is created, add the edge immediately (optimistic).
  useEffect(() => {
    const handler = ({ fromId, toId }: { fromId: string; toId: string }) => {
      setEdges((prev) => {
        const exists = prev.find((e) => e.source === fromId && e.target === toId)
        if (exists) return prev
        return [...prev, { source: fromId, target: toId }]
      })
    }
    eventBus.on('link:created', handler)
    return () => eventBus.off('link:created', handler)
  }, [])

  // When a link is removed, drop the edge.
  useEffect(() => {
    const handler = ({ fromId, toId }: { fromId: string; toId: string }) => {
      setEdges((prev) =>
        prev.filter((e) => !(e.source === fromId && e.target === toId))
      )
    }
    eventBus.on('link:removed', handler)
    return () => eventBus.off('link:removed', handler)
  }, [])

  // Manually refresh both nodes and edges from the DB.
  // Call this after bulk operations like syncLinksForNote.
  const refresh = useCallback(async () => {
    const [notes, links] = await Promise.all([getAllNotes(), getAllLinks()])
    setNodes(notes.map(noteToNode))
    setEdges(links.map(([from, to]) => ({ source: from, target: to })))
  }, [])

  const addLink = useCallback(async (fromId: string, toId: string) => {
    await createLink(fromId, toId)
    // eventBus.emit('link:created') is called inside createLink in core/notes.ts,
    // so the edge state updates automatically via the listener above.
  }, [])

  const dropLink = useCallback(async (fromId: string, toId: string) => {
    await removeLink(fromId, toId)
    // eventBus.emit('link:removed') is called inside removeLink in core/notes.ts.
  }, [])

  // Re-derive a note's outbound links from its content. Used after a pseudo-note
  // is created so notes that already reference its title get their edges (the
  // links table only stores edges between existing notes, so those inbound links
  // don't exist until each referencing note is re-synced). Emits link:created,
  // which the edge listener above folds in.
  const syncNoteLinks = useCallback(async (noteId: string, content: string) => {
    await syncLinksForNote(noteId, content)
  }, [])

  const graphData: GraphData = { nodes, edges }

  return { graphData, loading, refresh, addLink, dropLink, syncNoteLinks }
}

// ─── Helpers ─────────────────────────────────────────────

function noteToNode(note: Note): GraphNode {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags ?? [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}
