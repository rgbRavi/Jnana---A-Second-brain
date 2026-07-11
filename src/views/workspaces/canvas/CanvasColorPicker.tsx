// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CANVAS_PALETTE } from './palette'
import styles from './canvas.module.css'

interface Props {
  /** Screen (client) coordinates to anchor at — mirrors CanvasContextMenu. */
  x: number
  y: number
  value?: string
  onPick: (color: string | undefined) => void
  onClose: () => void
}

/** A small screen-space swatch popover for coloring a canvas node. Closes on
 *  pick (preset swatches), Escape, or an outside press — mirrors
 *  CanvasContextMenu's positioning/close behavior. */
export function CanvasColorPicker({ x, y, value, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - width - 8)
    const top = Math.min(y, window.innerHeight - height - 8)
    setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [onClose])

  return (
    <div ref={ref} className={styles.colorPicker} style={{ left: pos.left, top: pos.top }}>
      <button
        type="button"
        className={`${styles.swatch} ${styles.swatchDefault} ${!value ? styles.swatchOn : ''}`}
        title="Default"
        onClick={() => { onPick(undefined); onClose() }}
      />
      {CANVAS_PALETTE.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`${styles.swatch} ${value === c.value ? styles.swatchOn : ''}`}
          style={{ background: c.value }}
          title={c.label}
          onClick={() => { onPick(c.value); onClose() }}
        />
      ))}
      <label className={`${styles.swatch} ${styles.swatchCustom}`} title="Custom color">
        <input type="color" value={value ?? '#7c6af7'} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  )
}
