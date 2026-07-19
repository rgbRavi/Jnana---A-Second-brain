// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The right-rail "Table tools" panel. Reads the focused table's context from the
// activeTable store (published by EditorTableWidget) and drives its bound action
// callbacks. Every button does `onMouseDown → preventDefault` (the same keepFocus
// trick the in-grid controls use) so clicking the toolbar never blurs the editor
// cell — the active table + cell stay the target, and the edit stays undoable.

import type { ComponentType, ReactNode } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpAZ,
  BetweenHorizontalStart,
  BetweenHorizontalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  Copy,
  Download,
  FlipVertical2,
  Heading,
  Rows3,
  Trash2,
  type LucideProps,
} from 'lucide-react'
import { useActiveTable } from '../../lib/activeTable'
import styles from './RightRail.module.css'

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: ComponentType<LucideProps>
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      className={active ? `${styles.toolBtn} ${styles.toolBtnActive}` : styles.toolBtn}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionBtns}>{children}</div>
    </div>
  )
}

function TextBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      className={active ? `${styles.toolTextBtn} ${styles.toolBtnActive}` : styles.toolTextBtn}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

const AGGS: { code: 's' | 'a' | 'c' | 'n' | 'x'; label: string }[] = [
  { code: 's', label: 'Sum' },
  { code: 'a', label: 'Avg' },
  { code: 'c', label: 'Count' },
  { code: 'n', label: 'Min' },
  { code: 'x', label: 'Max' },
]

export function TableToolPanel() {
  const { rows, cols, activeCell, align, noHeader, zebra, agg, actions } = useActiveTable()
  if (!actions) return <div className={styles.empty}>Click into a table to use these tools.</div>

  const hasCell = !!activeCell
  const c = activeCell?.c ?? -1
  const colAlign = c >= 0 ? align[c] ?? '-' : '-'
  const colAgg = c >= 0 ? agg[c] ?? '-' : '-'

  return (
    <div className={styles.panelBody}>
      <div className={styles.ctx}>
        {hasCell ? `Col ${c + 1} · Row ${(activeCell!.r ?? 0) + 1}` : `${rows}×${cols} table`}
      </div>

      <Section title="Columns">
        <ToolBtn icon={BetweenVerticalStart} label="Insert column left" disabled={!hasCell} onClick={() => actions.insertColumn('left')} />
        <ToolBtn icon={BetweenVerticalEnd} label="Insert column right" disabled={!hasCell} onClick={() => actions.insertColumn('right')} />
        <ToolBtn icon={ArrowLeft} label="Move column left" disabled={!hasCell} onClick={() => actions.moveColumn('left')} />
        <ToolBtn icon={ArrowRight} label="Move column right" disabled={!hasCell} onClick={() => actions.moveColumn('right')} />
        <ToolBtn icon={ArrowDownAZ} label="Sort ascending" disabled={!hasCell} onClick={() => actions.sortColumn('asc')} />
        <ToolBtn icon={ArrowUpAZ} label="Sort descending" disabled={!hasCell} onClick={() => actions.sortColumn('desc')} />
        <ToolBtn icon={Trash2} label="Delete column" disabled={!hasCell} onClick={() => actions.deleteColumn()} />
      </Section>

      <Section title="Align column">
        <ToolBtn icon={AlignLeft} label="Align left" active={colAlign === 'l'} disabled={!hasCell} onClick={() => actions.alignColumn('l')} />
        <ToolBtn icon={AlignCenter} label="Align center" active={colAlign === 'c'} disabled={!hasCell} onClick={() => actions.alignColumn('c')} />
        <ToolBtn icon={AlignRight} label="Align right" active={colAlign === 'r'} disabled={!hasCell} onClick={() => actions.alignColumn('r')} />
      </Section>

      <Section title="Rows">
        <ToolBtn icon={BetweenHorizontalStart} label="Insert row above" disabled={!hasCell} onClick={() => actions.insertRow('above')} />
        <ToolBtn icon={BetweenHorizontalEnd} label="Insert row below" disabled={!hasCell} onClick={() => actions.insertRow('below')} />
        <ToolBtn icon={ArrowUp} label="Move row up" disabled={!hasCell} onClick={() => actions.moveRow('up')} />
        <ToolBtn icon={ArrowDown} label="Move row down" disabled={!hasCell} onClick={() => actions.moveRow('down')} />
        <ToolBtn icon={Trash2} label="Delete row" disabled={!hasCell} onClick={() => actions.deleteRow()} />
      </Section>

      <Section title="Format">
        <ToolBtn icon={Heading} label={noHeader ? 'Enable header row' : 'No header row'} active={noHeader} onClick={() => actions.toggleNoHeader()} />
        <ToolBtn icon={Rows3} label="Zebra striping" active={zebra} onClick={() => actions.toggleZebra()} />
      </Section>

      <Section title="Aggregate (column)">
        {AGGS.map((a) => (
          <TextBtn key={a.code} label={a.label} active={colAgg === a.code} disabled={!hasCell} onClick={() => actions.setAggregate(a.code)} />
        ))}
      </Section>

      <Section title="Table">
        <ToolBtn icon={FlipVertical2} label="Transpose (swap rows ↔ columns)" onClick={() => actions.transpose()} />
      </Section>

      <Section title="Export">
        <ToolBtn icon={Copy} label="Copy as CSV" onClick={() => actions.copyCsv()} />
        <ToolBtn icon={Download} label="Export as CSV file" onClick={() => actions.exportCsv()} />
      </Section>
    </div>
  )
}
