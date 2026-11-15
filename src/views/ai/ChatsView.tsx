// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, Search, Trash2 } from 'lucide-react'
import { listConversations } from '../../core/chat'
import { eventBus } from '../../lib/eventBus'
import { log } from '../../lib/logger'
import { requestChatAction, deleteChats, renameChat } from '../../hooks/useChatHistory'
import { useActiveVaultId } from '../../hooks/useVaults'
import { useProjects } from '../../hooks/useProjects'
import { goToAiMode, backAiMode, useAiBackLabel } from '../../hooks/aiNav'
import { ContextMenu, type MenuItem } from '../../ui/ContextMenu'
import { relativeTime } from '../home/dashboard/format'
import styles from './ChatsView.module.css'
import type { ConversationMeta } from '../../types'

const checkbox: React.CSSProperties = { margin: 0, width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }

/** Every chat in the active vault (all projects): search by title, open, rename, and
 *  delete one or many (checkboxes + select all). */
export function ChatsView() {
  const vaultId = useActiveVaultId()
  const { projects } = useProjects()
  const backLabel = useAiBackLabel()
  const [chats, setChats] = useState<ConversationMeta[] | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; c: ConversationMeta } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const refresh = () =>
      listConversations('chat', vaultId)
        .then((list) => {
          setChats(list)
          // Drop selections whose chat is gone (deleted here or elsewhere).
          setSelected((s) => new Set(list.filter((c) => s.has(c.id)).map((c) => c.id)))
        })
        .catch((e) => { log.error('Failed to list chats', e); setChats([]) })
    refresh()
    const onChange = (p: { mode: string }) => { if (p.mode === 'chat') refresh() }
    eventBus.on('ai:conversationSaved', onChange)
    eventBus.on('ai:conversationDeleted', onChange)
    return () => {
      eventBus.off('ai:conversationSaved', onChange)
      eventBus.off('ai:conversationDeleted', onChange)
    }
  }, [vaultId])

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name
  // ponytail: title-only search; matching message text needs a Rust-side query.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = [...(chats ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)
    return q ? all.filter((c) => (c.title || 'Untitled').toLowerCase().includes(q)) : all
  }, [chats, query])

  // "Select all" acts on what the search shows.
  const visibleSelected = visible.filter((c) => selected.has(c.id)).length
  const allSelected = visible.length > 0 && visibleSelected === visible.length
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = visibleSelected > 0 && !allSelected
  }, [visibleSelected, allSelected])

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s)
      for (const c of visible) {
        if (allSelected) next.delete(c.id)
        else next.add(c.id)
      }
      return next
    })

  const remove = (list: ConversationMeta[]) => void deleteChats('chat', list)
  const selectedChats = (chats ?? []).filter((c) => selected.has(c.id))

  const open = (id: string) => {
    requestChatAction('chat', { type: 'load', id })
    goToAiMode('chat')
  }

  const commitRename = async (id: string) => {
    const title = renameText.trim()
    setRenamingId(null)
    if (title) await renameChat('chat', id, title)
  }

  const menuItems = (c: ConversationMeta): MenuItem[] => [
    // Deferred: the menu hands focus back to its opener as it closes, which would blur
    // (and so commit) a rename box mounted in the same render.
    { label: 'Rename', onClick: () => setTimeout(() => { setRenamingId(c.id); setRenameText(c.title) }) },
    ...(selected.has(c.id) && selected.size > 1
      ? [{ label: `Delete ${selected.size} selected`, danger: true, separator: true, onClick: () => remove(selectedChats) }]
      : [{ label: 'Delete', danger: true, separator: true, onClick: () => remove([c]) }]),
  ]

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 820, width: '100%', margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={backAiMode}
          title={backLabel}
          aria-label={backLabel}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.4rem', cursor: 'pointer',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <MessageSquare size={22} color="var(--accent)" /> Chats
      </h1>

      <label
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '0.55rem 0.75rem',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        }}
      >
        <Search size={16} color="var(--text-3)" aria-hidden />
        <input
          autoFocus
          type="search"
          aria-label="Search chats"
          placeholder="Search your chats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontSize: '0.92rem' }}
        />
      </label>

      {chats && chats.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: 30, padding: '0 0.6rem', fontSize: '0.8rem', color: 'var(--text-3)' }}>
          <input
            ref={selectAllRef}
            type="checkbox"
            aria-label="Select all chats"
            title={allSelected ? 'Deselect all' : 'Select all'}
            checked={allSelected}
            disabled={visible.length === 0}
            onChange={toggleAll}
            style={checkbox}
          />
          <span style={{ flex: 1 }}>
            {selected.size > 0
              ? `${selected.size} selected`
              : query.trim() ? `${visible.length} of ${chats.length} chats` : `${chats.length} chat${chats.length === 1 ? '' : 's'}`}
          </span>
          {selected.size > 0 && (
            <>
              <button
                onClick={() => setSelected(new Set())}
                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Clear
              </button>
              <button
                onClick={() => remove(selectedChats)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '0.3rem 0.7rem', cursor: 'pointer',
                  fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', color: 'var(--danger)',
                  background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
                }}
              >
                <Trash2 size={13} /> Delete {selected.size}
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
        {chats && visible.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', padding: '1.5rem 0', textAlign: 'center' }}>
            {chats.length === 0 ? 'No chats yet.' : `No chats match “${query.trim()}”.`}
          </p>
        )}
        {visible.map((c) => {
          const project = projectName(c.projectId)
          const isSelected = selected.has(c.id)
          return (
            <div
              key={c.id}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, c }) }}
              className={`${styles.row}${isSelected ? ` ${styles.selected}` : ''}`}
            >
              <input
                type="checkbox"
                aria-label={`Select ${c.title || 'Untitled'}`}
                checked={isSelected}
                onChange={() => toggle(c.id)}
                style={checkbox}
              />
              {renamingId === c.id ? (
                <input
                  autoFocus
                  aria-label="Chat title"
                  value={renameText}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={() => void commitRename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename(c.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  style={{
                    flex: 1, minWidth: 0, margin: '0.6rem 0', padding: '0.35rem 0.5rem', fontSize: '0.92rem',
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)',
                  }}
                />
              ) : (
                <button
                  onClick={() => open(c.id)}
                  title={c.title || 'Untitled'}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px', textAlign: 'left',
                    cursor: 'pointer', padding: '0.75rem 0', background: 'transparent', border: 'none', color: 'var(--text-1)',
                  }}
                >
                  <span style={{ maxWidth: '100%', fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.title || 'Untitled'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    Last message {relativeTime(c.updatedAt)}{project ? ` · ${project}` : ''}
                  </span>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.c)} onClose={() => setMenu(null)} />}
    </div>
  )
}
