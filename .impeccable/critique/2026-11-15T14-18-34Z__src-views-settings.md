---
target: Settings view
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-11-15T14-18-34Z
slug: src-views-settings
---
Method: dual-agent (A: design review · B: detector). Browser overlay skipped (Tauri WebView, no IPC in browser).

## Design Health Score: 27/40 (21 → 26 → 27)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Status | 3 | Test connection result only in a vanishing toast; no persistent "connected / not tested" |
| 2 | Real world | 2 | Composer, Base URL, Embeddings, tokens, "inject once", toolbar "Capabilities/More/Focused", Base mode, ms |
| 3 | Control | 3 | Picking a preset silently discards unsaved custom theme; wallpaper remove no undo; QuickStart dismiss permanent |
| 4 | Consistency | 2 | Backup/About/Plugins skip SettingField rows; three sub-nav styles; Saved setup/preset/Preset |
| 5 | Error prevention | 3 | Hex field accepts any string; PresetBar Update overwrites without confirm |
| 6 | Recognition | 3 | Footnote route to remember; toasts point at hidden Developer console |
| 7 | Flexibility | 3 | /, Ctrl+F, palette deep links, typeahead; no per-section reset, overlay not movable |
| 8 | Minimalist | 3 | Backup 11 equal buttons; AI setup 6 sections; ~20 colour pickers; red Uninstall per plugin card |
| 9 | Error recovery | 3 | Theme import "Invalid JSON"; plugin install always "check your connection" |
| 10 | Help | 2 | ⓘ + intros only; Rules never linked; Ollama needs terminal |

## Anti-Patterns Verdict
Not slop. Detector 0 findings; 90/90 font sizes on ramp; 0 literal colours / uppercase / section-label / native controls; all 38 htmlFor resolve. Remaining texture: mono badges, ＋/↗ glyphs, "Export · copy JSON". Deterministic TPs: unnamed plugin-settings slider (PluginSettingsPane.tsx:116), 40 px spacings in PluginsPanel.module.css, 4 in Appearance, hardcoded flex ratios PresetsTab.

## Priority Issues
1. [P1] First AI setup is a form wall — QuickStart card above full config; choices mutate config; success leaves nothing. Stepper with own fields + "Show all settings"; persistent per-section status. → onboard, clarify
2. [P1] Rows break on wide panels — Appearance SettingPanel wide removes 54rem cap (labels ~1300px from controls on 1920); Plugins uncapped; Backup/About not rows. Cap rows at 54rem, wide only for preset grid/log; Backup as rows; one sub-nav component. → layout
3. [P2] SR gaps in primitives — SettingSlider no aria-describedby (Dim hint unannounced); unnamed plugin slider; tooltip strips title on focus so title-only explanations lost; DialogHost no aria-describedby; search no-results not announced; overlay no role/label/focus. → harden
4. [P2] Silent loss of work — preset card discards Custom theme (Reset guards it); PresetBar Update no confirm; "(none)" no-op. → harden
5. [P2] IA/wording for students — Composer top-level with 4 settings; AI behaviour all jargon, no Rules link; Logs in Backup vs Report issue in About; unlabelled 3rd nav group. → clarify

## Persona Red Flags
Alex: fixed unmovable overlay; no per-section reset; search capped at 8; per-keystroke set_ai_config on prompts; Ctrl+F hijack.
Sam: slider hints unannounced; title-only explanations lost; dialog bodies unannounced; QuickStart cards no aria-pressed; search popover never closes on blur; slider focus ring 45% mix.
Student: Enable AI explanation behind ⓘ; terminal for Ollama; Embeddings/Base URL/tokens; run-on Backup hint; onboarding role doesn't adapt Settings.

## Minor
Active badge ~4.2:1; mono theme badges; preset cards no hover; raw --motion-duration-base unscaled under reduced motion; glyph icons; font remove confirm not danger; motion demo "Reset" clash; "no key saved" fragment; fake shortcut in placeholder; anchorless search entries; 62rem layout jump; mixed clipboard APIs; stale density comment.

## Questions
1. Should Settings read the onboarding role (student vs researcher)?
2. Is AI setup a settings page or a first-run flow that leaves a page behind?
3. Would 10 presets + accent + density + wallpaper cover 95%, with the rest behind Advanced?
