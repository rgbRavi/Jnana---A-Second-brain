# Sample Worker — a sandboxed Jnana plugin

The reference plugin for the **worker runtime**. Its manifest sets
`"runtime": "worker"`, so Jnana loads it into a Web Worker: no DOM, no IPC, no
direct access to anything. Every capability comes from the host, which refuses
whatever the plugin wasn't granted — so `"permissions": ["notes"]` is an actual
boundary here, not a label on a door that's already open.

It adds one command (**Sample Worker: count my notes**, with a suggested
`Ctrl/Cmd+Alt+C`), a **right-rail panel**, and a renderer for ```` ```notecount ````
fences. It reads notes through `ctx.notes`, keeps a counter in `ctx.storage`, and
speaks to you with a `toast:info` event, which is how a plugin with no UI says
anything.

The panel and the fence are both **declarative**: the plugin returns blocks
(headings, text, a table, a button) and Jnana draws them with its own styling.
That is what lets a sandboxed plugin own a real surface without ever touching the
document — and it is the pattern to copy for any new one.

## No build step

Worker plugins can't render, so there's no JSX and no React — which means no
bundler. `manifest.json` points `main` straight at `src/index.js`. Copy this
folder, rename it, and you have a working plugin.

## Load it

Settings → Plugins → Developer → **Load Local Plugin** → pick this folder. The
install prompt should say it runs in the sandbox, and the Installed list should
show a green **Sandboxed** badge. Then Ctrl/⌘-` (the command palette) → "count my
notes", open the plug icon in the right rail, and put this in a note:

    ```notecount
    alpha
    ```

The fence renders as a table of matching note titles. Delete the plugin and it
goes back to being a code block — a plugin never takes your content with it.

## Types

`/// <reference path="../../types/jnana-plugin.d.ts" />` at the top of
`src/index.js` is what gives `ctx.` completion. Scaffolded plugins get their own
copy of that file; this sample points at the one in the repo.

## Test

`npx vitest run examples/sample-worker-plugin/smoke.test.js` drives `init(ctx)`
against a stub host — including the case where `notes` was never granted. The
worker transport itself is covered by `src/lib/pluginWorker.test.ts`.

## When to choose this runtime

Use `worker` whenever your plugin doesn't draw: commands, event listeners,
background work, anything that talks to an API — plus settings, block panels and
fenced renderers, which are data rather than drawing. Use `main` when you
contribute a note type, a widget or a React rail panel — those render, and
rendering needs the main thread.
