// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Sleek, theme-native form primitives for Settings — a custom Select and Slider
// that replace the OS-default <select>/<input type=range> (which ignore the
// theme entirely). Hand-rolled with pointer events + a body portal, matching the
// app's conventions (no UI library — see CLAUDE.md React-19 / pointer-event
// notes). Low-chrome and thin-stroked to sit alongside the lucide iconography.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import styles from './SettingControls.module.css'
import { HintText, InfoButton, normalizeHint, useHintToggle } from './SettingLayout'

// ─── Select ──────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
  /** Full text on hover when the label may be truncated (long names). */
  title?: string
}
export interface SelectGroup {
  label: string
  options: SelectOption[]
}
type SelectItem = SelectOption | SelectGroup

const isGroup = (i: SelectItem): i is SelectGroup => 'options' in i

function flatten(items: SelectItem[]): SelectOption[] {
  return items.flatMap((i) => (isGroup(i) ? i.options : [i]))
}

export function SettingSelect({
  value,
  onChange,
  options,
  id,
  ariaLabel,
  ariaDescribedBy,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: SelectItem[]
  id?: string
  ariaLabel?: string
  /** Id of a hint to announce with the trigger — `hintId(id)` inside a SettingField. */
  ariaDescribedBy?: string
  disabled?: boolean
}) {
  const flat = flatten(options)
  const selected = flat.find((o) => o.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const optId = (i: number) => `${listId}-o${i}`
  const typed = useRef({ buf: '', t: 0 })
  const seedActive = useRef<number | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; drop: 'down' | 'up' } | null>(null)

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Flip upward when there isn't room below (menu is capped at ~280px).
    const drop = window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom ? 'up' : 'down'
    setRect({ top: drop === 'down' ? r.bottom + 4 : r.top - 4, left: r.left, width: r.width, drop })
  }, [])

  // Open: seed the active row (a typeahead match, else the current selection) and position the menu.
  useLayoutEffect(() => {
    if (!open) return
    setActive(seedActive.current ?? Math.max(0, flat.findIndex((o) => o.value === value)))
    seedActive.current = null
    place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // While open: close on outside pointerdown, any scroll, or resize.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    // Scrolling the menu itself (arrowing to an off-screen row) must not close it.
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  // Keep the active row visible while arrowing.
  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, rect])

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Typeahead: printable keys jump to the next option whose label starts with
  // the typed buffer (reset after 500 ms) and highlight it. Closed: opens the
  // menu on that row instead of committing — several selects here have side
  // effects (provider defaults, preset switch), so a stray key must not change one.
  const typeahead = (key: string): boolean => {
    const ty = typed.current
    const now = Date.now()
    ty.buf = now - ty.t > 500 ? key : ty.buf + key
    ty.t = now
    // "bbb" means "next b", not a literal prefix — repeating one letter cycles its matches.
    const repeated = [...ty.buf].every((ch) => ch === ty.buf[0])
    const q = (repeated ? ty.buf[0] : ty.buf).toLowerCase()
    const from = open ? active : flat.findIndex((o) => o.value === value)
    // A single/repeated letter moves past the current row; a longer prefix may match it.
    const start = q.length > 1 ? from : from + 1
    for (let k = 0; k < flat.length; k++) {
      const i = (start + k + flat.length) % flat.length
      if (flat[i].label.toLowerCase().startsWith(q)) {
        if (open) setActive(i)
        else {
          seedActive.current = i
          setOpen(true)
        }
        return true
      }
    }
    return false
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      setOpen(false) // commit nothing; focus moves on naturally
      return
    }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeahead(e.key)) e.preventDefault()
      return
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(flat.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = flat[active]
      if (opt) commit(opt.value)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={styles.selectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className={styles.selectValue} title={selected?.title ?? selected?.label}>{selected?.label ?? (value || 'Unknown')}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.75}
          className={`${styles.selectChevron} ${open ? styles.selectChevronOpen : ''}`}
        />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            className={styles.selectMenu}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              transform: rect.drop === 'up' ? 'translateY(-100%)' : undefined,
            }}
          >
            {options.map((item, gi) =>
              isGroup(item) ? (
                <div key={`g${gi}`} className={styles.selectGroup} role="group" aria-labelledby={`${listId}-g${gi}`}>
                  <div id={`${listId}-g${gi}`} className={styles.selectGroupLabel}>{item.label}</div>
                  {item.options.map((o) => (
                    <Row
                      key={o.value}
                      id={optId(flat.indexOf(o))}
                      option={o}
                      selected={o.value === value}
                      active={flat.indexOf(o) === active}
                      onPick={commit}
                      onHover={() => setActive(flat.indexOf(o))}
                    />
                  ))}
                </div>
              ) : (
                <Row
                  key={item.value}
                  id={optId(flat.indexOf(item))}
                  option={item}
                  selected={item.value === value}
                  active={flat.indexOf(item) === active}
                  onPick={commit}
                  onHover={() => setActive(flat.indexOf(item))}
                />
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

function Row({
  id,
  option,
  selected,
  active,
  onPick,
  onHover,
}: {
  id: string
  option: SelectOption
  selected: boolean
  active: boolean
  onPick: (v: string) => void
  onHover: () => void
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      className={`${styles.selectRow} ${active ? styles.selectRowActive : ''} ${selected ? styles.selectRowSelected : ''}`}
      // pointerdown (not click) so the trigger's outside-close doesn't fire first
      onPointerDown={(e) => {
        e.preventDefault()
        onPick(option.value)
      }}
      onPointerEnter={onHover}
    >
      <span className={styles.selectRowLabel} title={option.title ?? option.label}>{option.label}</span>
      {selected && <Check size={14} strokeWidth={2} className={styles.selectCheck} aria-hidden />}
    </div>
  )
}

// ─── Toggle (switch) ─────────────────────────────────────────────────────────

export function SettingToggle({
  checked,
  onChange,
  label,
  hint,
  ariaLabel,
  hintVisible,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  /** Text beside the switch; clicking it toggles. Omit for a bare switch. */
  label?: ReactNode
  /** Explanation behind an ⓘ button (callers pass lowercase clauses; capitalised here). */
  hint?: string
  /** Keep the hint on screen — for consequences the user must not miss. */
  hintVisible?: boolean
  /** Accessible name for a bare switch (ignored when a visible `label` exists). */
  ariaLabel?: string
  /** Block interaction while a change is in flight. */
  disabled?: boolean
}) {
  const id = useId()
  const labelId = `${id}-label`
  const hintDomId = `${id}-hint`
  const hasLabel = label != null
  const { open, toggle } = useHintToggle()
  const hintText = hint ? normalizeHint(hint) : ''
  const button = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hasLabel ? undefined : ariaLabel}
      aria-labelledby={hasLabel ? labelId : undefined}
      aria-describedby={hasLabel && hint ? hintDomId : undefined}
      disabled={disabled}
      className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchKnob} />
    </button>
  )
  if (!hasLabel) return button
  return (
    <div className={`${styles.toggleRow} ${disabled ? styles.toggleDisabled : ''}`}>
      {button}
      <div className={styles.toggleText}>
        <span className={styles.toggleHead}>
          <label id={labelId} htmlFor={id} className={styles.toggleLabel}>
            {label}
          </label>
          {hint && !hintVisible && <InfoButton text={hintText} open={open} onToggle={toggle} controls={hintDomId} label={typeof label === 'string' ? label : undefined} />}
        </span>
        {hint && (
          <HintText id={hintDomId} open={!!hintVisible || open}>
            {hintText}
          </HintText>
        )}
      </div>
    </div>
  )
}

// ─── Slider ──────────────────────────────────────────────────────────────────

function decimals(step: number): number {
  const s = String(step)
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

export function SettingSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  id,
  ariaLabel,
  formatValue,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  id?: string
  ariaLabel?: string
  /** Human-readable value for assistive tech (aria-valuetext); defaults to the number. */
  formatValue?: (v: number) => string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const dp = decimals(step)

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width <= 0) return // measured while hidden: avoid NaN
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      const raw = min + Math.round((ratio * (max - min)) / step) * step
      const clamped = Math.min(max, Math.max(min, raw))
      onChange(Number(clamped.toFixed(dp)))
    },
    [min, max, step, dp, onChange],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromClientX(e.clientX)
  }

  const onKey = (e: React.KeyboardEvent) => {
    let next = value
    const big = Math.max(step, Math.round((max - min) / 10 / step) * step)
    const small = e.shiftKey ? step * 10 : step
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + small
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - small
    else if (e.key === 'PageUp') next = value + big
    else if (e.key === 'PageDown') next = value - big
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    else return
    e.preventDefault()
    onChange(Number(Math.min(max, Math.max(min, next)).toFixed(dp)))
  }

  return (
    <div
      ref={trackRef}
      id={id}
      className={styles.slider}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={formatValue ? formatValue(value) : String(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKey}
    >
      <div className={styles.sliderTrack}>
        <div className={styles.sliderFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.sliderThumb} style={{ left: `${pct}%` }} />
    </div>
  )
}
