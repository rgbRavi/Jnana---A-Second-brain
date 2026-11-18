// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The quiz plugin's logger: `ctx.log`, bound in init (see pluginLogSlot), so the
// view/editor components can log as the plugin from outside init.

import { pluginLogSlot } from '../../lib/pluginLog'

export const quizLog = pluginLogSlot()

const warned = new Set<string>()

/** Warn once per note per session when a quiz note's content isn't a quiz. */
export function warnUnreadableQuiz(noteId: string, content: string): void {
  if (warned.has(noteId)) return
  warned.add(noteId)
  quizLog.warn('Quiz content is unreadable', { noteId, chars: content.length })
}
