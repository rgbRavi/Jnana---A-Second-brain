# Dusk & Parchment — the reference theme plugin

Two themes (one dark, one light) and an optional animated backdrop. It is the
shape a theme plugin should have:

```json
{ "type": "theme", "runtime": "worker", "permissions": [] }
```

- **`"type": "theme"`** groups it under **Themes** in Settings → Plugins, gives it
  a Theme badge, and makes the install prompt say *"This is a theme: it changes
  how Jnana looks, and asks for nothing else."* If a theme asked for `notes` or
  `network`, that same prompt would point the mismatch out instead — the type is
  a label, so it can't prevent anything, but it can make the oddity visible.
- **`"runtime": "worker"`** — a theme has nothing to render, so it belongs in the
  sandbox. It gets a Sandboxed badge, and it works under "Only run sandboxed
  plugins".
- **No permissions.** It cannot read a note, touch a file or reach the network.

No build step: plain ESM, no React, `main` points straight at `src/index.js`.

## Load it

Settings → Plugins → Developer → **Load Local Plugin** → pick this folder. Then:

1. **Settings → Plugins → Installed** — it sits under **Themes**, with both
   badges. The filter row (All / Themes / Utility) and the sort control are there
   too.
2. **Settings → Appearance → Presets → From plugins** — *Dusk* and *Parchment*.
   Pick one. It applies, and the Theme Studio now treats it as your own theme:
   tweak any token, save it, and it survives uninstalling this plugin.
3. Its card in Settings → Plugins has an **Animated backdrop** setting (off by
   default — an animated background is a strong opinion to impose on someone who
   installed a colour scheme). Turn it on, then switch themes: the backdrop
   follows, because it declares no colours of its own.

## Writing your own

A theme is data, not CSS. You supply values for known tokens; Jnana validates
each one and drops anything that doesn't parse:

| Token group | Values |
|---|---|
| `--bg`, `--surface`, `--surface-2/3`, `--border`, `--border-hover`, `--accent`, `--text-1/2/3`, `--danger`, `--success`, `--warning`, `--star` | **six-digit hex only** (`#6ea8fe`) |
| `--radius-sm/md/lg` | a length (`12px`) |
| `--motion-duration-fast/base/slow` | a time (`200ms`) |
| `--motion-scale` | `0`–`2` |
| `--motion-ease` | a keyword or `cubic-bezier(…)` |

The six-digit rule is not fussiness: Jnana derives hover, pressed, soft-fill and
label colours from your accent and surface by channel arithmetic, and that maths
only reads `#rrggbb`. An `rgb()` value wouldn't fail loudly — it would flatten
every hover state and can pick an unreadable label colour, so it is dropped and
the preset's value is kept instead.

Leave tokens out and they come from the matching built-in preset, so a
three-token theme is perfectly valid. Anything that isn't in the table — an
unknown token, a `url()`, anything trying to close the declaration — is dropped
with a line in the Plugin Console.

## Test

```
npx vitest run examples/sample-theme/smoke.test.js
```

Checks the manifest's claims and runs every token through the host's own
validator, so a theme that would silently lose a colour fails here first.
