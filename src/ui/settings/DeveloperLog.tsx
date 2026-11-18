// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Settings → Developer → Developer Log: the in-memory app log (lib/logger.ts) with
// filters, expandable entries, copy/export and live pause. Rendering is paged
// (PAGE rows, "Show older" for more) so a full 2000-entry buffer stays responsive.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { getVersion } from '@tauri-apps/api/app'
import { appLogDir } from '@tauri-apps/api/path'
import {
  clearLogEntries,
  getLogEntries,
  getLogSettings,
  setLogSettings,
  subscribeLog,
  subscribeLogSettings,
  type DevLogLevel,
  type FileLogLevel,
  type LogEntry,
  type LogLevel,
  type LogSource,
} from '../../lib/logger'
import { DEFAULT_FILTER, LEVELS, distinct, filterLogEntries, formatEntry, formatExport, type LogFilter } from '../../lib/logView'
import { showConfirmDialog } from '../../lib/dialog'
import { toast } from '../../lib/toast'
import { saveTextFile } from '../../core/saveCsv'
import { SettingSelect } from './SettingControls'
import { SettingButton, SettingSection, settingInputClass } from './SettingLayout'
import styles from './DeveloperLog.module.css'

const PAGE = 200

const TIME_OPTIONS = [
  { value: '0', label: 'All time' },
  { value: String(5 * 60_000), label: 'Last 5 min' },
  { value: String(60 * 60_000), label: 'Last hour' },
  { value: String(24 * 60 * 60_000), label: 'Last 24 h' },
]

async function copy(text: string, what: string): Promise<void> {
  try {
    await writeText(text)
    toast.success(`${what} copied.`)
  } catch {
    toast.error(`Couldn't copy ${what.toLowerCase()}. Try again.`)
  }
}

function Row({ entry, onCorrelate }: { entry: LogEntry; onCorrelate: (opId: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`${styles.row} ${styles[`lv_${entry.level}`]}`}>
      <button type="button" className={styles.rowHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <time>{new Date(entry.ts).toLocaleTimeString()}</time>
        <span className={styles.level}>{entry.level}</span>
        <code className={styles.where}>
          {entry.source !== 'app' && <span className={styles.source}>{entry.source}</span>}
          {entry.category}
          {entry.pluginId && `:${entry.pluginId}`}
        </code>
        <span className={styles.message}>{entry.message}</span>
        {entry.durationMs !== undefined && <span className={styles.duration}>{entry.durationMs} ms</span>}
      </button>
      {open && (
        <div className={styles.detail}>
          <dl>
            {entry.event && (
              <>
                <dt>event</dt>
                <dd>{entry.event}</dd>
              </>
            )}
            {entry.opId && (
              <>
                <dt>operation</dt>
                <dd>
                  <button type="button" className={styles.link} onClick={() => onCorrelate(entry.opId!)} title="Show every entry of this operation">
                    {entry.opId}
                  </button>
                </dd>
              </>
            )}
            <dt>time</dt>
            <dd>{new Date(entry.ts).toISOString()}</dd>
          </dl>
          {entry.data && <pre>{prettyJson(entry.data)}</pre>}
          {entry.error && (
            <pre className={styles.error}>
              {entry.error.name}: {entry.error.message}
              {entry.error.stack ? `\n${entry.error.stack}` : ''}
            </pre>
          )}
          <SettingButton onClick={() => void copy(formatEntry(entry), 'Entry')}>
            Copy entry
          </SettingButton>
        </div>
      )}
    </li>
  )
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

export function DeveloperLog() {
  const live = useSyncExternalStore(subscribeLog, getLogEntries)
  const settings = useSyncExternalStore(subscribeLogSettings, getLogSettings)
  const [paused, setPaused] = useState<LogEntry[] | null>(null)
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_FILTER)
  const [limit, setLimit] = useState(PAGE)
  const [logDir, setLogDir] = useState('')

  useEffect(() => {
    appLogDir().then(setLogDir).catch(() => setLogDir(''))
  }, [])

  // Recompute at most every 200 ms: a chatty log would otherwise re-filter and
  // reverse up to 2,000 rows on every single entry.
  const [snap, setSnap] = useState(live)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current !== null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      setSnap(getLogEntries())
    }, 200)
  }, [live])
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const [exporting, setExporting] = useState(false)

  const entries = paused ?? snap
  const shown = useMemo(() => filterLogEntries(entries, filter).reverse(), [entries, filter])
  const categories = useMemo(() => distinct(entries, (e) => e.category), [entries])
  const plugins = useMemo(() => distinct(entries, (e) => e.pluginId), [entries])
  const patch = (p: Partial<LogFilter>) => {
    setFilter((f) => ({ ...f, ...p }))
    setLimit(PAGE)
  }

  const diagnostics = async (): Promise<string> => {
    const version = await getVersion().catch(() => 'unknown')
    const counts = LEVELS.map((l) => `${l}=${entries.filter((e) => e.level === l).length}`).join(' ')
    return [
      `Jnana ${version}`,
      `User agent: ${navigator.userAgent}`,
      `Window: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
      `Logging: developer=${settings.dev} file=${settings.file}`,
      `Entries in memory: ${entries.length} (${counts})`,
      `Generated: ${new Date().toISOString()}`,
    ].join('\n')
  }

  const exportLog = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const text = formatExport(shown.slice().reverse(), await diagnostics())
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      await saveTextFile(`jnana-log-${stamp}.log`, text, { title: 'Export log', filterName: 'Log', extensions: ['log', 'txt'] })
    } catch {
      toast.error("Couldn't export the log. Check the folder is writable.")
    } finally {
      setExporting(false)
    }
  }

  const clear = async () => {
    const ok = await showConfirmDialog({
      title: 'Clear the in-app log?',
      message: 'This empties the log shown here (and the Plugin Console). The log file on disk is kept.',
      confirmLabel: 'Clear',
      danger: true,
    })
    if (ok) {
      clearLogEntries()
      setPaused(null)
    }
  }

  return (
    <SettingSection title="Developer log">
      <p className={styles.hint}>
        Info, warnings and errors are always recorded and written to the log file. Developer detail adds debug
        (IPC failures, routes, plugin timings) or trace (every IPC call, event and plugin API call) to this view
        only. Secrets, note text and your user name are redacted.
        {logDir && (
          <>
            {' '}Log files: <code>{logDir}</code>{' '}
            <button type="button" className={styles.link} onClick={() => void copy(logDir, 'Path')}>
              copy
            </button>
          </>
        )}
      </p>

      <div className={styles.controls}>
        <label>
          Developer detail
          <SettingSelect
            ariaLabel="Developer detail"
            value={settings.dev}
            onChange={(v) => setLogSettings({ dev: v as DevLogLevel })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'debug', label: 'Debug' },
              { value: 'trace', label: 'Trace (verbose)' },
            ]}
          />
        </label>
        <label>
          Log file
          <SettingSelect
            ariaLabel="Log file level"
            value={settings.file}
            onChange={(v) => setLogSettings({ file: v as FileLogLevel })}
            options={[
              { value: 'info', label: 'Info and above' },
              { value: 'warn', label: 'Warnings and errors' },
            ]}
          />
        </label>
      </div>

      <div className={styles.controls}>
        <input
          className={`${settingInputClass} ${styles.search}`}
          type="search"
          placeholder="Search message, data, error, operation id…"
          value={filter.query}
          onChange={(e) => patch({ query: e.target.value })}
          // Esc clears the search first; only an empty box lets Settings' Esc = Back through.
          onKeyDown={(e) => {
            if (e.key === 'Escape' && filter.query) {
              e.preventDefault()
              patch({ query: '' })
            }
          }}
          aria-label="Search log"
        />
        <SettingSelect
          ariaLabel="Minimum level"
          value={filter.minLevel}
          onChange={(v) => patch({ minLevel: v as LogLevel })}
          options={LEVELS.map((l) => ({ value: l, label: l === 'trace' ? 'All levels' : `${l}+` }))}
        />
        <SettingSelect
          ariaLabel="Source"
          value={filter.source}
          onChange={(v) => patch({ source: v as LogSource | 'all' })}
          options={[
            { value: 'all', label: 'All sources' },
            { value: 'app', label: 'App' },
            { value: 'plugin', label: 'Plugin-written' },
            { value: 'rust', label: 'Rust' },
          ]}
        />
        <SettingSelect
          ariaLabel="Category"
          value={filter.category}
          onChange={(v) => patch({ category: v })}
          options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
        />
        <SettingSelect
          ariaLabel="Plugin"
          value={filter.pluginId}
          onChange={(v) => patch({ pluginId: v })}
          options={[{ value: '', label: 'All plugins' }, ...plugins.map((p) => ({ value: p, label: p }))]}
        />
        <SettingSelect
          ariaLabel="Time range"
          value={String(filter.withinMs)}
          onChange={(v) => patch({ withinMs: Number(v) })}
          options={TIME_OPTIONS}
        />
      </div>

      <div className={styles.toolbar}>
        <span className={styles.count}>
          {shown.length} of {entries.length}
          {paused && ' · paused'}
        </span>
        <SettingButton onClick={() => setPaused(paused ? null : live)}>
          {paused ? 'Resume' : 'Pause'}
        </SettingButton>
        <SettingButton onClick={() => patch(DEFAULT_FILTER)}>
          Reset filters
        </SettingButton>
        <SettingButton onClick={() => void diagnostics().then((d) => copy(d, 'Diagnostics'))}>
          Copy diagnostics
        </SettingButton>
        <SettingButton busy={exporting} disabled={exporting} onClick={() => void exportLog()} title="Exports the filtered entries, redacted">
          Export…
        </SettingButton>
        <SettingButton variant="danger" onClick={() => void clear()}>
          Clear
        </SettingButton>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>{entries.length === 0 ? 'Nothing logged yet.' : 'No entries match these filters.'}</p>
      ) : (
        <ul className={styles.list}>
          {shown.slice(0, limit).map((e) => (
            <Row key={e.id} entry={e} onCorrelate={(opId) => patch({ ...DEFAULT_FILTER, query: opId })} />
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <SettingButton onClick={() => setLimit((l) => l + PAGE)}>
          Show older ({shown.length - limit} more)
        </SettingButton>
      )}
    </SettingSection>
  )
}
