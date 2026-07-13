// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

import { Timer } from 'lucide-react'
import type { Plugin } from '../../types'
import { PomodoroWidget } from './PomodoroWidget'
import { toggleRun, reset } from './store'

/**
 * First-party bundled plugin: a Pomodoro timer. Unlike the flashcard/checklist
 * plugins (which contribute *note types*), this contributes **UI** — a widget in
 * the plugin tray plus command-palette commands — exercising the `ctx.ui` slot API.
 */
export const pomodoroPlugin: Plugin = {
  id: 'jnana.pomodoro',
  name: 'Pomodoro',
  version: '1.0.0',
  init(ctx) {
    ctx.ui.registerWidget({ id: 'pomodoro', title: 'Pomodoro', icon: Timer, Component: PomodoroWidget })
    ctx.ui.registerCommand({ id: 'pomodoro-toggle', label: 'Pomodoro: Start / Pause', icon: '🍅', run: toggleRun })
    ctx.ui.registerCommand({ id: 'pomodoro-reset', label: 'Pomodoro: Reset', icon: '🍅', run: reset })
  },
}
