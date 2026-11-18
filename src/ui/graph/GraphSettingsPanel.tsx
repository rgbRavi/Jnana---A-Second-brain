// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Right-hand settings panel of the Graph view: Filters, Groups, Display, Advanced.
// Pure presentation — GraphView owns the state (useViewState('graph.*') /
// useGraphForces) and passes it down, so persistence keys live in one place.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, X } from 'lucide-react'
import { describeGroup, isValidRegex, type GraphGroup, type TitleOp } from './groupMatch'
import { SettingSelect, SettingSlider, SettingToggle } from '../settings/SettingControls'
import { SettingField, settingInputClass } from '../settings/SettingLayout'
import type { SizeBy } from './nodeSize'
import type { GraphForces } from '../../hooks/useGraphForces'
import styles from './GraphSettingsPanel.module.css'

// Group colours: six hue-spread, named swatches, each >=3:1 on both dark and light
// backgrounds and clear of the accent (hub/focus), warning (unlinked) and success
// (connect) hues the canvas already uses for meaning.
export const GROUP_PALETTE: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#0284c7' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Magenta', hex: '#c026d3' },
]

/** Next palette colour not already used by a group (cycles once all are taken). */
export function nextGroupColor(used: string[]): string {
  const u = new Set(used.map((c) => c.toLowerCase()))
  return (GROUP_PALETTE.find((c) => !u.has(c.hex)) ?? GROUP_PALETTE[used.length % GROUP_PALETTE.length]).hex
}

export type DatePreset = 'all' | 'week' | 'month' | 'year'
export type SectionKey = 'filters' | 'groups' | 'display' | 'advanced'

const DEPTH_OPTIONS = [
  { value: '1', label: '1 link away' },
  { value: '2', label: '2 links away' },
  { value: '3', label: '3 links away' },
]

const DATE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
]

export interface GraphSettingsPanelProps {
  openSections: Record<SectionKey, boolean>
  onToggleSection: (key: SectionKey) => void
  onResetAll: () => void
  onClose: () => void
  /** Move focus to the close button on mount (set when opened from the button). */
  focusOnMount?: boolean

  filterText: string
  setFilterText: (v: string) => void
  datePreset: DatePreset
  setDatePreset: (v: DatePreset) => void
  orphansOnly: boolean
  setOrphansOnly: (v: boolean) => void
  tags: string[]
  filterTags: Set<string>
  onToggleTag: (tag: string) => void
  filterActive: boolean
  onClearFilters: () => void
  shownCount: number
  totalCount: number

  groups: GraphGroup[]
  onAddGroup: () => void
  onUpdateGroup: (id: string, patch: Partial<GraphGroup>) => void
  onRemoveGroup: (id: string) => void

  neighbourhoodOnly: boolean
  setNeighbourhoodOnly: (v: boolean) => void
  depth: number
  setDepth: (v: number) => void
  directed: boolean
  setDirected: (v: boolean) => void
  highlightStructure: boolean
  setHighlightStructure: (v: boolean) => void
  pinOnDrag: boolean
  onTogglePin: (v: boolean) => void
  textFade: number
  setTextFade: (v: number) => void
  showMissing: boolean
  setShowMissing: (v: boolean) => void
  missingCount: number
  onShowMissingList: () => void
  sizeBy: SizeBy
  setSizeBy: (v: SizeBy) => void
  nodeSize: number
  setNodeSize: (v: number) => void
  linkThickness: number
  setLinkThickness: (v: number) => void

  perpetualMotion: boolean
  setPerpetualMotion: (v: boolean) => void
  rippleBackground: boolean
  setRippleBackground: (v: boolean) => void
  forces: GraphForces
  onForcesChange: (patch: Partial<GraphForces>) => void
  onResetForces: () => void
  onApplyPreset: (name: 'clusters' | 'compact') => void
  onRerunLayout: () => void
}

/** A collapsible section: the whole header row is one button. */
function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const bodyId = useId()
  return (
    <section className={styles.section}>
      <button type="button" className={styles.sectionHead} onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
        <ChevronRight size={14} aria-hidden className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
        {title}
      </button>
      <div id={bodyId} className={styles.sectionBody} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

/** Label + readout + slider, wired together through SettingField. */
function SliderRow({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => String(Number(v.toFixed(2))),
}: {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  /** Readout + screen-reader text, so a slider never shows/announces a raw float. */
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <SettingField label={label} htmlFor={id} hint={hint} value={format(value)} stacked>
      <SettingSlider id={id} value={value} onChange={onChange} min={min} max={max} step={step} ariaLabel={label} formatValue={format} />
    </SettingField>
  )
}

const SIZE_BY_OPTIONS = [
  { value: 'same', label: 'Same for all' },
  { value: 'links', label: 'Number of links' },
  { value: 'edited', label: 'Last edited' },
]

const TAG_MODE_OPTIONS = [
  { value: 'any', label: 'any' },
  { value: 'all', label: 'all' },
]
const OP_OPTIONS = [
  { value: 'contains', label: 'contains' },
  { value: 'starts', label: 'starts with' },
  { value: 'ends', label: 'ends with' },
  { value: 'exact', label: 'is exactly' },
  { value: 'regex', label: 'matches regex' },
]
const MATCH_OPTIONS = [
  { value: 'all', label: 'both' },
  { value: 'any', label: 'either' },
]

/** Selected tags as small neutral chips + an in-flow searchable checklist of the vault's tags. */
function TagsEditor({
  label,
  tags,
  allTags,
  onChange,
}: {
  label: string
  tags: string[]
  allTags: string[]
  onChange: (tags: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const listId = useId()
  const sel = new Set(tags.map((t) => t.toLowerCase()))
  const shown = allTags.filter((t) => t.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (t: string) =>
    onChange(sel.has(t.toLowerCase()) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t])
  return (
    <div
      className={styles.tagsEditor}
      onKeyDown={(e) => {
        // Esc closes only the checklist, not the whole panel / list mode.
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <div className={styles.tags}>
        {tags.map((t) => (
          <button key={t} type="button" className={styles.tagChip} onClick={() => toggle(t)} title={`Remove #${t}`} aria-label={`Remove tag ${t} from ${label}`}>
            #{t} <X size={10} aria-hidden />
          </button>
        ))}
        <button type="button" className={styles.tagChip} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={listId} title={`Choose tags for ${label}`}>
          + tag
        </button>
      </div>
      {open && (
        <div className={styles.tagPicker}>
          <input
            className={settingInputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tags…"
            aria-label={`Search tags for ${label}`}
            autoFocus
          />
          <div id={listId} className={styles.tagList} role="listbox" aria-multiselectable="true" aria-label={`Tags for ${label}`}>
            {shown.length === 0 && <p className={styles.note}>{allTags.length ? 'No matching tags' : 'No tags in this vault yet'}</p>}
            {shown.map((t) => {
              const on = sel.has(t.toLowerCase())
              return (
                <button key={t} type="button" role="option" aria-selected={on} className={`${styles.tagOption} ${on ? styles.tagOptionOn : ''}`} onClick={() => toggle(t)}>
                  <span className={styles.tagCheck} aria-hidden>{on ? <Check size={12} /> : null}</span>
                  #{t}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Several title values as chips; type and press Enter (or comma) to add one. */
function TitleValues({
  label,
  values,
  regex,
  onChange,
}: {
  label: string
  values: string[]
  regex: boolean
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim()
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setDraft('')
  }
  const bad = regex ? values.filter((v) => !isValidRegex(v)) : []
  return (
    <div className={styles.tagsEditor}>
      <div className={styles.tags}>
        {values.map((v) => (
          <button key={v} type="button" className={styles.tagChip} onClick={() => onChange(values.filter((x) => x !== v))} title={`Remove "${v}"`} aria-label={`Remove ${v} from ${label}`}>
            {v} <X size={10} aria-hidden />
          </button>
        ))}
        <input
          className={`${settingInputClass} ${styles.valueInput}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={commit}
          placeholder={values.length ? 'Add another…' : regex ? 'Pattern, then Enter' : 'Text, then Enter'}
          aria-label={`Add a value to ${label}`}
        />
      </div>
      {bad.length > 0 && (
        <p role="alert" className={styles.invalid}>
          Invalid pattern: {bad.join(', ')}
        </p>
      )}
    </div>
  )
}

/** One group, collapsed to a single line (colour · summary · edit · remove). Opened,
 *  it has one Tags line and one Title line, each holding several values. */
function GroupRow({
  index,
  group,
  allTags,
  sharedWith,
  onUpdate,
  onRemove,
}: {
  index: number
  group: GraphGroup
  allTags: string[]
  /** 1-based number of an earlier group with the same colour, if any. */
  sharedWith?: number
  onUpdate: (patch: Partial<GraphGroup>) => void
  onRemove: () => void
}) {
  const [palette, setPalette] = useState(false)
  const summary = describeGroup(group)
  // New/empty groups open ready to edit; set-up ones stay a calm one-liner.
  const [editing, setEditing] = useState(!summary)
  const n = index + 1
  const sharedId = useId()
  const bodyId = useId()
  const hasTags = group.tags.length > 0
  const hasTitles = group.titles.some((t) => t.trim())
  return (
    <div
      className={styles.group}
      onKeyDown={(e) => {
        // Esc closes only the palette; stopping it keeps GraphView's Esc (list mode, focus) out of it.
        if (e.key === 'Escape' && palette) {
          e.preventDefault()
          e.stopPropagation()
          setPalette(false)
        }
      }}
    >
      <div className={styles.groupRow}>
        <button
          type="button"
          className={styles.swatch}
          style={{ background: group.color }}
          onClick={() => setPalette((o) => !o)}
          aria-expanded={palette}
          title={`Group ${n} colour`}
          aria-label={`Group ${n} colour`}
          aria-describedby={sharedWith ? sharedId : undefined}
        />
        <button
          type="button"
          className={styles.groupSummary}
          onClick={() => setEditing((o) => !o)}
          aria-expanded={editing}
          aria-controls={bodyId}
          title={editing ? 'Done editing' : 'Edit group'}
        >
          <span className={summary ? undefined : styles.groupEmpty}>{summary || 'New group'}</span>
          <ChevronDown size={14} aria-hidden className={`${styles.groupChevron} ${editing ? styles.groupChevronUp : ''}`} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onRemove} title={`Remove group ${n}`} aria-label={`Remove group ${n}`}>
          <X size={15} />
        </button>
      </div>
      {/* Past 6 groups colours repeat; say so, so the user can tell them apart. */}
      {sharedWith && (
        <p id={sharedId} className={styles.note}>
          Same colour as Group {sharedWith}
        </p>
      )}
      {palette && (
        <div className={styles.palette} role="group" aria-label={`Group ${n} colour options`}>
          {GROUP_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              className={styles.swatch}
              style={{ background: c.hex }}
              title={c.name}
              aria-label={c.name}
              aria-pressed={group.color.toLowerCase() === c.hex}
              autoFocus={group.color.toLowerCase() === c.hex}
              onClick={() => {
                onUpdate({ color: c.hex })
                setPalette(false)
              }}
            />
          ))}
        </div>
      )}
      <div id={bodyId} className={styles.groupBody} hidden={!editing}>
        <div className={styles.line}>
          <div className={styles.lineHead}>
            <span className={styles.lineLabel}>Tags</span>
            {group.tags.length > 1 && (
              <SettingSelect value={group.tagMode} onChange={(v) => onUpdate({ tagMode: v === 'all' ? 'all' : 'any' })} options={TAG_MODE_OPTIONS} ariaLabel={`Group ${n}: note needs any or all of these tags`} />
            )}
            {group.tags.length > 1 && (
              <button type="button" className={`${styles.textBtn} ${styles.clearBtn}`} onClick={() => onUpdate({ tags: [] })} aria-label={`Clear all tags in group ${n}`}>
                Clear
              </button>
            )}
          </div>
          <TagsEditor label={`group ${n} tags`} tags={group.tags} allTags={allTags} onChange={(tags) => onUpdate({ tags })} />
        </div>
        <div className={styles.line}>
          <div className={styles.lineHead}>
            <span className={styles.lineLabel}>Title</span>
            <SettingSelect value={group.titleOp} onChange={(v) => onUpdate({ titleOp: v as TitleOp })} options={OP_OPTIONS} ariaLabel={`Group ${n} title match`} />
            {group.titles.length > 1 && (
              <button type="button" className={`${styles.textBtn} ${styles.clearBtn}`} onClick={() => onUpdate({ titles: [] })} aria-label={`Clear all titles in group ${n}`}>
                Clear
              </button>
            )}
          </div>
          <TitleValues label={`group ${n} titles`} values={group.titles} regex={group.titleOp === 'regex'} onChange={(titles) => onUpdate({ titles })} />
        </div>
        {/* Only meaningful once both lines have something to combine. */}
        {hasTags && hasTitles && (
          <div className={styles.lineHead}>
            <span className={styles.lineLabel}>Needs</span>
            <SettingSelect value={group.match} onChange={(v) => onUpdate({ match: v === 'any' ? 'any' : 'all' })} options={MATCH_OPTIONS} ariaLabel={`Group ${n}: note needs both lines or either`} />
          </div>
        )}
      </div>
    </div>
  )
}

export function GraphSettingsPanel(p: GraphSettingsPanelProps) {
  const dateId = useId()
  const depthId = useId()
  const sizeById = useId()
  const { forces } = p
  const closeRef = useRef<HTMLButtonElement>(null)
  // Keyboard focus lands on the close button when the panel opens (the opener unmounts).
  useEffect(() => {
    if (p.focusOnMount) closeRef.current?.focus()
  }, [])  // eslint-disable-line
  return (
    <aside className={styles.panel} aria-label="Graph settings">
      <header className={styles.header}>
        <h2 className={styles.title}>Graph settings</h2>
        <button type="button" className={styles.iconBtn} onClick={p.onResetAll} title="Reset all graph settings" aria-label="Reset all graph settings">
          <RotateCcw size={15} />
        </button>
        <button ref={closeRef} type="button" className={styles.iconBtn} onClick={p.onClose} title="Close settings" aria-label="Close settings">
          <X size={15} />
        </button>
      </header>

      <Section title="Filters" open={p.openSections.filters} onToggle={() => p.onToggleSection('filters')}>
        <input
          type="search"
          className={settingInputClass}
          value={p.filterText}
          onChange={(e) => p.setFilterText(e.target.value)}
          placeholder="Filter by text in title, body or tags…"
          aria-label="Filter by text"
        />
        <SettingField label="Updated" htmlFor={dateId} stacked>
          <SettingSelect id={dateId} value={p.datePreset} onChange={(v) => p.setDatePreset(v as DatePreset)} options={DATE_OPTIONS} />
        </SettingField>
        <SettingToggle label="Unlinked notes only" hint="show only notes with no links" checked={p.orphansOnly} onChange={p.setOrphansOnly} />
        {p.tags.length > 0 && (
          <div className={styles.tags} role="group" aria-label="Filter by tag">
            {p.tags.map((tag) => {
              const on = p.filterTags.has(tag)
              return (
                <button key={tag} type="button" className={`${styles.tagChip} ${on ? styles.tagChipOn : ''}`} aria-pressed={on} onClick={() => p.onToggleTag(tag)}>
                  #{tag}
                </button>
              )
            })}
          </div>
        )}
        <div className={styles.filterFoot}>
          <span>
            Showing {p.shownCount} of {p.totalCount}
          </span>
          {p.filterActive && (
            <button type="button" className={styles.textBtn} onClick={p.onClearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </Section>

      <Section title="Groups" open={p.openSections.groups} onToggle={() => p.onToggleSection('groups')}>
        <p className={styles.note}>Colour notes by tags or title text. A note takes the colour of the first group it matches.</p>
        {p.groups.map((g, i) => (
          <GroupRow
            key={g.id}
            index={i}
            group={g}
            allTags={p.tags}
            sharedWith={(() => {
              const j = p.groups.findIndex((o) => o.color.toLowerCase() === g.color.toLowerCase())
              return j < i ? j + 1 : undefined
            })()}
            onUpdate={(patch) => p.onUpdateGroup(g.id, patch)} onRemove={() => p.onRemoveGroup(g.id)} />
        ))}
        <button type="button" className={`${styles.textBtn} ${styles.addBtn}`} onClick={p.onAddGroup}>
          <Plus size={14} aria-hidden /> Add group
        </button>
      </Section>

      <Section title="Display" open={p.openSections.display} onToggle={() => p.onToggleSection('display')}>
        <SettingToggle label="Neighbourhood only" hint="selecting a note hides all but its links" checked={p.neighbourhoodOnly} onChange={p.setNeighbourhoodOnly} />
        <SettingField label="Neighbourhood depth" htmlFor={depthId} stacked>
          <SettingSelect id={depthId} value={String(p.depth)} onChange={(v) => p.setDepth(Number(v))} options={DEPTH_OPTIONS} />
        </SettingField>
        <SettingToggle label="Arrows" hint="show link direction" checked={p.directed} onChange={p.setDirected} />
        <SettingToggle label="Highlight unlinked and well-linked notes" hint="colour notes with no links or many links" checked={p.highlightStructure} onChange={p.setHighlightStructure} />
        <SettingToggle label="Pin dragged nodes" hint="keep dragged notes where you drop them" checked={p.pinOnDrag} onChange={p.onTogglePin} />
        <SliderRow label="Hide labels when zoomed out" hint="higher hides labels until you zoom in closer" value={p.textFade} onChange={p.setTextFade} min={0} max={2} step={0.05} format={(v) => `${v.toFixed(1)}×`} />
        <SettingToggle label="Show missing notes" hint="faded dots for [[links]] to notes that don't exist yet" checked={p.showMissing} onChange={p.setShowMissing} />
        {p.showMissing && p.missingCount > 0 && (
          <button type="button" className={styles.missingCount} onClick={p.onShowMissingList}>
            {p.missingCount} missing note{p.missingCount === 1 ? '' : 's'}
          </button>
        )}
        <SettingField label="Node size by" htmlFor={sizeById} stacked>
          <SettingSelect id={sizeById} value={p.sizeBy} onChange={(v) => p.setSizeBy(v as SizeBy)} options={SIZE_BY_OPTIONS} ariaLabel="Node size by" />
        </SettingField>
        <SliderRow label="Node size" hint="scales the note dots" value={p.nodeSize} onChange={p.setNodeSize} min={0.5} max={3} step={0.1} format={(v) => `${v.toFixed(1)}×`} />
        <SliderRow label="Link thickness" hint="width of the lines between notes" value={p.linkThickness} onChange={p.setLinkThickness} min={0.5} max={6} step={0.5} format={(v) => `${v.toFixed(1)} px`} />
      </Section>

      <Section title="Advanced" open={p.openSections.advanced} onToggle={() => p.onToggleSection('advanced')}>
        <SettingToggle label="Glowing background" hint="soft accent glow behind the graph" checked={p.rippleBackground} onChange={p.setRippleBackground} />
        <SettingToggle label="Keep nodes moving" hint="notes drift gently instead of settling" checked={p.perpetualMotion} onChange={p.setPerpetualMotion} />
        <div className={styles.subhead}>
          <h3 className={styles.subtitle}>Layout</h3>
          <button type="button" className={styles.textBtn} onClick={p.onResetForces} title="Reset layout to defaults">
            Reset
          </button>
        </div>
        <SliderRow label="Centering" hint="higher pulls notes into a tighter ball" value={forces.center} onChange={(v) => p.onForcesChange({ center: v })} min={0} max={1} step={0.01} />
        <SliderRow label="Spacing" hint="higher pushes notes further apart" value={forces.repel} onChange={(v) => p.onForcesChange({ repel: v })} min={0} max={500} step={10} format={(v) => String(Math.round(v))} />
        <SliderRow label="Link pull" hint="higher keeps linked notes tightly grouped" value={forces.link} onChange={(v) => p.onForcesChange({ link: v })} min={0} max={1} step={0.05} />
        <SliderRow label="Link distance" hint="preferred length of each link" value={forces.distance} onChange={(v) => p.onForcesChange({ distance: v })} min={10} max={300} step={5} format={(v) => String(Math.round(v))} />
        <div className={styles.actions}>
          <button type="button" className={styles.textBtn} onClick={() => p.onApplyPreset('clusters')} title="Separate clusters so they are easy to see">
            See clusters
          </button>
          <button type="button" className={styles.textBtn} onClick={() => p.onApplyPreset('compact')} title="Pull everything into a tight ball">
            Compact
          </button>
          <button type="button" className={styles.textBtn} onClick={p.onRerunLayout} title="Let the layout settle again">
            Re-run layout
          </button>
        </div>
      </Section>
    </aside>
  )
}
