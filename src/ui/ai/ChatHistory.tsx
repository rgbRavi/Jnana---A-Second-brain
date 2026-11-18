// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Plus, FolderKanban, ChevronDown, MessageSquare, PanelLeftDashed, X } from 'lucide-react'
import { eventBus } from '../../lib/eventBus'
import { listConversations } from '../../core/chat'
import { useViewState } from '../../hooks/useViewState'
import { requestChatAction, deleteChats, renameChat } from '../../hooks/useChatHistory'
import { useActiveVaultId } from '../../hooks/useVaults'
import { setSidebarPrefs, useSidebarPrefs } from '../../hooks/useSidebarPrefs'
import { useProjects } from '../../hooks/useProjects'
import { useHoverReveal } from '../../hooks/useHoverReveal'
import { goToAiMode } from '../../hooks/aiNav'
import type { ConversationMeta } from '../../types'
import { ContextMenu } from '../ContextMenu'
import { relativeTime } from '../../views/home/dashboard/format'
import styles from './Ai.module.css'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

const fullDate = (t: number) =>
  new Date(t).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Left-hand history drawer shared by both AI modes; coordinates with the active
 *  chat component purely through the eventBus. */
export function ChatHistory({ mode }: { mode: string }) {
  const [list, setList] = useState<ConversationMeta[]>([])
  const activeVaultId = useActiveVaultId()
  // Same key + default factory as useChatHistory so the highlight stays in sync
  // (per mode + vault — history is vault-scoped).
  const [activeId] = useViewState<string>(`ai.conv.${mode}.${activeVaultId}`, newId)
  const [collapsed, setCollapsed] = useViewState('ai.history.collapsed', false)
  // In AI Chat, the drawer is scoped to the active project (Claude-style grouping).
  const [activeProjectId, setActiveProjectId] = useViewState('ai.free.projectId', '')
  const { projects, loaded: projectsLoaded } = useProjects()
  // Before the list loads, trust the stored tag (avoids a flash of the wrong chats).
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const inVault = (id: string | null | undefined) => !!id && (!projectsLoaded || projects.some((p) => p.id === id))
  // The active project must belong to the active vault (it survives a vault switch in view
  // state); otherwise the list filters to a project this vault can't show and looks empty.
  useEffect(() => {
    if (projectsLoaded && activeProjectId && !projects.some((p) => p.id === activeProjectId)) setActiveProjectId('')
  }, [projectsLoaded, projects, activeProjectId, setActiveProjectId])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [expandedChats, setExpandedChats] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; c: ConversationMeta } | null>(null)
  const { aiHistoryAutoHide: autoHide } = useSidebarPrefs()
  const reveal = useHoverReveal(!!menu || renamingId !== null)
  const [aiMode] = useViewState('ai.mode', 'chat')
  const inProjects = aiMode === 'projects'
  const inChatsList = aiMode === 'chats'
  const [, setForceOpenProject] = useViewState('ai.projects.openId', '')

  const allVisible =
    // A chat tagged with a project from another vault counts as unassigned, so it stays reachable.
    mode === 'chat' ? list.filter((c) => (inVault(c.projectId) ? c.projectId : '') === (activeProjectId ?? '')) : list
  const visible = expandedChats ? allVisible : allVisible.slice(0, 5)

  const refresh = useCallback(() => {
    listConversations(mode, activeVaultId)
      .then(setList)
      .catch((e) => console.error('Failed to list conversations:', e))
  }, [mode, activeVaultId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const h = (p: { mode: string }) => {
      if (p.mode === mode) refresh()
    }
    eventBus.on('ai:conversationSaved', h)
    eventBus.on('ai:conversationDeleted', h)
    return () => {
      eventBus.off('ai:conversationSaved', h)
      eventBus.off('ai:conversationDeleted', h)
    }
  }, [mode, refresh])

  // Both work from Projects too: queue the action, then show the chat.
  const newChat = () => {
    requestChatAction(mode, { type: 'new' })
    goToAiMode('chat')
  }
  const load = (id: string) => {
    requestChatAction(mode, { type: 'load', id })
    goToAiMode('chat')
  }
  const showChats = () => goToAiMode('chats')
  const showProjects = () => {
    setForceOpenProject('')
    goToAiMode('projects')
  }

  const iconBtn: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-2)',
    cursor: 'pointer',
    fontSize: '0.95rem',
    lineHeight: 1,
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }

  // Collapsed: a thin rail with expand + new-chat icons.
  if (collapsed && !autoHide) {
    return (
      <div
        style={{
          width: '42px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          borderRight: '1px solid var(--border)',
          paddingRight: '0.6rem',
        }}
      >
        <button onClick={() => setCollapsed(false)} title="Expand side toolbar" aria-label="Expand side toolbar" style={iconBtn}>
          <ChevronsRight size={16} />
        </button>
        <button onClick={newChat} title="New chat" aria-label="New chat" style={{ ...iconBtn, color: 'var(--on-accent)', background: 'var(--accent)', border: 'none' }}>
          <Plus size={16} />
        </button>
        <div style={{ width: '100%', height: '1px', background: 'var(--border)', margin: '4px 0' }} />
        <button onClick={showChats} title="Chats" aria-label="Chats" aria-current={inChatsList ? 'page' : undefined} style={{ ...iconBtn, background: inChatsList ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface-2)', color: inChatsList ? 'var(--accent)' : 'var(--text-2)' }}>
          <MessageSquare size={16} />
        </button>
        <button onClick={showProjects} title="Projects" aria-label="Projects" aria-current={inProjects ? 'page' : undefined} style={{ ...iconBtn, background: inProjects ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface-2)', color: inProjects ? 'var(--accent)' : 'var(--text-2)' }}>
          <FolderKanban size={16} />
        </button>
      </div>
    )
  }

  const remove = (id: string, title: string) => deleteChats(mode, [{ id, title }])

  const commitRename = async (id: string) => {
    const title = renameText.trim()
    setRenamingId(null)
    if (title) await renameChat(mode, id, title)
  }

  const autoHideToggle = (
    <button
      onClick={() => setSidebarPrefs({ aiHistoryAutoHide: !autoHide })}
      title={autoHide ? 'Auto-hide is on — click to keep the side toolbar open' : 'Auto-hide side toolbar (show on hover at the left edge)'}
      aria-label="Auto-hide side toolbar"
      aria-pressed={autoHide}
      style={autoHide ? { ...iconBtn, color: 'var(--accent)', background: 'var(--accent-soft)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' } : iconBtn}
    >
      <PanelLeftDashed size={15} />
    </button>
  )

  const panel = (
    <div
      style={{
        width: '230px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        borderRight: '1px solid var(--border)',
        paddingRight: '0.85rem',
        minHeight: 0,
      }}
    >
      {/* Normal: drawer controls (collapse · auto-hide) on their own row above New chat.
          Auto-hide has no collapse button, so the toggle joins New chat's row instead of
          sitting alone on an otherwise empty one. */}
      {!autoHide && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={() => setCollapsed(true)} title="Collapse side toolbar" aria-label="Collapse side toolbar" style={iconBtn}>
            <ChevronsLeft size={16} />
          </button>
          <span style={{ marginLeft: 'auto' }}>{autoHideToggle}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={newChat}
          className={styles.btnPrimary}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}
        >
          <Plus size={15} /> New chat
        </button>
        {autoHide && autoHideToggle}
      </div>

      <div style={{ marginTop: '0.2rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <button
          onClick={showChats}
          aria-current={inChatsList ? 'page' : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.5rem 0.6rem',
            background: inChatsList ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: inChatsList ? 'var(--text-1)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: inChatsList ? 600 : 500,
            textAlign: 'left',
          }}
        >
          <MessageSquare size={16} color={inChatsList ? 'var(--accent)' : 'var(--text-2)'} /> Chats
        </button>
        <button
          onClick={showProjects}
          aria-current={inProjects ? 'page' : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.5rem 0.6rem',
            background: aiMode === 'projects' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: aiMode === 'projects' ? 'var(--text-1)' : 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: aiMode === 'projects' ? 600 : 500,
            textAlign: 'left',
          }}
        >
          <FolderKanban size={16} color={aiMode === 'projects' ? 'var(--accent)' : 'var(--text-2)'} /> Projects
        </button>
      </div>

      {/* The list below follows the active project; say so, with a way out. Leaving starts a
          fresh project-less chat — clearing the id alone would re-file the open chat on its next save. */}
      {mode === 'chat' && activeProject && (
        <div className={styles.historyScope}>
          <FolderKanban size={13} aria-hidden />
          <span className={styles.historyScopeName} title={`Showing chats in ${activeProject.name}`}>In {activeProject.name}</span>
          <button
            type="button"
            className={styles.historyScopeClear}
            onClick={newChat}
            title="Leave project — start a chat outside it and show all chats"
            aria-label={`Leave project ${activeProject.name}`}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
        {visible.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '0.4rem 0.2rem' }}>No saved chats yet.</p>
        )}
        {visible.map((c) => {
          const active = aiMode === 'chat' && c.id === activeId
          return (
            <div
              key={c.id}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, c }) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                border: '1px solid ' + (active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent'),
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.45rem',
                backdropFilter: active ? 'var(--fx-blur)' : 'none',
                boxShadow: active ? 'var(--fx-glow)' : 'none',
              }}
            >
              {renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={() => commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(c.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-1)',
                    fontSize: '0.8rem',
                    padding: '0.2rem 0.35rem',
                  }}
                />
              ) : (
                <button
                  onClick={() => load(c.id)}
                  title={c.title}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  <div style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{relativeTime(c.updatedAt)}</div>
                </button>
              )}

            </div>
          )
        })}
        
        {allVisible.length > 5 && (
          <button
            onClick={() => setExpandedChats(!expandedChats)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '0.4rem',
              marginTop: '4px',
              background: 'transparent',
              border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-2)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            <ChevronDown size={14} style={{ transform: expandedChats ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            {expandedChats ? 'Show less' : `View more (${allVisible.length - 5})`}
          </button>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            // Deferred: the menu hands focus back to its opener as it closes, which would blur
            // (and so commit) a rename box mounted in the same render.
            { label: 'Rename', onClick: () => { const c = menu.c; setTimeout(() => { setRenamingId(c.id); setRenameText(c.title) }) } },
            { label: 'Info', children: [{ label: `Last active ${fullDate(menu.c.updatedAt)}` }] },
            { label: 'Delete', danger: true, separator: true, onClick: () => void remove(menu.c.id, menu.c.title) },
          ]}
        />
      )}
    </div>
  )

  if (!autoHide) return panel
  // Auto-hide: a thin hot strip at the view's left edge; the drawer overlays the chat while
  // hovered, and stays while its menu or rename box is in use.
  return (
    <div
      className={styles.historyEdge}
      {...reveal.bind}
    >
      <div className={`${styles.historyFloat} ${reveal.show ? styles.historyFloatOpen : ''}`}>{panel}</div>
    </div>
  )
}
