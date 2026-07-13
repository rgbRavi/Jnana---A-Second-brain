# Jnana — Release Checklist

Derived from the release-readiness audit of the codebase. Status legend:
**✅ done** · **🟡 partial** · **⬜ todo**. Severity: **Blocker** must be fixed before any
release; **High** before a public release; **Medium/Low** are non-blocking.

---

## ✅ Completed this pass

- ✅ **License added** — AGPL-3.0-only ([LICENSE](LICENSE)) with a plugin additional-permission
  ([LICENSE-EXCEPTION.md](LICENSE-EXCEPTION.md)); wired into `package.json` + `Cargo.toml`.
- ✅ **In-app legal notice** — Settings → About ([ui/settings/AboutPanel.tsx](src/ui/settings/AboutPanel.tsx))
  shows copyright/no-warranty + source link (AGPL §13).
- ✅ **SPDX headers** on all first-party `.ts/.tsx/.rs` source files.
- ✅ **SSRF guard** on web-preview fetching — blocks loopback/private/link-local/CGNAT/metadata
  and re-validates every redirect hop ([commands/web.rs](src-tauri/src/commands/web.rs)).
- ✅ **App-wide error boundary** above the router ([ui/ErrorBoundary.tsx](src/ui/ErrorBoundary.tsx),
  wired in [App.tsx](src/App.tsx)).
- ✅ **Transactional migrations** — each `migrate_vN` runs in its own transaction, so a partial/
  failed upgrade rolls back cleanly ([db/schema.rs](src-tauri/src/db/schema.rs)).
- ✅ **Fresh-install DB bug fixed (was a latent Blocker).** `migrate_v1` set `PRAGMA journal_mode=WAL`
  *inside* the per-migration transaction — SQLite rejects that on a file DB (`cannot change into wal
  mode from within a transaction`), so a **brand-new install would fail to initialize its database**
  (existing installs were unaffected — they never re-run v1). WAL is now set on the open connection
  outside any transaction ([db/mod.rs](src-tauri/src/db/mod.rs)); covered by a fresh-file-DB test.
- ✅ **Bundle identity fixed** — `productName: "Jnana"` ([tauri.conf.json](src-tauri/tauri.conf.json)),
  crate renamed `jnana` + real `description` ([Cargo.toml](src-tauri/Cargo.toml)).
- ✅ **Migration-failure UX** — startup no longer `.expect()`-panics on a bad/corrupt DB; it shows a
  native error dialog (open data folder / quit) then exits cleanly ([main.rs](src-tauri/src/main.rs)).
- ✅ **CI pipeline** — GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs
  `tsc --noEmit` + `vitest`, and a win/mac/linux matrix of `cargo test` + `cargo build` + `tauri build`.
- ✅ **Edge-case panics fixed** — 0-byte-asset range underflow guarded ([main.rs](src-tauri/src/main.rs));
  `convert_to_pdf` no longer unwraps file-name / non-UTF-8 paths, and `import_media` sanitizes its
  extension like `save_asset`/`import_file` ([commands/media.rs](src-tauri/src/commands/media.rs)).
- ✅ **CHANGELOG.md added** ([CHANGELOG.md](CHANGELOG.md)).
- ✅ **Asset CORS narrowed** — `jnana-asset://` reflects only app origins instead of `*`
  ([main.rs](src-tauri/src/main.rs)).
- ✅ **README export scope + Updating section** corrected/added ([README.md](README.md)).
- ✅ **Signing/updater setup documented** ([RELEASE_SIGNING.md](RELEASE_SIGNING.md)).
- ✅ **Windows bundle build + launch verified** (`Jnana_0.1.0` msi/nsis; release exe boots).

---

## Blockers — before any release

- ✅ **Bundle identity** — done this pass (`productName: "Jnana"`, crate `jnana` + real description).
- 🟡 **Code signing / notarization.** Still unsigned (needs the owner's Apple Developer-ID +
  Windows/Authenticode or Azure Trusted Signing certs — not something code can supply). The exact
  config, env vars, and release-workflow steps are now documented in
  [RELEASE_SIGNING.md](RELEASE_SIGNING.md); wiring is pending the certs. *(Downgrade to High for a
  limited/technical early-access drop with a documented "right-click → Open" workaround.)*

---

## High priority — before a public release

- ✅ **CI pipeline** — added this pass ([.github/workflows/ci.yml](.github/workflows/ci.yml)): all four
  checks + `tauri build` on a win/mac/linux matrix. First push validates it end-to-end.
- 🟡 **Update story documented; auto-updater still pending.** Manual-update path (data survives; where
  it lives) is now in the README "Updating" section, and the pre-migration auto-backup makes upgrades
  reversible. A real Tauri updater still needs a signing keypair + hosted endpoint — see
  [RELEASE_SIGNING.md](RELEASE_SIGNING.md).
- ✅ **Migration-failure UX** — done this pass. Startup catches an `init_db` error, shows a native
  error dialog (open data folder / quit), and exits cleanly instead of a raw panic
  ([main.rs](src-tauri/src/main.rs)).
- 🟡 **Verify packaged bundles build & launch.** **Windows confirmed this pass** — `tauri build`
  produced `Jnana_0.1.0_x64_en-US.msi` + `Jnana_0.1.0_x64-setup.exe` (correct name, exit 0) and the
  release `jnana.exe` boots (`Jnana starting — v0.1.0`, window up, frontend loaded). Linux
  (AppImage/deb/rpm) + macOS (dmg) still need a build+open check — covered by CI's `tauri build`
  matrix for the *build* half; opening them needs a real machine. *(Note: the benign
  "IPC custom protocol failed → postMessage" WebView2 warning is pre-existing Tauri behavior.)*

---

## Medium / Low — non-blocking

- ✅ **Export scope addressed (M).** Markdown export now emits YAML frontmatter (title, timestamps,
  tags, id) so tags survive, and the Import/Export panel states what's *not* included ([core/export.ts](src/core/export.ts),
  [ImportExportPanel.tsx](src/ui/settings/ImportExportPanel.tsx), tests in
  [export.test.ts](src/core/export.test.ts)). PDF highlights / canvas / workspace membership /
  media layout are still Markdown-export-excluded by design → "Export full vault" is the lossless path.
  README "take it with you" wording corrected to match ([README.md](README.md)).
- 🟡 **Rust test coverage (M).** Added a **v1-fixture→v12 migration-chain** test, a **backup→restore
  round-trip** test, and a **real-startup snapshot** test (`init_db_at` on a temp dir: v11 DB →
  snapshot + upgrade, plus a fresh-DB no-snapshot case) ([db/schema.rs](src-tauri/src/db/schema.rs),
  [commands/data.rs](src-tauri/src/commands/data.rs), [db/mod.rs](src-tauri/src/db/mod.rs)) — Rust
  tests now 12. Still todo: broad command-handler coverage + one app-launch smoke test.
- ✅ **Auto-backup before migrations (M).** `init_db` now snapshots an existing DB into `backups/`
  (`pre-migration-vN-*.db`) before any version-bumping migration ([db/mod.rs](src-tauri/src/db/mod.rs),
  gated on `schema::LATEST_VERSION`).
- ✅ **Modal focus management (M).** [DialogHost.tsx](src/ui/DialogHost.tsx) traps Tab/Shift+Tab within
  the dialog; [lib/dialog.ts](src/lib/dialog.ts) captures focus at open time (before autoFocus) and
  returns it on close. Covered by [DialogHost.test.tsx](src/ui/DialogHost.test.tsx).
- ✅ **`jnana-asset://` CORS narrowed (L).** Was a blanket `Access-Control-Allow-Origin: *`; now
  reflects only app origins (`tauri://…`, `*.localhost`) and denies others with `null`
  ([main.rs](src-tauri/src/main.rs), `is_app_origin`/`asset_acao` + tests). Media elements and pdf.js
  (app-origin) are unaffected. *(Cross-platform media spot-check still advisable.)*
- ✅ **Edge-case panics (L)** — fixed this pass. 0-byte-asset range underflow guarded
  ([main.rs](src-tauri/src/main.rs)); `convert_to_pdf` passes paths as `OsStr` instead of
  `file_name().unwrap()`/`to_str().unwrap()` ([commands/media.rs](src-tauri/src/commands/media.rs)).
- ✅ **`import_media` extension sanitized (L)** — now filters to ASCII-alphanumeric like
  `save_asset`/`import_file` ([commands/media.rs](src-tauri/src/commands/media.rs)).
- ✅ **CHANGELOG.md added (L)** ([CHANGELOG.md](CHANGELOG.md)).

---

## Cut list — descope from v1 (update PLAN.md)

All confirmed unfinished in code; label "Planned", don't advertise as shipping.

- ⬜ **MCP client / server** — roadmap only.
- ⬜ **Plugin framework** — registry exists ([lib/pluginRegistry.ts](src/lib/pluginRegistry.ts)); no
  plugins, no management UI. *(The plugin **license exception** is ready even though the runtime
  isn't — that's intentional and fine.)*
- ⬜ **Theme density / motion / reading-scale tokens** — written to `documentElement` but not
  consumed by CSS. → Hide the controls or label "beta".
- 🟡 **Code syntax highlighting** — [highlight.ts](src/core/markdown/highlight.ts) is a documented
  no-op; renders plain monospace. Ship as-is (graceful).
- ⬜ **Tables** — "not implemented yet" toast in the editor. Cut the menu entry or gate behind beta.
- ⬜ **Player-assisted timestamp writing**, **HEVC/H.265 transcoding**, **edge-drop-to-split** —
  not built; document as planned.

---

## Suggested tag-time sequence

1. Fix bundle identity (Blocker) → 2. Wire CI (High) → 3. Migration-failure dialog + auto-backup
(High/M) → 4. Set up signing + updater (Blocker/High) → 5. Build & launch-test every bundle target →
6. Truth-up README export scope + move cut-list items to "Planned" → 7. Add CHANGELOG → 8. Verify
`SOURCE_URL` in About points at the public repo matching the build → **tag**.
