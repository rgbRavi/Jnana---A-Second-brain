// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The file-explorer panel — a second sidebar to the right of the nav sidebar. It
// owns the vault switcher (create / rename / delete / switch, Obsidian-style) and
// hosts the active vault's FolderTree. Collapsible to a thin rail via a button
// (persisted, like useSidebarPrefs). Vault + folder + note names are all edited
// inline — no dialogs (except the destructive delete confirmations).

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useVaults, useActiveVaultId, setActiveVaultId } from '../../hooks/useVaults'
import { createVault, saveVault, deleteVault } from '../../core/vaults'
import { DEFAULT_VAULT_ID } from '../../types'
import { toast } from '../../lib/toast'
import { showConfirmDialog } from '../../lib/dialog'
import { log } from '../../lib/logger'
import { ContextMenu, type MenuItem } from '../ContextMenu'
import { FolderTree, requestReveal } from './FolderTree'
import { eventBus } from '../../lib/eventBus'
import { PanelLeftClose, PanelLeftDashed, PanelLeftOpen, Package, ChevronDown } from 'lucide-react'
import { setSidebarPrefs, useSidebarPrefs } from '../../hooks/useSidebarPrefs'
import { useHoverReveal } from '../../hooks/useHoverReveal'
import styles from './FileExplorer.module.css'

// ─── Collapsed state (persisted module store) ───────────

const STORAGE_KEY = 'jnana.explorer.collapsed.v1'
let collapsed = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()
function setCollapsed(v: boolean) {
  collapsed = v
  try {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}
function useExplorerCollapsed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => collapsed,
    () => collapsed,
  )
}

export function FileExplorer() {
  const { vaults, refresh } = useVaults()
  const activeVaultId = useActiveVaultId()
  const isCollapsed = useExplorerCollapsed()

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [renamingVault, setRenamingVault] = useState(false)
  const [draft, setDraft] = useState('')
  const switcherRef = useRef<HTMLButtonElement>(null)
  const { explorerAutoHide: autoHide } = useSidebarPrefs()
  const reveal = useHoverReveal(!!menuPos || renamingVault)

  const activeVault = vaults.find((v) => v.id === activeVaultId)

  // "Reveal in file explorer" (e.g. the Working Notes tab menu): un-collapse (or, in
  // auto-hide mode, pop it open for a moment), then hand the note to the tree — which
  // may only mount after this render.
  const { peek } = reveal
  useEffect(() => {
    const handler = ({ noteId }: { noteId: string }) => {
      setCollapsed(false)
      peek()
      requestReveal(noteId)
    }
    eventBus.on('explorer:reveal', handler)
    return () => eventBus.off('explorer:reveal', handler)
  }, [peek])

  // If the active vault vanished (deleted elsewhere), fall back to a real one.
  useEffect(() => {
    if (vaults.length > 0 && !vaults.some((v) => v.id === activeVaultId)) {
      setActiveVaultId(vaults[0]?.id ?? DEFAULT_VAULT_ID)
    }
  }, [vaults, activeVaultId])

  const beginRenameVault = () => {
    setDraft(activeVault?.name ?? '')
    setRenamingVault(true)
  }

  const commitRenameVault = async () => {
    const name = draft.trim()
    setRenamingVault(false)
    if (!activeVault || !name || name === activeVault.name) return
    try {
      await saveVault({ ...activeVault, name, updatedAt: Date.now() })
    } catch (e) {
      log.error('Failed to rename vault', e)
      toast.error('Could not rename vault')
    }
  }

  const handleNewVault = async () => {
    const vault = createVault('New Vault')
    try {
      await saveVault(vault)
      await refresh()
      setActiveVaultId(vault.id)
      setDraft(vault.name)
      setRenamingVault(true)
    } catch (e) {
      log.error('Failed to create vault', e)
      toast.error('Could not create vault')
    }
  }

  const handleDeleteVault = async () => {
    if (!activeVault) return
    if (vaults.length <= 1) {
      toast.error("Can't delete your only vault.")
      return
    }
    const reassignTo = vaults.find((v) => v.id !== activeVault.id)!
    const ok = await showConfirmDialog({
      title: `Delete vault "${activeVault.name}"?`,
      message: `Its notes move to "${reassignTo.name}" (unfiled) — nothing is deleted. Its folders are removed.`,
      confirmLabel: 'Delete vault',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteVault(activeVault.id, reassignTo.id)
      setActiveVaultId(reassignTo.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete vault')
    }
  }

  const openSwitcher = () => {
    const r = switcherRef.current?.getBoundingClientRect()
    if (r) setMenuPos({ x: r.left, y: r.bottom + 4 })
  }

  const switcherMenu: MenuItem[] = [
    ...vaults.map((v) => ({
      label: `${v.id === activeVaultId ? '✓ ' : '   '}${v.name}`,
      onClick: () => setActiveVaultId(v.id),
    })),
    { label: 'New vault', separator: true, onClick: () => void handleNewVault() },
    { label: 'Rename vault', onClick: beginRenameVault },
    { label: 'Delete vault', danger: true, onClick: () => void handleDeleteVault() },
  ]

  if (isCollapsed && !autoHide) {
    return (
      <div className={styles.rail}>
        <button
          type="button"
          className={styles.railBtn}
          onClick={() => setCollapsed(false)}
          title="Show file explorer"
          aria-label="Show file explorer"
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    )
  }

  const panel = (
    <aside className={styles.panel}>
      <div className={styles.vaultBar}>
        {renamingVault ? (
          <input
            className={styles.vaultInput}
            value={draft}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRenameVault()
              else if (e.key === 'Escape') setRenamingVault(false)
            }}
            onBlur={() => void commitRenameVault()}
          />
        ) : (
          <button
            ref={switcherRef}
            type="button"
            className={styles.vaultSwitcher}
            onClick={openSwitcher}
            title="Switch vault"
          >
            <span className={styles.vaultIcon} aria-hidden>
              <Package size={16} />
            </span>
            <span className={styles.vaultName}>{activeVault?.name ?? 'Vault'}</span>
            <span className={styles.vaultChevron} aria-hidden>
              <ChevronDown size={14} strokeWidth={2.5} />
            </span>
          </button>
        )}
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={() => setSidebarPrefs({ explorerAutoHide: !autoHide })}
          title={autoHide ? 'Auto-hide is on — click to keep the file explorer open' : 'Auto-hide file explorer (show on hover at its edge)'}
          aria-label="Auto-hide file explorer"
          aria-pressed={autoHide}
        >
          <PanelLeftDashed size={16} />
        </button>
        {!autoHide && (
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed(true)}
            title="Hide file explorer"
            aria-label="Hide file explorer"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <FolderTree vaultId={activeVaultId} />

      {menuPos && (
        <ContextMenu x={menuPos.x} y={menuPos.y} items={switcherMenu} onClose={() => setMenuPos(null)} />
      )}
    </aside>
  )

  if (!autoHide) return panel
  // Auto-hide: a thin strip beside the nav sidebar; the explorer overlays the page while hovered.
  return (
    <div className={styles.edge} {...reveal.bind}>
      <div className={`${styles.float} ${reveal.show ? styles.floatOpen : ''}`}>{panel}</div>
    </div>
  )
}
