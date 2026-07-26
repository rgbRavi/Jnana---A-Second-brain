// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// src/hooks/useChatHistory.ts
import { useCallback, useEffect, useRef } from 'react'
import { eventBus } from '../lib/eventBus'
import { getConversation, saveConversation } from '../core/chat'
import { useViewState, getViewState } from './useViewState'
import { useActiveVaultId } from './useVaults'
import type { StoredConversation } from '../types'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

/**
 * Wires a chat component into the shared history:
 *  - tracks the active conversation id (per mode, in the view store so the
 *    history drawer can highlight it),
 *  - listens for `ai:newChat` / `ai:loadConversation` (filtered by mode) emitted
 *    by the drawer and calls `onNew` / `onLoad`,
 *  - exposes `persist(messages, scope, title)` which upserts the active
 *    conversation and tells the drawer to refresh.
 *
 * The drawer and the chat component coordinate purely through the eventBus, so
 * neither needs a reference to the other.
 */
export function useChatHistory(
  mode: string,
  onLoad: (conv: StoredConversation) => void,
  onNew: () => void,
  /**
   * Called synchronously right before the active id (and thread) switches to
   * the incoming conversation — the caller's chance to flush any debounced
   * write for the OUTGOING conversation while its id is still active. Without
   * this, a pending debounced persist fires after the switch and either
   * no-ops (thread already reset) or, worse, saves the outgoing content under
   * the new conversation's id.
   */
  flushPending?: () => void,
) {
  // The active conversation id is tracked per (mode, vault) so switching vaults
  // starts a fresh chat rather than carrying another vault's conversation over.
  const activeVaultId = useActiveVaultId()
  const convKey = `ai.conv.${mode}.${activeVaultId}`
  const [activeId, setActiveId] = useViewState<string>(convKey, newId)

  // Refs keep the event listeners stable (no resubscribe per render).
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew
  const flushRef = useRef(flushPending)
  flushRef.current = flushPending

  useEffect(() => {
    const handleNew = (p: { mode: string }) => {
      if (p.mode !== mode) return
      flushRef.current?.()
      setActiveId(newId())
      onNewRef.current()
    }
    const handleLoad = (p: { mode: string; id: string }) => {
      if (p.mode !== mode) return
      getConversation(p.id)
        .then((c) => {
          flushRef.current?.()
          setActiveId(c.id)
          onLoadRef.current(c)
        })
        .catch((e) => console.error('Failed to load conversation:', e))
    }
    eventBus.on('ai:newChat', handleNew)
    eventBus.on('ai:loadConversation', handleLoad)
    return () => {
      eventBus.off('ai:newChat', handleNew)
      eventBus.off('ai:loadConversation', handleLoad)
    }
  }, [mode, setActiveId])

  const persist = useCallback(
    async (messages: unknown, scope: unknown, title: string, projectId?: string | null) => {
      // Read the current id from the store in case it changed mid-request.
      const id = getViewState<string>(convKey) ?? activeId
      const now = Date.now()
      const conv: StoredConversation = {
        id,
        mode,
        title: title.trim() || 'New chat',
        messages: JSON.stringify(messages ?? []),
        scope: scope == null ? null : JSON.stringify(scope),
        projectId: projectId ?? null,
        vaultId: activeVaultId,
        createdAt: now, // ignored on conflict; set only on first insert
        updatedAt: now,
      }
      try {
        await saveConversation(conv)
        eventBus.emit('ai:conversationSaved', { mode })
      } catch (e) {
        console.error('Failed to persist conversation:', e)
      }
    },
    [mode, activeId, convKey, activeVaultId],
  )

  return { activeId, setActiveId, persist }
}
