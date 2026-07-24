// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Sleek, theme-native form primitives for Settings — a custom Select and Slider
// that replace the OS-default <select>/<input type=range> (which ignore the
// theme entirely). Hand-rolled with pointer events + a body portal, matching the
// app's conventions (no UI library — see CLAUDE.md React-19 / pointer-event
// notes). Low-chrome and thin-stroked to sit alongside the lucide iconography.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import styles from './SettingControls.module.css'

// ─── Select ──────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
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
}: {
  value: string
  onChange: (v: string) => void
  options: SelectItem[]
  id?: string
  ariaLabel?: string
}) {
  const flat = flatten(options)
  const selected = flat.find((o) => o.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
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

  // Open: seed the active row at the current selection and position the menu.
  useLayoutEffect(() => {
    if (!open) return
    setActive(Math.max(0, flat.findIndex((o) => o.value === value)))
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
    const onScroll = () => setOpen(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
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
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className={styles.selectValue}>{selected?.label ?? ''}</span>
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
            className={styles.selectMenu}
            role="listbox"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              transform: rect.drop === 'up' ? 'translateY(-100%)' : undefined,
            }}
          >
            {options.map((item, gi) =>
              isGroup(item) ? (
                <div key={`g${gi}`} className={styles.selectGroup}>
                  <div className={styles.selectGroupLabel}>{item.label}</div>
                  {item.options.map((o) => (
                    <Row
                      key={o.value}
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
  option,
  selected,
  active,
  onPick,
  onHover,
}: {
  option: SelectOption
  selected: boolean
  active: boolean
  onPick: (v: string) => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
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
      <span className={styles.selectRowLabel}>{option.label}</span>
      {selected && <Check size={14} strokeWidth={2} className={styles.selectCheck} />}
    </button>
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
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  id?: string
  ariaLabel?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const dp = decimals(step)

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
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
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step
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
