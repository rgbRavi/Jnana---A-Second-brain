// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// One action per slot, from inside the sandbox: the plugin never touches the DOM.
// It describes each item; Jnana draws it and sends the click back here.

const words = (text) => (text.match(/\S+/g) || []).length

export default {
  id: 'com.jnana.sample-actions',
  name: 'Note Helpers',
  version: '1.0.0',
  init(ctx) {
    const say = (text) => ctx.bus.emit('toast:info', text)

    ctx.ui.registerAction({
      id: 'word-count',
      slot: 'note.menu',
      label: 'Word count',
      icon: '🔢',
      async run({ noteId }) {
        const note = noteId && (await ctx.notes.getById(noteId))
        if (note) say(`“${note.title || 'Untitled'}” has ${words(note.content)} words.`)
      },
    })

    ctx.ui.registerAction({
      id: 'reading-time',
      slot: 'editor.toolbar',
      label: 'Reading time',
      icon: '⏱',
      async run({ noteId }) {
        const note = noteId && (await ctx.notes.getById(noteId))
        if (note) say(`About ${Math.max(1, Math.round(words(note.content) / 220))} min to read.`)
      },
    })

    ctx.ui.registerAction({
      id: 'random-note',
      slot: 'sidebar',
      label: 'Random note',
      icon: '🎲',
      async run() {
        const all = await ctx.notes.getAll()
        if (!all.length) return say('No notes in this vault yet.')
        ctx.bus.emit('note:navigate', all[Math.floor(Math.random() * all.length)])
      },
    })
  },
}
