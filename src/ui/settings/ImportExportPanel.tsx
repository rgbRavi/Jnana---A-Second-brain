// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNotesContext } from '../../context/NotesContext'
import { exportNotes } from '../../core/export'
import { log } from '../../lib/logger'
import {
  createBackup,
  exportAssets,
  exportFullVault,
  formatBytes,
  getDataHistory,
  getStorageStats,
  importFilesAsNotes,
  importMarkdownFolder,
  markBackup,
  markExport,
  restoreBackup,
  type DataHistory,
  type StorageStats,
} from '../../core/data'
import { toast } from '../../lib/toast'
import { showConfirmDialog } from '../../lib/dialog'
import styles from './ImportExportPanel.module.css'

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : 'Never')

/** Settings → Import / Export: vault export, import and backup. */
export function ImportExportPanel() {
  const { notes } = useNotesContext()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [history, setHistory] = useState<DataHistory>(getDataHistory())
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const refreshStats = () => {
    getStorageStats().then(setStats).catch(() => {})
  }
  useEffect(refreshStats, [notes.length])

  // Wrap an async action with a busy guard + error toast.
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      log.error(`Data op "${key}" failed`, err)
      toast.error(String(err))
    } finally {
      setBusy(null)
    }
  }

  const openLogs = () =>
    run('logs', async () => {
      await invoke('open_logs_dir')
    })

  const exportAll = () =>
    run('exportAll', async () => {
      const n = await exportNotes(notes)
      if (n === null) return // cancelled
      setHistory(markExport())
      toast.success(`Exported ${n} note${n !== 1 ? 's' : ''} as Markdown.`)
    })

  const exportSelected = () =>
    run('exportSelected', async () => {
      const chosen = notes.filter((nt) => selected.has(nt.id))
      if (chosen.length === 0) {
        toast.error('No notes selected.')
        return
      }
      const n = await exportNotes(chosen)
      if (n === null) return
      setHistory(markExport())
      setPicking(false)
      toast.success(`Exported ${n} note${n !== 1 ? 's' : ''}.`)
    })

  const doExportAssets = () =>
    run('assets', async () => {
      const n = await exportAssets()
      if (n === null) return
      toast.success(`Copied ${n} asset${n !== 1 ? 's' : ''}.`)
    })

  const doExportVault = () =>
    run('vault', async () => {
      const path = await exportFullVault()
      if (!path) return
      setHistory(markBackup())
      refreshStats()
      toast.success('Full vault exported.')
    })

  const doImportMarkdown = () =>
    run('importMd', async () => {
      const n = await importMarkdownFolder()
      if (n === null) return
      refreshStats()
      toast.success(`Imported ${n} note${n !== 1 ? 's' : ''}.`)
    })

  const doImportFiles = (kind: 'documents' | 'media') =>
    run(`import-${kind}`, async () => {
      const n = await importFilesAsNotes(kind)
      if (n === null) return
      refreshStats()
      toast.success(`Imported ${n} ${kind === 'documents' ? 'document' : 'media file'}${n !== 1 ? 's' : ''}.`)
    })

  const doCreateBackup = () =>
    run('backup', async () => {
      const path = await createBackup()
      setHistory(markBackup())
      refreshStats()
      toast.success(`Backup created: ${path}`)
    })

  const doRestore = () =>
    run('restore', async () => {
      const ok = await showConfirmDialog({
        title: 'Restore from backup?',
        message:
          'This replaces your current notes, links and assets with the backup. Jnana will need to restart to apply it. This cannot be undone.',
        confirmLabel: 'Choose backup…',
        danger: true,
      })
      if (!ok) return
      const staged = await restoreBackup()
      if (!staged) return
      toast.success('Backup staged. Restart Jnana to finish restoring.', 8000)
    })

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Export your vault to portable Markdown, import notes and media, or create a full backup you can
        restore later. Backups bundle a copy of the database and all assets in a single .zip.
      </p>

      {/* ── Storage ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Storage</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.noteCount ?? '—'}</span>
            <span className={styles.statLabel}>Notes</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.conversationCount ?? '—'}</span>
            <span className={styles.statLabel}>AI chats</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.assetCount ?? '—'}</span>
            <span className={styles.statLabel}>Assets</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats ? formatBytes(stats.assetBytes) : '—'}</span>
            <span className={styles.statLabel}>Asset size</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats ? formatBytes(stats.dbBytes) : '—'}</span>
            <span className={styles.statLabel}>Database</span>
          </div>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.hint}>Last export: {fmtDate(history.lastExportAt)}</span>
          <span className={styles.hint}>Last backup: {fmtDate(history.lastBackupAt)}</span>
        </div>
      </section>

      {/* ── Export ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Export</h3>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={exportAll} disabled={!!busy}>
            Export all notes (Markdown)
          </button>
          <button className={styles.btn} onClick={() => setPicking((v) => !v)} disabled={!!busy}>
            {picking ? 'Hide selection' : 'Export selected notes…'}
          </button>
          <button className={styles.btn} onClick={doExportAssets} disabled={!!busy}>
            Export assets
          </button>
          <button className={styles.btn} onClick={doExportVault} disabled={!!busy}>
            Export full vault (.zip)
          </button>
        </div>

        {picking && (
          <div className={styles.picker}>
            {notes.length === 0 && <p className={styles.hint}>No notes to export.</p>}
            {notes.map((nt) => (
              <label key={nt.id} className={styles.pickRow}>
                <input
                  type="checkbox"
                  checked={selected.has(nt.id)}
                  onChange={() => toggleSelected(nt.id)}
                />
                <span className={styles.pickTitle}>{nt.title || 'Untitled'}</span>
              </label>
            ))}
            {notes.length > 0 && (
              <button className={styles.btnPrimary} onClick={exportSelected} disabled={!!busy}>
                Export {selected.size} selected
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Import ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Import</h3>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={doImportMarkdown} disabled={!!busy}>
            Import Markdown folder
          </button>
          <button className={styles.btn} onClick={() => doImportFiles('documents')} disabled={!!busy}>
            Import documents
          </button>
          <button className={styles.btn} onClick={() => doImportFiles('media')} disabled={!!busy}>
            Import media
          </button>
        </div>
        <span className={styles.hint}>
          Each imported file becomes a new note. Markdown folders import every .md as its own note.
        </span>
      </section>

      {/* ── Backup ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Backup</h3>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={doCreateBackup} disabled={!!busy}>
            Create backup
          </button>
          <button className={styles.btnDanger} onClick={doRestore} disabled={!!busy}>
            Restore backup…
          </button>
        </div>
        <span className={styles.hint}>
          A backup is a .zip of the database plus all assets. Restoring replaces your current vault and
          takes effect after a restart.
        </span>
      </section>

      {/* ── Diagnostics ── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Diagnostics</h3>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={openLogs} disabled={!!busy}>
            Open logs folder
          </button>
        </div>
        <span className={styles.hint}>
          Opens the folder containing jnana.log — handy when reporting an issue.
        </span>
      </section>
    </div>
  )
}
