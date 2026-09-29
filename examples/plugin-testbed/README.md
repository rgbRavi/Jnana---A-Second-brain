# Plugin Testbed

A plugin that exists to be **poked at**. It claims every plugin surface at once —
attachments, a React rail panel, a block panel, a fenced-block renderer, command
hotkeys and a settings pane — and reports pass/fail for each, so a capability that
silently stops working shows up instead of merely being absent.

This is **not** a reference sample. Copy
[`../sample-plugin`](../sample-plugin) (main thread) or
[`../sample-worker-plugin`](../sample-worker-plugin) (sandboxed) to start a real
plugin.

## Load it

Settings → Plugins → **Developer** → **Load Local Plugin** → pick this folder.
The consent prompt should list exactly two permissions — *Read and modify your
notes* and *Read and add attachments* — and warn that main-thread plugins are not
sandboxed. Both are true: it runs on the main thread because it contributes a
**React** rail panel, the one surface a worker plugin cannot have.

No build step. It is plain ESM using `React.createElement` instead of JSX, and the
loader rewrites its `react` import to the host's React.

## What to check

### 1. Attachments (`media` permission)

First put an image in a note (paste or drag one in), then open the rail's plug
icon → **Testbed** → **Run checks**. Expect:

- `ctx.notes.getAll` — a note count
- `ctx.media` — present
- `ctx.media.list` — the attachments of the first note that embeds any
- `ctx.media.read` — a byte count for the first asset

**Write test attachment** stores a 1×1 PNG and creates a note embedding it — open
that note and the image should render. Then, to see the permission actually bite:
revoke **Read and add attachments** on the plugin's card and press Run checks
again. `ctx.media` must report *absent*; the other checks keep passing. Grant it
back and it returns without a restart.

### 2. Rail panels

Two panels, both under the plug icon:

- **Testbed** — React, drawn by the plugin.
- **Testbed (blocks)** — the same results, *declared* as blocks and drawn by
  Jnana. This is the surface a sandboxed plugin gets.

Press **Run checks** in the blocks panel: it re-registers itself with the new
table, which is how a block panel updates. The panel deliberately includes an
unknown `html` block — nothing should render for it, and no `<script>` text should
appear anywhere.

### 3. Fenced blocks

Put this in a note and leave edit mode (read mode is where fences render today):

    ```testbed
    first line
    second line
    ```

Expect a heading, a note count, a numbered list of the lines, a small table, and a
**disabled** button (a fence has no action channel — buttons there are inert by
design).

Two failure cases, both of which must show the **plain code block** rather than an
empty space:

    ```testbed
    fail
    ```

    ```testbed
    empty
    ```

Disable the plugin with a `testbed` fence on screen: it must turn back into a code
block immediately. Your content is never lost to a plugin.

### 4. Hotkeys

On the plugin's card, **Testbed: run checks** should show `Ctrl+Alt+T` (`⌥⌘T` on
macOS). Press it anywhere — the checks run.

- Click the chord button, press a new combination: it rebinds, and the old one
  stops working.
- Click it and press `Ctrl+\`` — refused, with a message naming the command
  palette. Same for any binding the app owns.
- Press **Backspace** while capturing: the shortcut clears to *None*.
- The reset arrow returns it to the plugin's suggestion.
- The second command, **Testbed: chord that must NOT bind**, asks for `Ctrl+W`.
  Its Shortcut row should read *None*, and pressing `Ctrl+W` must still close the
  active tab — a plugin cannot take an app binding.

### 5. Themes and the backdrop

Settings → Appearance → Presets → **From plugins** should list **Testbed Deep**
and **Testbed Paper**. Pick one: it applies immediately and the Theme Studio now
treats it as *your* theme, so you can tweak and save it. Disable the plugin — the
cards disappear, but what you are looking at does not change, because applying
copied it.

**Testbed Deep deliberately ships one bad token** (`--danger:
url(https://example.invalid/pixel.png)`). It must be dropped: the danger colour
should stay the app default, and Settings → Plugins → Developer → Plugin Console
should have nothing loading a remote image. That token is the whole reason the
theme API takes data instead of CSS — a `url()` is a request on every paint.

For the backdrop, use the plugin's own settings pane (on its card in
Settings → Plugins): **Animated backdrop** → *Drifting gradient* uses the current
theme's colours, so switching themes re-colours it; *Aurora* uses its own. It must
sit behind everything — clicks still land, nothing is covered. With "Reduce
motion" on in your OS it should be still, not slow.

### 6. Teardown

Disable the plugin. Both rail panels, the fence renderer, both commands and their
shortcuts, the two theme cards and the backdrop must all disappear together; the
plug icon leaves the rail. Re-enable and they all come back.

## Test

```
npx vitest run examples/plugin-testbed/smoke.test.js
```

Drives `init(ctx)` against a stub host: every surface is claimed, and the checks
report honestly when `media` is missing or no note has an attachment.
