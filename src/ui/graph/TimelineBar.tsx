// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { SettingSlider } from '../settings/SettingControls'
import { stepDelayMs } from './timeline'
import styles from './TimelineBar.module.css'

const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const SPEEDS = [1, 2, 4]

interface Props {
  /** Total steps (notes + links). */
  count: number
  /** Steps revealed so far, 0..count. */
  step: number
  /** Date of the last revealed step, or null at 0. */
  at: number | null
  shown: number
  total: number
  onChange: (step: number) => void
  onClose: () => void
  /** Reports the bar's rendered height (0 on unmount). */
  onHeight?: (h: number) => void
  className?: string
}

/** Bottom bar: scrub or play the graph being built one note/link at a time. */
export function TimelineBar({ count, step, at, shown, total, onChange, onClose, onHeight, className }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(speed)
  speedRef.current = speed
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // One step per tick; the delay is read each step, so a speed change lands on the next one.
  // Stepping is not motion, so it runs under reduced motion too (only the fade is off).
  useEffect(() => {
    if (!playing) return
    if (step >= count) return setPlaying(false)
    const t = setTimeout(() => onChangeRef.current(step + 1), stepDelayMs(speedRef.current))
    return () => clearTimeout(t)
  }, [playing, step, count])

  useEffect(() => {
    const el = barRef.current
    if (!el || !onHeight) return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    onHeight(el.offsetHeight)
    return () => {
      ro.disconnect()
      onHeight(0)
    }
  }, [onHeight])

  const togglePlay = () => {
    if (playing) return setPlaying(false)
    if (step >= count) onChange(0)
    setPlaying(true)
  }

  const labelText = at === null ? 'No notes yet' : `${fmt(at)} · ${shown} of ${total} notes`
  const speedTitle = `Playback speed: ${speed}×, click to change`

  return (
    <div ref={barRef} className={`${styles.bar} ${className ?? ''}`} role="group" aria-label="Timeline">
      <button type="button" className={styles.btn} onClick={togglePlay} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause timeline' : 'Play timeline'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button type="button" className={styles.btn} onClick={() => setSpeed((v) => SPEEDS[(SPEEDS.indexOf(v) + 1) % SPEEDS.length])} title={speedTitle} aria-label={speedTitle}>
        {speed}×
      </button>
      <div className={styles.slider} onPointerDown={() => setPlaying(false)}>
        <SettingSlider value={step} min={0} max={Math.max(1, count)} step={1} onChange={onChange} ariaLabel="Timeline step" formatValue={() => labelText} />
      </div>
      <span className={styles.label} aria-live="polite" title={labelText}>{labelText}</span>
      <button type="button" className={styles.btn} onClick={onClose} title="Close timeline" aria-label="Close timeline">
        <X size={14} />
      </button>
    </div>
  )
}
