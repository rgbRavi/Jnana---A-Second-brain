// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Workspaces & collections — invoke wrappers over the Rust workspace commands.
// Mirrors core/aiWorkspace.ts. Mutations emit `workspace:changed` so any open
// view (sidebar, manager, workspace page) refreshes.

import { invoke } from '@tauri-apps/api/core'
import { eventBus } from '../lib/eventBus'
import type { Collection, Workspace, WorkspaceNote } from '../types'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

const changed = () => eventBus.emit('workspace:changed', null)

// ─── Workspaces ─────────────────────────────────────────

export function listWorkspaces(): Promise<Workspace[]> {
  return invoke<Workspace[]>('list_workspaces')
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  await invoke('save_workspace', { workspace })
  changed()
}

export async function deleteWorkspace(id: string): Promise<void> {
  await invoke('delete_workspace', { id })
  changed()
}

export interface WorkspaceCount {
  workspaceId: string
  count: number
}

export function listWorkspaceCounts(): Promise<WorkspaceCount[]> {
  return invoke<WorkspaceCount[]>('list_workspace_counts')
}

export function newWorkspace(vaultId: string): Workspace {
  const now = Date.now()
  return { id: newId(), name: '', icon: '📁', color: undefined, description: '', vaultId, createdAt: now, updatedAt: now }
}

// ─── Membership ─────────────────────────────────────────

export function listWorkspaceNotes(workspaceId: string): Promise<WorkspaceNote[]> {
  return invoke<WorkspaceNote[]>('list_workspace_notes', { workspaceId })
}

export async function addWorkspaceNote(workspaceId: string, noteId: string): Promise<void> {
  await invoke('add_workspace_note', { workspaceId, noteId })
  changed()
}

export async function addWorkspaceNotes(workspaceId: string, noteIds: string[]): Promise<void> {
  await invoke('add_workspace_notes', { workspaceId, noteIds })
  changed()
}

export async function removeWorkspaceNote(workspaceId: string, noteId: string): Promise<void> {
  await invoke('remove_workspace_note', { workspaceId, noteId })
  changed()
}

export async function setWorkspaceNotePinned(workspaceId: string, noteId: string, pinned: boolean): Promise<void> {
  await invoke('set_workspace_note_pinned', { workspaceId, noteId, pinned })
  changed()
}

export function listNoteWorkspaceIds(noteId: string): Promise<string[]> {
  return invoke<string[]>('list_note_workspace_ids', { noteId })
}

// ─── Collections ────────────────────────────────────────

export function listCollections(workspaceId: string): Promise<Collection[]> {
  return invoke<Collection[]>('list_collections', { workspaceId })
}

export async function saveCollection(collection: Collection): Promise<void> {
  await invoke('save_collection', { collection })
  changed()
}

export async function deleteCollection(id: string): Promise<void> {
  await invoke('delete_collection', { id })
  changed()
}

export function newCollection(workspaceId: string, name: string): Collection {
  return { id: newId(), workspaceId, name, createdAt: Date.now() }
}

export function listCollectionNoteIds(collectionId: string): Promise<string[]> {
  return invoke<string[]>('list_collection_note_ids', { collectionId })
}

export async function addCollectionNote(collectionId: string, noteId: string): Promise<void> {
  await invoke('add_collection_note', { collectionId, noteId })
  changed()
}

export async function removeCollectionNote(collectionId: string, noteId: string): Promise<void> {
  await invoke('remove_collection_note', { collectionId, noteId })
  changed()
}

/** Stable accent color for a workspace — its own color or one derived from the id. */
const PALETTE = ['#7c6af7', '#3fb950', '#e3b341', '#3ba7f7', '#f778ba', '#a371f7', '#56d4bc', '#ff8c42']
export function workspaceColor(ws: Pick<Workspace, 'id' | 'color'>): string {
  if (ws.color) return ws.color
  let h = 0
  for (let i = 0; i < ws.id.length; i++) h = (h * 31 + ws.id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
