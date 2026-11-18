// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { SettingSlider } from '../settings/SettingControls'
import styles from './TimelineBar.module.css'

const SWEEP_MS = 10_000
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

interface Props {
  min: number
  max: number
  value: number
  shown: number
  total: number
  reducedMotion: boolean
  onChange: (t: number) => void
  onClose: () => void
  className?: string
}

/** Bottom bar: scrub or play through note creation order. */
export function TimelineBar({ min, max, value, shown, total, reducedMotion, onChange, onClose, className }: Props) {
  const [playing, setPlaying] = useState(false)
  const span = Math.max(1, max - min)
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!playing) return
    // Resume from where the handle is; restart from the start when already at the end.
    const from = valueRef.current >= max ? min : valueRef.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(max, from + ((now - t0) / SWEEP_MS) * span)
      onChangeRef.current(t)
      if (t >= max) setPlaying(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, min, max, span])

  const togglePlay = () => {
    if (playing) return setPlaying(false)
    if (reducedMotion) return onChange(max)
    setPlaying(true)
  }

  return (
    <div className={`${styles.bar} ${className ?? ''}`} role="group" aria-label="Timeline">
      <button type="button" className={styles.btn} onClick={togglePlay} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause timeline' : 'Play timeline'}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className={styles.slider} onPointerDown={() => setPlaying(false)}>
        <SettingSlider
          value={Math.min(max, Math.max(min, value))}
          min={min}
          max={max > min ? max : min + 1}
          step={Math.max(1, Math.floor(span / 200))}
          onChange={onChange}
          ariaLabel="Timeline date"
          formatValue={fmt}
        />
      </div>
      <span className={styles.label} aria-live="polite">{`${fmt(value)} · ${shown} of ${total} notes`}</span>
      <button type="button" className={styles.btn} onClick={onClose} title="Close timeline" aria-label="Close timeline">
        <X size={14} />
      </button>
    </div>
  )
}
