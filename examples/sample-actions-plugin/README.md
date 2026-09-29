# Note Helpers — sample plugin actions

Load it: Settings → Plugins → Developer → Load Local Plugin → pick **this folder**.
It runs sandboxed and asks only for `notes`.

- **🔢 Word count** — right-click a note in the explorer or a Working Notes tab, or the editor's ⋮ menu.
- **⏱ Reading time** — button in the Working Notes editor header.
- **🎲 Random note** — entry at the bottom of the sidebar nav.

## The API

`ctx.ui.registerAction({ id, slot, label, icon, run })` — `slot` is `note.menu`,
`editor.toolbar` or `sidebar`; `run` gets `{ noteId }` for the first two. At most 3 per slot
per plugin, labels trimmed to 40 characters, icons to 2. Works in both runtimes: you describe
the item, Jnana draws it.
