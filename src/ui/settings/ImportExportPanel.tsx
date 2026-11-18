// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useNotesContext } from '../../context/NotesContext'
import { exportNotes, toastExported } from '../../core/export'
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
  openLogsDir,
  restartApp,
  restoreBackup,
  revealInFolder,
  type DataHistory,
  type StorageStats,
} from '../../core/data'
import { dismissToast, toast, updateToast } from '../../lib/toast'
import { formatDate } from '../../core/dateFormat'
import { plural } from '../../lib/plural'
import { MirrorReadError, mirrorAll, pickMirrorFolder } from '../../core/mirror'
import { getAllNotes } from '../../core/notes'
import { useGeneralSettings } from '../../hooks/useGeneralSettings'
import { useActiveVaultId } from '../../hooks/useVaults'
import { showChoiceDialog, showConfirmDialog } from '../../lib/dialog'
import { DEFAULT_VAULT_ID } from '../../types'
import { SettingActionRow, SettingButton, SettingPanel, SettingSection, settingInputClass } from './SettingLayout'
import styles from './ImportExportPanel.module.css'

const PICK_MAX = 200
const echo = (q: string) => (q.length > 60 ? q.slice(0, 60) + '…' : q)

/** Progress toast that resolves to a self-dismissing success (or vanishes on error — `run` toasts that). */
async function withProgress<T>(message: string, fn: (report: (done: number, total: number) => void) => Promise<T>, done: (r: T) => string | null): Promise<T> {
  const id = toast.progress(message)
  try {
    const r = await fn((d, t) => updateToast(id, { progress: t ? d / t : 0, message: `${message} ${d.toLocaleString()} of ${t.toLocaleString()}` }))
    const msg = done(r)
    if (msg) updateToast(id, { progress: 1, message: msg, variant: 'success', duration: 4000 })
    else dismissToast(id)
    return r
  } catch (err) {
    dismissToast(id)
    throw err
  }
}

/** Settings → Backup & export: backup/restore, export, import, mirror and logs. */
export function ImportExportPanel() {
  const { notes } = useNotesContext()
  const activeVault = useActiveVaultId()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [history, setHistory] = useState<DataHistory>(getDataHistory())
  const [busy, setBusy] = useState<string | null>(null)
  const [{ mirrorDir }, setGeneral] = useGeneralSettings()
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // A selection belongs to one vault — switching vaults starts it over.
  useEffect(() => setSelected(new Set()), [activeVault])
  const [query, setQuery] = useState('')
  // Filter on a debounced copy so 1000s of rows don't re-render per keystroke.
  const [dq, setDq] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setDq(query), 150)
    return () => window.clearTimeout(t)
  }, [query])

  // Export is vault-scoped (it writes a flat folder, so mixing vaults would
  // merge same-titled notes); the full backup is what carries every vault.
  const vaultNotes = useMemo(() => notes.filter((n) => (n.vaultId ?? DEFAULT_VAULT_ID) === activeVault), [notes, activeVault])
  const visible = useMemo(() => {
    const q = dq.trim().toLowerCase()
    return q ? vaultNotes.filter((n) => (n.title || 'Untitled').toLowerCase().includes(q)) : vaultNotes
  }, [vaultNotes, dq])

  const refreshStats = () => {
    setStatsFailed(false)
    getStorageStats().then(setStats).catch(() => setStatsFailed(true))
  }
  useEffect(refreshStats, [notes.length])

  // Busy guard + plain-language error toast; the real error goes to the log once.
  const run = async (key: string, failMessage: string, fn: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      log.error(`Data op "${key}" failed`, err)
      toast.error(failMessage)
    } finally {
      setBusy(null)
    }
  }

  const startMirror = async () => {
    if (busy) return
    setBusy('mirror')
    try {
      const dir = await pickMirrorFolder()
      if (!dir) return
      const ok = await showConfirmDialog({
        title: 'Mirror notes into this folder?',
        message: `Jnana will write a .md file for every note into ${dir} and keep them updated. A file there with the same name as a note is overwritten, so an empty folder is best.`,
        confirmLabel: 'Mirror notes',
      })
      if (!ok) return
      const id = toast.progress('Mirroring notes…')
      // Live before the first copy finishes: the mirror's queue runs saves made
      // meanwhile after it, so nothing edited during a long copy is missed.
      setGeneral({ mirrorDir: dir })
      try {
        await mirrorAll(dir, getAllNotes)
        updateToast(id, { progress: 1, message: 'Notes mirrored. Saving a note now updates that folder.', variant: 'success', duration: 4000 })
      } catch (err) {
        setGeneral({ mirrorDir: null })
        log.error('[mirror] initial mirror failed', err)
        const message = err instanceof MirrorReadError ? "Couldn't read your notes. Try again in a moment." : "Couldn't write to that folder. Check it exists and is writable."
        updateToast(id, { progress: undefined, message, variant: 'error', duration: 5000 })
      }
    } finally {
      setBusy(null)
    }
  }

  const revealAction = (path: string) => ({
    label: 'Show in folder',
    onClick: () => {
      revealInFolder(path).catch((err) => {
        log.error('Reveal backup failed', err)
        toast.error("Couldn't open the folder.")
      })
    },
  })

  const openLogs = () => run('logs', "Couldn't open the logs folder.", openLogsDir)

  const exportAll = () =>
    run('exportAll', "Couldn't export notes — check the folder is writable.", async () => {
      const result = await exportNotes(vaultNotes)
      if (result === null) return // cancelled
      setHistory(markExport())
      toastExported(result)
    })

  const exportSelected = () =>
    run('exportSelected', "Couldn't export the selected notes — check the folder is writable.", async () => {
      const chosen = vaultNotes.filter((nt) => selected.has(nt.id))
      if (chosen.length === 0) {
        toast.error('Select at least one note to export.')
        return
      }
      const result = await exportNotes(chosen)
      if (result === null) return
      setHistory(markExport())
      setPicking(false)
      toastExported(result)
    })

  const doExportAssets = () =>
    run('assets', "Couldn't export assets — check the folder is writable.", async () => {
      // Rust copies in one call (no counts), so the bar is indeterminate until it resolves.
      const id = toast.progress('Exporting media files…')
      try {
        const n = await exportAssets()
        if (n === null) return dismissToast(id)
        updateToast(id, { progress: 1, message: `Copied ${plural(n, 'asset')}.`, variant: 'success', duration: 4000 })
      } catch (err) {
        dismissToast(id)
        throw err
      }
    })

  const doExportVault = () =>
    run('vault', "Couldn't save the backup there — check the folder is writable and has space.", async () => {
      const path = await exportFullVault()
      if (!path) return
      setHistory(markBackup())
      refreshStats()
      toast.success('Backup saved.', 8000, revealAction(path))
    })

  const doImportMarkdown = () =>
    run('importMd', "Couldn't import that folder. Check it contains readable .md files.", async () => {
      try {
        await withProgress('Importing notes…', (report) => importMarkdownFolder(report), (n) => (n === null ? null : `Imported ${plural(n, 'note')}.`))
      } finally {
        refreshStats()
      }
    })

  const doImportFiles = (kind: 'documents' | 'media') =>
    run(`import-${kind}`, `Couldn't import those ${kind}. Check the files are readable.`, async () => {
      const noun = kind === 'documents' ? 'document' : 'media file'
      try {
        const r = await withProgress(
          'Importing…',
          (report) => importFilesAsNotes(kind, report),
          (res) => {
            // All failed: no green "Imported 0 of N" — the error toast below says it.
            if (!res || res.imported === 0) return null
            if (res.failed === 0) return `Imported ${plural(res.imported, noun)}.`
            return `Imported ${res.imported.toLocaleString()} of ${(res.imported + res.failed).toLocaleString()} files — ${res.failed.toLocaleString()} couldn't be read.`
          },
        )
        if (r && r.failed > 0 && r.imported === 0) toast.error(`Couldn't import those ${kind}. Check the files are readable.`)
      } finally {
        refreshStats() // partial imports already created notes
      }
    })

  const doCreateBackup = () =>
    run('backup', "Couldn't create the backup — check there's free disk space.", async () => {
      const path = await createBackup()
      setHistory(markBackup())
      refreshStats()
      toast.success('Backup created.', 8000, revealAction(path))
    })

  const doRestore = () =>
    run('restore', "Couldn't restore that backup. Check it's a Jnana backup .zip.", async () => {
      const choice = await showChoiceDialog({
        title: 'Restore from backup?',
        message: 'Restoring replaces your current notes, links and assets with the backup, and cannot be undone. Jnana restarts to apply it.',
        options: [
          { value: 'backup', label: 'Back up first', description: 'Save a copy of your current vault, then choose the backup to restore.', primary: true },
          { value: 'restore', label: 'Restore without a backup', description: 'Choose the backup to restore right away.' },
        ],
      })
      if (!choice) return
      if (choice === 'backup') {
        try {
          const path = await createBackup()
          setHistory(markBackup())
          toast.success('Current vault backed up.', 8000, revealAction(path))
        } catch (err) {
          log.error('Pre-restore backup failed', err)
          toast.error("Couldn't back up your current vault, so nothing was restored. Check there's free disk space.")
          return
        }
      }
      const staged = await restoreBackup()
      if (!staged) return
      toast.success('Backup ready. Restart Jnana to finish restoring.', 0, {
        label: 'Restart now',
        onClick: () => {
          restartApp().catch((err) => {
            log.error('Restart failed', err)
            toast.error("Couldn't restart automatically. Close and reopen Jnana to finish restoring.")
          })
        },
      })
    })

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Selects every match, not just the rendered rows.
  const selectVisible = () => setSelected((prev) => new Set([...prev, ...visible.map((n) => n.id)]))
  const clearVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      visible.forEach((n) => next.delete(n.id))
      return next
    })

  const anyBusy = !!busy
  const summary = stats
    ? `${plural(stats.noteCount, 'note')} · ${plural(stats.assetCount, 'asset')} (${formatBytes(stats.assetBytes)}) · ${plural(stats.conversationCount, 'AI chat')} · database ${formatBytes(stats.dbBytes)}`
    : statsFailed
      ? "Couldn't read storage details."
      : 'Loading storage…'

  return (
    <SettingPanel>
      <p className={styles.summary}>
        <span className={styles.nums}>
          {summary}
          {statsFailed && !stats && (
            <>
              {' '}
              <SettingButton onClick={refreshStats}>Retry</SettingButton>
            </>
          )}
        </span>
        <span className={styles.nums}>
          {history.lastBackupAt ? `Last backup ${formatDate(history.lastBackupAt)}` : 'No backup yet'} ·{' '}
          {history.lastExportAt ? `last export ${formatDate(history.lastExportAt)}` : 'no export yet'}
        </span>
      </p>

      <SettingSection title="Back up & restore">
        <SettingActionRow
          label="Back up"
          hint="One .zip of every vault: notes, links and media. Back up now keeps it in Jnana’s backups folder; Save a backup to… lets you pick a folder."
          hintVisible
        >
            <SettingButton variant="primary" busy={busy === 'backup'} disabled={anyBusy} onClick={doCreateBackup}>
              Back up now
            </SettingButton>
            <SettingButton busy={busy === 'vault'} disabled={anyBusy} onClick={doExportVault}>
              Save a backup to…
            </SettingButton>
        </SettingActionRow>
        <SettingActionRow label="Restore" hint="Replaces everything in Jnana with the backup, after a restart." hintVisible>
            <SettingButton variant="danger" busy={busy === 'restore'} disabled={anyBusy} onClick={doRestore}>
              Restore backup…
            </SettingButton>
        </SettingActionRow>
      </SettingSection>

      <SettingSection
        title="Export"
        intro="Active vault only: note text, media, tags and timestamps. PDF highlights, canvases and workspaces need a backup."
      >
        <SettingActionRow label="Markdown">
            <SettingButton busy={busy === 'exportAll'} disabled={anyBusy} onClick={exportAll}>
              Export notes as Markdown…
            </SettingButton>
            <SettingButton disabled={anyBusy} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
              {picking ? 'Hide selection' : 'Export selected notes…'}
            </SettingButton>
        </SettingActionRow>
        <SettingActionRow label="Media files">
            <SettingButton busy={busy === 'assets'} disabled={anyBusy} onClick={doExportAssets}>
              Export media files…
            </SettingButton>
        </SettingActionRow>

        {picking && (
          <div className={styles.picker}>
            {vaultNotes.length === 0 ? (
              <p className={styles.hint}>No notes in this vault to export.</p>
            ) : (
              <>
                <div className={styles.pickTools}>
                  <input
                    type="search"
                    className={`${settingInputClass} ${styles.search}`}
                    aria-label="Filter notes"
                    placeholder="Filter notes…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <SettingButton onClick={selectVisible} disabled={visible.length === 0}>Select all {visible.length.toLocaleString()}</SettingButton>
                  <SettingButton onClick={clearVisible} disabled={visible.length === 0}>Clear</SettingButton>
                </div>
                <div className={styles.pickList} role="group" aria-label="Notes to export">
                  {visible.length === 0 && <p className={styles.hint}>No notes match “{echo(dq)}”.</p>}
                  {visible.slice(0, PICK_MAX).map((nt) => {
                    const on = selected.has(nt.id)
                    return (
                      <button
                        key={nt.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        className={styles.pickRow}
                        onClick={() => toggleSelected(nt.id)}
                      >
                        <span className={`${styles.box} ${on ? styles.boxOn : ''}`} aria-hidden>
                          {on && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className={styles.pickTitle} title={nt.title || 'Untitled'}>{nt.title || 'Untitled'}</span>
                      </button>
                    )
                  })}
                </div>
                {visible.length > PICK_MAX && (
                  <p className={styles.hint}>
                    Showing {PICK_MAX} of {visible.length.toLocaleString()} — type to narrow.
                  </p>
                )}
                <SettingButton busy={busy === 'exportSelected'} disabled={anyBusy || selected.size === 0} onClick={exportSelected}>
                  Export {selected.size} selected
                </SettingButton>
              </>
            )}
          </div>
        )}
      </SettingSection>

      <SettingSection title="Import">
        <SettingActionRow
          label="Import"
          hint="Each imported file becomes a new note. Markdown folders import every .md as its own note."
          hintVisible
         column>
            <SettingButton busy={busy === 'importMd'} disabled={anyBusy} onClick={doImportMarkdown}>
              Import a Markdown folder…
            </SettingButton>
            <SettingButton busy={busy === 'import-documents'} disabled={anyBusy} onClick={() => doImportFiles('documents')}>
              Import documents (PDF, Word…)…
            </SettingButton>
            <SettingButton busy={busy === 'import-media'} disabled={anyBusy} onClick={() => doImportFiles('media')}>
              Import images, audio & video…
            </SettingButton>
        </SettingActionRow>
      </SettingSection>

      <SettingSection
        title="Markdown mirror"
        intro="Keeps a readable .md copy of every note in a folder you choose — handy for other apps or cloud sync. Jnana never reads it back."
      >
        <SettingActionRow
          label="Mirror folder"
          hint={
            mirrorDir ? (
              <>
                Mirroring to <code title={mirrorDir}>{mirrorDir}</code>. Each save updates that note's .md file; edits made in the folder are overwritten.
              </>
            ) : (
              'Organised by vault and folder. Edits made in that folder are never imported.'
            )
          }
          hintVisible
        >
            {mirrorDir ? (
              <SettingButton disabled={anyBusy} onClick={() => setGeneral({ mirrorDir: null })}>
                Stop mirroring
              </SettingButton>
            ) : (
              <SettingButton busy={busy === 'mirror'} disabled={anyBusy} onClick={startMirror}>
                Mirror to folder…
              </SettingButton>
            )}
        </SettingActionRow>
      </SettingSection>

      <SettingSection title="Logs">
        <SettingActionRow label="Log files" hint="Attach jnana.log when you report a problem." hintVisible>
            <SettingButton busy={busy === 'logs'} disabled={anyBusy} onClick={openLogs}>
              Open logs folder
            </SettingButton>
        </SettingActionRow>
      </SettingSection>
    </SettingPanel>
  )
}
