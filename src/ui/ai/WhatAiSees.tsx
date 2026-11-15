// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AiLayer } from '../../core/ai/aiLayers'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import s from './WhatAiSees.module.css'

const GAP = 8
const MARGIN = 8

/** Link-styled trigger that opens a portaled panel listing the instruction
 *  layers behind the next send, in the order the model receives them. */
export function WhatAiSees({ layers, onOpen }: { layers: AiLayer[]; /** Refresh inputs (e.g. rule names) as it opens. */ onOpen?: () => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useEscapeKey(() => setOpen(false))

  const place = useCallback(() => {
    const t = trigger.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const w = pop.current?.offsetWidth ?? 340
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - w - MARGIN))
    setPos({ left, bottom: Math.max(MARGIN, window.innerHeight - r.top + GAP) })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (pop.current?.contains(n) || trigger.current?.contains(n)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  return (
    <span className={s.wrap}>
      <button
        ref={trigger}
        type="button"
        className={s.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="See which instructions shape the next reply"
        onClick={() => { if (!open) onOpen?.(); setOpen(!open) }}
      >
        What the AI sees
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={s.pop}
            role="dialog"
            aria-label="What the AI sees"
            style={pos ? { left: pos.left, bottom: pos.bottom } : { visibility: 'hidden' }}
          >
            <h3 className={s.heading}>What the AI sees</h3>
            <p className={s.intro}>Instruction layers for the next send, in the order the model receives them.</p>
            <ol className={s.list}>
              {layers.map((l, i) => (
                <li key={l.key} className={`${s.item} ${l.active ? s.on : s.off}`} data-active={l.active}>
                  <span className={s.num}>{i + 1}.</span>
                  <span className={s.label}>{l.label}</span>
                  <span className={s.state}>{l.active ? 'On' : 'Off'}</span>
                  <p className={s.desc}>{l.description}</p>
                  {l.detail && <p className={s.detail}>{l.detail}</p>}
                </li>
              ))}
            </ol>
          </div>,
          document.body,
        )}
    </span>
  )
}
