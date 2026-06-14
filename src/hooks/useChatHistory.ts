// src/hooks/useChatHistory.ts
import { useCallback, useEffect, useRef } from 'react'
import { eventBus } from '../lib/eventBus'
import { getConversation, saveConversation } from '../core/chat'
import { useViewState, getViewState } from './useViewState'
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
) {
  const [activeId, setActiveId] = useViewState<string>(`ai.conv.${mode}`, newId)

  // Refs keep the event listeners stable (no resubscribe per render).
  const onLoadRef = useRef(onLoad)
  onLoadRef.current = onLoad
  const onNewRef = useRef(onNew)
  onNewRef.current = onNew

  useEffect(() => {
    const handleNew = (p: { mode: string }) => {
      if (p.mode !== mode) return
      setActiveId(newId())
      onNewRef.current()
    }
    const handleLoad = (p: { mode: string; id: string }) => {
      if (p.mode !== mode) return
      getConversation(p.id)
        .then((c) => {
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
      const id = getViewState<string>(`ai.conv.${mode}`) ?? activeId
      const now = Date.now()
      const conv: StoredConversation = {
        id,
        mode,
        title: title.trim() || 'New chat',
        messages: JSON.stringify(messages ?? []),
        scope: scope == null ? null : JSON.stringify(scope),
        projectId: projectId ?? null,
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
    [mode, activeId],
  )

  return { activeId, setActiveId, persist }
}
