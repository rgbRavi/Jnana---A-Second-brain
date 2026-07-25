# Custom Font Install System — Design

**Date:** 2026-07-20
**Status:** Approved (design), pending implementation plan
**Branch context:** builds on the completed design-token refactor (fonts are now resolved from a
catalog into `--font-body/mono/reading` in [apply.ts](../../../src/core/themes/apply.ts) `resolveVars`,
and Theme Studio's Design tab has a Fonts picker per role).

## Problem & goal

The Fonts picker offers a catalog (DM Sans, Newsreader, …) but the app **bundles no font files** and
the CSP blocks remote font loading, so every option falls back to an OS font — picking a face rarely
changes anything visible. **Goal:** let a user install their own font families (downloaded from
Fontsource/Google Fonts, or any `.woff2`/`.ttf`/`.otf`, or a `.zip` of them) and have those families
appear in the Theme Studio pickers and actually render, for the Interface / Reading / Monospace roles.

**Non-goals:** font subsetting, variable-font axis UI, per-vault fonts (fonts are global app-level
type), syncing fonts across machines, a built-in font browser/marketplace.

## Key constraints (verified)

- **CSP already allows local fonts.** `tauri.conf.json` CSP is `default-src 'self' jnana-asset:
  http://jnana-asset.localhost` with **no `font-src`**, so `font-src` inherits `default-src`, which
  includes `jnana-asset:`. `@font-face { src: url('jnana-asset://…') }` loads with **no CSP change**.
- **The `jnana-asset://` protocol** ([main.rs](../../../src-tauri/src/main.rs) `register_uri_scheme_protocol`)
  serves files from `assets_dir()` through `safe_asset_file` (flat filenames, traversal-guarded) with a
  content-type from `mime_from_ext`. `mime_from_ext` currently has **no font types** — must add them.
- **No asset garbage-collection exists** — files placed in `assets_dir()` are never swept, so fonts
  stored there are safe.
- **No DB migration** — font files live on disk; metadata lives in a JSON manifest (mirrors the
  plugin-install pattern, which uses `plugins_dir()` + files rather than the DB).

## Architecture

Layering follows the app convention `ui → hooks → core → Rust commands → assets/manifest`.

### 1. Rust — `src-tauri/src/commands/fonts.rs` (new)

Data shapes (serde, camelCase to match the TS side):

```rust
struct FontFace { file: String, weight: u16, italic: bool }        // file = "font-<uuid>.woff2"
struct InstalledFont { id: String, family: String, generic: String, faces: Vec<FontFace> }
// generic ∈ {"sans","serif","mono"} — the CSS fallback class for the family's stack.
```

Commands (registered in `main.rs` `invoke_handler!`):

- `install_fonts(paths: Vec<String>) -> Result<Vec<InstalledFont>, String>`
  For each input path:
  - If extension is `.zip`: open with the existing `zip` crate; iterate entries; treat entries whose
    extension is `woff2|woff|ttf|otf` as font files; ignore the rest.
  - For each font file (from disk or extracted bytes):
    1. **Parse metadata** with `allsorts` (decodes woff2 → sfnt, reads `name` table family/subfamily
       and `OS/2` `usWeightClass` + `fsSelection` italic bit). On any parse error, **fall back to
       filename heuristics** (`parse_face_from_filename`): family = filename sans weight/style tokens;
       weight from `Thin|Light|Regular|Medium|SemiBold|Bold|Black|100..900`; italic if name contains
       `Italic`/`Oblique`. `generic` inferred: name contains `Mono` → `mono`, `Serif`/known serif →
       `serif`, else `sans`.
    2. Copy the file into `assets_dir()` as `font-<uuid>.<ext>` (uuid via existing dep).
  - Group faces by family; merge into families; return the affected `InstalledFont`s.
  - Persist by read-modify-write of `fonts.json` (see manifest below). Merging: an install for an
    existing family **adds/replaces faces** (same weight+italic replaces).
- `list_fonts() -> Result<Vec<InstalledFont>, String>` — read + parse the manifest (empty vec if
  absent/corrupt; log on corrupt).
- `remove_font(id: String) -> Result<(), String>` — delete the family's face files from `assets_dir()`,
  drop its manifest entry, write back.

Also:
- Extend `mime_from_ext`: `woff2 → font/woff2`, `woff → font/woff`, `ttf → font/ttf`, `otf → font/otf`.
- `fonts_manifest_path()` = `data_dir()/fonts.json`, holding `{ "fonts": [InstalledFont, …] }`.
- Path safety: font filenames are generated (`font-<uuid>.<ext>`), never user-derived, so they pass
  `is_safe_asset_filename`. Reject input files above a sane size cap (e.g. 20 MB) to avoid abuse.
- **Dependency:** add `allsorts` to `src-tauri/Cargo.toml`.

### 2. Core — `src/core/fonts.ts` (new)

Thin `invoke` wrappers + the `InstalledFont` type (mirrors the Rust struct):
`installFonts(paths: string[])`, `listFonts()`, `removeFont(id: string)`. No dialog logic here
(the UI owns the picker); emits nothing — the store re-fetches.

### 3. Runtime face loading — `src/core/fonts/loadFaces.ts` (new)

`buildFaceCss(fonts: InstalledFont[]): string` returns one `@font-face` per face:

```css
@font-face {
  font-family: '<family>';
  font-weight: <weight>;
  font-style: <normal|italic>;
  font-display: swap;
  src: url('jnana-asset://font-<uuid>.woff2') format('woff2');
}
```

`applyFaceCss(fonts)` writes that string into a single `<style id="jnana-user-fonts">` element
(create-once, replace textContent). Pure `buildFaceCss` is unit-testable; `applyFaceCss` is the DOM
side. `format(...)` derived from the file extension.

### 4. Store — `src/hooks/useInstalledFonts.ts` (new)

Module store (same `useSyncExternalStore` + module-level state pattern as
[useTheme.ts](../../../src/hooks/useTheme.ts)):
- On first mount, `listFonts()` → state; then `applyFaceCss(state)`.
- Also populates a module-level **family → stack** map (`'<family>', <generic>`) consumed by
  `fontStack()` so `resolveVars` can resolve an installed family. Re-applied whenever the list changes.
- Exposes `{ fonts, install(paths), remove(id), refresh() }`. `install`/`remove` call core, update
  state, re-inject faces, re-emit `theme:changed` (so the running theme re-resolves `--font-*` if the
  active family was just (un)installed).

### 5. Catalog merge + resolution

- `fontStack(role, id)` in [apply.ts](../../../src/core/themes/apply.ts): look up the built-in `FONTS`
  catalog first; if not found, look up the installed-family map; else fall back to the role default.
  This keeps `Theme.fonts` storing just an id/family name — **no `ThemeTokens`/`Theme` change**.
- The picker's option list = built-in catalog **+** installed families (as `{ id: family, label:
  family }`), rendered in two `<optgroup>`s ("Built-in", "Installed"). Installed families offered for
  **all three roles** (the user assigns intent).

### 6. UI — Theme Studio Fonts section

Extend the Fonts block in [DesignTab.tsx](../../../src/ui/settings/appearance/DesignTab.tsx) (or factor
a `FontManager` subcomponent if it grows past ~80 lines):
- Role selects (`body`/`reading`/`mono`) gain the Installed `<optgroup>`.
- **＋ Install font…** button → `@tauri-apps/plugin-dialog` `open({ multiple: true, filters: [{ name:
  'Fonts', extensions: ['woff2','woff','ttf','otf','zip'] }] })` → `install(paths)` wrapped in a
  `toast.progress` → success toast with the installed family names.
- **Guide + links** (short, one paragraph): "Get free fonts from **Fontsource** or **Google Fonts**,
  download, then Install font and choose the `.woff2`/`.ttf` files (or the whole `.zip`)." Links open
  externally via `@tauri-apps/plugin-shell` `open(url)` (Fontsource `https://fontsource.org`,
  Google Fonts `https://fonts.google.com`).
- **Installed list**: each family with its face count and a ✕ remove that calls `showConfirmDialog`
  (destructive) → `remove(id)`.

## Data flow

pick files/zip → `install_fonts` (parse via allsorts / fallback, copy to `assets_dir()`, merge
`fonts.json`) → returns families → store updates + `applyFaceCss` injects `@font-face` + updates the
family→stack map → picker shows the family → user selects it → `setFont(role, family)` →
`resolveVars`/`fontStack` maps it to `--font-*` → the app renders in the installed face.

## Error handling & edge cases

- Corrupt/unparseable font → filename-heuristic face; if even the extension is wrong, skip that file
  and report it in the toast ("2 of 3 installed").
- `.zip` with no font entries → error toast ("No fonts found in that archive").
- Duplicate family name across installs → merge faces (same weight+italic replaces).
- Removing the family that the active theme currently uses → `fontStack` falls back to the role
  default; `theme:changed` re-emit repaints.
- Manifest corrupt/missing → treated as empty (logged), never blocks boot.
- Files are validated by size cap; filenames are app-generated, so no path-injection surface.
- **Boot ordering:** `resolveVars` runs synchronously at boot (from the localStorage theme mirror)
  *before* `useInstalledFonts` finishes its async `list_fonts()`. If the active theme uses an installed
  family, `--font-*` briefly resolves to the role fallback until the store hydrates, injects
  `@font-face`, populates the family→stack map, and re-emits `theme:changed` (which re-resolves the
  vars). This mirrors how `useTheme` reconciles the mirror against SQLite — a short, expected settle,
  not a flash of the wrong theme.

## Testing

- **Rust** (`cargo test`): `parse_face_from_filename` weight/style/generic detection; manifest
  read-modify-write round-trip (install → list → remove) against a temp dir. (allsorts parsing of a
  real face is covered by the fallback test + manual verify; optionally embed a tiny test `.ttf`.)
- **TS** (vitest): `buildFaceCss` emits correct `@font-face` for a mixed weight/italic family;
  `fontStack` resolves an installed family from the map and falls back for unknown ids; store merges
  catalog + installed into picker options.
- **Manual** (UI, not headless): install a Fontsource `.woff2` family and a Google Fonts `.zip`, pick
  it for Interface + Reading, confirm it renders and persists across restart, remove it and confirm
  fallback.

## Decisions locked

- Install input: font files **and** `.zip` (auto-extract).
- Family handling: **smart** — parse embedded metadata (`allsorts`, woff2-capable) with filename
  fallback; real weight/style descriptors.
- Resources: link **Fontsource + Google Fonts** with a short inline guide.
- Storage: files in `assets_dir()` (`font-<uuid>.ext`), metadata in `data_dir/fonts.json`. No DB
  migration, no CSP change, no `Theme`/`ThemeTokens` change. Fonts are global.
