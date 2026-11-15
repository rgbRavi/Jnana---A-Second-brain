// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Pause, Play, RotateCcw } from 'lucide-react'
import { formatTime } from './timer'
import { usePomodoro, toggleRun, reset } from './store'
import Styles from './Pomodoro.module.css'

/** The Pomodoro timer widget, shown in the plugin widget tray. */
export function PomodoroWidget() {
  const s = usePomodoro()
  return (
    <div className={Styles.wrap}>
      <div className={`${Styles.phase} ${s.phase === 'break' ? Styles.break : Styles.work}`}>
        {s.phase === 'work' ? 'Focus' : 'Break'}
      </div>
      <div className={Styles.time}>{formatTime(s.remaining)}</div>
      <div className={Styles.controls}>
        <button className={Styles.btn} onClick={toggleRun} title={s.running ? 'Pause' : 'Start'} aria-label={s.running ? 'Pause' : 'Start'}>
          {s.running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className={Styles.btn} onClick={reset} title="Reset" aria-label="Reset">
          <RotateCcw size={16} />
        </button>
      </div>
      <div className={Styles.count}>🍅 × {s.completed}</div>
    </div>
  )
}
