// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// A reasoning model's "thinking", above its reply: open while it streams, folded to
// "Thought for Ns" once the answer starts. Rendered as plain text, never markdown —
// it's the model's scratchpad, not something to format or auto-load links from.

import { useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import styles from './Ai.module.css'

const duration = (ms: number) => {
  const s = Math.max(1, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function ThinkingBlock({ reasoning, live, thoughtMs }: {
  reasoning: string
  /** Still reasoning (no answer yet) — keep it open. */
  live: boolean
  thoughtMs?: number
}) {
  const [open, setOpen] = useState(false)
  if (!reasoning) return null
  const shown = live || open
  const label = live ? 'Thinking…' : thoughtMs ? `Thought for ${duration(thoughtMs)}` : 'Thought'
  return (
    <div className={styles.thinking}>
      <button
        type="button"
        className={styles.thinkingToggle}
        aria-expanded={shown}
        disabled={live}
        onClick={() => setOpen((o) => !o)}
      >
        <Brain size={13} aria-hidden />
        <span>{label}</span>
        {!live && <ChevronDown size={13} aria-hidden className={open ? styles.thinkingChevronOpen : undefined} />}
      </button>
      {shown && <div className={styles.thinkingBody}>{reasoning}</div>}
    </div>
  )
}
