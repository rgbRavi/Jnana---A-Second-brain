// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Pencil, Plus, X, FolderKanban, ChevronDown } from 'lucide-react'
import { ask } from '@tauri-apps/plugin-dialog'
import { eventBus } from '../../lib/eventBus'
import { listConversations, deleteConversation, renameConversation } from '../../core/chat'
import { useViewState } from '../../hooks/useViewState'
import { useActiveVaultId } from '../../hooks/useVaults'
import type { ConversationMeta } from '../../types'
import styles from './Ai.module.css'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

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
  const [activeProjectId] = useViewState('ai.free.projectId', '')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [expandedChats, setExpandedChats] = useState(false)
  const [aiMode, setAiMode] = useViewState('ai.mode', 'focused')
  const [, setForceOpenProject] = useViewState('ai.projects.openId', '')

  const allVisible =
    mode === 'chat' ? list.filter((c) => (c.projectId ?? '') === (activeProjectId ?? '')) : list
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

  const newChat = () => eventBus.emit('ai:newChat', { mode })
  const load = (id: string) => eventBus.emit('ai:loadConversation', { mode, id })

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
  if (collapsed) {
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
        <button onClick={newChat} title="New chat" aria-label="New chat" style={{ ...iconBtn, color: '#fff', background: 'var(--accent)', border: 'none' }}>
          <Plus size={16} />
        </button>
        <div style={{ width: '100%', height: '1px', background: 'var(--border)', margin: '4px 0' }} />
        <button onClick={() => { setForceOpenProject(''); setAiMode('projects') }} title="Projects" aria-label="Projects" style={{ ...iconBtn, background: aiMode === 'projects' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface-2)', color: aiMode === 'projects' ? 'var(--accent)' : 'var(--text-2)' }}>
          <FolderKanban size={16} />
        </button>
      </div>
    )
  }

  const remove = async (id: string, title: string) => {
    const ok = await ask(`Delete chat "${title || 'Untitled'}"?`, { title: 'Delete chat', kind: 'warning' })
    if (!ok) return
    await deleteConversation(id).catch((e) => console.error(e))
    if (id === activeId) eventBus.emit('ai:newChat', { mode }) // reset the open chat
    eventBus.emit('ai:conversationDeleted', { mode })
  }

  const commitRename = async (id: string) => {
    const title = renameText.trim()
    setRenamingId(null)
    if (!title) return
    await renameConversation(id, title, Date.now()).catch((e) => console.error(e))
    refresh()
  }

  return (
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
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button onClick={() => setCollapsed(true)} title="Collapse side toolbar" aria-label="Collapse side toolbar" style={iconBtn}>
          <ChevronsLeft size={16} />
        </button>
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
      </div>

      <div style={{ marginTop: '0.2rem' }}>
        <button
          onClick={() => {
            setForceOpenProject('')
            setAiMode('projects')
          }}
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
      
      <div style={{ margin: '0.5rem 0 0.2rem', padding: '0 0.2rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Recent Chats
      </div>

      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', minHeight: 0 }}>
        {visible.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '0.4rem 0.2rem' }}>No saved chats yet.</p>
        )}
        {visible.map((c) => {
          const active = c.id === activeId
          return (
            <div
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                backdropFilter: active ? 'blur(8px)' : 'none',
                border: '1px solid ' + (active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent'),
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.45rem',
                boxShadow: active ? '0 0 10px color-mix(in srgb, var(--accent) 20%, transparent)' : 'none',
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
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{fmt(c.updatedAt)}</div>
                </button>
              )}

              <button
                onClick={() => {
                  setRenamingId(c.id)
                  setRenameText(c.title)
                }}
                title="Rename"
                aria-label="Rename chat"
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => remove(c.id, c.title)}
                title="Delete"
                aria-label="Delete chat"
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
              >
                <X size={14} />
              </button>
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
    </div>
  )
}
